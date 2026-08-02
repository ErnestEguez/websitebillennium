import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart3, Sparkles, FileCheck2, DollarSign, Loader2 } from 'lucide-react'

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const ORIGEN_LABELS: Record<string, string> = {
    compra_inventario: 'OCR Compra Inventario',
    compra_servicio: 'OCR Compra Servicio',
    th_screening_cv: 'Screening CV (Talento Humano)',
    asistente_voz: 'Asistente de voz',
}

function fmt(n: number) { return `$${n.toFixed(2)}` }

export function EstadisticasEmpresaPage() {
    const [empresas, setEmpresas] = useState<{ id: string; nombre: string; ruc: string }[]>([])
    const [empresaId, setEmpresaId] = useState('')
    const [anio, setAnio] = useState(new Date().getFullYear())
    const [mes, setMes] = useState(new Date().getMonth() + 1) // 1-12

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [consumoIA, setConsumoIA] = useState<{ origen: string; total: number }[]>([])
    const [facturasEmitidas, setFacturasEmitidas] = useState(0)
    const [totalFacturado, setTotalFacturado] = useState(0)

    useEffect(() => {
        supabase.from('empresas').select('id, nombre, ruc').order('nombre')
            .then(({ data }) => setEmpresas(data ?? []))
    }, [])

    useEffect(() => {
        if (empresaId) cargar()
    }, [empresaId, anio, mes])

    async function cargar() {
        setLoading(true); setError('')
        try {
            const desde = new Date(Date.UTC(anio, mes - 1, 1)).toISOString()
            const hasta = new Date(Date.UTC(mes === 12 ? anio + 1 : anio, mes === 12 ? 0 : mes, 1)).toISOString()

            const [consumoRes, comprobantesRes] = await Promise.all([
                supabase.from('consumo_ia')
                    .select('origen')
                    .eq('empresa_id', empresaId)
                    .eq('exitoso', true)
                    .gte('created_at', desde)
                    .lt('created_at', hasta),
                supabase.from('comprobantes')
                    .select('total')
                    .eq('empresa_id', empresaId)
                    .eq('estado_sri', 'AUTORIZADO')
                    .gte('created_at', desde)
                    .lt('created_at', hasta),
            ])

            if (consumoRes.error) throw consumoRes.error
            if (comprobantesRes.error) throw comprobantesRes.error

            const porOrigen: Record<string, number> = {}
            for (const r of consumoRes.data ?? []) {
                porOrigen[r.origen] = (porOrigen[r.origen] ?? 0) + 1
            }
            setConsumoIA(Object.entries(porOrigen).map(([origen, total]) => ({ origen, total })))

            const facturas = comprobantesRes.data ?? []
            setFacturasEmitidas(facturas.length)
            setTotalFacturado(facturas.reduce((s, f: any) => s + (Number(f.total) || 0), 0))
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const empresa = empresas.find(e => e.id === empresaId)
    const totalConsumoIA = consumoIA.reduce((s, r) => s + r.total, 0)
    const anioActual = new Date().getFullYear()
    const anios = Array.from({ length: 5 }, (_, i) => anioActual - i)

    return (
        <div className="max-w-3xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Estadísticas por Empresa</h1>
                    <p className="text-sm text-slate-500">Consumo de IA, facturación electrónica y volumen facturado — solo visible para admin_plataforma.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Empresa</label>
                        <select
                            value={empresaId}
                            onChange={e => setEmpresaId(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            <option value="">— Seleccionar empresa —</option>
                            {empresas.map(e => (
                                <option key={e.id} value={e.id}>{e.nombre} ({e.ruc})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Mes</label>
                        <select
                            value={mes}
                            onChange={e => setMes(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            {MESES.map((m, i) => (
                                <option key={m} value={i + 1}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Año</label>
                        <select
                            value={anio}
                            onChange={e => setAnio(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            {anios.map(a => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {!empresaId ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                    Selecciona una empresa para ver sus estadísticas.
                </div>
            ) : error ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
            ) : loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-slate-500">
                        {empresa?.nombre} — {MESES[mes - 1]} {anio}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 p-5">
                            <div className="flex items-center gap-2 text-indigo-600 mb-2">
                                <Sparkles className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wide">Consumo Gemini</span>
                            </div>
                            <p className="text-3xl font-bold text-slate-900">{totalConsumoIA}</p>
                            <p className="text-xs text-slate-400 mt-1">llamadas exitosas en el período</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-5">
                            <div className="flex items-center gap-2 text-blue-600 mb-2">
                                <FileCheck2 className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wide">Facturas Emitidas</span>
                            </div>
                            <p className="text-3xl font-bold text-slate-900">{facturasEmitidas}</p>
                            <p className="text-xs text-slate-400 mt-1">autorizadas por el SRI</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-5">
                            <div className="flex items-center gap-2 text-emerald-600 mb-2">
                                <DollarSign className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wide">Total Facturado</span>
                            </div>
                            <p className="text-3xl font-bold text-slate-900">{fmt(totalFacturado)}</p>
                            <p className="text-xs text-slate-400 mt-1">solo facturas autorizadas</p>
                        </div>
                    </div>

                    {consumoIA.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 p-5">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Desglose de consumo Gemini por origen</p>
                            <div className="space-y-2">
                                {consumoIA.map(r => (
                                    <div key={r.origen} className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600">{ORIGEN_LABELS[r.origen] ?? r.origen}</span>
                                        <span className="font-mono font-semibold text-slate-800">{r.total}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
