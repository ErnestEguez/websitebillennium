import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2, FileSpreadsheet, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { periodoNominaService } from '../../services/nominas/periodoNominaService'
import { useAuth } from '../../contexts/AuthContext'
import type { PeriodoNomina } from '../../types/nominas'
import { cn } from '../../lib/utils'
import * as XLSX from 'xlsx'

const nominas = () => supabase.schema('nominas')

const fmt = (n: number) =>
    n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtFecha = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
}

const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface Linea {
    codigo: string
    nombre: string
    tipo: 'ingreso' | 'descuento'
    monto: number
    orden: number
    horas?: number | null
}

interface CabeceraConLineas {
    id: string
    empleado_id: string
    sueldo_base: number
    total_ingresos: number
    total_descuentos: number
    neto: number
    empleado: { nombres: string; apellidos: string; seccion?: { nombre: string } | null; cargo?: { nombre: string } | null } | null
    lineas: Linea[]
}

interface ColConcepto {
    codigo: string
    nombre: string
    tipo: 'ingreso' | 'descuento'
    orden: number
}

type Vista = 'completo' | 'resumido' | 'descuentos' | 'papeletas'

// ── CSS embebido para documentos impresos ──────────────────────────────────────
function buildCss(landscape: boolean) {
    return `
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { size: ${landscape ? 'A3 landscape' : 'A4 portrait'}; margin: 1.2cm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #0f172a; }
.header { text-align: center; margin-bottom: 14px; }
.header .empresa { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.header .titulo  { font-size: 10pt; font-weight: 700; margin: 3px 0 2px; }
.header .periodo { font-size: 8.5pt; color: #475569; }
.header .borrador {
    display: inline-block; border: 2px solid #dc2626; color: #dc2626;
    font-weight: 900; font-size: 9pt; padding: 2px 14px; margin-top: 5px;
    letter-spacing: 0.1em;
}
.header hr { border: none; border-top: 2px solid #475569; margin-top: 8px; }

/* ── Tablas ── */
table { width: 100%; border-collapse: collapse; margin-top: 6px; }
th {
    background: #f1f5f9; font-weight: 700; font-size: 7.5pt;
    padding: 4px 5px; border: 1px solid #94a3b8;
    text-align: right; vertical-align: bottom; line-height: 1.2;
}
th.left  { text-align: left; }
th.center { text-align: center; }
td {
    padding: 3px 5px; border: 1px solid #cbd5e1;
    font-size: 7.5pt; text-align: right; vertical-align: middle;
}
td.left  { text-align: left; }
td.center { text-align: center; }
tr:nth-child(even) td { background: #f8fafc; }

/* Encabezados de sección */
.sec-ing  { background: #d1fae5 !important; color: #065f46; font-weight: 800;
             text-align: center; font-size: 8pt; border: 1px solid #6ee7b7; }
.sec-desc { background: #fee2e2 !important; color: #7f1d1d; font-weight: 800;
             text-align: center; font-size: 8pt; border: 1px solid #fca5a5; }

/* Celdas de totales por sección */
.col-ing  { color: #065f46; font-weight: 700; background: #f0fdf4; }
.col-desc { color: #7f1d1d; font-weight: 700; background: #fff5f5; }
.col-neto { color: #1e3a8a; font-weight: 800; background: #eff6ff; }

/* Fila de totales globales */
.tfoot-row td {
    font-weight: 800; font-size: 8pt;
    background: #e2e8f0 !important;
    border-top: 2.5px solid #475569;
}
.tfoot-ing-row td  { font-weight: 800; font-size: 8pt; background: #d1fae5 !important; color: #065f46; border-top: 2px solid #6ee7b7; }
.tfoot-desc-row td { font-weight: 800; font-size: 8pt; background: #fee2e2 !important; color: #7f1d1d; border-top: 2px solid #fca5a5; }
.tfoot-neto-row td { font-weight: 900; font-size: 10pt; background: #dbeafe !important; color: #1e3a8a; border-top: 3px solid #1e40af; }
.blank-td { color: #e2e8f0 !important; background: white !important; }
/* ── Agrupamiento por sección ── */
.sec-header-row td {
    background: #1e293b !important; color: white; font-weight: 900;
    font-size: 9pt; letter-spacing: 0.06em; padding: 6px 10px;
    border: 1px solid #334155;
}
.sec-sub-ing td  { font-weight: 700; font-size: 7.5pt; background: #ecfdf5 !important; color: #065f46; border-top: 1px solid #6ee7b7; }
.sec-sub-desc td { font-weight: 700; font-size: 7.5pt; background: #fef2f2 !important; color: #7f1d1d; border-top: 1px solid #fca5a5; }
.sec-sub-neto td { font-weight: 800; font-size: 8pt;   background: #f0f9ff !important; color: #0369a1; border-bottom: 2px solid #0ea5e9; }

/* ── Papeletas ── */
.papeleta {
    page-break-after: always; break-after: page;
    border: 1.5px solid #475569; padding: 1cm;
    max-width: 17cm; margin: 0 auto;
}
.papeleta:last-child { page-break-after: avoid; break-after: avoid; }
.pap-header { text-align: center; border-bottom: 1.5px solid #475569;
               padding-bottom: 8px; margin-bottom: 10px; }
.pap-empresa { font-size: 12pt; font-weight: 900; text-transform: uppercase; }
.pap-titulo  { font-size: 9.5pt; font-weight: 700; margin: 2px 0; }
.pap-periodo { font-size: 8pt; color: #475569; }
.pap-datos   { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px;
               border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 10px; }
.pap-label   { font-size: 7.5pt; color: #64748b; }
.pap-valor   { font-size: 8.5pt; font-weight: 700; }
.pap-cols    { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 10px; }
.pap-col-title {
    font-weight: 800; font-size: 9pt; padding-bottom: 4px;
    border-bottom: 1.5px solid; margin-bottom: 5px;
}
.pap-col-title.ing  { color: #065f46; border-color: #6ee7b7; }
.pap-col-title.desc { color: #7f1d1d; border-color: #fca5a5; }
.pap-linea   { display: flex; justify-content: space-between;
               font-size: 8pt; margin-bottom: 3px; border-bottom: 1px dotted #e2e8f0; padding-bottom: 2px; }
.pap-linea .nombre { color: #334155; }
.pap-linea .monto  { font-weight: 600; }
.pap-subtotal {
    display: flex; justify-content: space-between;
    font-weight: 800; font-size: 9pt;
    border-top: 1.5px solid #94a3b8; padding-top: 4px; margin-top: 5px;
}
.pap-neto {
    display: flex; justify-content: space-between; align-items: center;
    background: #eff6ff; border: 2px solid #1e40af;
    border-radius: 4px; padding: 8px 12px; margin-top: 12px;
    font-weight: 900; color: #1e3a8a;
}
.pap-neto .label { font-size: 10pt; }
.pap-neto .valor { font-size: 13pt; }
.pap-firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 28px; }
.pap-firma  { text-align: center; }
.pap-firma .linea-firma { border-top: 1px solid #0f172a; padding-top: 4px; font-size: 7.5pt; color: #475569; }
.pap-num { text-align: right; font-size: 7pt; color: #cbd5e1; margin-top: 8px; }
`
}

