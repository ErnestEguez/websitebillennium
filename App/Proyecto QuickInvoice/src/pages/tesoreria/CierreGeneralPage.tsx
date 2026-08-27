import { useEffect, useState, useCallback, useRef } from 'react'
import {
    Wallet, ArrowUpCircle, ArrowDownCircle, Printer, CheckCircle,
    AlertCircle, X, Plus, RotateCcw, Loader2, FileText, Search, Calendar, Mail,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { supabaseContabilidad } from '../../lib/supabaseContabilidad'
import { cn, formatMoneda } from '../../lib/utils'
import { HelpButton } from '../../components/help/HelpButton'
import {
    cajaGeneralService,
    type MovimientoCajaGeneral,
    type CierreGeneral,
    type DepositoCierre,
} from '../../services/cajaGeneralService'
import { cuentasBancariasService } from '../../services/finance/bancosService'
import type { CuentaBancaria } from '../../types/finance'
import { mensajeErrorFuncion } from '../../lib/functionsError'

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtFecha(iso: string) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-EC', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    })
}

function hoy(): string {
    return new Date().toISOString().slice(0, 10)
}

const METODO_ABREV: Record<string, string> = {
    efectivo:     'EF',
    cheque:       'CD',
    cheque_fecha: 'CF',
    transferencia:'TR',
    credito:      'CRE',
    tarjeta:      'TC',
    nota_credito: 'NC',
    otros:        'OT',
}

function fmtMetodo(m: string): string {
    return METODO_ABREV[m.toLowerCase()] ?? m.slice(0, 3).toUpperCase()
}

// ─── Plan-cuentas mini-selector (contabilidad schema) ────────────────────────

interface LpCuentaMini {
    id: string
    codigo: string
    nombre: string
}

function useCuentasLP() {
    const [cuentas, setCuentas] = useState<LpCuentaMini[]>([])
    useEffect(() => {
        ;(async () => {
            try {
                const { data: membs } = await supabaseContabilidad
                    .from('lp_usuarios_empresa')
                    .select('empresa_id')
                    .eq('activo', true)
                    .limit(1)
                if (!membs?.length) return
                const { data } = await supabaseContabilidad
                    .from('lp_cuentas')
                    .select('id, codigo, nombre')
                    .eq('empresa_id', membs[0].empresa_id)
                    .eq('acepta_movimientos', true)
                    .order('codigo')
                setCuentas((data ?? []) as LpCuentaMini[])
            } catch {/* ignore */ }
        })()
    }, [])
    return cuentas
}

function useCuentasBancarias(empresaId: string | undefined) {
    const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
    useEffect(() => {
        if (!empresaId) return
        cuentasBancariasService.listar(empresaId)
            .then(data => setCuentas(data.filter(c => c.estado === 'activa')))
            .catch(() => {})
    }, [empresaId])
    return cuentas
}

// ─── SelectorCuenta contable ─────────────────────────────────────────────────

interface SelectorCuentaProps {
    cuentas: LpCuentaMini[]
    value: string | null
    onChange: (id: string | null, codigo: string | null, nombre: string | null) => void
    placeholder?: string
}

