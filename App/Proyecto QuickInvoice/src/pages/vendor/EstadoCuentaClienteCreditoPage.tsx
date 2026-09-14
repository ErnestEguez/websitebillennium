import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { HelpButton } from '../../components/help/HelpButton'
import { supabase } from '../../lib/supabase'
import {
    creditoElectrodomesticosService,
    type CreditoElectrodomesticos,
    type EstadoCredito,
    type CuotaCredito,
} from '../../services/creditoElectrodomesticosService'
import { formatCurrency } from '../../lib/utils'
import { Search, Printer, ChevronDown, ChevronUp, User, X, Loader2, Home } from 'lucide-react'

const ESTADO_BADGE: Record<EstadoCredito, string> = {
    CALCULADO: 'bg-slate-100 text-slate-600',
    VIGENTE: 'bg-blue-100 text-blue-700',
    EN_MORA: 'bg-red-100 text-red-700',
    LIQUIDADO: 'bg-emerald-100 text-emerald-700',
    ANULADO: 'bg-slate-200 text-slate-500 line-through',
}

const CUOTA_BADGE: Record<CuotaCredito['estado'], string> = {
    PENDIENTE: 'bg-slate-100 text-slate-600',
    PARCIAL: 'bg-amber-100 text-amber-700',
    PAGADA: 'bg-emerald-100 text-emerald-700',
    VENCIDA: 'bg-red-100 text-red-700',
    ANULADA: 'bg-slate-200 text-slate-400 line-through',
}

const METODO_LABEL: Record<string, string> = {
    efectivo: 'Efectivo', transferencia: 'Depósito', tarjeta: 'Tarjeta', cheque: 'Cheque', nota_credito: 'Nota de Crédito', otros: 'Otros',
}

