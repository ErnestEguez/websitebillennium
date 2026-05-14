import { useEffect, useState } from 'react'
import { Plus, Loader2, CheckCircle, Building2, Calendar } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { LpPeriodo } from '../types/conta'
import { mesNombre } from '../lib/utils'

export function ConfiguracionPage() {
    const { empresaActiva } = useAuth()
    const [periodos, setPeriodos] = useState<LpPeriodo[]>([])
    const [loading, setLoading] = useState(true)
    const [creando, setCreando] = useState(false)
    const [año, setAño] = useState(new Date().getFullYear())
    const [mes, setMes] = useState(new Date().getMonth() + 1)
    const [ok, setOk] = useState(false)

    useEffect(() => { if (empresaActiva) cargarPeriodos() }, [empresaActiva])

    async function cargarPeriodos() {
        if (!empresaActiva) return
        setLoading(true)
        const { data } = await supabase.from('lp_periodos')
            .select('*').eq('empresa_id', empresaActiva.id).order('año').order('mes')
        setPeriodos(data ?? [])
        setLoading(false)
    }

    async function crearPeriodo() {
        if (!empresaActiva) return
        setCreando(true)
        const { error } = await supabase.from('lp_periodos').insert({
            empresa_id: empresaActiva.id,
            año,
            mes,
            estado: 'abierto',
            fecha_apertura: new Date().toISOString().slice(0, 10),
        })
        if (!error) { setOk(true); setTimeout(() => setOk(false), 2000) }
        setCreando(false)
        cargarPeriodos()
    }

    async function cambiarEstado(id: string, estado: 'abierto' | 'cerrado') {
        await supabase.from('lp_periodos').update({
            estado,
            fecha_cierre: estado === 'cerrado' ? new Date().toISOString().slice(0, 10) : null,
        }).eq('id', id)
        cargarPeriodos()
    }

    const ESTADO_STYLE = {
        abierto:   'bg-green-100 text-green-700',
        cerrado:   'bg-slate-100 text-slate-600',
        bloqueado: 'bg-red-100 text-red-700',
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
                <p className="text-slate-500 text-sm mt-0.5">Gestión de períodos contables</p>
            </div>

            {/* Info empresa */}
            {empresaActiva && (
                <div className="card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                        <p className="font-bold text-slate-900">{empresaActiva.razon_social}</p>
                        <p className="text-sm text-slate-500">{empresaActiva.ruc ?? 'Sin RUC'} · {empresaActiva.moneda?.codigo ?? 'USD'}</p>
                    </div>
                </div>
            )}

            {/* Nuevo período */}
            <div className="card p-5">
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Abrir nuevo período
                </h2>
                <div className="flex items-end gap-3">
                    <div>
                        <label className="label">Año</label>
                        <input type="number" className="input w-28" value={año} min={2020} max={2035} onChange={e => setAño(parseInt(e.target.value))} />
                    </div>
                    <div>
                        <label className="label">Mes</label>
                        <select className="input w-40" value={mes} onChange={e => setMes(parseInt(e.target.value))}>
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>{mesNombre(i + 1)}</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={crearPeriodo} disabled={creando} className="btn btn-primary gap-2">
                        {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : ok ? <CheckCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        Abrir
                    </button>
                </div>
            </div>

            {/* Lista períodos */}
            <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b">
                    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Períodos registrados</h2>
                </div>
                {loading ? (
                    <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                ) : periodos.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Sin períodos. Abre el primero arriba.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b">
                                <th className="text-left py-2.5 px-5 text-xs font-semibold text-slate-600 uppercase">Período</th>
                                <th className="text-left py-2.5 px-5 text-xs font-semibold text-slate-600 uppercase">Estado</th>
                                <th className="text-left py-2.5 px-5 text-xs font-semibold text-slate-600 uppercase">Apertura</th>
                                <th className="py-2.5 px-5 w-32" />
                            </tr>
                        </thead>
                        <tbody>
                            {periodos.map(p => (
                                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="py-2.5 px-5 font-medium text-slate-800 capitalize">
                                        {p.mes ? `${mesNombre(p.mes)} ${p.año}` : `Año ${p.año}`}
                                    </td>
                                    <td className="py-2.5 px-5">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_STYLE[p.estado]}`}>
                                            {p.estado}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-5 text-slate-500 text-xs">{p.fecha_apertura}</td>
                                    <td className="py-2.5 px-5 text-right">
                                        {p.estado === 'abierto' && (
                                            <button onClick={() => cambiarEstado(p.id, 'cerrado')} className="text-xs text-red-600 hover:underline font-medium">
                                                Cerrar período
                                            </button>
                                        )}
                                        {p.estado === 'cerrado' && (
                                            <button onClick={() => cambiarEstado(p.id, 'abierto')} className="text-xs text-primary-600 hover:underline font-medium">
                                                Reabrir
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
