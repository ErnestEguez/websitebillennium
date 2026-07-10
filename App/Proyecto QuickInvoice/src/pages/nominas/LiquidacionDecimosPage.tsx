import { useState, useMemo } from 'react'
import { HelpButton } from '../../components/help/HelpButton'
import { FileText, Calculator, Printer, AlertTriangle, Info } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
    liquidacionDecimosService,
    type LineaLiquidacionDecimo,
} from '../../services/nominas/liquidacionDecimosService'

type TipoDecimo  = 'tercero' | 'cuarto'
type RegionDecimo = 'sierra' | 'costa'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FMT = new Intl.NumberFormat('es-EC', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
})
const fmt      = (n: number) => FMT.format(n)
const fmtDate  = (s?: string | null) =>
    s ? new Date(s + 'T00:00:00').toLocaleDateString('es-EC', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    }) : '—'
const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function defaultFechas(tipo: TipoDecimo, anio: number, region: RegionDecimo) {
    if (tipo === 'tercero') {
        return { inicio: `${anio - 1}-12-01`, fin: `${anio}-11-30` }
    }
    if (region === 'costa') {
        const feb = anio % 4 === 0 ? '29' : '28'
        return { inicio: `${anio - 1}-03-01`, fin: `${anio}-02-${feb}` }
    }
    return { inicio: `${anio - 1}-08-01`, fin: `${anio}-07-31` }
}

