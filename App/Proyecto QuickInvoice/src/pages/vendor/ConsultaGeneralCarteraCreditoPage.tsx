import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useAuth } from '../../contexts/AuthContext'
import { HelpButton } from '../../components/help/HelpButton'
import { cobradorService, type Cobrador } from '../../services/cobradorService'
import { creditoElectrodomesticosService, type FilaCarteraCredito } from '../../services/creditoElectrodomesticosService'
import { formatCurrency } from '../../lib/utils'
import { Wallet, Download, Printer, Search } from 'lucide-react'

function diasVencido(fecha: string): number | null {
    const diff = Math.floor((Date.now() - new Date(fecha + 'T00:00:00').getTime()) / 86400000)
    return diff > 0 ? diff : null
}
function diasPorVencer(fecha: string): number | null {
    const diff = Math.floor((new Date(fecha + 'T00:00:00').getTime() - Date.now()) / 86400000)
    return diff >= 0 ? diff : null
}

interface GrupoCobrador {
    cobrador: string
    filas: FilaCarteraCredito[]
    subtotal: number
}

function agrupar(filas: FilaCarteraCredito[]): GrupoCobrador[] {
    const mapa: Record<string, FilaCarteraCredito[]> = {}
    for (const f of filas) {
        if (!mapa[f.cobrador]) mapa[f.cobrador] = []
        mapa[f.cobrador].push(f)
    }
    return Object.entries(mapa)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cobrador, rows]) => ({
            cobrador,
            filas: rows.sort((a, b) => a.cliente.localeCompare(b.cliente)),
            subtotal: rows.reduce((s, r) => s + r.saldo_pendiente, 0),
        }))
}

