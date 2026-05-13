import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/utils'
import { FileText, Download, Printer, Search } from 'lucide-react'

interface FilaVenta {
    id: string
    secuencial: string
    fecha: string
    cliente: string
    identificacion: string
    vendedor: string
    base_iva: number
    base_cero: number
    suma_bases: number
    iva: number
    total: number
    efectivo: number
    tarjeta: number
    transferencia: number
    cheque: number
    credito: number
    otros: number
    estado_sri: string
    estado_sistema: string
}

export function ConsultaVentasPage() {
    const { empresa } = useAuth()
    const printRef = useRef<HTMLDivElement>(null)

    const today = new Date().toISOString().split('T')[0]
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

    const [fechaInicio, setFechaInicio] = useState(firstOfMonth)
    const [fechaFin, setFechaFin] = useState(today)
    const [vendedorFiltro, setVendedorFiltro] = useState('')
    const [vendedores, setVendedores] = useState<any[]>([])
    const [filas, setFilas] = useState<FilaVenta[]>([])
    const [loading, setLoading] = useState(false)

    const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: 'Consulta_Ventas' })

    useEffect(() => {
        if (empresa?.id) loadVendedores()
    }, [empresa?.id])

    async function loadVendedores() {
        const { data } = await supabase
            .from('vendedores')
            .select('id, nombre')
            .eq('empresa_id', empresa!.id)
            .eq('estado', 'activo')
            .order('nombre')
        setVendedores(data || [])
    }

    async function consultar() {
        if (!empresa?.id) return
        setLoading(true)
        try {
            let query = supabase
                .from('comprobantes')
                .select(`
                    id, secuencial, created_at, total, estado_sri, estado_sistema,
                    clientes (nombre, identificacion),
                    vendedores (nombre),
                    comprobante_detalles (iva_porcentaje, subtotal, iva_valor),
                    comprobante_pagos (metodo_pago, valor)
                `)
                .eq('empresa_id', empresa.id)
                .eq('tipo_comprobante', 'FACTURA')
                .gte('created_at', `${fechaInicio}T00:00:00`)
                .lte('created_at', `${fechaFin}T23:59:59`)
                .order('secuencial', { ascending: true })

            if (vendedorFiltro) {
                query = query.eq('vendedor_id', vendedorFiltro)
            }

            const { data, error } = await query
            if (error) throw error

            const rows: FilaVenta[] = (data || []).map((c: any) => {
                const detalles = c.comprobante_detalles || []
                const pagos    = c.comprobante_pagos    || []
                const anulada  = c.estado_sistema === 'ANULADA'

                let base_iva = 0, base_cero = 0, iva = 0
                if (!anulada) {
                    for (const d of detalles) {
                        const pct    = Number(d.iva_porcentaje || 0)
                        const sub    = Number(d.subtotal       || 0)
                        const ivaVal = Number(d.iva_valor      || 0)
                        if (pct > 0) { base_iva += sub; iva += ivaVal }
                        else base_cero += sub
                    }
                }

                const getPago = (metodo: string) => anulada ? 0 :
                    pagos.filter((p: any) => p.metodo_pago === metodo)
                         .reduce((s: number, p: any) => s + Number(p.valor), 0)

                return {
                    id: c.id,
                    secuencial:     c.secuencial || '',
                    fecha:          new Date(c.created_at).toLocaleDateString('es-EC'),
                    cliente:        c.clientes?.nombre || 'Consumidor Final',
                    identificacion: c.clientes?.identificacion || '',
                    vendedor:       c.vendedores?.nombre || '—',
                    base_iva:       anulada ? 0 : Math.round(base_iva  * 100) / 100,
                    base_cero:      anulada ? 0 : Math.round(base_cero * 100) / 100,
                    suma_bases:     anulada ? 0 : Math.round((base_iva + base_cero) * 100) / 100,
                    iva:            anulada ? 0 : Math.round(iva * 100) / 100,
                    total:          anulada ? 0 : Number(c.total),
                    efectivo:       getPago('efectivo'),
                    tarjeta:        getPago('tarjeta'),
                    transferencia:  getPago('transferencia'),
                    cheque:         getPago('cheque'),
                    credito:        getPago('credito'),
                    otros:          getPago('otros'),
                    estado_sri:     c.estado_sri,
                    estado_sistema: c.estado_sistema || 'VIGENTE',
                }
            })
            setFilas(rows)
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    function exportarCSV() {
        const headers = [
            'Nro Factura', 'Fecha', 'Cliente', 'Identificación', 'Vendedor',
            'Base IVA', 'Base 0%', 'Suma Bases', 'IVA', 'Total',
            'Efectivo', 'Tarjeta', 'Transferencia', 'Cheque', 'Crédito', 'Otros', 'Estado SRI'
        ]
        const rows = filas.map(f => [
            f.secuencial, f.fecha, f.cliente, f.identificacion, f.vendedor,
            f.base_iva.toFixed(2), f.base_cero.toFixed(2), f.suma_bases.toFixed(2), f.iva.toFixed(2), f.total.toFixed(2),
            f.efectivo.toFixed(2), f.tarjeta.toFixed(2), f.transferencia.toFixed(2),
            f.cheque.toFixed(2), f.credito.toFixed(2), f.otros.toFixed(2), f.estado_sri
        ])
        const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Ventas_${fechaInicio}_${fechaFin}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    // Totales
    const tot = filas.reduce((acc, f) => ({
        base_iva: acc.base_iva + f.base_iva,
        base_cero: acc.base_cero + f.base_cero,
        suma_bases: acc.suma_bases + f.suma_bases,
        iva: acc.iva + f.iva,
        total: acc.total + f.total,
        efectivo: acc.efectivo + f.efectivo,
        tarjeta: acc.tarjeta + f.tarjeta,
        transferencia: acc.transferencia + f.transferencia,
        cheque: acc.cheque + f.cheque,
        credito: acc.credito + f.credito,
        otros: acc.otros + f.otros,
    }), { base_iva:0, base_cero:0, suma_bases:0, iva:0, total:0, efectivo:0, tarjeta:0, transferencia:0, cheque:0, credito:0, otros:0 })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-primary-600" /> Ventas por Período
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">Consulta de facturas emitidas con detalle por formas de pago</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="card p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Desde</label>
                        <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Hasta</label>
                        <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Vendedor</label>
                        <select value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white">
                            <option value="">Todos los vendedores</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <button onClick={consultar} disabled={loading}
                            className="w-full btn btn-primary flex items-center justify-center gap-2 py-2">
                            <Search className="w-4 h-4" />
                            {loading ? 'Consultando...' : 'Consultar'}
                        </button>
                    </div>
                    {filas.length > 0 && (
                        <div className="flex gap-2">
                            <button onClick={exportarCSV} className="flex-1 btn btn-secondary flex items-center justify-center gap-1 py-2 text-sm">
                                <Download className="w-4 h-4" /> Excel
                            </button>
                            <button onClick={() => handlePrint()} className="flex-1 btn btn-secondary flex items-center justify-center gap-1 py-2 text-sm">
                                <Printer className="w-4 h-4" /> Imprimir
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabla */}
            {filas.length > 0 && (
                <div ref={printRef}>
                    {/* Print header */}
                    <div className="hidden print:block mb-4">
                        <h2 className="text-xl font-bold">{empresa?.nombre}</h2>
                        <p className="text-sm">Reporte de Ventas — {fechaInicio} al {fechaFin}</p>
                        {vendedorFiltro && <p className="text-sm">Vendedor: {vendedores.find(v => v.id === vendedorFiltro)?.nombre}</p>}
                    </div>

                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-3 text-left font-semibold text-slate-600">Nro Factura</th>
                                        <th className="px-3 py-3 text-left font-semibold text-slate-600">Fecha</th>
                                        <th className="px-3 py-3 text-left font-semibold text-slate-600">Cliente</th>
                                        <th className="px-3 py-3 text-left font-semibold text-slate-600">Vendedor</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">Base IVA</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">Base 0%</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">Suma Bases</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">IVA</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600 bg-primary-50">Total</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">Efectivo</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">Tarjeta</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">Transf.</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">Cheque</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">Crédito</th>
                                        <th className="px-3 py-3 text-right font-semibold text-slate-600">Otros</th>
                                        <th className="px-3 py-3 text-center font-semibold text-slate-600">SRI</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filas.map(f => {
                                        const anulada = f.estado_sistema === 'ANULADA'
                                        return (
                                        <tr key={f.id} className={`hover:bg-slate-50 ${anulada ? 'opacity-50 bg-red-50/30' : ''}`}>
                                            <td className="px-3 py-2 font-mono text-slate-700">
                                                {anulada
                                                    ? <span className="line-through text-red-400">{f.secuencial}</span>
                                                    : f.secuencial}
                                            </td>
                                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{f.fecha}</td>
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-slate-800">{f.cliente}</div>
                                                <div className="text-slate-400">{f.identificacion}</div>
                                            </td>
                                            <td className="px-3 py-2 text-slate-600">{f.vendedor}</td>
                                            <td className="px-3 py-2 text-right text-slate-700">{!anulada && f.base_iva > 0 ? formatCurrency(f.base_iva) : '—'}</td>
                                            <td className="px-3 py-2 text-right text-slate-700">{!anulada && f.base_cero > 0 ? formatCurrency(f.base_cero) : '—'}</td>
                                            <td className="px-3 py-2 text-right text-slate-700">{!anulada ? formatCurrency(f.suma_bases) : '—'}</td>
                                            <td className="px-3 py-2 text-right text-slate-700">{!anulada && f.iva > 0 ? formatCurrency(f.iva) : '—'}</td>
                                            <td className="px-3 py-2 text-right font-bold bg-primary-50/50">
                                                {anulada
                                                    ? <span className="text-red-400 line-through text-xs">{formatCurrency(Number(f.total))}</span>
                                                    : <span className="text-slate-900">{formatCurrency(f.total)}</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right">{!anulada && f.efectivo > 0 ? formatCurrency(f.efectivo) : '—'}</td>
                                            <td className="px-3 py-2 text-right">{!anulada && f.tarjeta > 0 ? formatCurrency(f.tarjeta) : '—'}</td>
                                            <td className="px-3 py-2 text-right">{!anulada && f.transferencia > 0 ? formatCurrency(f.transferencia) : '—'}</td>
                                            <td className="px-3 py-2 text-right">{!anulada && f.cheque > 0 ? formatCurrency(f.cheque) : '—'}</td>
                                            <td className="px-3 py-2 text-right">{!anulada && f.credito > 0 ? formatCurrency(f.credito) : '—'}</td>
                                            <td className="px-3 py-2 text-right">{!anulada && f.otros > 0 ? formatCurrency(f.otros) : '—'}</td>
                                            <td className="px-3 py-2 text-center">
                                                {anulada
                                                    ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">ANULADA</span>
                                                    : <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                        f.estado_sri === 'AUTORIZADO' ? 'bg-green-100 text-green-700' :
                                                        f.estado_sri === 'PENDIENTE'  ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-red-100 text-red-700'
                                                      }`}>{f.estado_sri}</span>}
                                            </td>
                                        </tr>
                                        )
                                    })}
                                </tbody>
                                {/* Totales */}
                                <tfoot className="bg-slate-900 text-white">
                                    <tr>
                                        <td className="px-3 py-3 font-black text-xs" colSpan={4}>TOTALES ({filas.length} facturas)</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.base_iva)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.base_cero)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.suma_bases)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.iva)}</td>
                                        <td className="px-3 py-3 text-right font-black text-sm bg-primary-800">{formatCurrency(tot.total)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.efectivo)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.tarjeta)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.transferencia)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.cheque)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.credito)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-xs">{formatCurrency(tot.otros)}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {!loading && filas.length === 0 && (
                <div className="card p-12 text-center">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Selecciona un período y presiona Consultar</p>
                </div>
            )}
        </div>
    )
}
