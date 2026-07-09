import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/utils'
import { Wallet, Download, Printer, Search } from 'lucide-react'

interface FilaDeuda {
    secuencial: string
    fecha_emision: string
    fecha_vencimiento: string | null
    vendedor: string
    cliente: string
    identificacion: string
    valor_factura: number
    valor_deuda: number
    pagado: number
    saldo: number
    estado: string
}

function diasVencido(fechaVenc: string | null): number | null {
    if (!fechaVenc) return null
    const diff = Math.floor((Date.now() - new Date(fechaVenc + 'T00:00:00').getTime()) / 86400000)
    return diff > 0 ? diff : null
}

function diasPorVencer(fechaVenc: string | null): number | null {
    if (!fechaVenc) return null
    const diff = Math.floor((new Date(fechaVenc + 'T00:00:00').getTime() - Date.now()) / 86400000)
    return diff >= 0 ? diff : null
}

interface GrupoVendedor {
    vendedor: string
    filas: FilaDeuda[]
    subtotal_deuda: number
    subtotal_pagado: number
    subtotal_saldo: number
}

export function ConsultaCarteraClientesPage() {
    const { empresa } = useAuth()
    const printRef = useRef<HTMLDivElement>(null)
    const today = new Date().toISOString().split('T')[0]

    const [fechaCorte, setFechaCorte] = useState(today)
    const [vendedorFiltro, setVendedorFiltro] = useState('')
    const [vendedores, setVendedores] = useState<any[]>([])
    const [grupos, setGrupos] = useState<GrupoVendedor[]>([])
    const [loading, setLoading] = useState(false)

    const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: 'Cartera_Clientes' })

    useEffect(() => {
        if (empresa?.id) loadVendedores()
    }, [empresa?.id])

    async function loadVendedores() {
        const { data } = await supabase
            .from('vendedores')
            .select('id, nombre')
            .eq('empresa_id', empresa!.id)
            .order('nombre')
        setVendedores(data || [])
    }

    async function consultar() {
        if (!empresa?.id) return
        setLoading(true)
        try {
            // Traer cartera con pagos hasta fecha de corte
            let query = supabase
                .from('cartera_cxc')
                .select(`
                    id, fecha_emision, fecha_vencimiento, valor_original, saldo, estado,
                    clientes (nombre, identificacion),
                    comprobantes (secuencial, total, vendedor_id, vendedores (nombre)),
                    cartera_cxc_pagos (valor, fecha_pago, estado)
                `)
                .eq('empresa_id', empresa!.id)
                .in('estado', ['pendiente', 'parcial'])
                .lte('fecha_emision', fechaCorte)

            const { data, error } = await query
            if (error) throw error

            const filas: FilaDeuda[] = []
            for (const c of (data || [])) {
                const comp = c.comprobantes as any
                const vendedorNombre = comp?.vendedores?.nombre || '— Sin vendedor —'

                if (vendedorFiltro && comp?.vendedor_id !== vendedorFiltro) continue

                // Pagos hasta la fecha de corte
                const pagosHastaCorte = (c.cartera_cxc_pagos as any[] || [])
                    .filter((p: any) => p.fecha_pago <= fechaCorte && p.estado === 'activo')
                const pagado = pagosHastaCorte.reduce((s: number, p: any) => s + Number(p.valor), 0)
                const saldoCorte = Number(c.valor_original) - pagado

                if (saldoCorte <= 0) continue

                filas.push({
                    secuencial: comp?.secuencial || '—',
                    fecha_emision: c.fecha_emision,
                    fecha_vencimiento: (c as any).fecha_vencimiento || null,
                    vendedor: vendedorNombre,
                    cliente: (c.clientes as any)?.nombre || '—',
                    identificacion: (c.clientes as any)?.identificacion || '—',
                    valor_factura: Number(comp?.total || 0),
                    valor_deuda: Number(c.valor_original),
                    pagado,
                    saldo: saldoCorte,
                    estado: c.estado,
                })
            }

            // Agrupar por vendedor
            const mapa: Record<string, FilaDeuda[]> = {}
            for (const f of filas) {
                if (!mapa[f.vendedor]) mapa[f.vendedor] = []
                mapa[f.vendedor].push(f)
            }

            const resultado: GrupoVendedor[] = Object.entries(mapa)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([vendedor, rows]) => ({
                    vendedor,
                    filas: rows.sort((a, b) => a.cliente.localeCompare(b.cliente)),
                    subtotal_deuda: rows.reduce((s, r) => s + r.valor_deuda, 0),
                    subtotal_pagado: rows.reduce((s, r) => s + r.pagado, 0),
                    subtotal_saldo: rows.reduce((s, r) => s + r.saldo, 0),
                }))

            setGrupos(resultado)
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    function exportarCSV() {
        const headers = ['Factura', 'Emisión', 'Vendedor', 'Cliente', 'Identificación', 'Valor Factura', 'Valor Deuda', 'Pagado', 'Saldo']
        const rows: string[][] = []
        for (const g of grupos) {
            for (const f of g.filas) {
                rows.push([
                    f.secuencial, f.fecha_emision, f.vendedor, f.cliente, f.identificacion,
                    f.valor_factura.toFixed(2), f.valor_deuda.toFixed(2), f.pagado.toFixed(2), f.saldo.toFixed(2)
                ])
            }
            rows.push(['', '', `SUBTOTAL ${g.vendedor}`, '', '', '', g.subtotal_deuda.toFixed(2), g.subtotal_pagado.toFixed(2), g.subtotal_saldo.toFixed(2)])
        }
        const totDeuda = grupos.reduce((s, g) => s + g.subtotal_deuda, 0)
        const totPagado = grupos.reduce((s, g) => s + g.subtotal_pagado, 0)
        const totSaldo = grupos.reduce((s, g) => s + g.subtotal_saldo, 0)
        rows.push(['', '', 'TOTAL GENERAL', '', '', '', totDeuda.toFixed(2), totPagado.toFixed(2), totSaldo.toFixed(2)])

        const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Cartera_Clientes_${fechaCorte}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const totalGeneral = grupos.reduce((s, g) => s + g.subtotal_saldo, 0)
    const totalFilas = grupos.reduce((s, g) => s + g.filas.length, 0)

    function makeGrupos(filasFiltradas: FilaDeuda[]): GrupoVendedor[] {
        const mapa: Record<string, FilaDeuda[]> = {}
        for (const f of filasFiltradas) {
            if (!mapa[f.vendedor]) mapa[f.vendedor] = []
            mapa[f.vendedor].push(f)
        }
        return Object.entries(mapa)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([vendedor, rows]) => ({
                vendedor,
                filas: rows.sort((a, b) => a.cliente.localeCompare(b.cliente)),
                subtotal_deuda:  rows.reduce((s, r) => s + r.valor_deuda, 0),
                subtotal_pagado: rows.reduce((s, r) => s + r.pagado, 0),
                subtotal_saldo:  rows.reduce((s, r) => s + r.saldo, 0),
            }))
    }

    const todasLasFilas = grupos.flatMap(g => g.filas)
    const gruposVencidos   = makeGrupos(todasLasFilas.filter(f => diasVencido(f.fecha_vencimiento) !== null))
    const gruposPorVencer  = makeGrupos(todasLasFilas.filter(f => diasPorVencer(f.fecha_vencimiento) !== null))
    const gruposSinFecha   = makeGrupos(todasLasFilas.filter(f => !f.fecha_vencimiento))

    const totalVencido   = gruposVencidos.reduce((s, g) => s + g.subtotal_saldo, 0)
    const totalPorVencer = gruposPorVencer.reduce((s, g) => s + g.subtotal_saldo, 0)

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Wallet className="w-6 h-6 text-primary-600" /> Deudas de Clientes
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">Cartera por cobrar agrupada por vendedor</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="card p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Corte a fecha</label>
                        <input type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)}
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
                    {grupos.length > 0 && (
                        <div className="flex gap-2 col-span-2 md:col-span-2">
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

            {grupos.length > 0 && (
                <div ref={printRef} className="space-y-6">
                    {/* Print header */}
                    <div className="hidden print:block mb-4">
                        <h2 className="text-xl font-bold">{empresa?.nombre}</h2>
                        <p className="text-sm">Cartera de Clientes — Corte al {fechaCorte}</p>
                    </div>

                    {/* ══ SECCIÓN VENCIDAS ══ */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full bg-red-500" />
                                <h2 className="text-base font-bold text-red-700 uppercase tracking-wide">Facturas Vencidas</h2>
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                                    {gruposVencidos.reduce((s, g) => s + g.filas.length, 0)} facturas
                                </span>
                            </div>
                            <span className="font-bold text-red-700">Total: {formatCurrency(totalVencido)}</span>
                        </div>

                        {gruposVencidos.length === 0 ? (
                            <div className="card p-6 text-center text-slate-400 text-sm">Sin facturas vencidas</div>
                        ) : gruposVencidos.map(g => (
                            <div key={g.vendedor} className="card overflow-hidden">
                                <div className="bg-red-800 text-white px-4 py-2.5 flex items-center justify-between">
                                    <span className="font-bold text-sm">Vendedor: {g.vendedor}</span>
                                    <span className="text-xs opacity-75">{g.filas.length} facturas · Saldo: {formatCurrency(g.subtotal_saldo)}</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-red-50 border-b border-red-100">
                                            <tr>
                                                <th className="px-3 py-2.5 text-left font-semibold text-red-600">Factura</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-red-600">Emisión</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-red-600">Vencimiento</th>
                                                <th className="px-3 py-2.5 text-center font-semibold text-red-600">Días Vencidos</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-red-600">Cliente</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-red-600">Valor Deuda</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-red-600">Pagado</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-red-600">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-red-50">
                                            {g.filas.map((f, i) => {
                                                const dias = diasVencido(f.fecha_vencimiento)!
                                                return (
                                                    <tr key={i} className="hover:bg-red-50/50 bg-red-50/20">
                                                        <td className="px-3 py-2 font-mono text-slate-700">{f.secuencial}</td>
                                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{f.fecha_emision}</td>
                                                        <td className="px-3 py-2 text-red-600 font-medium whitespace-nowrap">{f.fecha_vencimiento || '—'}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                                                {dias} {dias === 1 ? 'día' : 'días'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium text-slate-800">{f.cliente}</div>
                                                            <div className="text-slate-400">{f.identificacion}</div>
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(f.valor_deuda)}</td>
                                                        <td className="px-3 py-2 text-right text-green-700">{f.pagado > 0 ? formatCurrency(f.pagado) : '—'}</td>
                                                        <td className="px-3 py-2 text-right font-bold text-red-600">{formatCurrency(f.saldo)}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                        <tfoot className="bg-red-100 border-t border-red-200">
                                            <tr>
                                                <td colSpan={5} className="px-3 py-2 font-bold text-red-800 text-xs">Subtotal vendedor</td>
                                                <td className="px-3 py-2 text-right font-bold text-slate-700">{formatCurrency(g.subtotal_deuda)}</td>
                                                <td className="px-3 py-2 text-right font-bold text-green-700">{formatCurrency(g.subtotal_pagado)}</td>
                                                <td className="px-3 py-2 text-right font-black text-red-700">{formatCurrency(g.subtotal_saldo)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ══ SECCIÓN POR VENCER ══ */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full bg-amber-400" />
                                <h2 className="text-base font-bold text-amber-700 uppercase tracking-wide">Por Vencer</h2>
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                                    {gruposPorVencer.reduce((s, g) => s + g.filas.length, 0)} facturas
                                </span>
                            </div>
                            <span className="font-bold text-amber-700">Total: {formatCurrency(totalPorVencer)}</span>
                        </div>

                        {gruposPorVencer.length === 0 ? (
                            <div className="card p-6 text-center text-slate-400 text-sm">Sin facturas por vencer</div>
                        ) : gruposPorVencer.map(g => (
                            <div key={g.vendedor} className="card overflow-hidden">
                                <div className="bg-amber-700 text-white px-4 py-2.5 flex items-center justify-between">
                                    <span className="font-bold text-sm">Vendedor: {g.vendedor}</span>
                                    <span className="text-xs opacity-75">{g.filas.length} facturas · Saldo: {formatCurrency(g.subtotal_saldo)}</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-amber-50 border-b border-amber-100">
                                            <tr>
                                                <th className="px-3 py-2.5 text-left font-semibold text-amber-700">Factura</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-amber-700">Emisión</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-amber-700">Vencimiento</th>
                                                <th className="px-3 py-2.5 text-center font-semibold text-amber-700">Días x Vencer</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-amber-700">Cliente</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-amber-700">Valor Deuda</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-amber-700">Pagado</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-amber-700">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-amber-50">
                                            {g.filas.map((f, i) => {
                                                const dias = diasPorVencer(f.fecha_vencimiento)!
                                                return (
                                                    <tr key={i} className="hover:bg-amber-50/50">
                                                        <td className="px-3 py-2 font-mono text-slate-700">{f.secuencial}</td>
                                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{f.fecha_emision}</td>
                                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{f.fecha_vencimiento || '—'}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${dias <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                                                {dias} {dias === 1 ? 'día' : 'días'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium text-slate-800">{f.cliente}</div>
                                                            <div className="text-slate-400">{f.identificacion}</div>
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(f.valor_deuda)}</td>
                                                        <td className="px-3 py-2 text-right text-green-700">{f.pagado > 0 ? formatCurrency(f.pagado) : '—'}</td>
                                                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatCurrency(f.saldo)}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                        <tfoot className="bg-amber-100 border-t border-amber-200">
                                            <tr>
                                                <td colSpan={5} className="px-3 py-2 font-bold text-amber-800 text-xs">Subtotal vendedor</td>
                                                <td className="px-3 py-2 text-right font-bold text-slate-700">{formatCurrency(g.subtotal_deuda)}</td>
                                                <td className="px-3 py-2 text-right font-bold text-green-700">{formatCurrency(g.subtotal_pagado)}</td>
                                                <td className="px-3 py-2 text-right font-black text-amber-800">{formatCurrency(g.subtotal_saldo)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ══ SIN FECHA (si existen) ══ */}
                    {gruposSinFecha.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 px-1">
                                <div className="w-4 h-4 rounded-full bg-slate-400" />
                                <h2 className="text-base font-bold text-slate-600 uppercase tracking-wide">Sin Fecha de Vencimiento</h2>
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                                    {gruposSinFecha.reduce((s, g) => s + g.filas.length, 0)} facturas
                                </span>
                            </div>
                            {gruposSinFecha.map(g => (
                                <div key={g.vendedor} className="card overflow-hidden">
                                    <div className="bg-slate-700 text-white px-4 py-2.5 flex items-center justify-between">
                                        <span className="font-bold text-sm">Vendedor: {g.vendedor}</span>
                                        <span className="text-xs opacity-75">{g.filas.length} facturas · Saldo: {formatCurrency(g.subtotal_saldo)}</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Factura</th>
                                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Emisión</th>
                                                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Cliente</th>
                                                    <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Valor Deuda</th>
                                                    <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Pagado</th>
                                                    <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Saldo</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {g.filas.map((f, i) => (
                                                    <tr key={i} className="hover:bg-slate-50">
                                                        <td className="px-3 py-2 font-mono text-slate-700">{f.secuencial}</td>
                                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{f.fecha_emision}</td>
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium text-slate-800">{f.cliente}</div>
                                                            <div className="text-slate-400">{f.identificacion}</div>
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(f.valor_deuda)}</td>
                                                        <td className="px-3 py-2 text-right text-green-700">{f.pagado > 0 ? formatCurrency(f.pagado) : '—'}</td>
                                                        <td className="px-3 py-2 text-right font-bold text-slate-700">{formatCurrency(f.saldo)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-slate-100 border-t border-slate-200">
                                                <tr>
                                                    <td colSpan={3} className="px-3 py-2 font-bold text-slate-700 text-xs">Subtotal vendedor</td>
                                                    <td className="px-3 py-2 text-right font-bold text-slate-700">{formatCurrency(g.subtotal_deuda)}</td>
                                                    <td className="px-3 py-2 text-right font-bold text-green-700">{formatCurrency(g.subtotal_pagado)}</td>
                                                    <td className="px-3 py-2 text-right font-black text-slate-700">{formatCurrency(g.subtotal_saldo)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Total general */}
                    <div className="card p-4 bg-slate-900 text-white flex items-center justify-between">
                        <span className="font-black text-sm">TOTAL GENERAL — {totalFilas} facturas pendientes</span>
                        <span className="font-black text-xl text-red-300">{formatCurrency(totalGeneral)}</span>
                    </div>
                </div>
            )}

            {!loading && grupos.length === 0 && (
                <div className="card p-12 text-center">
                    <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Selecciona los filtros y presiona Consultar</p>
                </div>
            )}
        </div>
    )
}