function buildDocumento(titulo: string, body: string, landscape: boolean) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>${buildCss(landscape)}</style>
</head>
<body>
${body}
<script>
window.onload = function() {
    setTimeout(function() { window.print(); }, 300);
};
</script>
</body>
</html>`
}

function abrirVentana(titulo: string, body: string, landscape: boolean) {
    const html = buildDocumento(titulo, body, landscape)

    // Intenta abrir popup
    const win = window.open('', '_blank', 'noopener,noreferrer')
    if (win) {
        win.document.write(html)
        win.document.close()
        return
    }

    // Fallback: descarga como .html para abrir y imprimir con Ctrl+P
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${titulo.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim()}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// ── Componente principal ───────────────────────────────────────────────────────

export function ReportesNominaPage() {
    const { periodoId } = useParams<{ periodoId: string }>()
    const { empresa }   = useAuth() as any
    const navigate      = useNavigate()

    const [periodo, setPeriodo] = useState<PeriodoNomina | null>(null)
    const [cabs, setCabs]       = useState<CabeceraConLineas[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState<string | null>(null)
    const [vista, setVista]     = useState<Vista>('completo')

    useEffect(() => {
        if (periodoId) cargar()
    }, [periodoId])

    async function cargar() {
        setLoading(true)
        setError(null)
        try {
            const [per, rawCabs] = await Promise.all([
                periodoNominaService.obtener(periodoId!),
                nominas()
                    .from('rol_cabecera')
                    .select('id, empleado_id, sueldo_base, total_ingresos, total_descuentos, neto, empleado:empleados(nombres, apellidos, seccion:secciones(nombre), cargo:cargos(nombre)), lineas:rol_lineas(codigo, nombre, tipo, monto, orden, horas)')
                    .eq('periodo_id', periodoId!)
                    .order('created_at'),
            ])
            if (rawCabs.error) throw rawCabs.error
            setPeriodo(per)
            const sorted = (rawCabs.data as unknown as CabeceraConLineas[]).map(c => ({
                ...c,
                lineas: [...(c.lineas ?? [])].sort((a, b) => a.orden - b.orden),
            }))
            setCabs(sorted)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    function getDias(cab: CabeceraConLineas): number {
        const base = periodo?.tipo_nomina === 'mensual' ? 30 : 15
        const falta = cab.lineas.find(l => l.codigo === 'DIAS_FALTA')
        return Math.max(0, base - (falta?.horas ?? 0))
    }

    const allConceptos = (() => {
        const map = new Map<string, ColConcepto>()
        for (const c of cabs) {
            for (const l of c.lineas) {
                if (!map.has(l.codigo)) {
                    map.set(l.codigo, { codigo: l.codigo, nombre: l.nombre, tipo: l.tipo, orden: l.orden })
                }
            }
        }
        return [...map.values()].sort((a, b) => a.orden - b.orden)
    })()

    const colsIngreso   = allConceptos.filter(c => c.tipo === 'ingreso')
    const colsDescuento = allConceptos.filter(c => c.tipo === 'descuento')

    const cabecerasPorSeccion: [string, CabeceraConLineas[]][] = (() => {
        const map = new Map<string, CabeceraConLineas[]>()
        for (const c of cabs) {
            const sec = c.empleado?.seccion?.nombre ?? 'Sin Sección'
            if (!map.has(sec)) map.set(sec, [])
            map.get(sec)!.push(c)
        }
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    })()

    function getMonto(cab: CabeceraConLineas, codigo: string) {
        return cab.lineas.find(l => l.codigo === codigo)?.monto ?? 0
    }

    const esLiquidado = periodo?.estado === 'liquidado'
    const esBorrador  = !esLiquidado
    const nombreEmp   = empresa?.nombre ?? ''

    const totalIngresos   = cabs.reduce((s, c) => s + c.total_ingresos,   0)
    const totalDescuentos = cabs.reduce((s, c) => s + c.total_descuentos, 0)
    const totalNeto       = cabs.reduce((s, c) => s + c.neto,             0)

    // ── Generadores de HTML para ventana popup ─────────────────────────────────

    function htmlEncabezado(tipoReporte: string) {
        return `
<div class="header">
    <div class="empresa">${esc(nombreEmp)}</div>
    <div class="titulo">ROL DE PAGOS</div>
    <div class="periodo">${esc(periodo!.nombre)} &middot; ${fmtFecha(periodo!.fecha_inicio)} &ndash; ${fmtFecha(periodo!.fecha_fin)}</div>
    <div class="titulo" style="margin-top:3px;font-size:9pt">${esc(tipoReporte)}</div>
    ${esBorrador ? '<div class="borrador">*** BORRADOR &mdash; No es documento oficial ***</div>' : ''}
    <hr>
</div>`
    }

    function htmlCompleto(): string {
        const totalCols = 3 + colsIngreso.length + 1 + colsDescuento.length + 1 + 1

        function empRow(cab: CabeceraConLineas) {
            return `
<tr>
    <td class="left">${esc(`${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`)}</td>
    <td class="left">${esc(cab.empleado?.cargo?.nombre ?? '—')}</td>
    <td class="center">${getDias(cab)}</td>
    ${colsIngreso.map(c => { const m = getMonto(cab, c.codigo); return `<td>${m !== 0 ? fmt(m) : '<span style="color:#cbd5e1">—</span>'}</td>` }).join('')}
    <td class="col-ing">${fmt(cab.total_ingresos)}</td>
    ${colsDescuento.map(c => { const m = getMonto(cab, c.codigo); return `<td>${m !== 0 ? fmt(m) : '<span style="color:#cbd5e1">—</span>'}</td>` }).join('')}
    <td class="col-desc">${fmt(cab.total_descuentos)}</td>
    <td class="col-neto">${fmt(cab.neto)}</td>
</tr>`
        }

        const bodyRows = cabecerasPorSeccion.map(([secNombre, secCabs]) => {
            const sI = secCabs.reduce((s, c) => s + c.total_ingresos,   0)
            const sD = secCabs.reduce((s, c) => s + c.total_descuentos, 0)
            const sN = secCabs.reduce((s, c) => s + c.neto,             0)
            return `
<tr class="sec-header-row"><td colspan="${totalCols}">▐  ${esc(secNombre.toUpperCase())}</td></tr>
${secCabs.map(empRow).join('')}
<tr class="sec-sub-ing">
    <td class="left" colspan="3">Sub-Total Ingresos &mdash; ${esc(secNombre)}</td>
    ${colsIngreso.map(c => `<td>${fmt(secCabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}</td>`).join('')}
    <td style="background:#a7f3d0!important;font-weight:900">${fmt(sI)}</td>
    ${colsDescuento.map(() => `<td class="blank-td">—</td>`).join('')}
    <td class="blank-td">—</td><td class="blank-td">—</td>
