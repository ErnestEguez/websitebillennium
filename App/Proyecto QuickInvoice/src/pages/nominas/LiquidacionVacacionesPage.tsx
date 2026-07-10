import { useState, useEffect } from 'react'
import { HelpButton } from '../../components/help/HelpButton'
import { Sun, Calculator, Printer, AlertTriangle, Info, User } from 'lucide-react'
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

// ─── HTML: Comprobante individual vertical ───────────────────────────────────
function buildComprobante(
    empresaNombre: string,
    fechaInicio: string,
    fechaFin: string,
    e: DatosLiquidacionVacaciones,
): string {
    const hoy = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const tiempoStr = `${e.anios_trabajados} año${e.anios_trabajados !== 1 ? 's' : ''} ${e.meses_adicionales} mes${e.meses_adicionales !== 1 ? 'es' : ''}`
    const fSalRow   = e.fecha_salida
        ? `<tr><td class="l">Fecha de Salida:</td><td class="v">${fmtDate(e.fecha_salida)}</td></tr>`
        : ''
    const extraRow  = e.dias_extra > 0
        ? `<tr><td class="l">Días adicionales por antigüedad (${e.anios_trabajados} años &gt; 5):</td><td class="v">+ ${e.dias_extra} días</td></tr>`
        : ''

    const css = `
@page{size:A4 portrait;margin:18mm 15mm}
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}
body{font-size:9.5pt;color:#111}
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
.vhl{color:#1d4ed8;font-size:10pt}
.total td{background:#1e40af!important;color:#fff!important;font-weight:bold!important;font-size:10pt}
.sig{margin-top:36px;display:flex;justify-content:space-between}
.sb{width:45%;text-align:center}
.sl{border-top:1.5px solid #374151;margin:52px 0 6px}
.sb p{font-size:8.5pt;margin:2px 0;color:#374151}
.sb .sn{font-weight:bold;font-size:9pt;color:#111}
.note{font-size:7.5pt;color:#888;margin-top:10px;text-align:center;border-top:1px solid #e5e7eb;padding-top:6px}
`

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Liquidación Vacaciones</title><style>${css}</style></head>
<body>
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
<tr><td class="l">Nóminas procesadas:</td><td class="v">${e.periodos_count} nómina${e.periodos_count !== 1 ? 's' : ''} (${e.periodos_dias_nominales} días nominales)</td></tr>
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

<div class="note">Art. 69 y 71 del Código del Trabajo de la República del Ecuador — Método 1/24 de las remuneraciones del período</div>
</body></html>`
}

// ─── Fila del detalle en pantalla ─────────────────────────────────────────────
function FilaDetalle({ label, value, highlight = false, total = false }: {
    label: string; value: string; highlight?: boolean; total?: boolean
}) {
    if (total) {
        return (
            <div className="flex justify-between items-center bg-blue-700 text-white rounded px-4 py-3 mt-2">
                <span className="font-bold text-sm">{label}</span>
                <span className="font-bold text-lg tabular-nums">{value}</span>
            </div>
        )
    }
    return (
        <div className="flex justify-between items-start py-1.5 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-600 pr-4">{label}</span>
            <span className={`text-sm font-semibold tabular-nums text-right ${highlight ? 'text-blue-700' : 'text-gray-800'}`}>
                {value}
            </span>
        </div>
    )
}

function SeccionDetalle({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div className="mb-3">
            <div className="bg-blue-700 text-white text-xs font-bold px-3 py-1.5 uppercase tracking-wide rounded-t">
                {titulo}
            </div>
            <div className="border border-t-0 border-gray-200 rounded-b px-3 py-1">
                {children}
            </div>
        </div>
    )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function LiquidacionVacacionesPage() {
    const { empresa } = useAuth() as any

    const hoy   = new Date()
    const hace1 = new Date(hoy)
    hace1.setFullYear(hace1.getFullYear() - 1)

    // Lista de empleados para el selector
    const [empleados, setEmpleados] = useState<{ id: string; nombres: string; apellidos: string; cedula: string }[]>([])

    // Formulario
    const [empleadoId,  setEmpleadoId]  = useState('')
    const [fechaInicio, setFechaInicio] = useState(toISO(hace1))
    const [fechaFin,    setFechaFin]    = useState(toISO(hoy))
    const [diasGozados, setDiasGozados] = useState(0)

    // Estado de cálculo
    const [datos,       setDatos]       = useState<DatosLiquidacionVacaciones | null>(null)
    const [cargando,    setCargando]    = useState(false)
    const [error,       setError]       = useState<string | null>(null)

    // Cargar empleados al montar
    useEffect(() => {
        if (!empresa?.id) return
        liquidacionVacacionesService.getEmpleados(empresa.id)
            .then(setEmpleados)
            .catch(e => setError(e.message))
    }, [empresa?.id])

    async function calcular() {
        if (!empresa?.id || !empleadoId) return
        setCargando(true); setError(null); setDatos(null)
        try {
            const result = await liquidacionVacacionesService.calcularUno(
                empresa.id, empleadoId, fechaInicio, fechaFin, diasGozados
            )
            if (result && result.periodos_count === 0) {
                setError('No se encontraron períodos cerrados para este empleado en el rango seleccionado.')
            } else {
                setDatos(result)
            }
        } catch (e: any) {
            setError(e.message ?? 'Error al calcular')
        } finally {
            setCargando(false)
        }
    }

    function imprimir() {
        if (!datos) return
        const html = buildComprobante(empresa?.nombre ?? '', fechaInicio, fechaFin, datos)
        const win  = window.open('', '_blank', 'width=820,height=720')
        if (win) {
            win.document.write(html)
            win.document.close()
            setTimeout(() => win.print(), 300)
        } else {
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
            const url  = URL.createObjectURL(blob)
            const a    = document.createElement('a')
            a.href = url
            a.download = `vacaciones_${datos.apellidos.replace(/\s+/g, '_')}.html`
            a.click()
            URL.revokeObjectURL(url)
        }
    }

    return (
        <div className="p-4 space-y-4">
            {/* ── Cabecera ── */}
            <div className="flex items-center gap-2">
                <Sun className="w-6 h-6 text-amber-500" />
                <h1 className="text-xl font-bold text-gray-800">Liquidación de Vacaciones</h1>
                <HelpButton pageKey="vacaciones-nomina" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {/* ── Columna izquierda: Parámetros ── */}
                <div className="bg-white border rounded-lg p-4 space-y-4">
                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Parámetros de Liquidación</h2>

                    {/* Selector de empleado */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Empleado
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <select
                                value={empleadoId}
                                onChange={e => { setEmpleadoId(e.target.value); setDatos(null); setError(null) }}
                                className="w-full border rounded-md pl-9 pr-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500"
                            >
                                <option value="">— Seleccionar empleado —</option>
                                {empleados.map(e => (
                                    <option key={e.id} value={e.id}>
                                        {e.apellidos} {e.nombres} · {e.cedula}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Fechas */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                                Período Desde
                            </label>
                            <input type="date" value={fechaInicio}
                                onChange={e => { setFechaInicio(e.target.value); setDatos(null) }}
                                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                                Hasta
                            </label>
                            <input type="date" value={fechaFin}
                                onChange={e => { setFechaFin(e.target.value); setDatos(null) }}
                                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500" />
                        </div>
                    </div>

                    {/* Días gozados */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Días de Vacación ya Gozados
                        </label>
                        <input type="number" value={diasGozados} min={0} max={30} step={1}
                            onChange={e => { setDiasGozados(Math.max(0, Number(e.target.value))); setDatos(null) }}
                            className="w-32 border rounded-md px-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500" />
                        <p className="text-xs text-gray-500 mt-1">Días que el empleado ya tomó en este período</p>
                    </div>

                    {/* Botones */}
                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={calcular}
                            disabled={cargando || !empleadoId}
                            className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
                        >
                            <Calculator className="w-4 h-4" />
                            {cargando ? 'Calculando…' : 'Calcular'}
                        </button>
                        {datos && (
                            <button
                                onClick={imprimir}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700"
                            >
                                <Printer className="w-4 h-4" />
                                Imprimir Comprobante
                            </button>
                        )}
                    </div>

                    {/* Nota informativa */}
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded p-2 text-xs text-amber-800">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>
                            Solo se suman nóminas en estado <strong>cerrado/liquidado</strong> dentro del rango.
                            Base = todos los ingresos salariales ÷ 24 (Art. 69 CT).
                        </span>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                {/* ── Columna derecha: Resultado ── */}
                <div>
                    {!datos && !cargando && (
                        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center py-16 text-gray-400">
                            <Sun className="w-10 h-10 mb-3 text-amber-200" />
                            <p className="text-sm">Selecciona un empleado y haz clic en <strong>Calcular</strong></p>
                            <p className="text-xs mt-1">El desglose aparecerá aquí</p>
                        </div>
                    )}

                    {cargando && (
                        <div className="bg-white border rounded-lg flex items-center justify-center py-16 text-gray-400 text-sm">
                            Calculando…
                        </div>
                    )}

                    {datos && (
                        <div>
                            {/* Nombre del empleado como encabezado */}
                            <div className="bg-amber-500 text-white rounded-t-lg px-4 py-3">
                                <p className="font-bold text-base">{datos.apellidos} {datos.nombres}</p>
                                <p className="text-xs text-amber-100">
                                    C.I. {datos.cedula} · {datos.cargo ?? '—'} · {datos.seccion ?? '—'}
                                </p>
                            </div>
                            <div className="bg-white border border-t-0 rounded-b-lg p-4 space-y-0">
                                <SeccionDetalle titulo="1. Datos del Empleado">
                                    <FilaDetalle label="Fecha de Ingreso" value={fmtDate(datos.fecha_ingreso)} />
                                    {datos.fecha_salida && (
                                        <FilaDetalle label="Fecha de Salida" value={fmtDate(datos.fecha_salida)} />
                                    )}
                                    <FilaDetalle
                                        label="Tiempo de servicio"
                                        value={`${datos.anios_trabajados} año${datos.anios_trabajados !== 1 ? 's' : ''} ${datos.meses_adicionales} mes${datos.meses_adicionales !== 1 ? 'es' : ''}`}
                                    />
                                </SeccionDetalle>

                                <SeccionDetalle titulo="2. Período de Cálculo">
                                    <FilaDetalle
                                        label="Período"
                                        value={`${fmtDate(fechaInicio)} al ${fmtDate(fechaFin)}`}
                                    />
                                    <FilaDetalle
                                        label="Nóminas procesadas"
                                        value={`${datos.periodos_count} nómina${datos.periodos_count !== 1 ? 's' : ''} · ${datos.periodos_dias_nominales} días`}
                                    />
                                </SeccionDetalle>

                                <SeccionDetalle titulo="3. Base de Cálculo — Método 1/24">
                                    <FilaDetalle label="Total remuneraciones del período" value={fmt(datos.total_percibido)} />
                                    <FilaDetalle label="Valor 1/24 (÷ 24) = 15 días" value={fmt(datos.valor_1_24)} highlight />
                                    <FilaDetalle label="Valor por día (÷ 360)" value={fmt(datos.valor_por_dia)} />
                                </SeccionDetalle>

                                <SeccionDetalle titulo="4. Días de Vacaciones">
                                    <FilaDetalle label="Días por ley (base)" value={`${datos.dias_base} días`} />
                                    {datos.dias_extra > 0 && (
                                        <FilaDetalle
                                            label={`Días adicionales por antigüedad (${datos.anios_trabajados} años)`}
                                            value={`+ ${datos.dias_extra} días`}
                                            highlight
                                        />
                                    )}
                                    <FilaDetalle label="Total días generados" value={`${datos.dias_generados} días`} highlight />
                                    <FilaDetalle label="Días ya gozados" value={`${datos.dias_gozados} días`} />
                                    <FilaDetalle label="Días pendientes a cobrar" value={`${datos.dias_pendientes} días`} />
                                </SeccionDetalle>

                                <div className="mt-1">
                                    <FilaDetalle
                                        label={`TOTAL VACACIONES (${datos.dias_pendientes} días × ${fmt(datos.valor_por_dia)})`}
                                        value={fmt(datos.valor_vacaciones)}
                                        total
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