export function ConsultaGeneralCarteraCreditoPage() {
    const { empresa } = useAuth()
    const printRef = useRef<HTMLDivElement>(null)
    const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: 'Cartera_Credito_Electrodomesticos' })

    const [cobradores, setCobradores] = useState<Cobrador[]>([])
    const [cobradorFiltro, setCobradorFiltro] = useState('')
    const [filas, setFilas] = useState<FilaCarteraCredito[] | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (empresa?.id) cobradorService.getCobradoresActivos(empresa.id).then(setCobradores)
    }, [empresa?.id])

    async function consultar() {
        if (!empresa?.id) return
        setLoading(true)
        try {
            const r = await creditoElectrodomesticosService.consultaGeneralCartera(empresa.id, cobradorFiltro || undefined)
            setFilas(r)
        } catch (e: any) {
            alert('Error al consultar la cartera: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    function exportarCSV() {
        if (!filas) return
        const headers = ['Factura', 'Cobrador', 'Cliente', 'Identificación', 'N.º Cuota', 'Vencimiento', 'Cuota Programada', 'Saldo Pendiente']
        const rows = filas.map(f => [
            f.factura, f.cobrador, f.cliente, f.identificacion, String(f.numero_cuota), f.fecha_vencimiento,
            f.cuota_programada.toFixed(2), f.saldo_pendiente.toFixed(2),
        ])
        const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Cartera_Credito_Electrodomesticos_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const vencidas  = agrupar((filas ?? []).filter(f => diasVencido(f.fecha_vencimiento) !== null))
    const porVencer = agrupar((filas ?? []).filter(f => diasPorVencer(f.fecha_vencimiento) !== null))
    const totalVencido   = vencidas.reduce((s, g) => s + g.subtotal, 0)
    const totalPorVencer = porVencer.reduce((s, g) => s + g.subtotal, 0)
    const totalGeneral   = totalVencido + totalPorVencer
    const totalFilas     = (filas ?? []).length

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Wallet className="w-6 h-6 text-primary-600" /> Consulta General de Cartera
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">Créditos de electrodomésticos — cuotas vencidas y por vencer, por cobrador</p>
                </div>
                <HelpButton pageKey="credito-electrodomesticos" />
            </div>

            <div className="card p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Cobrador</label>
                        <select value={cobradorFiltro} onChange={e => setCobradorFiltro(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white">
                            <option value="">Todos los cobradores</option>
                            {cobradores.map(c => <option key={c.id} value={c.id}>{c.nombres}</option>)}
                        </select>
                    </div>
                    <div>
                        <button onClick={consultar} disabled={loading}
                            className="w-full btn btn-primary flex items-center justify-center gap-2 py-2">
                            <Search className="w-4 h-4" />
                            {loading ? 'Consultando...' : 'Consultar'}
                        </button>
                    </div>
                    {filas && filas.length > 0 && (
                        <div className="flex gap-2 col-span-2">
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

            {filas && filas.length > 0 && (
                <div ref={printRef} className="space-y-6">
                    <div className="hidden print:block mb-4">
                        <h2 className="text-xl font-bold">{empresa?.nombre}</h2>
                        <p className="text-sm">Cartera Crédito de Electrodomésticos — {new Date().toLocaleDateString('es-EC')}</p>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full bg-red-500" />
                                <h2 className="text-base font-bold text-red-700 uppercase tracking-wide">Cuotas Vencidas</h2>
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                                    {vencidas.reduce((s, g) => s + g.filas.length, 0)} cuotas
                                </span>
                            </div>
                            <span className="font-bold text-red-700">Total: {formatCurrency(totalVencido)}</span>
                        </div>

                        {vencidas.length === 0 ? (
                            <div className="card p-6 text-center text-slate-400 text-sm">Sin cuotas vencidas</div>
                        ) : vencidas.map(g => (
                            <div key={g.cobrador} className="card overflow-hidden">
                                <div className="bg-red-800 text-white px-4 py-2.5 flex items-center justify-between">
                                    <span className="font-bold text-sm">Cobrador: {g.cobrador}</span>
                                    <span className="text-xs opacity-75">{g.filas.length} cuotas · Saldo: {formatCurrency(g.subtotal)}</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-red-50 border-b border-red-100">
                                            <tr>
                                                <th className="px-3 py-2.5 text-left font-semibold text-red-600">Factura</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-red-600">Cliente</th>
                                                <th className="px-3 py-2.5 text-center font-semibold text-red-600">Cuota</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-red-600">Vencimiento</th>
                                                <th className="px-3 py-2.5 text-center font-semibold text-red-600">Días Vencidos</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-red-600">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-red-50">
                                            {g.filas.map((f, i) => {
                                                const dias = diasVencido(f.fecha_vencimiento)!
                                                return (
                                                    <tr key={i} className="hover:bg-red-50/50 bg-red-50/20">
                                                        <td className="px-3 py-2 font-mono text-slate-700">{f.factura}</td>
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium text-slate-800">{f.cliente}</div>
                                                            <div className="text-slate-400">{f.identificacion}</div>
                                                        </td>
                                                        <td className="px-3 py-2 text-center text-slate-600">#{f.numero_cuota}</td>
                                                        <td className="px-3 py-2 text-red-600 font-medium whitespace-nowrap">{f.fecha_vencimiento}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                                                {dias} {dias === 1 ? 'día' : 'días'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-bold text-red-600">{formatCurrency(f.saldo_pendiente)}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                        <tfoot className="bg-red-100 border-t border-red-200">
                                            <tr>
                                                <td colSpan={5} className="px-3 py-2 font-bold text-red-800 text-xs">Subtotal cobrador</td>
                                                <td className="px-3 py-2 text-right font-black text-red-700">{formatCurrency(g.subtotal)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full bg-amber-400" />
                                <h2 className="text-base font-bold text-amber-700 uppercase tracking-wide">Por Vencer</h2>
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                                    {porVencer.reduce((s, g) => s + g.filas.length, 0)} cuotas
                                </span>
                            </div>
                            <span className="font-bold text-amber-700">Total: {formatCurrency(totalPorVencer)}</span>
                        </div>

                        {porVencer.length === 0 ? (
                            <div className="card p-6 text-center text-slate-400 text-sm">Sin cuotas por vencer</div>
                        ) : porVencer.map(g => (
                            <div key={g.cobrador} className="card overflow-hidden">
                                <div className="bg-amber-700 text-white px-4 py-2.5 flex items-center justify-between">
                                    <span className="font-bold text-sm">Cobrador: {g.cobrador}</span>
                                    <span className="text-xs opacity-75">{g.filas.length} cuotas · Saldo: {formatCurrency(g.subtotal)}</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-amber-50 border-b border-amber-100">
                                            <tr>
                                                <th className="px-3 py-2.5 text-left font-semibold text-amber-700">Factura</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-amber-700">Cliente</th>
                                                <th className="px-3 py-2.5 text-center font-semibold text-amber-700">Cuota</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-amber-700">Vencimiento</th>
                                                <th className="px-3 py-2.5 text-center font-semibold text-amber-700">Días x Vencer</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-amber-700">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-amber-50">
                                            {g.filas.map((f, i) => {
                                                const dias = diasPorVencer(f.fecha_vencimiento)!
                                                return (
                                                    <tr key={i} className="hover:bg-amber-50/50">
                                                        <td className="px-3 py-2 font-mono text-slate-700">{f.factura}</td>
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium text-slate-800">{f.cliente}</div>
                                                            <div className="text-slate-400">{f.identificacion}</div>
                                                        </td>
                                                        <td className="px-3 py-2 text-center text-slate-600">#{f.numero_cuota}</td>
                                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{f.fecha_vencimiento}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${dias <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                                                {dias} {dias === 1 ? 'día' : 'días'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatCurrency(f.saldo_pendiente)}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                        <tfoot className="bg-amber-100 border-t border-amber-200">
                                            <tr>
                                                <td colSpan={5} className="px-3 py-2 font-bold text-amber-800 text-xs">Subtotal cobrador</td>
                                                <td className="px-3 py-2 text-right font-black text-amber-800">{formatCurrency(g.subtotal)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="card p-4 bg-slate-900 text-white flex items-center justify-between">
                        <span className="font-black text-sm">TOTAL GENERAL — {totalFilas} cuotas pendientes</span>
                        <span className="font-black text-xl text-red-300">{formatCurrency(totalGeneral)}</span>
                    </div>
                </div>
            )}

            {!loading && filas === null && (
                <div className="card p-12 text-center">
                    <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Presiona Consultar para ver la cartera</p>
                </div>
            )}

            {!loading && filas !== null && filas.length === 0 && (
                <div className="card p-12 text-center">
                    <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No hay cuotas vencidas ni por vencer{cobradorFiltro ? ' para este cobrador' : ''}.</p>
                </div>
            )}
        </div>
    )
}