</tr>
<tr class="sec-sub-desc">
    <td class="left" colspan="3">Sub-Total Descuentos &mdash; ${esc(secNombre)}</td>
    ${colsIngreso.map(() => `<td class="blank-td">—</td>`).join('')}
    <td class="blank-td">—</td>
    ${colsDescuento.map(c => `<td>${fmt(secCabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}</td>`).join('')}
    <td style="background:#fca5a5!important;font-weight:900">${fmt(sD)}</td>
    <td class="blank-td">—</td>
</tr>
<tr class="sec-sub-neto">
    <td class="left" colspan="${3 + colsIngreso.length + 1 + colsDescuento.length + 1}">Neto &mdash; ${esc(secNombre)}</td>
    <td>${fmt(sN)}</td>
</tr>`
        }).join('\n')

        return `
${htmlEncabezado('Rol Completo — Detalle por Concepto')}
<table>
<thead>
    <tr>
        <th colspan="3" style="border:none;background:white"></th>
        <th class="sec-ing" colspan="${colsIngreso.length + 1}">── INGRESOS ──</th>
        <th class="sec-desc" colspan="${colsDescuento.length + 1}">── DESCUENTOS ──</th>
        <th style="border:none;background:white"></th>
    </tr>
    <tr>
        <th class="left" rowspan="2" style="min-width:130px">Empleado</th>
        <th class="left" rowspan="2" style="min-width:100px">Cargo</th>
        <th class="center" rowspan="2" style="min-width:40px">Días</th>
        ${colsIngreso.map(c => `<th><small style="font-weight:400;color:#64748b;font-size:6.5pt">${esc(c.codigo)}</small><br>${esc(c.nombre)}</th>`).join('')}
        <th class="col-ing">Total<br>Ingresos</th>
        ${colsDescuento.map(c => `<th><small style="font-weight:400;color:#64748b;font-size:6.5pt">${esc(c.codigo)}</small><br>${esc(c.nombre)}</th>`).join('')}
        <th class="col-desc">Total<br>Descuentos</th>
        <th class="col-neto">NETO</th>
    </tr>
</thead>
<tbody>
${bodyRows}
</tbody>
<tfoot>
    <tr class="tfoot-ing-row">
        <td class="left" colspan="3">▶ Sub-Total INGRESOS</td>
        ${colsIngreso.map(c => `<td>${fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}</td>`).join('')}
        <td style="background:#a7f3d0!important;font-weight:900">${fmt(totalIngresos)}</td>
        ${colsDescuento.map(() => `<td class="blank-td">—</td>`).join('')}
        <td class="blank-td">—</td>
        <td class="blank-td">—</td>
    </tr>
    <tr class="tfoot-desc-row">
        <td class="left" colspan="3">▶ Sub-Total DESCUENTOS</td>
        ${colsIngreso.map(() => `<td class="blank-td">—</td>`).join('')}
        <td class="blank-td">—</td>
        ${colsDescuento.map(c => `<td>${fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}</td>`).join('')}
        <td style="background:#fca5a5!important;font-weight:900">${fmt(totalDescuentos)}</td>
        <td class="blank-td">—</td>
    </tr>
    <tr class="tfoot-neto-row">
        <td class="left" colspan="${3 + colsIngreso.length + 1 + colsDescuento.length + 1}">NETO TOTAL A PAGAR</td>
        <td>${fmt(totalNeto)}</td>
    </tr>
</tfoot>
</table>`
    }

    function htmlResumido(): string {
        const bodyRows = cabecerasPorSeccion.map(([secNombre, secCabs]) => {
            const sI = secCabs.reduce((s, c) => s + c.total_ingresos,   0)
            const sD = secCabs.reduce((s, c) => s + c.total_descuentos, 0)
            const sN = secCabs.reduce((s, c) => s + c.neto,             0)
            const empRows = secCabs.map(cab => `
<tr>
    <td class="left">${esc(`${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`)}</td>
    <td class="left">${esc(cab.empleado?.cargo?.nombre ?? '—')}</td>
    <td class="center">${getDias(cab)}</td>
    <td>${fmt(cab.sueldo_base)}</td>
    <td class="col-ing">${fmt(cab.total_ingresos)}</td>
    <td class="col-desc">${fmt(cab.total_descuentos)}</td>
    <td class="col-neto">${fmt(cab.neto)}</td>
</tr>`).join('')
            return `
<tr class="sec-header-row"><td colspan="7">▐  ${esc(secNombre.toUpperCase())}</td></tr>
${empRows}
<tr class="sec-sub-ing">
    <td class="left" colspan="4">Sub-Total Ingresos &mdash; ${esc(secNombre)}</td>
    <td>${fmt(sI)}</td><td class="blank-td">—</td><td class="blank-td">—</td>
</tr>
<tr class="sec-sub-desc">
    <td class="left" colspan="4">Sub-Total Descuentos &mdash; ${esc(secNombre)}</td>
    <td class="blank-td">—</td><td>${fmt(sD)}</td><td class="blank-td">—</td>
</tr>
<tr class="sec-sub-neto">
    <td class="left" colspan="6">Neto &mdash; ${esc(secNombre)}</td>
    <td>${fmt(sN)}</td>
</tr>`
        }).join('\n')

        return `
${htmlEncabezado('Rol Resumido')}
<table>
<thead>
    <tr>
        <th class="left" colspan="4" style="background:white;border:none"></th>
        <th class="sec-ing">INGRESOS</th>
        <th class="sec-desc">DESCUENTOS</th>
        <th style="background:white;border:none"></th>
    </tr>
    <tr>
        <th class="left">Empleado</th>
        <th class="left">Cargo</th>
        <th class="center">Días Trab.</th>
        <th>Sueldo Base</th>
        <th class="col-ing">Total Ingresos</th>
        <th class="col-desc">Total Descuentos</th>
        <th class="col-neto">Neto a Recibir</th>
    </tr>
</thead>
<tbody>
${bodyRows}
</tbody>
<tfoot>
    <tr class="tfoot-ing-row">
        <td class="left" colspan="4">▶ Sub-Total INGRESOS</td>
        <td>${fmt(totalIngresos)}</td>
        <td class="blank-td">—</td>
        <td class="blank-td">—</td>
    </tr>
    <tr class="tfoot-desc-row">
        <td class="left" colspan="4">▶ Sub-Total DESCUENTOS</td>
        <td class="blank-td">—</td>
        <td>${fmt(totalDescuentos)}</td>
        <td class="blank-td">—</td>
    </tr>
    <tr class="tfoot-neto-row">
        <td class="left" colspan="6">NETO TOTAL A PAGAR</td>
        <td>${fmt(totalNeto)}</td>
    </tr>
