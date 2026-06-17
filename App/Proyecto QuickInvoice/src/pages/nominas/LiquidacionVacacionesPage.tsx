import { useState, useMemo } from 'react'
import { Sun, Calculator, Printer, AlertTriangle, Info, FileText } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
    liquidacionVacacionesService,
    type DatosLiquidacionVacaciones,
} from '../../services/nominas/liquidacionVacacionesService'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FMT = new Intl.NumberFormat('es-EC', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
})
const fmt     = (n: number) => FMT.format(n)
const fmtDate = (s?: string | null) =>
    s ? new Date(s + 'T00:00:00').toLocaleDateString('es-EC', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    }) : '—'
const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const toISO = (d: Date) => d.toISOString().split('T')[0]

// ─── HTML: Tabla Resumen (A4 landscape, agrupado por sección) ─────────────────
function buildHtmlTabla(
    empresaNombre: string,
    fechaInicio: string,
    fechaFin: string,
    porSeccion: [string, DatosLiquidacionVacaciones[]][],
    totalLineas: number,
): string {
    const css = `
@page{size:A4 landscape;margin:12mm 8mm}
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}
body{font-size:8pt;color:#111}
.hdr{text-align:center;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #1d4ed8}
.hdr h2{font-size:10pt;font-weight:bold;color:#1e40af;text-transform:uppercase}
.hdr h1{font-size:9pt;font-weight:bold;margin-top:2px}
.hdr p{font-size:7.5pt;color:#555;margin-top:3px}
table{width:100%;border-collapse:collapse;margin-top:4px}
th{background:#1d4ed8;color:#fff;font-size:7.5pt;padding:4px 3px;text-align:center;border:1px solid #1e40af}
td{font-size:7pt;padding:3px;border:1px solid #d1d5db;vertical-align:middle}
.r{text-align:right}.c{text-align:center}
.sec-tr td{background:#dbeafe;font-weight:bold;font-size:8pt;color:#1e3a8a;border-top:2px solid #1d4ed8}
.sub-tr td{background:#eff6ff;font-weight:bold;font-size:7.5pt}
.grand-tr td{background:#1d4ed8;color:#fff;font-weight:bold}
.pb{page-break-before:always}
`
    let rows = '', gTotal = 0, first = true
    for (const [sec, emps] of porSeccion) {
        let sTotal = 0
        rows += `<tr class="sec-tr${first ? '' : ' pb'}"><td colspan="9">&nbsp;&nbsp;SECCIÓN: ${esc(sec)}</td></tr>`
        first = false
        emps.forEach((e, i) => {
            sTotal += e.valor_vacaciones
            rows += `<tr>
<td class="c">${i + 1}</td>
<td>${esc(`${e.apellidos} ${e.nombres}`)}</td>
<td class="c">${fmtDate(e.fecha_ingreso)}</td>
<td class="c">${e.anios_trabajados}a ${e.meses_adicionales}m</td>
<td class="c">${e.dias_generados}${e.dias_extra > 0 ? ` (+${e.dias_extra})` : ''}</td>
<td class="r">${esc(fmt(e.total_percibido))}</td>
<td class="r">${esc(fmt(e.valor_1_24))}</td>
<td class="c">${e.dias_gozados} / ${e.dias_pendientes}</td>
<td class="r">${esc(fmt(e.valor_vacaciones))}</td>
</tr>`
        })
        gTotal += sTotal
        rows += `<tr class="sub-tr">
<td colspan="8" class="r">Subtotal ${esc(sec)} (${emps.length} empl.):</td>
<td class="r">${esc(fmt(sTotal))}</td></tr>`
    }
    rows += `<tr class="grand-tr">
<td colspan="8" class="r">TOTAL GENERAL (${totalLineas} empleados):</td>
<td class="r">${esc(fmt(gTotal))}</td></tr>`

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Liquidación Vacaciones</title><style>${css}</style></head>
<body>
<div class="hdr">
<h2>${esc(empresaNombre)}</h2>
<h1>LIQUIDACIÓN DE VACACIONES — TABLA RESUMEN</h1>
<p>Período: ${esc(fmtDate(fechaInicio))} al ${esc(fmtDate(fechaFin))}</p>
</div>
<table>
<thead><tr>
<th width="24">#</th><th>Apellidos y Nombres</th>
<th width="72">F. Ingreso</th><th width="64">Antigüedad</th>
<th width="60">Días Vac.</th><th width="82">Base (Ingresos)</th>
<th width="82">Valor 1/24</th><th width="80">Gozados/Pend.</th>
<th width="82">TOTAL VAC.</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`
}

// ─── HTML: Comprobantes individuales (A4 portrait, vertical) ─────────────────
function buildHtmlComprobantes(
    empresaNombre: string,
    fechaInicio: string,
    fechaFin: string,
    lineas: DatosLiquidacionVacaciones[],
): string {
    const hoy = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const css = `
@page{size:A4 portrait;margin:18mm 15mm}
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}
body{font-size:9.5pt;color:#111}
.page{page-break-after:always}.page:last-child{page-break-after:auto}
.hdr{text-align:center;margin-bottom:14px;padding-bottom:8px;border-bottom:2.5px double #1d4ed8}
.hdr .emp{font-size:12pt;font-weight:900;text-transform:uppercase;color:#1e40af;letter-spacing:0.05em}
.hdr .tit{font-size:11pt;font-weight:bold;margin-top:4px}
.hdr .per{font-size:8pt;color:#555;margin-top:3px}
.sec{background:#1e40af;color:white;font-weight:bold;font-size:8.5pt;
     padding:5px 10px;margin:14px 0 0;letter-spacing:0.04em;text-transform:uppercase}
table.dt{width:100%;border-collapse:collapse}
table.dt td{padding:4px 8px;border:1px solid #e2e8f0;font-size:9pt;vertical-align:middle}
table.dt tr:nth-child(even) td{background:#f8fafc}
.l{width:62%;color:#374151}.v{width:38%;font-weight:bold;text-align:right}
.vhl{color:#1d4ed8;font-size:10pt}.total td{background:#1e40af!important;color:#fff!important;font-weight:bold!important;font-size:10pt}
.sig{margin-top:36px;display:flex;justify-content:space-between}
.sb{width:45%;text-align:center}
.sl{border-top:1.5px solid #374151;margin:52px 0 6px}
.sb p{font-size:8.5pt;margin:2px 0;color:#374151}
.sb .sn{font-weight:bold;font-size:9pt;color:#111}
.note{font-size:7.5pt;color:#888;margin-top:10px;text-align:center;border-top:1px solid #e5e7eb;padding-top:6px}
`

    const pages = lineas.map(e => {
        const tiempoStr = `${e.anios_trabajados} año${e.anios_trabajados !== 1 ? 's' : ''} ${e.meses_adicionales} mes${e.meses_adicionales !== 1 ? 'es' : ''}`
        const fSalRow = e.fecha_salida
            ? `<tr><td class="l">Fecha de Salida:</td><td class="v">${fmtDate(e.fecha_salida)}</td></tr>`
            : ''
        const extraRow = e.dias_extra > 0
            ? `<tr><td class="l">Días adicionales por antigüedad (${e.anios_trabajados} años &gt; 5):</td><td class="v">+ ${e.dias_extra} días</td></tr>`
            : ''

        return `<div class="page">
<div class="hdr">
<div class="emp">${esc(empresaNombre)}</div>
<div class="tit">LIQUIDACIÓN DE VACACIONES</div>
<div class="per">Período: ${esc(fmtDate(fechaInicio))} al ${esc(fmtDate(fechaFin))} &nbsp;|&nbsp; Generado: ${hoy}</div>
</div>

<div class="sec">1. Datos del Empleado</div>
<table class="dt">
<tr><td class="l">Apellidos y Nombres:</td><td class="v">${esc(`${e.apellidos} ${e.nombres}`)}</td></tr>
<tr><td class="l">Cédula de Identidad:</td><td class="v">${esc(e.cedula)}</td></tr>
<tr><td class="l">Cargo / Función:</td><td class="v">${esc(e.cargo ?? '—')}</td></tr>
<tr><td class="l">Sección / Departamento:</td><td class="v">${esc(e.seccion ?? '—')}</td></tr>
<tr><td class="l">Fecha de Ingreso:</td><td class="v">${fmtDate(e.fecha_ingreso)}</td></tr>
${fSalRow}
<tr><td class="l">Tiempo de servicio:</td><td class="v">${esc(tiempoStr)}</td></tr>
</table>

<div class="sec">2. Período de Cálculo</div>
<table class="dt">
<tr><td class="l">Período analizado:</td><td class="v">${esc(fmtDate(fechaInicio))} al ${esc(fmtDate(fechaFin))}</td></tr>
<tr><td class="l">Nóminas procesadas:</td><td class="v">${e.periodos_count} nóminas (${e.periodos_dias_nominales} días nominales)</td></tr>
</table>

<div class="sec">3. Base de Cálculo — Método 1/24 (Art. 69 Código del Trabajo)</div>
<table class="dt">
<tr><td class="l">Total remuneraciones del período<br><small style="font-weight:normal;color:#888">(sueldos + horas extra + otros ingresos salariales; excluye décimos, viáticos, utilidades)</small></td><td class="v">${esc(fmt(e.total_percibido))}</td></tr>
<tr><td class="l">Valor 1/24 (total ÷ 24) — equivale a los 15 días de vacación:</td><td class="v vhl">${esc(fmt(e.valor_1_24))}</td></tr>
<tr><td class="l">Valor por día de vacación (total ÷ 360):</td><td class="v">${esc(fmt(e.valor_por_dia))}</td></tr>
</table>

<div class="sec">4. Días de Vacaciones</div>
<table class="dt">
<tr><td class="l">Días de vacación por ley (Art. 69 CT):</td><td class="v">${e.dias_base} días</td></tr>
${extraRow}
<tr><td class="l">Total días generados en el período:</td><td class="v vhl">${e.dias_generados} días</td></tr>
<tr><td class="l">Días gozados / tomados:</td><td class="v">${e.dias_gozados} días</td></tr>
<tr><td class="l">Días pendientes a liquidar:</td><td class="v">${e.dias_pendientes} días</td></tr>
</table>

<div class="sec">5. Liquidación Final</div>
<table class="dt">
<tr><td class="l">Días pendientes a pagar:</td><td class="v">${e.dias_pendientes} días</td></tr>
<tr><td class="l">Valor por día de vacación:</td><td class="v">${esc(fmt(e.valor_por_dia))}</td></tr>
<tr class="total"><td class="l" style="font-size:10pt">TOTAL A PERCIBIR POR VACACIONES:</td><td class="v" style="font-size:11pt">${esc(fmt(e.valor_vacaciones))}</td></tr>
</table>

<div class="sig">
<div class="sb">
<div class="sl"></div>
<p class="sn">EMPLEADOR</p>
<p>${esc(empresaNombre)}</p>
</div>
<div class="sb">
<div class="sl"></div>
<p class="sn">RECIBÍ CONFORME</p>
<p>${esc(`${e.apellidos} ${e.nombres}`)}</p>
<p>C.I.: ${esc(e.cedula)}</p>
<p style="margin-top:8px">Fecha: ________________________________</p>
</div>
</div>

<div class="note">Art. 69 y 71 del Código del Trabajo de la República del Ecuador — Cálculo basado en el método 1/24 de las remuneraciones del período</div>
</div>`
    }).join('\n')

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Comprobantes Vacaciones</title><style>${css}</style></head>
<body>${pages}</body></html>`
}

// ─── Página ───────────────────────────────────────────────────────────────────
export function LiquidacionVacacionesPage() {
    const { empresa } = useAuth() as any

    const hoy   = new Date()
    const hace1 = new Date(hoy)
    hace1.setFullYear(hace1.getFullYear() - 1)

    const [fechaInicio,  setFechaInicio]  = useState(toISO(hace1))
    const [fechaFin,     setFechaFin]     = useState(toISO(hoy))
    const [diasGozados,  setDiasGozados]  = useState(0)
    const [lineas,       setLineas]       = useState<DatosLiquidacionVacaciones[]>([])
    const [cargando,     setCargando]     = useState(false)
    const [error,        setError]        = useState<string | null>(null)
    const [calculado,    setCalculado]    = useState(false)

    async function calcular() {
        if (!empresa?.id) return
        setCargando(true); setError(null)
        try {
            const result = await liquidacionVacacionesService.calcularTodos(
                empresa.id, fechaInicio, fechaFin, diasGozados
            )
            setLineas(result)
            setCalculado(true)
        } catch (e: any) {
            setError(e.message ?? 'Error al calcular')
        } finally {
            setCargando(false)
        }
    }

    const porSeccion = useMemo<[string, DatosLiquidacionVacaciones[]][]>(() => {
        const map = new Map<string, DatosLiquidacionVacaciones[]>()
        for (const l of lineas) {
            const sec = l.seccion ?? 'SIN SECCIÓN'
            const arr = map.get(sec) ?? []
            arr.push(l)
            map.set(sec, arr)
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    }, [lineas])

    const totalGeneral = useMemo(
        () => lineas.reduce((s, l) => s + l.valor_vacaciones, 0),
        [lineas]
    )

    function abrirVentana(html: string, filename: string) {
        const win = window.open('', '_blank', 'width=960,height=720')
        if (win) {
            win.document.write(html)
            win.document.close()
            setTimeout(() => win.print(), 300)
        } else {
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
            const url  = URL.createObjectURL(blob)
            const a    = document.createElement('a')
            a.href = url; a.download = filename; a.click()
            URL.revokeObjectURL(url)
        }
    }

    return (
        <div className="p-4 space-y-4">
            {/* ── Cabecera ── */}
            <div className="flex items-center gap-2">
                <Sun className="w-6 h-6 text-amber-500" />
                <h1 className="text-xl font-bold text-gray-800">Liquidación de Vacaciones</h1>
            </div>

            {/* ── Filtros ── */}
            <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Período Desde
                        </label>
                        <input type="date" value={fechaInicio}
                            onChange={e => { setFechaInicio(e.target.value); setCalculado(false) }}
                            className="border rounded-md px-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Hasta
                        </label>
                        <input type="date" value={fechaFin}
                            onChange={e => { setFechaFin(e.target.value); setCalculado(false) }}
                            className="border rounded-md px-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Días Gozados (todos)
                        </label>
                        <input type="number" value={diasGozados} min={0} max={30} step={1}
                            onChange={e => { setDiasGozados(Math.max(0, Number(e.target.value))); setCalculado(false) }}
                            className="border rounded-md px-3 py-2 text-sm w-28 focus:ring-amber-500 focus:border-amber-500" />
                    </div>

                    <button
                        onClick={calcular}
                        disabled={cargando || !empresa?.id}
                        className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
                    >
                        <Calculator className="w-4 h-4" />
                        {cargando ? 'Calculando…' : 'Calcular'}
                    </button>

                    {calculado && lineas.length > 0 && (
                        <>
                            <button
                                onClick={() => abrirVentana(
                                    buildHtmlTabla(empresa?.nombre ?? '', fechaInicio, fechaFin, porSeccion, lineas.length),
                                    'vacaciones_tabla.html'
                                )}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700"
                            >
                                <Printer className="w-4 h-4" />
                                Tabla Resumen
                            </button>
                            <button
                                onClick={() => abrirVentana(
                                    buildHtmlComprobantes(empresa?.nombre ?? '', fechaInicio, fechaFin, lineas),
                                    'vacaciones_comprobantes.html'
                                )}
                                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-emerald-700"
                            >
                                <FileText className="w-4 h-4" />
                                Comprobantes Individuales
                            </button>
                        </>
                    )}
                </div>

                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded p-2 text-xs text-amber-800">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                        <strong>Art. 69 CT:</strong> Base = total remuneraciones ÷ 24 (1/24). Excluye Décimos, Vacaciones, Utilidades y Viáticos.
                        Días adicionales por antigüedad a partir del 6° año. Solo se procesan períodos <strong>cerrados o liquidados</strong>.
                    </span>
                </div>
            </div>

            {/* ── Error ── */}
            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* ── Sin datos ── */}
            {calculado && lineas.length === 0 && (
                <div className="text-center text-gray-500 py-10 bg-white border rounded-lg">
                    No se encontraron períodos cerrados en el rango seleccionado.
                    <p className="text-xs mt-1 text-gray-400">Solo se consideran períodos con estado <strong>cerrado</strong> o <strong>liquidado</strong>.</p>
                </div>
            )}

            {/* ── Tabla de resultados ── */}
            {calculado && lineas.length > 0 && (
                <div className="space-y-4">
                    {porSeccion.map(([secName, emps]) => {
                        const sTotal = emps.reduce((s, e) => s + e.valor_vacaciones, 0)
                        return (
                            <div key={secName} className="bg-white border rounded-lg overflow-hidden shadow-sm">
                                <div className="bg-amber-600 text-white px-4 py-2 font-bold text-sm tracking-wide">
                                    {secName}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 border-b text-xs text-gray-600 font-semibold">
                                                <th className="px-2 py-2 text-center w-8">#</th>
                                                <th className="px-3 py-2 text-left">Apellidos y Nombres</th>
                                                <th className="px-3 py-2 text-center">Ingreso</th>
                                                <th className="px-3 py-2 text-center">Antigüedad</th>
                                                <th className="px-3 py-2 text-center">Días Vac.</th>
                                                <th className="px-3 py-2 text-right">Base Ingresos</th>
                                                <th className="px-3 py-2 text-right">Valor 1/24</th>
                                                <th className="px-3 py-2 text-center">Gozados / Pend.</th>
                                                <th className="px-3 py-2 text-right text-green-700">TOTAL VAC.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {emps.map((emp, i) => (
                                                <tr key={emp.empleado_id}
                                                    className={i % 2 === 0 ? 'bg-white hover:bg-amber-50' : 'bg-gray-50 hover:bg-amber-50'}>
                                                    <td className="px-2 py-1.5 text-center text-gray-400 text-xs">{i + 1}</td>
                                                    <td className="px-3 py-1.5 font-medium text-gray-800">
                                                        {emp.apellidos} {emp.nombres}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-center text-xs text-gray-600">
                                                        {fmtDate(emp.fecha_ingreso)}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-center">
                                                        <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                                                            {emp.anios_trabajados}a {emp.meses_adicionales}m
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-center font-medium">
                                                        {emp.dias_generados}
                                                        {emp.dias_extra > 0 && (
                                                            <span className="ml-1 text-xs text-blue-600">(+{emp.dias_extra})</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                                        {fmt(emp.total_percibido)}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right tabular-nums text-blue-700 font-medium">
                                                        {fmt(emp.valor_1_24)}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-center text-xs">
                                                        <span className={emp.dias_gozados > 0 ? 'text-amber-600' : 'text-gray-500'}>
                                                            {emp.dias_gozados}
                                                        </span>
                                                        {' / '}
                                                        <span className="font-medium text-gray-800">{emp.dias_pendientes}</span>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-bold text-green-700 tabular-nums">
                                                        {fmt(emp.valor_vacaciones)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-amber-300 bg-amber-50 font-semibold text-sm">
                                                <td colSpan={8} className="px-3 py-2 text-right text-amber-800">
                                                    Subtotal {secName} ({emps.length} empleado{emps.length !== 1 ? 's' : ''}):
                                                </td>
                                                <td className="px-3 py-2 text-right text-green-700 tabular-nums">
                                                    {fmt(sTotal)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )
                    })}

                    {/* ── Total General ── */}
                    <div className="bg-amber-600 text-white rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4 shadow">
                        <span className="font-bold text-sm">TOTAL GENERAL — {lineas.length} empleados</span>
                        <div className="text-right">
                            <div className="text-xs text-amber-200">TOTAL A PAGAR POR VACACIONES</div>
                            <div className="font-bold text-xl tabular-nums">{fmt(totalGeneral)}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