// ─── Print HTML ───────────────────────────────────────────────────────────────
function buildHtml(
    empresaNombre: string,
    tipo: TipoDecimo,
    region: RegionDecimo,
    fechaInicio: string,
    fechaFin: string,
    porSeccion: [string, LineaLiquidacionDecimo[]][],
    totalLineas: number,
): string {
    const titulo = tipo === 'tercero'
        ? 'LIQUIDACIÓN DÉCIMO TERCERO SUELDO'
        : 'LIQUIDACIÓN DÉCIMO CUARTO SUELDO'

    const css = `
@page { size: A4 portrait; margin: 12mm 8mm; }
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}
body{font-size:8.5pt;color:#111}
.hdr{text-align:center;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #1d4ed8}
.hdr h2{font-size:10.5pt;font-weight:bold;color:#1e40af;text-transform:uppercase}
.hdr h1{font-size:9pt;font-weight:bold;margin-top:2px}
.hdr p{font-size:7.5pt;color:#555;margin-top:3px}
table{width:100%;border-collapse:collapse;margin-top:4px}
th{background:#1d4ed8;color:#fff;font-size:7.5pt;padding:4px 3px;text-align:center;border:1px solid #1e40af}
td{font-size:7pt;padding:3px;border:1px solid #d1d5db;vertical-align:middle}
.r{text-align:right} .c{text-align:center}
.sec-tr td{background:#dbeafe;font-weight:bold;font-size:8pt;color:#1e3a8a;border-top:2px solid #1d4ed8}
.sub-tr td{background:#eff6ff;font-weight:bold;font-size:7.5pt}
.grand-tr td{background:#1d4ed8;color:#fff;font-weight:bold;font-size:8pt}
.firma{border-bottom:1px solid #666;width:68px;display:inline-block}
.pb{page-break-before:always}
`
    const esDec3 = tipo === 'tercero'

    let rows = ''
    let grandDecimo = 0, grandRecibido = 0, grandPercibir = 0
    let first = true

    for (const [sec, emps] of porSeccion) {
        let sD = 0, sR = 0, sP = 0, sDias = 0
        rows += `<tr class="sec-tr${first ? '' : ' pb'}"><td colspan="9">&nbsp;&nbsp;SECCIÓN: ${esc(sec)}</td></tr>`
        first = false

        emps.forEach((e, i) => {
            sD += e.valor_decimo; sR += e.ya_recibido; sP += e.valor_percibir
            sDias += e.dias_trabajados
            const nombre = esc(`${e.apellidos} ${e.nombres}`)
            const modo   = e.decimo_modo === 'mensualizado' ? 'Mens.' : 'Acum.'
            const fSal   = e.fecha_salida ? fmtDate(e.fecha_salida) : 'Activo'
            if (esDec3) {
                rows += `<tr>
<td class="c">${i + 1}</td><td>${nombre}</td>
<td class="c">${fmtDate(e.fecha_ingreso)}</td><td class="c">${fSal}</td>
<td class="r">${fmt(e.base_calculo)}</td><td class="c">${modo}</td>
<td class="r">${fmt(e.ya_recibido)}</td><td class="r">${fmt(e.valor_percibir)}</td>
<td class="c"><span class="firma">&nbsp;</span></td></tr>`
            } else {
                rows += `<tr>
<td class="c">${i + 1}</td><td>${nombre}</td>
<td class="c">${fmtDate(e.fecha_ingreso)}</td><td class="c">${fSal}</td>
<td class="c">${e.dias_trabajados}</td><td class="r">${fmt(e.base_calculo)}</td>
<td class="c">${modo}</td><td class="r">${fmt(e.valor_percibir)}</td>
<td class="c"><span class="firma">&nbsp;</span></td></tr>`
            }
        })

        grandDecimo += sD; grandRecibido += sR; grandPercibir += sP

        if (esDec3) {
            rows += `<tr class="sub-tr">
<td colspan="4" class="r">Subtotal ${esc(sec)} (${emps.length} empl.):</td>
<td class="r">${fmt(sD)}</td><td></td>
<td class="r">${fmt(sR)}</td><td class="r">${fmt(sP)}</td><td></td></tr>`
        } else {
            rows += `<tr class="sub-tr">
<td colspan="4" class="r">Subtotal ${esc(sec)} (${emps.length} empl.):</td>
<td class="c">${sDias}</td><td></td><td></td>
<td class="r">${fmt(sP)}</td><td></td></tr>`
        }
    }

    if (esDec3) {
        rows += `<tr class="grand-tr">
<td colspan="4" class="r">TOTAL GENERAL (${totalLineas} empleados):</td>
<td class="r">${fmt(grandDecimo * 12)}</td><td></td>
<td class="r">${fmt(grandRecibido)}</td><td class="r">${fmt(grandPercibir)}</td>
<td></td></tr>`
    } else {
        rows += `<tr class="grand-tr">
<td colspan="7" class="r">TOTAL GENERAL (${totalLineas} empleados):</td>
<td class="r">${fmt(grandPercibir)}</td><td></td></tr>`
    }

    const regionLabel = region === 'costa' ? ' &nbsp;|&nbsp; Región: Costa / Galápagos' : ' &nbsp;|&nbsp; Región: Sierra / Amazonía'
    const headDec3 = `<th width="24">#</th><th>Apellidos y Nombres</th>
<th width="68">F. Ingreso</th><th width="62">F. Salida</th>
<th width="80">Base Cálculo</th><th width="44">Modo</th>
<th width="78">Ya Recibido</th><th width="78">A Percibir</th><th width="72">Firma</th>`

    const headDec4 = `<th width="24">#</th><th>Apellidos y Nombres</th>
<th width="68">F. Ingreso</th><th width="62">F. Salida</th>
<th width="44">Días</th><th width="62">SBU</th><th width="44">Modo</th>
<th width="78">A Percibir</th><th width="72">Firma</th>`

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>${esc(titulo)}</title><style>${css}</style></head>
<body>
<div class="hdr">
<h2>${esc(empresaNombre)}</h2>
<h1>${titulo}</h1>
<p>Período: ${esc(fmtDate(fechaInicio))} al ${esc(fmtDate(fechaFin))}${tipo === 'cuarto' ? regionLabel : ''}</p>
</div>
<table>
<thead><tr>${esDec3 ? headDec3 : headDec4}</tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`
}

// ─── Página ───────────────────────────────────────────────────────────────────
export function LiquidacionDecimosPage() {
    const { empresa } = useAuth() as any
    const anioActual = new Date().getFullYear()

    const [tipo,         setTipo]         = useState<TipoDecimo>('tercero')
    const [region,       setRegion]       = useState<RegionDecimo>('sierra')
    const [anio,         setAnio]         = useState(anioActual)
    const [fechaInicio,  setFechaInicio]  = useState(() => defaultFechas('tercero', anioActual, 'sierra').inicio)
    const [fechaFin,     setFechaFin]     = useState(() => defaultFechas('tercero', anioActual, 'sierra').fin)
    const [lineas,       setLineas]       = useState<LineaLiquidacionDecimo[]>([])
    const [cargando,     setCargando]     = useState(false)
    const [error,        setError]        = useState<string | null>(null)
    const [calculado,    setCalculado]    = useState(false)

    function actualizarFechas(t: TipoDecimo, a: number, r: RegionDecimo) {
        const f = defaultFechas(t, a, r)
        setFechaInicio(f.inicio)
        setFechaFin(f.fin)
    }

    function handleTipo(v: TipoDecimo) {
        setTipo(v); actualizarFechas(v, anio, region)
        setLineas([]); setCalculado(false)
    }
    function handleAnio(v: number) {
        setAnio(v); actualizarFechas(tipo, v, region)
        setLineas([]); setCalculado(false)
    }
    function handleRegion(v: RegionDecimo) {
        setRegion(v); if (tipo === 'cuarto') actualizarFechas(tipo, anio, v)
        setLineas([]); setCalculado(false)
    }

    async function calcular() {
        if (!empresa?.id) return
        setCargando(true); setError(null)
        try {
            const result = tipo === 'tercero'
                ? await liquidacionDecimosService.calcularDecTercero(empresa.id, fechaInicio, fechaFin)
                : await liquidacionDecimosService.calcularDecCuarto(empresa.id, fechaInicio, fechaFin)
            setLineas(result)
            setCalculado(true)
        } catch (e: any) {
            setError(e.message ?? 'Error al calcular')
        } finally {
            setCargando(false)
        }
    }

    const porSeccion = useMemo<[string, LineaLiquidacionDecimo[]][]>(() => {
        const map = new Map<string, LineaLiquidacionDecimo[]>()
        for (const l of lineas) {
            const sec = l.seccion ?? 'SIN SECCIÓN'
            const arr = map.get(sec) ?? []
            arr.push(l)
            map.set(sec, arr)
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    }, [lineas])

    const totales = useMemo(() => lineas.reduce(
        (a, l) => ({
            valor_decimo:   a.valor_decimo   + l.valor_decimo,
            ya_recibido:    a.ya_recibido    + l.ya_recibido,
            valor_percibir: a.valor_percibir + l.valor_percibir,
        }),
        { valor_decimo: 0, ya_recibido: 0, valor_percibir: 0 }
    ), [lineas])

    function imprimir() {
        const html = buildHtml(
            empresa?.nombre ?? '',
            tipo, region,
            fechaInicio, fechaFin,
            porSeccion, lineas.length
        )
        const win = window.open('', '_blank', 'width=920,height=720')
        if (win) {
            win.document.write(html)
            win.document.close()
            setTimeout(() => win.print(), 300)
        } else {
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
            const url  = URL.createObjectURL(blob)
            const a    = document.createElement('a')
            a.href     = url
            a.download = `decimo_${tipo === 'tercero' ? '13' : '14'}_${anio}.html`
            a.click()
            URL.revokeObjectURL(url)
        }
    }

    const anios = [anioActual - 2, anioActual - 1, anioActual, anioActual + 1]

    return (
        <div className="p-4 space-y-4">
            {/* ── Cabecera ── */}
            <div className="flex items-center gap-2">
                <FileText className="w-6 h-6 text-cyan-600" />
                <h1 className="text-xl font-bold text-gray-800">Liquidación de Décimos</h1>
                <HelpButton pageKey="decimos" />
            </div>

            {/* ── Filtros ── */}
            <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Tipo de Décimo
                        </label>
                        <select
                            value={tipo}
                            onChange={e => handleTipo(e.target.value as TipoDecimo)}
                            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
                        >
                            <option value="tercero">Décimo Tercero (13ro)</option>
                            <option value="cuarto">Décimo Cuarto (14to)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Año de Pago
                        </label>
                        <select
                            value={anio}
                            onChange={e => handleAnio(Number(e.target.value))}
                            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
                        >
                            {anios.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    {tipo === 'cuarto' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                                Región
                            </label>
                            <select
                                value={region}
                                onChange={e => handleRegion(e.target.value as RegionDecimo)}
                                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
                            >
                                <option value="sierra">Sierra / Amazonía (pago 15 ago)</option>
                                <option value="costa">Costa / Galápagos (pago 15 mar)</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* Período personalizable */}
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Período Desde
                        </label>
                        <input
                            type="date" value={fechaInicio}
                            onChange={e => { setFechaInicio(e.target.value); setCalculado(false) }}
                            className="border rounded-md px-3 py-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Hasta
                        </label>
                        <input
                            type="date" value={fechaFin}
                            onChange={e => { setFechaFin(e.target.value); setCalculado(false) }}
                            className="border rounded-md px-3 py-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
                        />
                    </div>

                    <button
                        onClick={calcular}
                        disabled={cargando || !empresa?.id}
                        className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50"
                    >
                        <Calculator className="w-4 h-4" />
                        {cargando ? 'Calculando…' : 'Calcular'}
                    </button>

                    {calculado && lineas.length > 0 && (
                        <button
                            onClick={imprimir}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700"
                        >
                            <Printer className="w-4 h-4" />
                            Imprimir Reporte
                        </button>
                    )}
                </div>

                {/* Aviso cálculo */}
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded p-2 text-xs text-blue-700">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    {tipo === 'tercero'
                        ? 'Solo se incluyen períodos cerrados o liquidados en el rango. Base = todos los ingresos excepto DEC4, vacaciones y utilidades.'
                        : 'Solo se incluyen períodos cerrados o liquidados en el rango. Valor = SBU ÷ 360 × días trabajados.'}
                </div>
            </div>

            {/* ── Error ── */}
            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4" />
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

            {/* ── Resultados por sección ── */}
            {calculado && lineas.length > 0 && (
                <div className="space-y-4">
                    {porSeccion.map(([secName, emps]) => {
                        const sDecimo   = emps.reduce((s, e) => s + e.valor_decimo,   0)
                        const sRecibido = emps.reduce((s, e) => s + e.ya_recibido,    0)
                        const sPercibir = emps.reduce((s, e) => s + e.valor_percibir, 0)
                        const sDias     = emps.reduce((s, e) => s + e.dias_trabajados, 0)

                        return (
                            <div key={secName} className="bg-white border rounded-lg overflow-hidden shadow-sm">
                                <div className="bg-blue-700 text-white px-4 py-2 font-bold text-sm tracking-wide">
                                    {secName}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 border-b text-xs text-gray-600 font-semibold">
                                                <th className="px-2 py-2 text-center w-8">#</th>
                                                <th className="px-3 py-2 text-left">Apellidos y Nombres</th>
                                                <th className="px-3 py-2 text-center">F. Ingreso</th>
                                                <th className="px-3 py-2 text-center">F. Salida</th>
                                                {tipo === 'cuarto' && <th className="px-3 py-2 text-center">Días</th>}
                                                <th className="px-3 py-2 text-right">
                                                    {tipo === 'tercero' ? 'Base Cálculo' : 'SBU'}
                                                </th>
                                                <th className="px-3 py-2 text-center">Modo</th>
                                                {tipo === 'tercero' && (
                                                    <th className="px-3 py-2 text-right">Ya Recibido</th>
                                                )}
                                                <th className="px-3 py-2 text-right text-green-700">A Percibir</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {emps.map((emp, i) => (
                                                <tr
                                                    key={emp.empleado_id}
                                                    className={i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}
                                                >
                                                    <td className="px-2 py-1.5 text-center text-gray-400 text-xs">{i + 1}</td>
                                                    <td className="px-3 py-1.5 font-medium text-gray-800">
                                                        {emp.apellidos} {emp.nombres}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-center text-gray-600 text-xs">
                                                        {fmtDate(emp.fecha_ingreso)}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-center text-xs">
                                                        {emp.fecha_salida
                                                            ? <span className="text-gray-600">{fmtDate(emp.fecha_salida)}</span>
                                                            : <span className="text-green-600 font-medium">Activo</span>
                                                        }
                                                    </td>
                                                    {tipo === 'cuarto' && (
                                                        <td className="px-3 py-1.5 text-center font-medium">
                                                            {emp.dias_trabajados}
                                                        </td>
                                                    )}
                                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                                        {fmt(emp.base_calculo)}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-center">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                            emp.decimo_modo === 'mensualizado'
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : 'bg-amber-100 text-amber-700'
                                                        }`}>
                                                            {emp.decimo_modo === 'mensualizado' ? 'Mens.' : 'Acum.'}
                                                        </span>
                                                    </td>
                                                    {tipo === 'tercero' && (
                                                        <td className="px-3 py-1.5 text-right text-gray-500 tabular-nums">
                                                            {fmt(emp.ya_recibido)}
                                                        </td>
                                                    )}
                                                    <td className="px-3 py-1.5 text-right font-bold text-green-700 tabular-nums">
                                                        {fmt(emp.valor_percibir)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-blue-300 bg-blue-50 font-semibold text-sm">
                                                <td colSpan={tipo === 'cuarto' ? 4 : 4}
                                                    className="px-3 py-2 text-right text-blue-800">
                                                    Subtotal ({emps.length} empleado{emps.length !== 1 ? 's' : ''}):
                                                </td>
                                                {tipo === 'cuarto' && (
                                                    <td className="px-3 py-2 text-center text-blue-800">{sDias}</td>
                                                )}
                                                <td className="px-3 py-2 text-right text-blue-800 tabular-nums">
                                                    {fmt(sDecimo)}
                                                </td>
                                                <td className="px-3 py-2"></td>
                                                {tipo === 'tercero' && (
                                                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                                                        {fmt(sRecibido)}
                                                    </td>
                                                )}
                                                <td className="px-3 py-2 text-right text-green-700 tabular-nums">
                                                    {fmt(sPercibir)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )
                    })}

                    {/* ── Total General ── */}
                    <div className="bg-blue-700 text-white rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4 shadow">
                        <span className="font-bold text-sm">
                            TOTAL GENERAL — {lineas.length} empleados
                        </span>
                        <div className="flex gap-6 text-right">
                            {tipo === 'tercero' && (
                                <>
                                    <div>
                                        <div className="text-xs text-blue-200">Base Ingresos</div>
                                        <div className="font-bold tabular-nums">{fmt(totales.valor_decimo * 12)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-blue-200">Décimo Calculado</div>
                                        <div className="font-bold tabular-nums">{fmt(totales.valor_decimo)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-blue-200">Ya Recibido</div>
                                        <div className="font-bold tabular-nums">{fmt(totales.ya_recibido)}</div>
                                    </div>
                                </>
                            )}
                            {tipo === 'cuarto' && (
                                <div>
                                    <div className="text-xs text-blue-200">Total Dec. Calculado</div>
                                    <div className="font-bold tabular-nums">{fmt(totales.valor_decimo)}</div>
                                </div>
                            )}
                            <div>
                                <div className="text-xs text-blue-200 font-semibold">TOTAL A PAGAR</div>
                                <div className="font-bold text-lg tabular-nums">{fmt(totales.valor_percibir)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