</tfoot>
</table>`
    }

    function htmlDescuentos(): string {
        if (colsDescuento.length === 0) return `${htmlEncabezado('Auxiliar de Descuentos')}<p style="text-align:center;margin-top:20px;color:#64748b">No hay descuentos en este período.</p>`

        const totalCols = 1 + colsDescuento.length + 1
        const bodyRows = cabecerasPorSeccion.map(([secNombre, secCabs]) => {
            const sD = secCabs.reduce((s, c) => s + c.total_descuentos, 0)
            const empRows = secCabs.map(cab => `
<tr>
    <td class="left">${esc(`${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`)}</td>
    ${colsDescuento.map(c => { const m = getMonto(cab, c.codigo); return `<td>${m !== 0 ? fmt(m) : '<span style="color:#cbd5e1">—</span>'}</td>` }).join('')}
    <td class="col-desc">${fmt(cab.total_descuentos)}</td>
</tr>`).join('')
            return `
<tr class="sec-header-row"><td colspan="${totalCols}">▐  ${esc(secNombre.toUpperCase())}</td></tr>
${empRows}
<tr class="sec-sub-desc">
    <td class="left">Sub-Total Descuentos &mdash; ${esc(secNombre)}</td>
    ${colsDescuento.map(c => `<td>${fmt(secCabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}</td>`).join('')}
    <td style="background:#fca5a5!important;font-weight:900">${fmt(sD)}</td>
</tr>`
        }).join('\n')

        return `
${htmlEncabezado('Auxiliar de Descuentos')}
<table>
<thead>
    <tr>
        <th class="left" style="background:white;border:none"></th>
        <th class="sec-desc" colspan="${colsDescuento.length + 1}">── DESCUENTOS ──</th>
    </tr>
    <tr>
        <th class="left">Empleado</th>
        ${colsDescuento.map(c => `<th><small style="font-weight:400;color:#64748b;font-size:6.5pt">${esc(c.codigo)}</small><br>${esc(c.nombre)}</th>`).join('')}
        <th class="col-desc">Total Desc.</th>
    </tr>
</thead>
<tbody>
${bodyRows}
</tbody>
<tfoot>
    <tr class="tfoot-desc-row">
        <td class="left">▶ TOTAL DESCUENTOS</td>
        ${colsDescuento.map(c => `<td>${fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}</td>`).join('')}
        <td style="background:#fca5a5!important;font-weight:900">${fmt(totalDescuentos)}</td>
    </tr>
</tfoot>
</table>`
    }

    function htmlPapeletas(): string {
        const base = periodo!.tipo_nomina === 'mensual' ? 30 : 15
        const papeletas = cabs.map((cab, idx) => {
            const ingresosLineas   = cab.lineas.filter(l => l.tipo === 'ingreso')
            const descuentosLineas = cab.lineas.filter(l => l.tipo === 'descuento')
            const dias = getDias(cab)

            return `
<div class="papeleta">
    <div class="pap-header">
        <div class="pap-empresa">${esc(nombreEmp)}</div>
        <div class="pap-titulo">COMPROBANTE INDIVIDUAL DE PAGO</div>
        <div class="pap-periodo">${esc(periodo!.nombre)} &middot; ${fmtFecha(periodo!.fecha_inicio)} &ndash; ${fmtFecha(periodo!.fecha_fin)}</div>
    </div>

    <div class="pap-datos">
        <div>
            <div class="pap-label">Empleado</div>
            <div class="pap-valor">${esc(`${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`)}</div>
        </div>
        <div>
            <div class="pap-label">Cargo</div>
            <div class="pap-valor">${esc(cab.empleado?.cargo?.nombre ?? '—')}</div>
        </div>
        <div>
            <div class="pap-label">Sueldo Base</div>
            <div class="pap-valor">$ ${fmt(cab.sueldo_base)}</div>
        </div>
        <div>
            <div class="pap-label">Días Trabajados</div>
            <div class="pap-valor" ${dias < base ? 'style="color:#b45309"' : ''}>${dias} / ${base}</div>
        </div>
    </div>

    <div class="pap-cols">
        <div>
            <div class="pap-col-title ing">INGRESOS</div>
            ${ingresosLineas.map(l => `
            <div class="pap-linea">
                <span class="nombre">${esc(l.nombre)}</span>
                <span class="monto" style="color:#065f46">$ ${fmt(l.monto)}</span>
            </div>`).join('')}
            <div class="pap-subtotal" style="color:#065f46">
                <span>Total Ingresos</span>
                <span>$ ${fmt(cab.total_ingresos)}</span>
            </div>
        </div>
        <div>
            <div class="pap-col-title desc">DESCUENTOS</div>
            ${descuentosLineas.map(l => `
            <div class="pap-linea">
                <span class="nombre">${esc(l.nombre)}</span>
                <span class="monto" style="color:#991b1b">$ ${fmt(l.monto)}</span>
            </div>`).join('')}
            <div class="pap-subtotal" style="color:#991b1b">
                <span>Total Descuentos</span>
                <span>$ ${fmt(cab.total_descuentos)}</span>
            </div>
        </div>
    </div>

    <div class="pap-neto">
        <span class="label">NETO A RECIBIR</span>
        <span class="valor">$ ${fmt(cab.neto)}</span>
    </div>

    <div class="pap-firmas">
        <div class="pap-firma">
            <div class="linea-firma">Firma Empleador / Responsable</div>
        </div>
        <div class="pap-firma">
            <div class="linea-firma">Firma Empleado — ${esc(`${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`)}</div>
        </div>
    </div>
    <div class="pap-num">Papeleta ${idx + 1} de ${cabs.length}</div>