export function EstadoCuentaClienteCreditoPage() {
    const { empresa } = useAuth()
    const [clientes, setClientes] = useState<any[]>([])
    const [busqueda, setBusqueda] = useState('')
    const [clienteSel, setClienteSel] = useState<any | null>(null)
    const [creditos, setCreditos] = useState<CreditoElectrodomesticos[]>([])
    const [loading, setLoading] = useState(false)
    const [loadingClientes, setLoadingClientes] = useState(false)
    const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

    async function buscarCliente() {
        if (!empresa?.id || clienteSel || !busqueda.trim()) return
        setLoadingClientes(true)
        try {
            const q = '%' + busqueda.trim().replace(/\*/g, '%') + '%'
            const { data } = await supabase
                .from('clientes').select('id, nombre, identificacion')
                .eq('empresa_id', empresa.id)
                .or(`nombre.ilike.${q},identificacion.ilike.${q}`)
                .order('nombre').limit(50)
            setClientes(data ?? [])
        } finally { setLoadingClientes(false) }
    }

    async function seleccionarCliente(cliente: any) {
        setClienteSel(cliente)
        setBusqueda(cliente.nombre)
        setLoading(true)
        try {
            const data = await creditoElectrodomesticosService.getEstadoCuentaPorCliente(empresa!.id, cliente.id)
            setCreditos(data)
            const exp: Record<string, boolean> = {}
            data.forEach(c => { if ((c.pagos?.length ?? 0) > 0) exp[c.id] = true })
            setExpandidos(exp)
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    function limpiar() {
        setClienteSel(null); setBusqueda(''); setCreditos([])
    }

    const clientesFiltrados = busqueda && !clienteSel ? clientes : []

    const totalFinanciado = creditos.reduce((s, c) => s + Number(c.total_financiado), 0)
    const totalPagado = creditos.reduce((s, c) => s + Number(c.total_pagado), 0)
    const totalSaldo = creditos.reduce((s, c) => s + Number(c.saldo_pendiente), 0)

    function imprimir() {
        if (!clienteSel || creditos.length === 0) return
        const ahora = new Date().toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
        const nombreEmpresa = (empresa as any)?.nombre || 'EMPRESA'
        const rucEmpresa = (empresa as any)?.ruc || ''

        const bloques = creditos.map(c => {
            const cuotaRows = (c.cuotas || []).map(cu => `
                <tr style="background:#f8fafc">
                    <td style="padding:3px 6px;font-size:10px;color:#555;padding-left:20px">└ Cuota #${cu.numero_cuota} · vence ${cu.fecha_vencimiento}</td>
                    <td style="padding:3px 6px;font-size:10px;text-align:right">${formatCurrency(cu.cuota_programada)}</td>
                    <td style="padding:3px 6px;font-size:10px;text-align:right;color:#16a34a">${Number(cu.total_pagado) > 0 ? formatCurrency(cu.total_pagado) : '—'}</td>
                    <td style="padding:3px 6px;font-size:10px;text-align:right;font-weight:bold;color:${Number(cu.saldo_pendiente) === 0 ? '#16a34a' : '#dc2626'}">${Number(cu.saldo_pendiente) === 0 ? '✓' : formatCurrency(cu.saldo_pendiente)}</td>
                </tr>`).join('')
            return `<tr style="border-top:2px solid #e2e8f0">
                <td style="padding:5px 6px;font-family:monospace;font-weight:bold">${c.comprobantes?.secuencial || '—'}</td>
                <td style="padding:5px 6px;font-size:11px">${c.fecha_venta}</td>
                <td style="padding:5px 6px;text-align:right">${formatCurrency(c.total_financiado)}</td>
                <td style="padding:5px 6px;text-align:right;color:#16a34a">${formatCurrency(c.total_pagado)}</td>
                <td style="padding:5px 6px;text-align:right;font-weight:bold;color:${Number(c.saldo_pendiente) === 0 ? '#16a34a' : '#dc2626'}">${Number(c.saldo_pendiente) === 0 ? '✓ PAGADO' : formatCurrency(c.saldo_pendiente)}</td>
            </tr>${cuotaRows}`
        }).join('')

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Estado de Cuenta</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}
  .hdr{display:flex;justify-content:space-between;border-bottom:2px solid #1e3a5f;padding-bottom:12px;margin-bottom:14px}
  .empresa{font-size:15px;font-weight:bold;text-transform:uppercase;color:#1e3a5f}
  .titulo{font-size:14px;font-weight:bold;text-align:right;color:#1e3a5f}
  .cliente-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  .campo label{font-size:9px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block}
  .campo p{font-size:12px;margin-top:2px}
  table{width:100%;border-collapse:collapse}
  th{background:#1e3a5f;color:white;padding:5px 6px;font-size:10px;text-transform:uppercase;text-align:left}
  .resumen{margin-top:14px;background:#f1f5f9;border-left:4px solid #1e3a5f;padding:10px 14px}
  .resumen .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
  .resumen .big{font-size:16px;font-weight:bold;border-top:2px solid #1e3a5f;margin-top:6px;padding-top:6px}
  .footer{text-align:center;margin-top:16px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
  @media print{.no-print{display:none}body{padding:10px}}
</style></head><body>
<div class="hdr">
  <div><div class="empresa">${nombreEmpresa}</div><div style="color:#555;font-size:11px">RUC: ${rucEmpresa}</div></div>
  <div><div class="titulo">ESTADO DE CUENTA — CRÉDITO ELECTRODOMÉSTICOS</div><div style="font-size:11px;color:#555;text-align:right">${ahora}</div></div>
</div>
<div class="cliente-box">
  <div class="campo"><label>Cliente</label><p><strong>${clienteSel.nombre}</strong></p></div>
  <div class="campo"><label>Identificación</label><p>${clienteSel.identificacion || '—'}</p></div>
  <div class="campo"><label>Total saldo</label><p style="font-size:14px;font-weight:bold;color:#dc2626">${formatCurrency(totalSaldo)}</p></div>
</div>
<table>
  <thead><tr><th>Factura / Cuota</th><th>Fecha</th><th>Financiado</th><th>Pagado</th><th>Saldo</th></tr></thead>
  <tbody>${bloques}</tbody>
</table>
<div class="resumen">
  <div class="row"><span>Total financiado:</span><span>${formatCurrency(totalFinanciado)}</span></div>
  <div class="row" style="color:#16a34a"><span>Total pagado:</span><span>− ${formatCurrency(totalPagado)}</span></div>
  <div class="row big" style="color:#dc2626"><span>SALDO PENDIENTE:</span><span>${formatCurrency(totalSaldo)}</span></div>
</div>
<div class="footer">Estado de cuenta generado por Corina ERP — ${ahora}</div>
<div class="no-print" style="text-align:center;margin-top:16px">
  <button onclick="window.print()" style="padding:8px 24px;background:#1e3a5f;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Imprimir</button>
</div>
</body></html>`

        const w = window.open('', '_blank', 'width=900,height=700')
        if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400) }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                        <Home className="w-7 h-7 text-primary-600" /> Estado de Cuenta por Cliente
                    </h1>
                    <p className="text-slate-600 mt-1">Historial de créditos de electrodomésticos, cuotas y pagos por cliente</p>
                </div>
                <div className="flex items-center gap-2">
                    {clienteSel && creditos.length > 0 && (
                        <button onClick={imprimir}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-xl text-sm font-semibold hover:bg-slate-800">
                            <Printer className="w-4 h-4" /> Imprimir
                        </button>
                    )}
                    <HelpButton pageKey="credito-electrodomesticos" />
                </div>
            </div>

            <div className="card p-5">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Seleccionar cliente</label>
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Nombre o RUC/Cédula — Enter o Buscar"
                        value={busqueda}
                        onChange={e => { setBusqueda(e.target.value); if (clienteSel) limpiar(); setClientes([]) }}
                        onKeyDown={e => { if (e.key === 'Enter') buscarCliente() }}
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 outline-none" />
                    {(busqueda || clienteSel) && (
                        <button onClick={limpiar} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                <button onClick={buscarCliente} disabled={loadingClientes || !busqueda.trim()}
                    className="flex items-center gap-1.5 px-4 py-2.5 mt-2 text-sm bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50">
                    {loadingClientes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar
                </button>

                {loadingClientes && <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Buscando...</p>}
                {!clienteSel && clientesFiltrados.length > 0 && (
                    <div className="mt-2 max-w-md border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto shadow-md">
                        {clientesFiltrados.map(c => (
                            <button key={c.id} onClick={() => seleccionarCliente(c)} className="w-full text-left px-4 py-2.5 hover:bg-primary-50 transition-colors">
                                <span className="font-medium text-slate-900 text-sm">{c.nombre}</span>
                                <span className="ml-2 text-slate-500 text-xs">{c.identificacion}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {loading && <div className="text-center py-10 text-slate-400">Cargando estado de cuenta...</div>}

            {clienteSel && !loading && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="card p-4 sm:col-span-1 flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                                <User className="w-5 h-5 text-primary-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Cliente</p>
                                <p className="font-bold text-slate-900 text-sm">{clienteSel.nombre}</p>
                                <p className="text-xs text-slate-400">{clienteSel.identificacion}</p>
                            </div>
                        </div>
                        <div className="card p-4 text-center">
                            <p className="text-xs text-slate-500 uppercase font-semibold">Créditos</p>
                            <p className="text-2xl font-bold text-slate-900">{creditos.length}</p>
                        </div>
                        <div className="card p-4 text-center">
                            <p className="text-xs text-slate-500 uppercase font-semibold">Total pagado</p>
                            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPagado)}</p>
                        </div>
                        <div className="card p-4 text-center">
                            <p className="text-xs text-slate-500 uppercase font-semibold">Saldo pendiente</p>
                            <p className={`text-2xl font-bold ${totalSaldo > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(totalSaldo)}</p>
                        </div>
                    </div>

                    {creditos.length === 0 ? (
                        <div className="text-center py-10 text-slate-400">Este cliente no tiene créditos de electrodomésticos registrados.</div>
                    ) : (
                        <div className="card overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-slate-800 text-white">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase">Factura</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase">Venta</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase">Cobrador</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase">Financiado</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase">Pagado</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase">Saldo</th>
                                        <th className="text-center px-4 py-3 text-xs font-semibold uppercase">Estado</th>
                                        <th className="px-4 py-3 w-8" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {creditos.map(c => {
                                        const isExp = expandidos[c.id]
                                        return (
                                            <>
                                                <tr key={c.id}
                                                    className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                                                    onClick={() => setExpandidos(prev => ({ ...prev, [c.id]: !prev[c.id] }))}>
                                                    <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">{c.comprobantes?.secuencial || '—'}</td>
                                                    <td className="px-4 py-3 text-sm text-slate-600">{c.fecha_venta}</td>
                                                    <td className="px-4 py-3 text-sm text-slate-600">{c.cobradores?.nombres || '—'}</td>
                                                    <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(c.total_financiado)}</td>
                                                    <td className="px-4 py-3 text-right text-sm font-medium text-green-600">{Number(c.total_pagado) > 0 ? formatCurrency(c.total_pagado) : '—'}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-sm">
                                                        <span className={Number(c.saldo_pendiente) === 0 ? 'text-green-600' : 'text-red-600'}>
                                                            {Number(c.saldo_pendiente) === 0 ? '✓ $0.00' : formatCurrency(c.saldo_pendiente)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[c.estado]}`}>{c.estado}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-400">
                                                        {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </td>
                                                </tr>

                                                {isExp && (
                                                    <tr key={`${c.id}-detalle`} className="bg-slate-50/50">
                                                        <td colSpan={8} className="px-8 py-3 space-y-4">
                                                            <div>
                                                                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Cuotas</p>
                                                                <table className="w-full text-sm">
                                                                    <thead>
                                                                        <tr className="text-xs text-slate-400">
                                                                            <th className="text-left pb-1 font-semibold">N.º</th>
                                                                            <th className="text-left pb-1 font-semibold">Vencimiento</th>
                                                                            <th className="text-right pb-1 font-semibold">Programada</th>
                                                                            <th className="text-right pb-1 font-semibold">Pagado</th>
                                                                            <th className="text-right pb-1 font-semibold">Saldo</th>
                                                                            <th className="text-center pb-1 font-semibold">Estado</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-100">
                                                                        {(c.cuotas || []).map(cu => (
                                                                            <tr key={cu.id}>
                                                                                <td className="py-1.5 text-slate-600">#{cu.numero_cuota}</td>
                                                                                <td className="py-1.5 text-slate-600">{cu.fecha_vencimiento}</td>
                                                                                <td className="py-1.5 text-right text-slate-700">{formatCurrency(cu.cuota_programada)}</td>
                                                                                <td className="py-1.5 text-right text-green-700">{Number(cu.total_pagado) > 0 ? formatCurrency(cu.total_pagado) : '—'}</td>
                                                                                <td className="py-1.5 text-right font-bold text-slate-700">{formatCurrency(cu.saldo_pendiente)}</td>
                                                                                <td className="py-1.5 text-center">
                                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${CUOTA_BADGE[cu.estado]}`}>{cu.estado}</span>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            {(c.pagos?.length ?? 0) > 0 && (
                                                                <div>
                                                                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Pagos registrados</p>
                                                                    <table className="w-full text-sm">
                                                                        <thead>
                                                                            <tr className="text-xs text-slate-400">
                                                                                <th className="text-left pb-1 font-semibold">Fecha</th>
                                                                                <th className="text-left pb-1 font-semibold">Recibo</th>
                                                                                <th className="text-left pb-1 font-semibold">Método</th>
                                                                                <th className="text-right pb-1 font-semibold">Valor</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-green-100">
                                                                            {(c.pagos || []).map(p => (
                                                                                <tr key={p.id} className={p.estado === 'reversado' ? 'opacity-40 line-through' : ''}>
                                                                                    <td className="py-1.5 text-slate-600">{p.fecha_pago}</td>
                                                                                    <td className="py-1.5 text-slate-500">{p.recibo_interno ?? '—'}</td>
                                                                                    <td className="py-1.5 text-slate-600">{METODO_LABEL[p.metodo_pago] || p.metodo_pago}</td>
                                                                                    <td className="py-1.5 text-right font-bold text-green-700">{formatCurrency(p.valor)}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )
                                    })}
                                </tbody>
                            </table>

                            <div className="bg-slate-50 border-t border-slate-200 px-4 py-4 flex justify-end gap-8">
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 uppercase font-semibold">Total financiado</p>
                                    <p className="text-lg font-bold text-slate-800">{formatCurrency(totalFinanciado)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 uppercase font-semibold">Total pagado</p>
                                    <p className="text-lg font-bold text-green-600">{formatCurrency(totalPagado)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 uppercase font-semibold">Saldo pendiente</p>
                                    <p className={`text-xl font-bold ${totalSaldo > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(totalSaldo)}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
