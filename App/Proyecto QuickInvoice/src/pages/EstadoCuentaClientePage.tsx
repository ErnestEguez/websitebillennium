import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { carteraCxcService } from '../services/carteraCxcService'
import { formatCurrency } from '../lib/utils'
import { Search, Printer, ChevronDown, ChevronUp, User, X } from 'lucide-react'

const ESTADO_BADGE: Record<string, string> = {
    pendiente: 'bg-yellow-100 text-yellow-800',
    parcial:   'bg-blue-100 text-blue-800',
    pagada:    'bg-green-100 text-green-800',
    anulada:   'bg-red-100 text-red-800',
}

export function EstadoCuentaClientePage() {
    const { empresa } = useAuth()
    const [clientes, setClientes]       = useState<any[]>([])
    const [busqueda, setBusqueda]       = useState('')
    const [clienteSel, setClienteSel]   = useState<any | null>(null)
    const [cuenta, setCuenta]           = useState<any[]>([])
    const [loading, setLoading]         = useState(false)
    const [loadingClientes, setLoadingClientes] = useState(false)
    const [expandidos, setExpandidos]   = useState<Record<string, boolean>>({})

    useEffect(() => {
        if (empresa?.id) cargarClientes()
    }, [empresa?.id])

    async function cargarClientes() {
        setLoadingClientes(true)
        try {
            const data = await carteraCxcService.getClientesConCartera(empresa!.id)
            setClientes(data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingClientes(false)
        }
    }

    async function seleccionarCliente(cliente: any) {
        setClienteSel(cliente)
        setBusqueda(cliente.nombre)
        setLoading(true)
        try {
            const data = await carteraCxcService.getEstadoCuentaCliente(empresa!.id, cliente.id)
            setCuenta(data)
            // Expandir facturas con pagos por defecto
            const exp: Record<string, boolean> = {}
            data.forEach((c: any) => { if (c.pagos?.length > 0) exp[c.id] = true })
            setExpandidos(exp)
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        } finally {
            setLoading(false)
        }
    }

    function limpiar() {
        setClienteSel(null); setBusqueda(''); setCuenta([])
    }

    const clientesFiltrados = busqueda && !clienteSel
        ? clientes.filter(c =>
            c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
            c.identificacion?.includes(busqueda))
        : []

    // Totales
    const totalOriginal = cuenta.reduce((s, c) => s + Number(c.valor_original), 0)
    const totalPagado   = cuenta.reduce((s, c) => {
        return s + (c.pagos || []).reduce((ps: number, p: any) => ps + Number(p.valor), 0)
    }, 0)
    const totalSaldo    = cuenta.reduce((s, c) => s + Number(c.saldo), 0)

    // ── Imprimir estado de cuenta ──
    function imprimir() {
        if (!clienteSel || cuenta.length === 0) return
        const ahora = new Date().toLocaleString('es-EC', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        })
        const nombreEmpresa = (empresa as any)?.nombre || (empresa as any)?.razon_social || 'EMPRESA'
        const rucEmpresa    = (empresa as any)?.ruc || ''

        const bloques = cuenta.map(c => {
            const pagoRows = (c.pagos || []).map((p: any) => `
                <tr style="background:#f0fdf4">
                    <td style="padding:3px 6px;font-size:10px;color:#555;padding-left:20px">└ Pago ${p.fecha_pago}</td>
                    <td style="padding:3px 6px;font-size:10px;color:#555">${p.metodo_pago}${p.referencia ? ' / ' + p.referencia : ''}</td>
                    <td></td>
                    <td style="padding:3px 6px;font-size:10px;text-align:right;color:#16a34a;font-weight:bold">+ ${formatCurrency(p.valor)}</td>
                    <td></td>
                </tr>`).join('')
            const saldoNuevo = Number(c.saldo)
            return `<tr style="border-top:2px solid #e2e8f0">
                <td style="padding:5px 6px;font-family:monospace;font-weight:bold">${c.comprobantes?.secuencial || '—'}</td>
                <td style="padding:5px 6px;font-size:11px">${c.fecha_emision}${c.fecha_vencimiento ? ' | vence: ' + c.fecha_vencimiento : ''}</td>
                <td style="padding:5px 6px;text-align:right">${formatCurrency(c.valor_original)}</td>
                <td style="padding:5px 6px;text-align:right;color:#dc2626">−</td>
                <td style="padding:5px 6px;text-align:right;font-weight:bold;color:${saldoNuevo===0?'#16a34a':'#dc2626'}">${saldoNuevo===0?'✓ PAGADA':formatCurrency(saldoNuevo)}</td>
            </tr>${pagoRows}`
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
  th.r{text-align:right}
  .resumen{margin-top:14px;background:#f1f5f9;border-left:4px solid #1e3a5f;padding:10px 14px}
  .resumen .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
  .resumen .big{font-size:16px;font-weight:bold;border-top:2px solid #1e3a5f;margin-top:6px;padding-top:6px}
  .footer{text-align:center;margin-top:16px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
  @media print{.no-print{display:none}body{padding:10px}}
</style></head><body>
<div class="hdr">
  <div><div class="empresa">${nombreEmpresa}</div><div style="color:#555;font-size:11px">RUC: ${rucEmpresa} | ${(empresa as any)?.direccion || ''}</div></div>
  <div><div class="titulo">ESTADO DE CUENTA</div><div style="font-size:11px;color:#555;text-align:right">${ahora}</div></div>
</div>

<div class="cliente-box">
  <div class="campo"><label>Cliente</label><p><strong>${clienteSel.nombre}</strong></p></div>
  <div class="campo"><label>Identificación</label><p>${clienteSel.identificacion || '—'}</p></div>
  <div class="campo"><label>Total saldo</label><p style="font-size:14px;font-weight:bold;color:#dc2626">${formatCurrency(totalSaldo)}</p></div>
</div>

<table>
  <thead>
    <tr>
      <th>No. Factura / Detalle</th><th>Fecha</th>
      <th class="r">Valor Fact.</th><th class="r">Pagos</th><th class="r">Saldo</th>
    </tr>
  </thead>
  <tbody>${bloques}</tbody>
</table>

<div class="resumen">
  <div class="row"><span>Total facturas:</span><span>${formatCurrency(totalOriginal)}</span></div>
  <div class="row" style="color:#16a34a"><span>Total pagado:</span><span>− ${formatCurrency(totalPagado)}</span></div>
  <div class="row big" style="color:#dc2626"><span>SALDO PENDIENTE:</span><span>${formatCurrency(totalSaldo)}</span></div>
</div>

<div class="footer">Estado de cuenta generado por QuickInvoice — ${ahora}</div>
<div class="no-print" style="text-align:center;margin-top:16px">
  <button onclick="window.print()" style="padding:8px 24px;background:#1e3a5f;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Imprimir</button>
</div>
</body></html>`

        const w = window.open('', '_blank', 'width=900,height=700')
        if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400) }
    }

    return (
        <div className="space-y-6">
            {/* Encabezado */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Estado de Cuenta por Cliente</h1>
                    <p className="text-slate-600 mt-1">Historial completo de facturas y pagos por cliente</p>
                </div>
                {clienteSel && cuenta.length > 0 && (
                    <button
                        onClick={imprimir}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-xl text-sm font-semibold hover:bg-slate-800"
                    >
                        <Printer className="w-4 h-4" />
                        Imprimir Estado de Cuenta
                    </button>
                )}
            </div>

            {/* Buscador de cliente */}
            <div className="card p-5">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Seleccionar cliente</label>
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o identificación..."
                        value={busqueda}
                        onChange={e => { setBusqueda(e.target.value); if (clienteSel) limpiar() }}
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    {(busqueda || clienteSel) && (
                        <button onClick={limpiar} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Lista desplegable de clientes */}
                {!clienteSel && clientesFiltrados.length > 0 && (
                    <div className="mt-2 max-w-md border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto shadow-md">
                        {clientesFiltrados.map(c => (
                            <button
                                key={c.id}
                                onClick={() => seleccionarCliente(c)}
                                className="w-full text-left px-4 py-2.5 hover:bg-primary-50 transition-colors"
                            >
                                <span className="font-medium text-slate-900 text-sm">{c.nombre}</span>
                                <span className="ml-2 text-slate-500 text-xs">{c.identificacion}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Fallback: mostrar todos si no hay búsqueda */}
                {!clienteSel && !busqueda && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {loadingClientes ? (
                            <span className="text-sm text-slate-400">Cargando clientes...</span>
                        ) : (
                            clientes.slice(0, 20).map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => seleccionarCliente(c)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-primary-100 text-slate-700 rounded-lg text-sm transition-colors"
                                >
                                    <User className="w-3 h-3" />
                                    {c.nombre}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Loading */}
            {loading && (
                <div className="text-center py-10 text-slate-400">Cargando estado de cuenta...</div>
            )}

            {/* Resumen del cliente seleccionado */}
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
                            <p className="text-xs text-slate-500 uppercase font-semibold">Facturas</p>
                            <p className="text-2xl font-bold text-slate-900">{cuenta.length}</p>
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

                    {cuenta.length === 0 ? (
                        <div className="text-center py-10 text-slate-400">Este cliente no tiene facturas registradas en cartera.</div>
                    ) : (
                        <div className="card overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-slate-800 text-white">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase">No. Factura</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase">Emisión</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase">Vencimiento</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase">Valor</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase">Pagado</th>
                                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase">Saldo</th>
                                        <th className="text-center px-4 py-3 text-xs font-semibold uppercase">Estado</th>
                                        <th className="px-4 py-3 w-8" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {cuenta.map(c => {
                                        const pagadoEnFactura = (c.pagos || []).reduce((s: number, p: any) => s + Number(p.valor), 0)
                                        const isExp = expandidos[c.id]
                                        return (
                                            <>
                                                <tr
                                                    key={c.id}
                                                    className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${c.estado === 'pagada' ? 'bg-green-50/30' : c.saldo > 0 ? '' : ''}`}
                                                    onClick={() => setExpandidos(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                                                >
                                                    <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">
                                                        {c.comprobantes?.secuencial || '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-600">{c.fecha_emision}</td>
                                                    <td className="px-4 py-3 text-sm text-slate-500">{c.fecha_vencimiento || '—'}</td>
                                                    <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(c.valor_original)}</td>
                                                    <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                                                        {pagadoEnFactura > 0 ? formatCurrency(pagadoEnFactura) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-sm">
                                                        <span className={Number(c.saldo) === 0 ? 'text-green-600' : 'text-red-600'}>
                                                            {Number(c.saldo) === 0 ? '✓ $0.00' : formatCurrency(c.saldo)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[c.estado] || ''}`}>
                                                            {c.estado}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-400">
                                                        {c.pagos?.length > 0
                                                            ? isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                                                            : null}
                                                    </td>
                                                </tr>

                                                {/* Detalle de pagos */}
                                                {isExp && (c.pagos || []).length > 0 && (
                                                    <tr key={`${c.id}-pagos`} className="bg-green-50/50">
                                                        <td colSpan={8} className="px-8 py-3">
                                                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Pagos registrados</p>
                                                            <table className="w-full text-sm">
                                                                <thead>
                                                                    <tr className="text-xs text-slate-400">
                                                                        <th className="text-left pb-1 font-semibold">Fecha</th>
                                                                        <th className="text-left pb-1 font-semibold">Método</th>
                                                                        <th className="text-left pb-1 font-semibold">Referencia</th>
                                                                        <th className="text-right pb-1 font-semibold">Valor</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-green-100">
                                                                    {c.pagos.map((p: any) => (
                                                                        <tr key={p.id}>
                                                                            <td className="py-1.5 text-slate-600">{p.fecha_pago}</td>
                                                                            <td className="py-1.5 text-slate-600 capitalize">{p.metodo_pago.replace('_', ' ')}</td>
                                                                            <td className="py-1.5 text-slate-500">{p.referencia || '—'}</td>
                                                                            <td className="py-1.5 text-right font-bold text-green-700">{formatCurrency(p.valor)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )
                                    })}
                                </tbody>
                            </table>

                            {/* Pie con totales */}
                            <div className="bg-slate-50 border-t border-slate-200 px-4 py-4 flex justify-end gap-8">
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 uppercase font-semibold">Total facturas</p>
                                    <p className="text-lg font-bold text-slate-800">{formatCurrency(totalOriginal)}</p>
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