function SelectorCuenta({ cuentas, value, onChange, placeholder = 'Seleccionar cuenta...' }: SelectorCuentaProps) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    const cuenta = cuentas.find(c => c.id === value)

    const filtradas = cuentas
        .filter(c =>
            !q ||
            c.codigo.includes(q) ||
            c.nombre.toLowerCase().includes(q.toLowerCase())
        )
        .slice(0, q ? 50 : 15)

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full text-left px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
            >
                {cuenta ? (
                    <span className="text-slate-700">{cuenta.codigo} — {cuenta.nombre}</span>
                ) : (
                    <span className="text-slate-400">{placeholder}</span>
                )}
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 w-96 bg-white rounded-xl border border-slate-200 shadow-xl z-50">
                    <div className="p-2 border-b flex items-center gap-2">
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                        <input
                            autoFocus
                            className="flex-1 text-sm outline-none"
                            placeholder="Código o nombre..."
                            value={q}
                            onChange={e => setQ(e.target.value)}
                        />
                        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => { onChange(null, null, null); setOpen(false); setQ('') }}
                            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-400 italic"
                        >
                            Sin cuenta
                        </button>
                        {filtradas.length === 0
                            ? <p className="text-sm text-slate-400 text-center py-4">Sin resultados</p>
                            : filtradas.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => { onChange(c.id, c.codigo, c.nombre); setOpen(false); setQ('') }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex items-center gap-3 text-sm"
                                >
                                    <span className="font-mono text-xs text-slate-500 w-24 shrink-0">{c.codigo}</span>
                                    <span className="text-slate-700 truncate">{c.nombre}</span>
                                </button>
                            ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── SelectorCuentaBancaria ───────────────────────────────────────────────────

interface SelectorCuentaBancProps {
    cuentas: CuentaBancaria[]
    value: string | null
    onChange: (id: string | null, nombre: string) => void
    disabled?: boolean
}

function getNombreCuenta(c: CuentaBancaria): string {
    const bancoNom = (c.banco as Record<string, string> | null)?.nombre ?? ''
    const tipo = c.tipo === 'corriente' ? 'Cte' : 'Aho'
    return `${bancoNom} — ${tipo} ${c.numero_cuenta}`
}

function SelectorCuentaBancaria({ cuentas, value, onChange, disabled }: SelectorCuentaBancProps) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    const cuenta = cuentas.find(c => c.id === value)

    const filtradas = cuentas.filter(c => {
        if (!q) return true
        const str = getNombreCuenta(c).toLowerCase()
        return str.includes(q.toLowerCase()) || c.numero_cuenta.includes(q)
    }).slice(0, 20)

    if (disabled) {
        return (
            <div className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500">
                {cuenta ? getNombreCuenta(cuenta) : '—'}
            </div>
        )
    }

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full text-left px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
                {cuenta ? (
                    <span className="text-slate-700 text-xs">{getNombreCuenta(cuenta)}</span>
                ) : (
                    <span className="text-slate-400 text-xs">Seleccionar banco...</span>
                )}
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50">
                    <div className="p-2 border-b flex items-center gap-2">
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                        <input
                            autoFocus
                            className="flex-1 text-sm outline-none"
                            placeholder="Banco o número..."
                            value={q}
                            onChange={e => setQ(e.target.value)}
                        />
                        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {filtradas.length === 0
                            ? <p className="text-sm text-slate-400 text-center py-4">Sin resultados</p>
                            : filtradas.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => { onChange(c.id, getNombreCuenta(c)); setOpen(false); setQ('') }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-primary-50 text-sm text-slate-700"
                                >
                                    {getNombreCuenta(c)}
                                </button>
                            ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Print helpers ───────────────────────────────────────────────────────────

function imprimirRecibo80mm(mov: MovimientoCajaGeneral, empresaNombre: string) {
    const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:monospace;font-size:11px;width:72mm;padding:4mm}
h2{font-size:13px;text-align:center;margin-bottom:2mm}
.center{text-align:center}
.line{border-top:1px dashed #000;margin:2mm 0}
.row{display:flex;justify-content:space-between;margin:1mm 0}
.tipo-ing{font-weight:bold;color:#166534;font-size:13px;text-align:center}
.tipo-egr{font-weight:bold;color:#991b1b;font-size:13px;text-align:center}
.val{font-size:16px;font-weight:bold;text-align:center;margin:2mm 0}
</style></head><body>
<h2>${empresaNombre}</h2>
<p class="center">COMPROBANTE CAJA GENERAL</p>
<div class="line"></div>
<div class="row"><span>No.:</span><span>${mov.numero}</span></div>
<div class="row"><span>Fecha:</span><span>${fmtFecha(mov.fecha)}</span></div>
<div class="row"><span>Usuario:</span><span>${mov.user_nombre || ''}</span></div>
<div class="line"></div>
<p class="${mov.tipo === 'INGRESO' ? 'tipo-ing' : 'tipo-egr'}">${mov.tipo}</p>
<p class="val">${formatMoneda(mov.valor)}</p>
<p class="center" style="font-size:10px;margin-top:1mm">${mov.motivo}</p>
${mov.cuenta_contable_codigo ? `<p class="center" style="font-size:9px;color:#555">Cta: ${mov.cuenta_contable_codigo} ${mov.cuenta_contable_nombre || ''}</p>` : ''}
<div class="line"></div>
<p class="center" style="font-size:9px">Documento interno — QuickInvoice</p>
</body></html>`
    const w = window.open('', '_blank', 'width=320,height=480')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.onload = () => { w.print(); w.close() }
}

// Agrupa el subtotal (sin IVA) de cada línea de venta por el nombre de la
// categoría de su producto — 'Sin categoría' para líneas de servicio o
// productos sin categoría asignada.
function calcularVentasPorCategoria(ventas: unknown[]): Record<string, number> {
    const porCategoria: Record<string, number> = {}
    for (const v of ventas) {
        const vt = v as Record<string, unknown>
        for (const d of (vt.comprobante_detalles as unknown[]) ?? []) {
            const dt = d as Record<string, unknown>
            const prod = dt.productos as Record<string, unknown> | null
            const cat = (prod?.categorias as Record<string, string> | null)?.nombre || 'Sin categoría'
            porCategoria[cat] = (porCategoria[cat] ?? 0) + (Number(dt.subtotal) || 0)
        }
    }
    return porCategoria
}

function imprimirReporteCierre(
    cierre: CierreGeneral,
    movimientos: MovimientoCajaGeneral[],
    ventas: unknown[],
    cartera: unknown[],
    depositos: DepositoCierre[],
    empresaNombre: string,
    cajeroNombre: string
) {
    const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s

    // ── Totales ventas por FP ──
    const ventasPorFP: Record<string, number> = {}
    for (const v of ventas) {
        const vt = v as Record<string, unknown>
        for (const p of (vt.comprobante_pagos as unknown[]) ?? []) {
            const pt = p as Record<string, unknown>
            const met = String(pt.metodo_pago || 'otros').toLowerCase()
            ventasPorFP[met] = (ventasPorFP[met] ?? 0) + Number(pt.valor || 0)
        }
    }

    // ── Totales cartera por FP ──
    const carteraPorFP: Record<string, number> = {}
    for (const p of cartera) {
        const pt = p as Record<string, unknown>
        const met = String(pt.metodo_pago || 'otros').toLowerCase()
        carteraPorFP[met] = (carteraPorFP[met] ?? 0) + Number(pt.valor || 0)
    }

    // ── Detalle ventas: una fila por pago ──
    const filasVentas = ventas.map(v => {
        const vt = v as Record<string, unknown>
        const pagos = (vt.comprobante_pagos as unknown[]) ?? []
        const cli = trunc((vt.clientes as Record<string, string> | null)?.nombre ?? '', 14)
        const num = String(vt.secuencial ?? '').split('-').pop() ?? String(vt.secuencial ?? '')
        return pagos.map((p, i) => {
            const pt = p as Record<string, unknown>
            const met = String(pt.metodo_pago || 'otros').toLowerCase()
            return `<tr>
              <td style="white-space:nowrap">${i === 0 ? num : ''}</td>
              <td style="white-space:nowrap">${i === 0 ? cli : ''}</td>
              <td class="r">${formatMoneda(Number(pt.valor || 0))}</td>
              <td class="r" style="font-weight:bold">${fmtMetodo(met)}</td>
            </tr>`
        }).join('')
    }).join('')

    // ── Detalle cartera: una fila por cobro ──
    const filasCartera = cartera.map(p => {
        const pt = p as Record<string, unknown>
        const cxc = pt.cartera_cxc as Record<string, unknown> | null
        const cli = trunc((cxc?.clientes as Record<string, string> | null)?.nombre ?? '—', 14)
        const ref = trunc(String(pt.referencia || '—'), 10)
        const met = String(pt.metodo_pago || 'otros').toLowerCase()
        return `<tr>
          <td style="white-space:nowrap">${ref}</td>
          <td>${cli}</td>
          <td class="r">${formatMoneda(Number(pt.valor || 0))}</td>
          <td class="r" style="font-weight:bold">${fmtMetodo(met)}</td>
        </tr>`
    }).join('')

    const ventasPorCategoria = calcularVentasPorCategoria(ventas)
    const filasCategoria = Object.entries(ventasPorCategoria)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, total]) => `<div class="row"><span>${trunc(cat, 26)}</span><span>${formatMoneda(total)}</span></div>`)
        .join('')

    const totalDepositos = depositos.reduce((s, d) => s + d.valor, 0)
    const totalADepositar = Math.max(0, cierre.total_efectivo_dia - cierre.base_caja) + cierre.total_cheques_dia

    const resumenFP = (map: Record<string, number>) =>
        Object.entries(map).filter(([, v]) => v > 0)
            .map(([m, v]) => `<div class="row"><span>${fmtMetodo(m)}</span><span>${formatMoneda(v)}</span></div>`)
            .join('')

    const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:9px;width:72mm;padding:3mm}
h2{font-size:12px;text-align:center;font-weight:bold;margin-bottom:1mm}
.line{border-top:1px dashed #000;margin:1.5mm 0}
.row{display:flex;justify-content:space-between;margin:0.7mm 0}
.bold{font-weight:bold}
.section{font-weight:bold;font-size:10px;margin:2mm 0 1mm;text-transform:uppercase}
.sub{font-size:8px;color:#555;margin:1mm 0 0.5mm}
table{width:100%;border-collapse:collapse;font-size:8.5px}
th{text-align:left;border-bottom:1px solid #888;padding:0.5mm 0;font-size:8px}
td{padding:0.4mm 0}
.r{text-align:right}
</style></head><body>
<h2>${empresaNombre}</h2>
<p style="text-align:center;font-size:9px">REPORTE CIERRE DE CAJA GENERAL</p>
<div class="line"></div>
<div class="row"><span>Fecha:</span><span>${fmtFecha(cierre.fecha)}</span></div>
<div class="row"><span>Base caja:</span><span>${formatMoneda(cierre.base_caja)}</span></div>
<div class="line"></div>

<p class="section">Ventas del Día (${ventas.length})</p>
${cierre.con_detalle && ventas.length > 0 ? `
<table>
<tr><th style="width:18mm">No.Fact.</th><th>Cliente</th><th class="r" style="width:17mm">Valor</th><th class="r" style="width:8mm">FP</th></tr>
${filasVentas}
</table>` : ''}
<p class="sub">Por forma de pago:</p>
${resumenFP(ventasPorFP)}
<div class="row bold"><span>TOTAL VENTAS:</span><span>${formatMoneda(cierre.total_ventas)}</span></div>
<div class="line"></div>

<p class="section">Ventas por Categoría</p>
${filasCategoria || '<p style="font-size:8px;color:#888">Sin ventas con categoría registradas</p>'}
<div class="line"></div>

<p class="section">Recuperación Cartera (${cartera.length})</p>
${cierre.con_detalle && cartera.length > 0 ? `
<table>
<tr><th style="width:16mm">Referencia</th><th>Cliente</th><th class="r" style="width:17mm">Valor</th><th class="r" style="width:8mm">FP</th></tr>
${filasCartera}
</table>` : ''}
<p class="sub">Por forma de pago:</p>
${resumenFP(carteraPorFP)}
<div class="row bold"><span>TOTAL CARTERA:</span><span>${formatMoneda(cierre.total_cartera)}</span></div>
<div class="line"></div>

${movimientos.length > 0 ? `
<p class="section">Movimientos Extra</p>
${cierre.con_detalle ? `
<table>
<tr><th style="width:18mm">No.</th><th>Motivo</th><th class="r" style="width:17mm">Valor</th><th class="r" style="width:6mm">T</th></tr>
${movimientos.filter(m => m.tipo === 'INGRESO').map(m => `<tr><td>${m.numero}</td><td>${trunc(m.motivo, 14)}</td><td class="r">${formatMoneda(m.valor)}</td><td class="r">I</td></tr>`).join('')}
${movimientos.filter(m => m.tipo === 'EGRESO').map(m => `<tr><td>${m.numero}</td><td>${trunc(m.motivo, 14)}</td><td class="r">${formatMoneda(m.valor)}</td><td class="r">E</td></tr>`).join('')}
</table>` : ''}
<div class="row"><span>Total ingresos:</span><span>${formatMoneda(cierre.total_ingresos_extra)}</span></div>
<div class="row"><span>Total egresos:</span><span>${formatMoneda(cierre.total_egresos_extra)}</span></div>
<div class="line"></div>` : ''}

<p class="section">Resumen Final</p>
<div class="row bold"><span>EFECTIVO TOTAL:</span><span>${formatMoneda(cierre.total_efectivo_dia)}</span></div>
<div class="row bold"><span>CHEQUES TOTAL:</span><span>${formatMoneda(cierre.total_cheques_dia)}</span></div>
<div class="row"><span>(-) Base caja:</span><span>${formatMoneda(cierre.base_caja)}</span></div>
<div class="row bold"><span>A DEPOSITAR:</span><span>${formatMoneda(totalADepositar)}</span></div>
<div class="line"></div>
<p class="section">Depósitos</p>
${depositos.length > 0
    ? depositos.map(d => `<div class="row"><span>${trunc(d.cuenta_banco_nombre, 22)} (${fmtMetodo(d.tipo_deposito.toLowerCase())})</span><span>${formatMoneda(d.valor)}</span></div>`).join('')
    : '<p style="font-size:8px;color:#888">Sin depósitos registrados</p>'}
<div class="row bold"><span>Total depósitos:</span><span>${formatMoneda(totalDepositos)}</span></div>
${cierre.observaciones ? `<div class="line"></div><p style="font-size:8px">Obs: ${cierre.observaciones}</p>` : ''}
<div class="line"></div>
<p style="margin-top:6mm;border-top:1px solid #000;padding-top:1mm">f. Cajero</p>
<p style="margin-top:1mm">${cajeroNombre}</p>
</body></html>`

    const w = window.open('', '_blank', 'width=320,height=700')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.onload = () => { w.print(); w.close() }
}

// Versión HTML por correo del mismo reporte de cierre — mismo contenido que
// imprimirReporteCierre (mismos totales, desgloses por forma de pago, detalle
// de ventas/cartera/movimientos y depósitos), solo con estilo de correo en
// vez de ticket 80mm.
function construirHtmlCorreoCierre(
    cierre: CierreGeneral,
    movimientos: MovimientoCajaGeneral[],
    ventas: unknown[],
    cartera: unknown[],
    depositos: DepositoCierre[],
    empresaNombre: string,
    cajeroNombre: string,
): string {
    const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s

    // ── Totales por forma de pago (mismo cálculo que imprimirReporteCierre) ──
    const ventasPorFP: Record<string, number> = {}
    for (const v of ventas) {
        const vt = v as Record<string, unknown>
        for (const p of (vt.comprobante_pagos as unknown[]) ?? []) {
            const pt = p as Record<string, unknown>
            const met = String(pt.metodo_pago || 'otros').toLowerCase()
            ventasPorFP[met] = (ventasPorFP[met] ?? 0) + Number(pt.valor || 0)
        }
    }
    const carteraPorFP: Record<string, number> = {}
    for (const p of cartera) {
        const pt = p as Record<string, unknown>
        const met = String(pt.metodo_pago || 'otros').toLowerCase()
        carteraPorFP[met] = (carteraPorFP[met] ?? 0) + Number(pt.valor || 0)
    }

    // ── Detalle: una fila por venta/cobro/movimiento, solo si con_detalle ──
    const filasVentas = ventas.map(v => {
        const vt = v as Record<string, unknown>
        const pagos = (vt.comprobante_pagos as unknown[]) ?? []
        const cli = trunc((vt.clientes as Record<string, string> | null)?.nombre ?? '', 22)
        const num = String(vt.secuencial ?? '').split('-').pop() ?? String(vt.secuencial ?? '')
        return pagos.map((p, i) => {
            const pt = p as Record<string, unknown>
            const met = String(pt.metodo_pago || 'otros').toLowerCase()
            return filaTabla([i === 0 ? num : '', i === 0 ? cli : '', formatMoneda(Number(pt.valor || 0)), fmtMetodo(met)])
        }).join('')
    }).join('')

    const filasCartera = cartera.map(p => {
        const pt = p as Record<string, unknown>
        const cxc = pt.cartera_cxc as Record<string, unknown> | null
        const cli = trunc((cxc?.clientes as Record<string, string> | null)?.nombre ?? '—', 22)
        const ref = trunc(String(pt.referencia || '—'), 16)
        const met = String(pt.metodo_pago || 'otros').toLowerCase()
        return filaTabla([ref, cli, formatMoneda(Number(pt.valor || 0)), fmtMetodo(met)])
    }).join('')

    const filasMovIngresos = movimientos.filter(m => m.tipo === 'INGRESO').map(m => filaTabla([m.numero, trunc(m.motivo, 22), formatMoneda(m.valor), 'I'])).join('')
    const filasMovEgresos = movimientos.filter(m => m.tipo === 'EGRESO').map(m => filaTabla([m.numero, trunc(m.motivo, 22), formatMoneda(m.valor), 'E'])).join('')

    const ventasPorCategoria = calcularVentasPorCategoria(ventas)
    const totalDepositos = depositos.reduce((s, d) => s + d.valor, 0)
    const totalADepositar = Math.max(0, cierre.total_efectivo_dia - cierre.base_caja) + cierre.total_cheques_dia

    const filaCat = (cat: string, total: number) =>
        `<tr><td style="padding:4px 0;color:#374151">${cat}</td><td style="padding:4px 0;text-align:right;font-weight:700">${formatMoneda(total)}</td></tr>`
    const fila = (label: string, val: string, bold = false) =>
        `<tr><td style="padding:4px 0;color:#374151${bold ? ';font-weight:700' : ''}">${label}</td><td style="padding:4px 0;text-align:right${bold ? ';font-weight:700' : ''}">${val}</td></tr>`
    function filaTabla(cols: string[]): string {
        return `<tr>${cols.map((c, i) => `<td style="padding:3px 4px;font-size:12px;${i === cols.length - 1 ? 'text-align:right;font-weight:700' : ''}">${c}</td>`).join('')}</tr>`
    }
    const resumenFP = (map: Record<string, number>) =>
        Object.entries(map).filter(([, v]) => v > 0)
            .map(([m, v]) => fila(fmtMetodo(m), formatMoneda(v)))
            .join('')
    const seccion = (titulo: string, contenido: string) => `
<tr><td style="padding:12px 28px;border-top:1px solid #f3f4f6;">
  <p style="margin:0 0 6px;color:#1e4db8;font-size:12px;font-weight:700;text-transform:uppercase;">${titulo}</p>
  ${contenido}
</td></tr>`

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.14);">
<tr><td style="background:linear-gradient(135deg,#1e4db8 0%,#2563eb 100%);padding:24px 28px;text-align:center">
  <span style="color:#fff;font-weight:800;font-size:18px;">${empresaNombre}</span>
</td></tr>
<tr><td style="padding:20px 28px 8px;text-align:center">
  <p style="margin:0;color:#111827;font-size:17px;font-weight:700;">Reporte de Cierre de Caja General</p>
  <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${fmtFecha(cierre.fecha)}</p>
</td></tr>
${seccion(`Ventas del Día (${ventas.length})`, `
  ${cierre.con_detalle && ventas.length > 0 ? `<table width="100%" style="border-collapse:collapse;margin-bottom:6px;">${filasVentas}</table>` : ''}
  <p style="margin:6px 0 2px;color:#9ca3af;font-size:11px;">Por forma de pago:</p>
  <table width="100%" style="border-collapse:collapse;font-size:13px;">${resumenFP(ventasPorFP)}${fila('TOTAL VENTAS', formatMoneda(cierre.total_ventas), true)}</table>
`)}
${seccion('Ventas por Categoría', `
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    ${Object.entries(ventasPorCategoria).sort(([, a], [, b]) => b - a).map(([cat, total]) => filaCat(cat, total)).join('') || '<tr><td style="color:#9ca3af;font-size:12px">Sin ventas con categoría registradas</td></tr>'}
  </table>
`)}
${seccion(`Recuperación Cartera (${cartera.length})`, `
  ${cierre.con_detalle && cartera.length > 0 ? `<table width="100%" style="border-collapse:collapse;margin-bottom:6px;">${filasCartera}</table>` : ''}
  <p style="margin:6px 0 2px;color:#9ca3af;font-size:11px;">Por forma de pago:</p>
  <table width="100%" style="border-collapse:collapse;font-size:13px;">${resumenFP(carteraPorFP)}${fila('TOTAL CARTERA', formatMoneda(cierre.total_cartera), true)}</table>
`)}
${movimientos.length > 0 ? seccion('Movimientos Extra', `
  ${cierre.con_detalle ? `<table width="100%" style="border-collapse:collapse;margin-bottom:6px;">${filasMovIngresos}${filasMovEgresos}</table>` : ''}
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    ${fila('Total ingresos', formatMoneda(cierre.total_ingresos_extra))}
    ${fila('Total egresos', formatMoneda(cierre.total_egresos_extra))}
  </table>
`) : ''}
${seccion('Resumen Final', `
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    ${fila('Efectivo total', formatMoneda(cierre.total_efectivo_dia), true)}
    ${fila('Cheques total', formatMoneda(cierre.total_cheques_dia), true)}
    ${fila('(-) Base de caja', formatMoneda(cierre.base_caja))}
    ${fila('A depositar', formatMoneda(totalADepositar), true)}
  </table>
`)}
${seccion('Depósitos', `
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    ${depositos.length > 0
        ? depositos.map(d => fila(`${trunc(d.cuenta_banco_nombre, 30)} (${fmtMetodo(d.tipo_deposito.toLowerCase())})`, formatMoneda(d.valor))).join('')
        : '<tr><td style="color:#9ca3af;font-size:12px">Sin depósitos registrados</td></tr>'}
    ${fila('Total depósitos', formatMoneda(totalDepositos), true)}
  </table>
`)}
${cierre.observaciones ? `<tr><td style="padding:8px 28px;color:#6b7280;font-size:12px;">Obs: ${cierre.observaciones}</td></tr>` : ''}
<tr><td style="background:#1e3a8a;padding:16px 28px;text-align:center;">
  <p style="margin:0 0 4px;color:rgba(255,255,255,0.9);font-size:12px;font-weight:600;">Cerrado por: ${cajeroNombre}</p>
  <p style="margin:0;color:rgba(255,255,255,0.55);font-size:10px;">QuickInvoice · www.billenniumsystem.com</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

// ─── Modal Movimiento ────────────────────────────────────────────────────────

interface ModalMovimientoProps {
    empresaId: string
    fecha: string
    userName: string
    userId: string
    cuentas: LpCuentaMini[]
    onClose: () => void
    onSaved: (mov: MovimientoCajaGeneral) => void
}

function ModalMovimiento({ empresaId, fecha, userName, userId, cuentas, onClose, onSaved }: ModalMovimientoProps) {
    const [tipo, setTipo]     = useState<'INGRESO' | 'EGRESO'>('INGRESO')
    const [motivo, setMotivo] = useState('')
    const [valor, setValor]   = useState('')
    const [ctaId, setCtaId]   = useState<string | null>(null)
    const [ctaCod, setCtaCod] = useState<string | null>(null)
    const [ctaNom, setCtaNom] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [err, setErr]       = useState('')
    const [saved, setSaved]   = useState<MovimientoCajaGeneral | null>(null)

    function resetForm() {
        setMotivo('')
        setValor('')
        setCtaId(null)
        setCtaCod(null)
        setCtaNom(null)
        setSaved(null)
        setErr('')
    }

    async function handleSave() {
        if (!motivo.trim()) { setErr('Ingrese el motivo'); return }
        const v = parseFloat(valor)
        if (!v || v <= 0) { setErr('Ingrese un valor válido'); return }
        setSaving(true); setErr('')
        try {
            const mov = await cajaGeneralService.crearMovimiento({
                empresa_id: empresaId,
                fecha,
                tipo,
                motivo: motivo.trim(),
                valor: v,
                cuenta_contable_id: ctaId,
                cuenta_contable_codigo: ctaCod,
                cuenta_contable_nombre: ctaNom,
                user_id: userId,
                user_nombre: userName,
                cierre_id: null,
            })
            onSaved(mov)
            setSaved(mov)
            // Limpiar campos después de guardar
            setTimeout(() => resetForm(), 1200)
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : String(e))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="font-bold text-slate-900 text-lg">Nuevo Movimiento</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    {/* Tipo toggle */}
                    <div className="flex rounded-xl overflow-hidden border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setTipo('INGRESO')}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
                                tipo === 'INGRESO' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                            )}
                        >
                            <ArrowUpCircle className="w-4 h-4" /> INGRESO
                        </button>
                        <button
                            type="button"
                            onClick={() => setTipo('EGRESO')}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
                                tipo === 'EGRESO' ? 'bg-red-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                            )}
                        >
                            <ArrowDownCircle className="w-4 h-4" /> EGRESO
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Motivo *</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            placeholder="Descripción del movimiento"
                            value={motivo}
                            onChange={e => setMotivo(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Valor *</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            placeholder="0.00"
                            value={valor}
                            onChange={e => setValor(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Cuenta Contable (opcional)</label>
                        <SelectorCuenta
                            cuentas={cuentas}
                            value={ctaId}
                            onChange={(id, cod, nom) => { setCtaId(id); setCtaCod(cod); setCtaNom(nom) }}
                        />
                    </div>

                    {err && <p className="text-red-600 text-sm">{err}</p>}

                    {saved && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-emerald-700 text-sm">
                                <CheckCircle className="w-4 h-4" />
                                <span>Guardado: <strong>{saved.numero}</strong></span>
                            </div>
                            <button
                                type="button"
                                onClick={() => imprimirRecibo80mm(saved, '')}
                                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                            >
                                <Printer className="w-3.5 h-3.5" /> Imprimir
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-3 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                        Cerrar
                    </button>
                    {!saved && (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Guardar
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Modal Reversal ──────────────────────────────────────────────────────────

interface ModalReversarProps {
    cierre: CierreGeneral
    userId: string
    onClose: () => void
    onDone: () => void
}

function ModalReversar({ cierre, userId, onClose, onDone }: ModalReversarProps) {
    const [motivo, setMotivo] = useState('')
    const [saving, setSaving] = useState(false)
    const [err, setErr]       = useState('')

    async function handleReversar() {
        if (!motivo.trim()) { setErr('Ingrese el motivo de reversión'); return }
        setSaving(true); setErr('')
        try {
            await cajaGeneralService.reversarCierre(cierre.id, motivo.trim(), userId)
            onDone()
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : String(e))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="font-bold text-slate-900 text-lg">Reversar Cierre</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">¿Reversar cierre del {fmtFecha(cierre.fecha)}?</p>
                            <p className="mt-1">Se anulará el asiento contable y el día quedará abierto para corrección.</p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Motivo *</label>
                        <textarea
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                            placeholder="Explique por qué se reversa..."
                            value={motivo}
                            onChange={e => setMotivo(e.target.value)}
                        />
                    </div>
                    {err && <p className="text-red-600 text-sm">{err}</p>}
                </div>
                <div className="flex justify-end gap-3 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button
                        onClick={handleReversar}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        Reversar
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type TabId = 0 | 1 | 2 | 3 | 4

const TABS = [
    { id: 0, label: 'Movimientos',    icon: FileText },
    { id: 1, label: 'Ventas del Día', icon: ArrowUpCircle },
    { id: 2, label: 'Rec. Cartera',   icon: ArrowDownCircle },
    { id: 3, label: 'Cierre',         icon: CheckCircle },
    { id: 4, label: 'Histórico',      icon: RotateCcw },
] as const

export function CierreGeneralPage() {
    const { empresa, user, profile } = useAuth()
    const cuentasLP        = useCuentasLP()
    const cuentasBancarias = useCuentasBancarias(empresa?.id)

    // ── state ──
    const [fechaSeleccionada, setFechaSeleccionada] = useState(hoy())
    const [tab, setTab]                   = useState<TabId>(0)
    const [loading, setLoading]           = useState(true)
    const [error, setError]               = useState('')

    // Day data
    const [cierre, setCierre]             = useState<CierreGeneral | null>(null)
    const [movimientos, setMovimientos]   = useState<MovimientoCajaGeneral[]>([])
    const [ventas, setVentas]             = useState<unknown[]>([])
    const [cartera, setCartera]           = useState<unknown[]>([])
    const [cajerosPendientes, setCajerosPendientes] = useState<string[]>([])

    // Historico
    const [historico, setHistorico]       = useState<CierreGeneral[]>([])
    const [loadingHist, setLoadingHist]   = useState(false)

    // UI
    const [showModalMov, setShowModalMov] = useState(false)
    const [reversarTarget, setReversarTarget] = useState<CierreGeneral | null>(null)

    // Cierre form state
    const [observaciones, setObservaciones] = useState('')
    const [conDetalle, setConDetalle]       = useState(true)
    const [baseCajaEdit, setBaseCajaEdit]   = useState('0')
    const [cerrandoCierre, setCerrandoCierre] = useState(false)
    const [enviandoCorreo, setEnviandoCorreo] = useState(false)
    const [correoEnviado, setCorreoEnviado] = useState(false)
    const [savingBase, setSavingBase]         = useState(false)
    const [baseSaved, setBaseSaved]           = useState(false)

    // Deposits form
    const [depositoRows, setDepositoRows] = useState<DepositoCierre[]>([])

    // Refs para detectar cambios del usuario (evitar auto-guardar lo que viene de la BD)
    const lastSavedDepositos = useRef<string>('[]')
    const lastSavedObs       = useRef<string>('')
    const lastSavedDetalle   = useRef<boolean>(true)

    // ── data loaders ──
    const cargarDia = useCallback(async () => {
        if (!empresa?.id) return
        setLoading(true)
        setError('')
        try {
            const [base, cajeros, cierreExist] = await Promise.all([
                cajaGeneralService.getBaseCaja(empresa.id),
                cajaGeneralService.todosCajerosCerraron(empresa.id, fechaSeleccionada),
                cajaGeneralService.getCierreDelDia(empresa.id, fechaSeleccionada),
            ])
            setBaseCajaEdit(String(base))
            setCajerosPendientes(cajeros.pendientes)

            // Auto-crear borrador para hoy si no existe aún
            let cierreActual = cierreExist
            if (!cierreExist && fechaSeleccionada === hoy()) {
                cierreActual = await cajaGeneralService.crearCierre(empresa.id, fechaSeleccionada, base)
            }
            setCierre(cierreActual)

            const [movs, consol] = await Promise.all([
                cajaGeneralService.getMovimientosDia(empresa.id, fechaSeleccionada),
                cajaGeneralService.getDatosConsolidados(empresa.id, fechaSeleccionada),
            ])
            setMovimientos(movs)
            setVentas(consol.ventas)
            setCartera(consol.cartera)

            if (cierreActual) {
                const deps = await cajaGeneralService.getDepositosCierre(cierreActual.id)
                const obsDB = cierreActual.observaciones ?? ''
                const detDB = cierreActual.con_detalle ?? true
                setDepositoRows(deps)
                setObservaciones(obsDB)
                setConDetalle(detDB)
                // Sincronizar refs con lo que vino de la BD
                lastSavedDepositos.current = JSON.stringify(deps)
                lastSavedObs.current       = obsDB
                lastSavedDetalle.current   = detDB
            } else {
                setDepositoRows([])
                setObservaciones('')
                lastSavedDepositos.current = '[]'
                lastSavedObs.current       = ''
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }, [empresa?.id, fechaSeleccionada])

    const cargarHistorico = useCallback(async () => {
        if (!empresa?.id) return
        setLoadingHist(true)
        try {
            setHistorico(await cajaGeneralService.getHistorico(empresa.id))
        } finally {
            setLoadingHist(false)
        }
    }, [empresa?.id])

    useEffect(() => { cargarDia() }, [cargarDia])
    useEffect(() => { if (tab === 4) cargarHistorico() }, [tab, cargarHistorico])

    // Auto-guardar depósitos en BD cuando el usuario los edita
    useEffect(() => {
        if (!cierre?.id || cierre.estado === 'CERRADO' || !empresa?.id) return
        const serialized = JSON.stringify(depositoRows)
        if (serialized === lastSavedDepositos.current) return  // sin cambios
        const timer = setTimeout(async () => {
            try {
                await cajaGeneralService.guardarDepositos(cierre.id, empresa.id, depositoRows)
                lastSavedDepositos.current = serialized
            } catch { /* silent */ }
        }, 800)
        return () => clearTimeout(timer)
    }, [depositoRows, cierre?.id, cierre?.estado, empresa?.id])

    // Auto-guardar observaciones y conDetalle en BD cuando cambian
    useEffect(() => {
        if (!cierre?.id || cierre.estado === 'CERRADO') return
        if (observaciones === lastSavedObs.current && conDetalle === lastSavedDetalle.current) return
        const timer = setTimeout(async () => {
            try {
                await cajaGeneralService.actualizarBorrador(cierre.id, observaciones, conDetalle)
                lastSavedObs.current     = observaciones
                lastSavedDetalle.current = conDetalle
            } catch { /* silent */ }
        }, 800)
        return () => clearTimeout(timer)
    }, [observaciones, conDetalle, cierre?.id, cierre?.estado])

    // ── computed totals ──
    function calcularTotales() {
        // Ventas
        let tvEfectivo = 0, tvCheque = 0, tvOtros = 0
        for (const v of ventas) {
            const vt = v as Record<string, unknown>
            for (const p of (vt.comprobante_pagos as unknown[]) ?? []) {
                const pt = p as Record<string, unknown>
                const val = Number(pt.valor) || 0
                const met = String(pt.metodo_pago || '').toLowerCase()
                if (met === 'efectivo') tvEfectivo += val
                else if (met === 'cheque') tvCheque += val
                else tvOtros += val
            }
        }
        const tvTotal = tvEfectivo + tvCheque + tvOtros

        // Cartera
        let tcEfectivo = 0, tcCheque = 0, tcOtros = 0
        for (const p of cartera) {
            const pt = p as Record<string, unknown>
            const val = Number(pt.valor) || 0
            const met = String(pt.metodo_pago || '').toLowerCase()
            if (met === 'efectivo') tcEfectivo += val
            else if (met === 'cheque' || met === 'transferencia') tcCheque += val
            else tcOtros += val
        }
        const tcTotal = tcEfectivo + tcCheque + tcOtros

        // Movimientos extra
        const tiIngresos = movimientos.reduce((s, m) => s + (m.tipo === 'INGRESO' ? m.valor : 0), 0)
        const tiEgresos  = movimientos.reduce((s, m) => s + (m.tipo === 'EGRESO' ? m.valor : 0), 0)

        // Totals per medium
        const totalEfectivoDia = tvEfectivo + tcEfectivo + tiIngresos - tiEgresos
        const totalChequesDia  = tvCheque + tcCheque

        return {
            total_ventas_efectivo: tvEfectivo,
            total_ventas_cheque: tvCheque,
            total_ventas_otros: tvOtros,
            total_ventas: tvTotal,
            total_cartera_efectivo: tcEfectivo,
            total_cartera_cheque: tcCheque,
            total_cartera_otros: tcOtros,
            total_cartera: tcTotal,
            total_ingresos_extra: tiIngresos,
            total_egresos_extra: tiEgresos,
            total_efectivo_dia: totalEfectivoDia,
            total_cheques_dia: totalChequesDia,
        }
    }

    const totales = calcularTotales()
    const baseEdited = parseFloat(baseCajaEdit) || 0
    const totalDepositos = depositoRows.reduce((s, d) => s + (d.valor || 0), 0)

    // ── actions ──
    async function ejecutarCierreDefinitivo() {
        if (!empresa?.id || !user?.id) return
        if (cajerosPendientes.length > 0) {
            setError('No se puede cerrar: hay cajeros con sesión abierta.')
            return
        }
        setCerrandoCierre(true)
        setError('')
        try {
            let cierreId = cierre?.id
            if (!cierreId) {
                const nuevo = await cajaGeneralService.crearCierre(empresa.id, fechaSeleccionada, baseEdited)
                cierreId = nuevo.id
            }
            // Save deposits first
            await cajaGeneralService.guardarDepositos(cierreId, empresa.id, depositoRows)
            // Execute cierre
            await cajaGeneralService.ejecutarCierre(
                cierreId,
                {
                    empresa_id: empresa.id,
                    fecha: fechaSeleccionada,
                    base_caja: baseEdited,
                    observaciones: observaciones || null,
                    con_detalle: conDetalle,
                    ...totales,
                },
                profile?.nombre || user.email || '',
                user.id
            )
            await cargarDia()
            // Envío automático del reporte por correo al ejecutar el cierre,
            // sin preguntar — si el correo falla (ej. SMTP mal configurado)
            // no debe aparentar que el cierre en sí falló, por eso corre en
            // su propio try/catch separado del flujo principal.
            handleEnviarCorreoCierre(cierre!).catch(() => {})
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setCerrandoCierre(false)
        }
    }

    async function handleEnviarCorreoCierre(cierreOverride?: CierreGeneral) {
        const cierreParaEnviar = cierreOverride ?? cierre
        if (!empresa?.id || !cierreParaEnviar) return
        if (!user?.email) { setError('Tu usuario no tiene un correo registrado.'); return }
        setEnviandoCorreo(true); setError(''); setCorreoEnviado(false)
        try {
            const html = construirHtmlCorreoCierre(
                { ...cierreParaEnviar, ...totales, base_caja: baseEdited },
                movimientos, ventas, cartera, depositoRows,
                empresa.nombre || '',
                profile?.nombre || user.email || '',
            )
            const { error: fnErr } = await supabase.functions.invoke('enviar-reporte-interno', {
                body: {
                    empresa_id: empresa.id,
                    destinatario: user.email,
                    asunto: `Cierre de Caja General ${fmtFecha(fechaSeleccionada)} — ${empresa.nombre || ''}`,
                    html,
                },
            })
            if (fnErr) throw new Error(await mensajeErrorFuncion(fnErr, 'Error al enviar el correo'))
            setCorreoEnviado(true)
            setTimeout(() => setCorreoEnviado(false), 4000)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setEnviandoCorreo(false)
        }
    }

    async function handleSaveBase() {
        if (!empresa?.id) return
        setSavingBase(true)
        try {
            await cajaGeneralService.setBaseCaja(empresa.id, baseEdited)
            setBaseSaved(true)
            setTimeout(() => setBaseSaved(false), 2000)
        } finally {
            setSavingBase(false)
        }
    }

    function addDepositoRow() {
        setDepositoRows(r => [...r, {
            cuenta_banco_id: null,
            cuenta_banco_nombre: '',
            tipo_deposito: 'EFECTIVO',
            valor: 0,
        }])
    }

    function updateDepositoRow(i: number, patch: Partial<DepositoCierre>) {
        setDepositoRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row))
    }

    function removeDepositoRow(i: number) {
        setDepositoRows(r => r.filter((_, idx) => idx !== i))
    }

    // ── render tabs ──

    function renderMovimientos() {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">{movimientos.length} movimiento(s) del día</p>
                    <button
                        onClick={() => setShowModalMov(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        <Plus className="w-4 h-4" /> Nuevo Movimiento
                    </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                            <tr>
                                <th className="px-4 py-3">Número</th>
                                <th className="px-4 py-3">Tipo</th>
                                <th className="px-4 py-3">Motivo</th>
                                <th className="px-4 py-3">Cuenta</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                                <th className="px-4 py-3">Usuario</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {movimientos.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                                        No hay movimientos registrados.
                                    </td>
                                </tr>
                            )}
                            {movimientos.map(m => (
                                <tr key={m.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.numero}</td>
                                    <td className="px-4 py-3">
                                        <span className={cn(
                                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
                                            m.tipo === 'INGRESO' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                        )}>
                                            {m.tipo === 'INGRESO' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                                            {m.tipo}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">{m.motivo}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                                        {m.cuenta_contable_codigo ? `${m.cuenta_contable_codigo}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                                        {formatMoneda(m.valor)}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{m.user_nombre}</td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => imprimirRecibo80mm(m, empresa?.nombre || '')}
                                            className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                                            title="Imprimir recibo"
                                        >
                                            <Printer className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {movimientos.length > 0 && (
                            <tfoot className="bg-slate-50 text-xs font-medium text-slate-700 border-t border-slate-200">
                                <tr>
                                    <td colSpan={4} className="px-4 py-2 text-right">Ingresos:</td>
                                    <td className="px-4 py-2 text-right font-mono text-emerald-700">
                                        {formatMoneda(totales.total_ingresos_extra)}
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>
                                <tr>
                                    <td colSpan={4} className="px-4 py-2 text-right">Egresos:</td>
                                    <td className="px-4 py-2 text-right font-mono text-red-700">
                                        {formatMoneda(totales.total_egresos_extra)}
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        )
    }

    function renderVentas() {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Efectivo', value: totales.total_ventas_efectivo, color: 'text-emerald-700' },
                        { label: 'Cheque / Transf.', value: totales.total_ventas_cheque, color: 'text-blue-700' },
                        { label: 'Otros', value: totales.total_ventas_otros, color: 'text-slate-700' },
                    ].map(x => (
                        <div key={x.label} className="bg-white rounded-xl border border-slate-200 p-4">
                            <p className="text-xs text-slate-500">{x.label}</p>
                            <p className={cn('text-xl font-bold font-mono mt-1', x.color)}>{formatMoneda(x.value)}</p>
                        </div>
                    ))}
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                            <tr>
                                <th className="px-4 py-3">Comprobante</th>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3 text-right">Total</th>
                                <th className="px-4 py-3">Formas de Pago</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {ventas.length === 0 && (
                                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Sin ventas registradas.</td></tr>
                            )}
                            {ventas.map((v, i) => {
                                const vt = v as Record<string, unknown>
                                const pagos = (vt.comprobante_pagos as unknown[]) ?? []
                                // Agrupa pagos por metodo
                                const porMetodo: Record<string, number> = {}
                                for (const p of pagos) {
                                    const pt = p as Record<string, unknown>
                                    const met = String(pt.metodo_pago || 'otros').toLowerCase()
                                    porMetodo[met] = (porMetodo[met] ?? 0) + (Number(pt.valor) || 0)
                                }
                                const detalles = Object.entries(porMetodo)
                                    .filter(([, v]) => v > 0)
                                    .map(([m, v]) => `${fmtMetodo(m)} ${formatMoneda(v)}`)
                                    .join(' | ')
                                return (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-mono text-xs">{vt.secuencial as string}</td>
                                        <td className="px-4 py-3 text-slate-700">{(vt.clientes as Record<string, string> | null)?.nombre || '—'}</td>
                                        <td className="px-4 py-3 text-right font-mono font-bold">{formatMoneda(Number(vt.total))}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{detalles || '—'}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold">
                            <tr>
                                <td colSpan={2} className="px-4 py-3 text-right">TOTAL</td>
                                <td className="px-4 py-3 text-right font-mono">{formatMoneda(totales.total_ventas)}</td>
                                <td className="px-4 py-3 text-xs text-slate-500">
                                    EF {formatMoneda(totales.total_ventas_efectivo)} | CD/TR {formatMoneda(totales.total_ventas_cheque)} | OT {formatMoneda(totales.total_ventas_otros)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        )
    }

    function renderCartera() {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Efectivo', value: totales.total_cartera_efectivo, color: 'text-emerald-700' },
                        { label: 'Cheque / Transf.', value: totales.total_cartera_cheque, color: 'text-blue-700' },
                        { label: 'Otros', value: totales.total_cartera_otros, color: 'text-slate-700' },
                    ].map(x => (
                        <div key={x.label} className="bg-white rounded-xl border border-slate-200 p-4">
                            <p className="text-xs text-slate-500">{x.label}</p>
                            <p className={cn('text-xl font-bold font-mono mt-1', x.color)}>{formatMoneda(x.value)}</p>
                        </div>
                    ))}
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                            <tr>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3">Referencia</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {cartera.length === 0 && (
                                <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Sin cobros de cartera registrados.</td></tr>
                            )}
                            {cartera.map((p, i) => {
                                const pt = p as Record<string, unknown>
                                const cxc = pt.cartera_cxc as Record<string, unknown> | null
                                const clienteNom = (cxc?.clientes as Record<string, string> | null)?.nombre ?? '—'
                                const met = String(pt.metodo_pago || 'otros').toLowerCase()
                                return (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-slate-700 text-sm">{clienteNom}</td>
                                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{(pt.referencia as string) || '—'}</td>
                                        <td className="px-4 py-3 text-right font-mono font-bold">
                                            <span className="text-xs text-slate-500 mr-1">{fmtMetodo(met)}</span>
                                            {formatMoneda(Number(pt.valor))}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold">
                            <tr>
                                <td colSpan={2} className="px-4 py-3 text-right">TOTAL</td>
                                <td className="px-4 py-3 text-right font-mono">{formatMoneda(totales.total_cartera)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        )
    }

    function renderCierre() {
        const isCerrado = cierre?.estado === 'CERRADO'
        const aDepositar = baseEdited > totales.total_efectivo_dia
            ? 0
            : totales.total_efectivo_dia - baseEdited

        return (
            <div className="space-y-6 max-w-3xl">
                {/* Warning cajeros */}
                {cajerosPendientes.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium text-amber-800 text-sm">Cajeros con sesión abierta</p>
                            <p className="text-amber-700 text-sm mt-1">
                                {cajerosPendientes.join(', ')}
                            </p>
                            <p className="text-amber-600 text-xs mt-1">
                                Todos los cajeros deben cerrar su sesión antes del cierre general.
                            </p>
                        </div>
                    </div>
                )}

                {isCerrado && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium text-emerald-800 text-sm">Caja cerrada</p>
                            <p className="text-emerald-700 text-xs mt-1">
                                Cerrado el {cierre?.fecha_cierre ? new Date(cierre.fecha_cierre).toLocaleString('es-EC') : ''} por {cierre?.user_cierre_nombre}
                            </p>
                        </div>
                    </div>
                )}

                {/* Totals summary */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                    <h3 className="font-semibold text-slate-700">Resumen del día</h3>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-500">Ventas efectivo</span><span className="font-mono">{formatMoneda(totales.total_ventas_efectivo)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Ventas cheque/transf.</span><span className="font-mono">{formatMoneda(totales.total_ventas_cheque)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Cartera efectivo</span><span className="font-mono">{formatMoneda(totales.total_cartera_efectivo)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Cartera cheque/transf.</span><span className="font-mono">{formatMoneda(totales.total_cartera_cheque)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Ingresos extra</span><span className="font-mono text-emerald-700">{formatMoneda(totales.total_ingresos_extra)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Egresos extra</span><span className="font-mono text-red-700">{formatMoneda(totales.total_egresos_extra)}</span></div>
                    </div>
                    <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-x-8">
                        <div className="flex justify-between font-bold text-sm"><span>Total efectivo día</span><span className="font-mono text-emerald-700">{formatMoneda(totales.total_efectivo_dia)}</span></div>
                        <div className="flex justify-between font-bold text-sm"><span>Total cheques día</span><span className="font-mono text-blue-700">{formatMoneda(totales.total_cheques_dia)}</span></div>
                    </div>
                </div>

                {/* Base caja */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h3 className="font-semibold text-slate-700 mb-3">Base de Caja</h3>
                    <div className="flex items-center gap-3 flex-wrap">
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={isCerrado}
                            className="w-36 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                            value={baseCajaEdit}
                            onChange={e => { setBaseCajaEdit(e.target.value); setBaseSaved(false) }}
                        />
                        {!isCerrado && (
                            <button
                                onClick={handleSaveBase}
                                disabled={savingBase}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                            >
                                {savingBase ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                {baseSaved ? '✓ Guardado' : 'Guardar base'}
                            </button>
                        )}
                        <p className="text-sm text-slate-500">No se deposita; queda para el día siguiente.</p>
                    </div>
                    <div className="mt-3 flex justify-between text-sm font-bold border-t border-slate-100 pt-3">
                        <span>Efectivo a depositar</span>
                        <span className="font-mono text-emerald-700">{formatMoneda(aDepositar)}</span>
                    </div>
                </div>

                {/* Deposits */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-slate-700">Depósitos Bancarios</h3>
                        {!isCerrado && (
                            <button
                                onClick={addDepositoRow}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                                <Plus className="w-3.5 h-3.5" /> Agregar
                            </button>
                        )}
                    </div>
                    <div className="space-y-2">
                        {depositoRows.map((d, i) => (
                            <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                {/* Bank account selector */}
                                <div className="col-span-5">
                                    <SelectorCuentaBancaria
                                        cuentas={cuentasBancarias}
                                        value={d.cuenta_banco_id ?? null}
                                        disabled={isCerrado}
                                        onChange={(id, nombre) => updateDepositoRow(i, {
                                            cuenta_banco_id: id,
                                            cuenta_banco_nombre: nombre,
                                        })}
                                    />
                                </div>
                                {/* Tipo */}
                                <select
                                    className="col-span-2 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-primary-400 focus:outline-none disabled:bg-slate-50"
                                    disabled={isCerrado}
                                    value={d.tipo_deposito}
                                    onChange={e => updateDepositoRow(i, { tipo_deposito: e.target.value as 'EFECTIVO' | 'CHEQUE' })}
                                >
                                    <option value="EFECTIVO">Efectivo</option>
                                    <option value="CHEQUE">Cheque</option>
                                </select>
                                {/* Valor */}
                                <input
                                    type="number"
                                    step="0.01"
                                    className="col-span-2 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right font-mono focus:ring-1 focus:ring-primary-400 focus:outline-none disabled:bg-slate-50"
                                    placeholder="0.00"
                                    disabled={isCerrado}
                                    value={d.valor || ''}
                                    onChange={e => updateDepositoRow(i, { valor: parseFloat(e.target.value) || 0 })}
                                />
                                {/* Comprobante */}
                                <input
                                    className="col-span-2 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-primary-400 focus:outline-none disabled:bg-slate-50"
                                    placeholder="Nro. comprobante"
                                    disabled={isCerrado}
                                    value={d.numero_comprobante || ''}
                                    onChange={e => updateDepositoRow(i, { numero_comprobante: e.target.value })}
                                />
                                {!isCerrado && (
                                    <button
                                        onClick={() => removeDepositoRow(i)}
                                        className="col-span-1 flex justify-center text-slate-400 hover:text-red-500"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {depositoRows.length === 0 && (
                            <p className="text-sm text-slate-400 py-2">Sin depósitos registrados.</p>
                        )}
                    </div>
                    {depositoRows.length > 0 && (
                        <div className="flex justify-between font-bold text-sm border-t border-slate-200 pt-3 mt-3">
                            <span>Total depósitos</span>
                            <span className="font-mono">{formatMoneda(totalDepositos)}</span>
                        </div>
                    )}
                </div>

                {/* Observaciones */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h3 className="font-semibold text-slate-700 mb-2">Observaciones</h3>
                    <textarea
                        rows={3}
                        disabled={isCerrado}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder="Observaciones del cierre..."
                        value={observaciones}
                        onChange={e => setObservaciones(e.target.value)}
                    />
                    <label className="flex items-center gap-2 mt-2 text-sm text-slate-600 cursor-pointer">
                        <input
                            type="checkbox"
                            disabled={isCerrado}
                            checked={conDetalle}
                            onChange={e => setConDetalle(e.target.checked)}
                            className="rounded"
                        />
                        Imprimir reporte con detalle de ventas
                    </label>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => imprimirReporteCierre(
                            { ...cierre!, ...totales, base_caja: baseEdited },
                            movimientos, ventas, cartera, depositoRows,
                            empresa?.nombre || '',
                            profile?.nombre || user?.email || ''
                        )}
                        className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                        <Printer className="w-4 h-4" /> Imprimir Reporte
                    </button>
                    <button
                        onClick={() => handleEnviarCorreoCierre()}
                        disabled={enviandoCorreo}
                        className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                        {enviandoCorreo
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : correoEnviado
                                ? <CheckCircle className="w-4 h-4 text-emerald-600" />
                                : <Mail className="w-4 h-4" />}
                        {correoEnviado ? `Enviado a ${user?.email}` : 'Enviar por correo'}
                    </button>
                    {!isCerrado && (
                        <button
                            onClick={ejecutarCierreDefinitivo}
                            disabled={cerrandoCierre || cajerosPendientes.length > 0}
                            className="flex items-center gap-2 px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {cerrandoCierre
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <CheckCircle className="w-4 h-4" />}
                            Ejecutar Cierre Definitivo
                        </button>
                    )}
                </div>
            </div>
        )
    }

    function renderHistorico() {
        return (
            <div className="space-y-4">
                {loadingHist && (
                    <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                    </div>
                )}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                            <tr>
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3 text-right">Total Ventas</th>
                                <th className="px-4 py-3 text-right">Cartera</th>
                                <th className="px-4 py-3 text-right">Efectivo</th>
                                <th className="px-4 py-3 text-right">Cheques</th>
                                <th className="px-4 py-3">Cerrado por</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {historico.length === 0 && !loadingHist && (
                                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Sin registros de cierre.</td></tr>
                            )}
                            {historico.map(c => (
                                <tr key={c.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium">{fmtFecha(c.fecha)}</td>
                                    <td className="px-4 py-3">
                                        <span className={cn(
                                            'inline-flex px-2 py-0.5 rounded-full text-xs font-bold',
                                            c.estado === 'CERRADO' ? 'bg-emerald-100 text-emerald-700'
                                                : c.estado === 'ABIERTO' ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-red-100 text-red-700'
                                        )}>
                                            {c.estado}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{formatMoneda(c.total_ventas)}</td>
                                    <td className="px-4 py-3 text-right font-mono">{formatMoneda(c.total_cartera)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-emerald-700">{formatMoneda(c.total_efectivo_dia)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-blue-700">{formatMoneda(c.total_cheques_dia)}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{c.user_cierre_nombre || '—'}</td>
                                    <td className="px-4 py-3">
                                        {c.estado === 'CERRADO' && user?.id && (
                                            <button
                                                onClick={() => setReversarTarget(c)}
                                                className="flex items-center gap-1 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" /> Reversar
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    // ── main render ──

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Wallet className="w-6 h-6 text-emerald-600" />
                        Cierre de Caja General
                        {cierre && cierre.estado !== 'CERRADO' && (
                            <span className="text-xs font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                ● Abierto — auto-guardado
                            </span>
                        )}
                        <HelpButton pageKey="cierre-caja-general" />
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {new Date(fechaSeleccionada + 'T12:00:00').toLocaleDateString('es-EC', {
                            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
                        })}
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Date picker */}
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <input
                            type="date"
                            value={fechaSeleccionada}
                            max={hoy()}
                            onChange={e => {
                                if (e.target.value) setFechaSeleccionada(e.target.value)
                            }}
                            className="text-sm text-slate-700 focus:outline-none bg-transparent"
                        />
                    </div>
                    {/* Cajero status */}
                    {cajerosPendientes.length === 0
                        ? <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 text-sm">
                            <CheckCircle className="w-4 h-4" /> Todos los cajeros cerraron
                        </span>
                        : <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200 text-sm">
                            <AlertCircle className="w-4 h-4" /> {cajerosPendientes.length} caja(s) abierta(s)
                        </span>}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200">
                {TABS.map(t => {
                    const Icon = t.icon
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id as TabId)}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                                tab === t.id
                                    ? 'border-primary-600 text-primary-700'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {/* Tab content */}
            <div>
                {tab === 0 && renderMovimientos()}
                {tab === 1 && renderVentas()}
                {tab === 2 && renderCartera()}
                {tab === 3 && renderCierre()}
                {tab === 4 && renderHistorico()}
            </div>

            {/* Modals */}
            {showModalMov && empresa?.id && user?.id && (
                <ModalMovimiento
                    empresaId={empresa.id}
                    fecha={fechaSeleccionada}
                    userName={profile?.nombre || user.email || ''}
                    userId={user.id}
                    cuentas={cuentasLP}
                    onClose={() => setShowModalMov(false)}
                    onSaved={mov => {
                        setMovimientos(prev => [...prev, mov])
                    }}
                />
            )}

            {reversarTarget && user?.id && (
                <ModalReversar
                    cierre={reversarTarget}
                    userId={user.id}
                    onClose={() => setReversarTarget(null)}
                    onDone={() => { setReversarTarget(null); cargarHistorico() }}
                />
            )}
        </div>
    )
}