</div>`
        }).join('\n')

        return papeletas
    }

    function imprimir() {
        if (!periodo) return
        const titulo = `${nombreEmp} — ${VISTA_LABELS[vista]} — ${periodo.nombre}`

        let body: string
        let landscape: boolean

        if (vista === 'completo') {
            body = htmlCompleto()
            landscape = true
        } else if (vista === 'resumido') {
            body = htmlResumido()
            landscape = false
        } else if (vista === 'descuentos') {
            body = htmlDescuentos()
            landscape = colsDescuento.length > 5
        } else {
            body = htmlPapeletas()
            landscape = false
        }

        abrirVentana(titulo, body, landscape)
    }

    // ── Excel export ────────────────────────────────────────────────────────────

    function exportarExcel() {
        if (!periodo) return
        if (vista === 'resumido')      exportResumido()
        else if (vista === 'completo') exportCompleto()
        else                           exportDescuentos()
    }

    function exportResumido() {
        const nombre = periodo!.nombre.replace(/\s+/g, '_')
        const enc = [
            [`${nombreEmp} — Rol de Pagos — Resumen — ${periodo!.nombre}`],
            [`${fmtFecha(periodo!.fecha_inicio)} – ${fmtFecha(periodo!.fecha_fin)}`],
            ...(esBorrador ? [['BORRADOR — No es documento oficial']] : []),
            [],
        ]
        const cols = ['Empleado', 'Cargo', 'Días Trabajados', 'Sueldo Base', 'Total Ingresos', 'Total Descuentos', 'Neto a Recibir']
        const filas = cabs.map(cab => [
            `${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`,
            cab.empleado?.cargo?.nombre ?? '',
            getDias(cab),
            cab.sueldo_base,
            cab.total_ingresos,
            cab.total_descuentos,
            cab.neto,
        ])
        const totales = ['TOTALES', '', '',
            cabs.reduce((s, c) => s + c.sueldo_base, 0),
            cabs.reduce((s, c) => s + c.total_ingresos, 0),
            cabs.reduce((s, c) => s + c.total_descuentos, 0),
            cabs.reduce((s, c) => s + c.neto, 0),
        ]
        const ws = XLSX.utils.aoa_to_sheet([...enc, cols, ...filas, totales])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Rol Resumido')
        XLSX.writeFile(wb, `rol_resumido_${nombre}.xlsx`)
    }

    function exportCompleto() {
        const nombre = periodo!.nombre.replace(/\s+/g, '_')
        const enc = [
            [`${nombreEmp} — Rol de Pagos — Completo — ${periodo!.nombre}`],
            [`${fmtFecha(periodo!.fecha_inicio)} – ${fmtFecha(periodo!.fecha_fin)}`],
            ...(esBorrador ? [['BORRADOR — No es documento oficial']] : []),
            [],
        ]
        const cols = [
            'Empleado', 'Cargo', 'Días',
            ...colsIngreso.map(c => c.nombre), 'Total Ingresos',
            ...colsDescuento.map(c => c.nombre), 'Total Descuentos', 'Neto',
        ]
        const filas = cabs.map(cab => [
            `${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`,
            cab.empleado?.cargo?.nombre ?? '',
            getDias(cab),
            ...colsIngreso.map(c => getMonto(cab, c.codigo) || ''),
            cab.total_ingresos,
            ...colsDescuento.map(c => getMonto(cab, c.codigo) || ''),
            cab.total_descuentos,
            cab.neto,
        ])
        const totales = [
            'TOTALES', '', '',
            ...colsIngreso.map(c => cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0)),
            cabs.reduce((s, c) => s + c.total_ingresos, 0),
            ...colsDescuento.map(c => cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0)),
            cabs.reduce((s, c) => s + c.total_descuentos, 0),
            cabs.reduce((s, c) => s + c.neto, 0),
        ]
        const ws = XLSX.utils.aoa_to_sheet([...enc, cols, ...filas, totales])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Rol Completo')
        XLSX.writeFile(wb, `rol_completo_${nombre}.xlsx`)
    }

    function exportDescuentos() {
        const nombre = periodo!.nombre.replace(/\s+/g, '_')
        const enc = [
            [`${nombreEmp} — Auxiliar de Descuentos — ${periodo!.nombre}`],
            [`${fmtFecha(periodo!.fecha_inicio)} – ${fmtFecha(periodo!.fecha_fin)}`],
            ...(esBorrador ? [['BORRADOR — No es documento oficial']] : []),
            [],
        ]
        const cols = ['Empleado', ...colsDescuento.map(c => c.nombre), 'Total Descuentos']
        const filas = cabs.map(cab => [
            `${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`,
            ...colsDescuento.map(c => getMonto(cab, c.codigo) || ''),
            cab.total_descuentos,
        ])
        const totales = [
            'TOTALES',
            ...colsDescuento.map(c => cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0)),
            cabs.reduce((s, c) => s + c.total_descuentos, 0),
        ]
        const ws = XLSX.utils.aoa_to_sheet([...enc, cols, ...filas, totales])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Aux Descuentos')
        XLSX.writeFile(wb, `auxiliar_descuentos_${nombre}.xlsx`)
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    )

    if (!periodo) return (
        <div className="text-center py-20 text-slate-400">Período no encontrado.</div>
    )

    const VISTA_LABELS: Record<Vista, string> = {
        completo:   'Rol Completo',
        resumido:   'Rol Resumido',
        descuentos: 'Auxiliar Descuentos',
        papeletas:  'Papeletas Individuales',
    }

    return (
        <div className="space-y-4">
            {/* Barra superior */}
            <div className="flex flex-wrap items-center gap-4">
                <button
                    onClick={() => navigate(`/nominas/rol/${periodoId}`)}
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al Rol
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-slate-900">Reportes — {periodo.nombre}</h1>
                        {esBorrador && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-300">
                                BORRADOR
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-400">
                        {fmtFecha(periodo.fecha_inicio)} – {fmtFecha(periodo.fecha_fin)}
                    </p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {/* Tabs + botones */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
                    {([
                        ['completo',   'Rol Completo'],
                        ['resumido',   'Rol Resumido'],
                        ['descuentos', 'Auxiliar Descuentos'],
                        ...(esLiquidado ? [['papeletas', 'Papeletas']] : []),
                    ] as [Vista, string][]).map(([v, label]) => (
                        <button
                            key={v}
                            onClick={() => setVista(v)}
                            className={cn(
                                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                vista === v
                                    ? 'bg-white shadow-sm text-primary-700'
                                    : 'text-slate-500 hover:text-slate-700'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    <button
                        onClick={imprimir}
                        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        Imprimir {VISTA_LABELS[vista]}
                    </button>
                    {vista !== 'papeletas' && (
                        <button
                            onClick={exportarExcel}
                            className="flex items-center gap-2 border border-emerald-400 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            Excel
                        </button>
                    )}
                    {!esLiquidado && (
                        <button
                            disabled
                            title="Disponible después de Liquidación Definitiva"
                            className="flex items-center gap-2 border border-slate-200 text-slate-400 px-4 py-2 rounded-xl text-sm font-medium cursor-not-allowed opacity-50"
                        >
                            <Receipt className="w-4 h-4" />
                            Papeletas
                        </button>
                    )}
                </div>
            </div>

            {/* ── ROL COMPLETO ─────────────────────────────────────── */}
            {vista === 'completo' && (
                <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
                    <table className="w-full text-xs whitespace-nowrap">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr className="text-[10px]">
                                <th colSpan={3} className="bg-white border-b-0 px-1"></th>
                                <th colSpan={colsIngreso.length + 1}
                                    className="text-center px-2 py-1 font-bold text-emerald-800 bg-emerald-50 border-b border-emerald-200">
                                    ── INGRESOS ──
                                </th>
                                <th colSpan={colsDescuento.length + 1}
                                    className="text-center px-2 py-1 font-bold text-red-700 bg-red-50 border-b border-red-200">
                                    ── DESCUENTOS ──
                                </th>
                                <th className="bg-white border-b-0 px-1"></th>
                            </tr>
                            <tr>
                                <th className="text-left px-3 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[160px]">Empleado</th>
                                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[110px]">Cargo</th>
                                <th className="text-center px-3 py-2.5 font-semibold text-slate-500 min-w-[50px]">Días</th>
                                {colsIngreso.map(c => (
                                    <th key={c.codigo} className="text-right px-3 py-2.5 font-semibold text-emerald-700 min-w-[90px]">
                                        <span className="block text-[9px] font-mono text-slate-400">{c.codigo}</span>
                                        {c.nombre}
                                    </th>
                                ))}
                                <th className="text-right px-3 py-2.5 font-bold text-emerald-800 min-w-[90px] bg-emerald-50">Total Ing.</th>
                                {colsDescuento.map(c => (
                                    <th key={c.codigo} className="text-right px-3 py-2.5 font-semibold text-red-600 min-w-[90px]">
                                        <span className="block text-[9px] font-mono text-slate-400">{c.codigo}</span>
                                        {c.nombre}
                                    </th>
                                ))}
                                <th className="text-right px-3 py-2.5 font-bold text-red-700 min-w-[90px] bg-red-50">Total Desc.</th>
                                <th className="text-right px-3 py-2.5 font-bold text-primary-700 min-w-[90px] bg-primary-50">Neto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cabecerasPorSeccion.flatMap(([secNombre, secCabs]) => {
                                const sI = secCabs.reduce((s, c) => s + c.total_ingresos,   0)
                                const sD = secCabs.reduce((s, c) => s + c.total_descuentos, 0)
                                const sN = secCabs.reduce((s, c) => s + c.neto,             0)
                                const nc = 3 + colsIngreso.length + 1 + colsDescuento.length + 1 + 1
                                return [
                                    <tr key={`sec-${secNombre}`} className="bg-slate-800">
                                        <td colSpan={nc} className="px-3 py-1.5 font-bold text-white text-xs uppercase tracking-widest sticky left-0 bg-slate-800">▐ {secNombre}</td>
                                    </tr>,
                                    ...secCabs.map(cab => (
                                        <tr key={cab.id} className="hover:bg-slate-50 transition-colors border-t border-slate-100">
                                            <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white">{cab.empleado?.apellidos}, {cab.empleado?.nombres}</td>
                                            <td className="px-3 py-2 text-slate-500">{cab.empleado?.cargo?.nombre ?? '—'}</td>
                                            <td className="px-3 py-2 text-center font-medium text-slate-700">{getDias(cab)}</td>
                                            {colsIngreso.map(c => (
                                                <td key={c.codigo} className="px-3 py-2 text-right text-emerald-700">
                                                    {getMonto(cab, c.codigo) !== 0 ? fmt(getMonto(cab, c.codigo)) : <span className="text-slate-300">—</span>}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2 text-right font-semibold text-emerald-800 bg-emerald-50">{fmt(cab.total_ingresos)}</td>
                                            {colsDescuento.map(c => (
                                                <td key={c.codigo} className="px-3 py-2 text-right text-red-600">
                                                    {getMonto(cab, c.codigo) !== 0 ? fmt(getMonto(cab, c.codigo)) : <span className="text-slate-300">—</span>}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2 text-right font-semibold text-red-700 bg-red-50">{fmt(cab.total_descuentos)}</td>
                                            <td className="px-3 py-2 text-right font-bold text-primary-700 bg-primary-50">{fmt(cab.neto)}</td>
                                        </tr>
                                    )),
                                    <tr key={`sec-ing-${secNombre}`} className="bg-emerald-50 border-t border-emerald-200 text-xs">
                                        <td colSpan={3} className="px-3 py-1 font-bold text-emerald-700 sticky left-0 bg-emerald-50">Sub-Total INGRESOS — {secNombre}</td>
                                        {colsIngreso.map(c => <td key={c.codigo} className="px-3 py-1 text-right font-semibold text-emerald-600">{fmt(secCabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}</td>)}
                                        <td className="px-3 py-1 text-right font-bold text-emerald-900 bg-emerald-100">{fmt(sI)}</td>
                                        {colsDescuento.map(c => <td key={c.codigo} className="px-3 py-1 text-center text-slate-300">—</td>)}
                                        <td className="px-3 py-1 text-center text-slate-300">—</td>
                                        <td className="px-3 py-1 text-center text-slate-300">—</td>
                                    </tr>,
                                    <tr key={`sec-desc-${secNombre}`} className="bg-red-50 border-t border-red-100 text-xs">
                                        <td colSpan={3} className="px-3 py-1 font-bold text-red-700 sticky left-0 bg-red-50">Sub-Total DESCUENTOS — {secNombre}</td>
                                        {colsIngreso.map(c => <td key={c.codigo} className="px-3 py-1 text-center text-slate-300">—</td>)}
                                        <td className="px-3 py-1 text-center text-slate-300">—</td>
                                        {colsDescuento.map(c => <td key={c.codigo} className="px-3 py-1 text-right font-semibold text-red-600">{fmt(secCabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}</td>)}
                                        <td className="px-3 py-1 text-right font-bold text-red-800 bg-red-100">{fmt(sD)}</td>
                                        <td className="px-3 py-1 text-center text-slate-300">—</td>
                                    </tr>,
                                    <tr key={`sec-neto-${secNombre}`} className="bg-primary-50 border-t border-primary-200 border-b-2 border-b-slate-300 text-xs">
                                        <td colSpan={3 + colsIngreso.length + 1 + colsDescuento.length + 1} className="px-3 py-1 font-bold text-primary-700 sticky left-0 bg-primary-50">Neto — {secNombre}</td>
                                        <td className="px-3 py-1 text-right font-black text-primary-900 bg-primary-100">{fmt(sN)}</td>
                                    </tr>,
                                ]
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                                <td colSpan={3} className="px-3 py-2 font-bold text-emerald-800 sticky left-0 bg-emerald-50">▶ Sub-Total INGRESOS</td>
                                {colsIngreso.map(c => (
                                    <td key={c.codigo} className="px-3 py-2 text-right font-bold text-emerald-700">
                                        {fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}
                                    </td>
                                ))}
                                <td className="px-3 py-2 text-right font-bold text-emerald-900 bg-emerald-100">{fmt(totalIngresos)}</td>
                                {colsDescuento.map(c => (
                                    <td key={c.codigo} className="px-3 py-2 text-center text-slate-300">—</td>
                                ))}
                                <td className="px-3 py-2 text-center text-slate-300">—</td>
                                <td className="px-3 py-2 text-center text-slate-300">—</td>
                            </tr>
                            <tr className="bg-red-50 border-t border-red-200">
                                <td colSpan={3} className="px-3 py-2 font-bold text-red-800 sticky left-0 bg-red-50">▶ Sub-Total DESCUENTOS</td>
                                {colsIngreso.map(c => (
                                    <td key={c.codigo} className="px-3 py-2 text-center text-slate-300">—</td>
                                ))}
                                <td className="px-3 py-2 text-center text-slate-300">—</td>
                                {colsDescuento.map(c => (
                                    <td key={c.codigo} className="px-3 py-2 text-right font-bold text-red-600">
                                        {fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}
                                    </td>
                                ))}
                                <td className="px-3 py-2 text-right font-bold text-red-800 bg-red-100">{fmt(totalDescuentos)}</td>
                                <td className="px-3 py-2 text-center text-slate-300">—</td>
                            </tr>
                            <tr className="bg-primary-50 border-t-2 border-primary-400">
                                <td colSpan={3 + colsIngreso.length + 1 + colsDescuento.length + 1} className="px-3 py-2.5 font-bold text-primary-800 sticky left-0 bg-primary-50">NETO TOTAL A PAGAR</td>
                                <td className="px-3 py-2.5 text-right font-black text-primary-900 bg-primary-100">{fmt(totalNeto)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {/* ── ROL RESUMIDO ──────────────────────────────────────── */}
            {vista === 'resumido' && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr className="text-[10px]">
                                <th colSpan={4} className="bg-white border-b-0"></th>
                                <th className="text-center py-1 font-bold text-emerald-800 bg-emerald-50 border-b border-emerald-200">INGRESOS</th>
                                <th className="text-center py-1 font-bold text-red-700 bg-red-50 border-b border-red-200">DESCUENTOS</th>
                                <th className="bg-white border-b-0"></th>
                            </tr>
                            <tr>
                                <th className="text-left px-5 py-3 font-semibold text-slate-600">Empleado</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Cargo</th>
                                <th className="text-center px-3 py-3 font-semibold text-slate-600">Días</th>
                                <th className="text-right px-4 py-3 font-semibold text-slate-600">Sueldo Base</th>
                                <th className="text-right px-4 py-3 font-semibold text-emerald-700 bg-emerald-50">Total Ingresos</th>
                                <th className="text-right px-4 py-3 font-semibold text-red-600 bg-red-50">Total Descuentos</th>
                                <th className="text-right px-4 py-3 font-semibold text-primary-700 bg-primary-50">Neto a Recibir</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cabecerasPorSeccion.flatMap(([secNombre, secCabs]) => {
                                const sI = secCabs.reduce((s, c) => s + c.total_ingresos,   0)
                                const sD = secCabs.reduce((s, c) => s + c.total_descuentos, 0)
                                const sN = secCabs.reduce((s, c) => s + c.neto,             0)
                                return [
                                    <tr key={`sec-${secNombre}`} className="bg-slate-800">
                                        <td colSpan={7} className="px-4 py-1.5 font-bold text-white text-xs uppercase tracking-widest">▐ {secNombre}</td>
                                    </tr>,
                                    ...secCabs.map(cab => (
                                        <tr key={cab.id} className="hover:bg-slate-50 transition-colors border-t border-slate-100">
                                            <td className="px-5 py-3 font-medium text-slate-800">{cab.empleado?.apellidos}, {cab.empleado?.nombres}</td>
                                            <td className="px-4 py-3 text-slate-500 text-sm">{cab.empleado?.cargo?.nombre ?? '—'}</td>
                                            <td className="px-3 py-3 text-center font-medium text-slate-700">{getDias(cab)}</td>
                                            <td className="px-4 py-3 text-right text-slate-700">${fmt(cab.sueldo_base)}</td>
                                            <td className="px-4 py-3 text-right text-emerald-700 font-medium bg-emerald-50">${fmt(cab.total_ingresos)}</td>
                                            <td className="px-4 py-3 text-right text-red-600 font-medium bg-red-50">${fmt(cab.total_descuentos)}</td>
                                            <td className="px-4 py-3 text-right text-primary-700 font-bold bg-primary-50">${fmt(cab.neto)}</td>
                                        </tr>
                                    )),
                                    <tr key={`sec-ing-${secNombre}`} className="bg-emerald-50 border-t border-emerald-200 text-xs">
                                        <td colSpan={4} className="px-5 py-1 font-bold text-emerald-700">Sub-Total INGRESOS — {secNombre}</td>
                                        <td className="px-4 py-1 text-right font-bold text-emerald-900 bg-emerald-100">${fmt(sI)}</td>
                                        <td className="px-4 py-1 text-center text-slate-300">—</td>
                                        <td className="px-4 py-1 text-center text-slate-300">—</td>
                                    </tr>,
                                    <tr key={`sec-desc-${secNombre}`} className="bg-red-50 border-t border-red-100 text-xs">
                                        <td colSpan={4} className="px-5 py-1 font-bold text-red-700">Sub-Total DESCUENTOS — {secNombre}</td>
                                        <td className="px-4 py-1 text-center text-slate-300">—</td>
                                        <td className="px-4 py-1 text-right font-bold text-red-800 bg-red-100">${fmt(sD)}</td>
                                        <td className="px-4 py-1 text-center text-slate-300">—</td>
                                    </tr>,
                                    <tr key={`sec-neto-${secNombre}`} className="bg-primary-50 border-t border-primary-200 border-b-2 border-b-slate-300 text-xs">
                                        <td colSpan={6} className="px-5 py-1 font-bold text-primary-700">Neto — {secNombre}</td>
                                        <td className="px-4 py-1 text-right font-black text-primary-900 bg-primary-100">${fmt(sN)}</td>
                                    </tr>,
                                ]
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                                <td colSpan={4} className="px-5 py-2 font-bold text-emerald-800">▶ Sub-Total INGRESOS</td>
                                <td className="px-4 py-2 text-right font-bold text-emerald-900 bg-emerald-100">${fmt(totalIngresos)}</td>
                                <td className="px-4 py-2 text-center text-slate-300">—</td>
                                <td className="px-4 py-2 text-center text-slate-300">—</td>
                            </tr>
                            <tr className="bg-red-50 border-t border-red-200">
                                <td colSpan={4} className="px-5 py-2 font-bold text-red-800">▶ Sub-Total DESCUENTOS</td>
                                <td className="px-4 py-2 text-center text-slate-300">—</td>
                                <td className="px-4 py-2 text-right font-bold text-red-800 bg-red-100">${fmt(totalDescuentos)}</td>
                                <td className="px-4 py-2 text-center text-slate-300">—</td>
                            </tr>
                            <tr className="bg-primary-50 border-t-2 border-primary-400">
                                <td colSpan={6} className="px-5 py-2.5 font-bold text-primary-800">NETO TOTAL A PAGAR</td>
                                <td className="px-4 py-2.5 text-right font-black text-primary-900 bg-primary-100">${fmt(totalNeto)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {/* ── AUXILIAR DE DESCUENTOS ─────────────────────────────── */}
            {vista === 'descuentos' && (
                <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
                    {colsDescuento.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 text-sm">No hay descuentos en este período.</div>
                    ) : (
                        <table className="w-full text-xs whitespace-nowrap">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr className="text-[10px]">
                                    <th className="bg-white border-b-0"></th>
                                    <th colSpan={colsDescuento.length + 1}
                                        className="text-center py-1 font-bold text-red-700 bg-red-50 border-b border-red-200">
                                        ── DESCUENTOS ──
                                    </th>
                                </tr>
                                <tr>
                                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 min-w-[180px]">Empleado</th>
                                    {colsDescuento.map(c => (
                                        <th key={c.codigo} className="text-right px-3 py-2.5 font-semibold text-red-600 min-w-[110px]">
                                            <span className="block text-[9px] font-mono text-slate-400">{c.codigo}</span>
                                            {c.nombre}
                                        </th>
                                    ))}
                                    <th className="text-right px-3 py-2.5 font-bold text-red-800 min-w-[90px] bg-red-50">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cabecerasPorSeccion.flatMap(([secNombre, secCabs]) => {
                                    const sD = secCabs.reduce((s, c) => s + c.total_descuentos, 0)
                                    const nc = 1 + colsDescuento.length + 1
                                    return [
                                        <tr key={`sec-${secNombre}`} className="bg-slate-800">
                                            <td colSpan={nc} className="px-4 py-1.5 font-bold text-white text-xs uppercase tracking-widest sticky left-0 bg-slate-800">▐ {secNombre}</td>
                                        </tr>,
                                        ...secCabs.map(cab => (
                                            <tr key={cab.id} className="hover:bg-slate-50 transition-colors border-t border-slate-100">
                                                <td className="px-4 py-2 font-medium text-slate-800 sticky left-0 bg-white">{cab.empleado?.apellidos}, {cab.empleado?.nombres}</td>
                                                {colsDescuento.map(c => (
                                                    <td key={c.codigo} className="px-3 py-2 text-right text-red-600">
                                                        {getMonto(cab, c.codigo) !== 0 ? fmt(getMonto(cab, c.codigo)) : <span className="text-slate-300">—</span>}
                                                    </td>
                                                ))}
                                                <td className="px-3 py-2 text-right font-bold text-red-700 bg-red-50">{fmt(cab.total_descuentos)}</td>
                                            </tr>
                                        )),
                                        <tr key={`sec-desc-${secNombre}`} className="bg-red-50 border-t border-red-200 border-b-2 border-b-slate-300 text-xs">
                                            <td className="px-4 py-1 font-bold text-red-700 sticky left-0 bg-red-50">Sub-Total — {secNombre}</td>
                                            {colsDescuento.map(c => <td key={c.codigo} className="px-3 py-1 text-right font-semibold text-red-600">{fmt(secCabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}</td>)}
                                            <td className="px-3 py-1 text-right font-bold text-red-800 bg-red-100">${fmt(sD)}</td>
                                        </tr>,
                                    ]
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-red-50 border-t-2 border-red-300">
                                    <td className="px-4 py-2.5 font-bold text-red-800 sticky left-0 bg-red-50">▶ TOTAL DESCUENTOS</td>
                                    {colsDescuento.map(c => (
                                        <td key={c.codigo} className="px-3 py-2.5 text-right font-bold text-red-700">
                                            {fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2.5 text-right font-bold text-red-900 bg-red-100">
                                        {fmt(totalDescuentos)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            )}

            {/* ── PAPELETAS (vista previa en pantalla) ──────────────── */}
            {vista === 'papeletas' && esLiquidado && (
                <div className="space-y-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 flex items-center gap-2">
                        <Receipt className="w-4 h-4 shrink-0" />
                        Vista previa de papeletas. Haz clic en <strong className="mx-1">Imprimir Papeletas Individuales</strong> para generar el PDF.
                    </div>
                    {cabs.map((cab, idx) => {
                        const ingresosLineas   = cab.lineas.filter(l => l.tipo === 'ingreso')
                        const descuentosLineas = cab.lineas.filter(l => l.tipo === 'descuento')
                        const dias = getDias(cab)
                        const base = periodo.tipo_nomina === 'mensual' ? 30 : 15

                        return (
                            <div key={cab.id} className="bg-white rounded-2xl border-2 border-slate-300 p-6 max-w-2xl mx-auto">
                                {/* Encabezado */}
                                <div className="text-center pb-4 border-b-2 border-slate-300 mb-4">
                                    <p className="font-black text-base uppercase tracking-wider text-slate-900">{empresa?.nombre}</p>
                                    <p className="font-bold text-slate-700 mt-0.5">Comprobante Individual de Pago</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {periodo.nombre} · {fmtFecha(periodo.fecha_inicio)} – {fmtFecha(periodo.fecha_fin)}
                                    </p>
                                </div>
                                {/* Datos empleado */}
                                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4 pb-4 border-b border-slate-200 text-sm">
                                    <div>
                                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">Empleado</p>
                                        <p className="font-bold text-slate-800">{cab.empleado?.apellidos}, {cab.empleado?.nombres}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">Cargo</p>
                                        <p className="font-bold text-slate-800">{cab.empleado?.cargo?.nombre ?? '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">Sueldo Base</p>
                                        <p className="font-bold text-slate-800">${fmt(cab.sueldo_base)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">Días Trabajados</p>
                                        <p className={cn('font-bold', dias < base ? 'text-amber-600' : 'text-slate-800')}>
                                            {dias} de {base}
                                        </p>
                                    </div>
                                </div>
                                {/* Conceptos */}
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <p className="text-xs font-black text-emerald-800 uppercase tracking-wider border-b-2 border-emerald-200 pb-1.5 mb-2">Ingresos</p>
                                        <div className="space-y-1.5">
                                            {ingresosLineas.map(l => (
                                                <div key={l.codigo} className="flex justify-between text-xs border-b border-dotted border-slate-100 pb-1">
                                                    <span className="text-slate-600">{l.nombre}</span>
                                                    <span className="font-semibold text-emerald-700">${fmt(l.monto)}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-between font-bold text-sm mt-2 pt-1.5 border-t-2 border-emerald-300">
                                            <span className="text-emerald-900">Total Ingresos</span>
                                            <span className="text-emerald-900">${fmt(cab.total_ingresos)}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-red-800 uppercase tracking-wider border-b-2 border-red-200 pb-1.5 mb-2">Descuentos</p>
                                        <div className="space-y-1.5">
                                            {descuentosLineas.map(l => (
                                                <div key={l.codigo} className="flex justify-between text-xs border-b border-dotted border-slate-100 pb-1">
                                                    <span className="text-slate-600">{l.nombre}</span>
                                                    <span className="font-semibold text-red-600">${fmt(l.monto)}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-between font-bold text-sm mt-2 pt-1.5 border-t-2 border-red-300">
                                            <span className="text-red-900">Total Descuentos</span>
                                            <span className="text-red-900">${fmt(cab.total_descuentos)}</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Neto */}
                                <div className="flex justify-between items-center bg-primary-600 text-white rounded-xl px-5 py-3 mb-5">
                                    <span className="font-bold text-sm">NETO A RECIBIR</span>
                                    <span className="font-black text-xl">${fmt(cab.neto)}</span>
                                </div>
                                {/* Firmas */}
                                <div className="grid grid-cols-2 gap-16 mt-4">
                                    <div className="text-center border-t border-slate-400 pt-2">
                                        <p className="text-[10px] text-slate-400">Firma Empleador / Responsable</p>
                                    </div>
                                    <div className="text-center border-t border-slate-400 pt-2">
                                        <p className="text-[10px] text-slate-400">Firma Empleado — {cab.empleado?.apellidos}, {cab.empleado?.nombres}</p>
                                    </div>
                                </div>
                                <p className="text-right text-[10px] text-slate-200 mt-3">Papeleta {idx + 1} de {cabs.length}</p>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
