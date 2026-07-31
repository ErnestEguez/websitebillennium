import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { History, Loader2, Search, Users, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface HistorialRow {
    id: string
    user_id: string
    empresa_id: string
    ip: string | null
    dispositivo: string | null
    created_at: string
    cerrada_en: string
    cerrada_por: 'logout_manual' | 'desplazada_por_nuevo_login' | 'expirada' | 'admin'
}

const MOTIVO_LABEL: Record<HistorialRow['cerrada_por'], { label: string; className: string }> = {
    logout_manual:               { label: 'Logout manual',            className: 'bg-slate-100 text-slate-600' },
    desplazada_por_nuevo_login:  { label: 'Desplazada (nuevo login)',  className: 'bg-amber-100 text-amber-700' },
    expirada:                    { label: 'Expirada',                  className: 'bg-slate-100 text-slate-600' },
    admin:                       { label: 'Cerrada por admin',         className: 'bg-red-100 text-red-700' },
}

function fechaHace(dias: number): string {
    const d = new Date()
    d.setDate(d.getDate() - dias)
    return d.toISOString().split('T')[0]
}

export function LogSesionesPage() {
    const [empresas, setEmpresas] = useState<{ id: string; nombre: string; ruc: string }[]>([])
    const [empresaId, setEmpresaId] = useState('')
    const [desde, setDesde] = useState(fechaHace(30))
    const [hasta, setHasta] = useState(fechaHace(0))
    const [rows, setRows] = useState<HistorialRow[]>([])
    const [nombresPorUserId, setNombresPorUserId] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(false)
    const [buscado, setBuscado] = useState(false)
    const [confirmText, setConfirmText] = useState('')
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        supabase.from('empresas').select('id, nombre, ruc').order('nombre')
            .then(({ data }) => setEmpresas(data ?? []))
    }, [])

    async function buscar() {
        setLoading(true); setBuscado(true)
        try {
            let query = supabase
                .from('historial_sesiones')
                .select('*')
                .order('cerrada_en', { ascending: false })
                .limit(500)

            if (empresaId) query = query.eq('empresa_id', empresaId)
            if (desde) query = query.gte('cerrada_en', `${desde}T00:00:00`)
            if (hasta) query = query.lte('cerrada_en', `${hasta}T23:59:59`)

            const { data, error } = await query
            if (error) throw error

            const historial = data ?? []
            setRows(historial)

            const userIds = [...new Set(historial.map(r => r.user_id))]
            if (userIds.length > 0) {
                const { data: perfiles } = await supabase
                    .from('profiles').select('id, nombre').in('id', userIds)
                const mapa: Record<string, string> = {}
                for (const p of perfiles ?? []) mapa[p.id] = p.nombre || p.id
                setNombresPorUserId(mapa)
            } else {
                setNombresPorUserId({})
            }
        } catch (e: any) {
            console.error('Error cargando historial de sesiones:', e.message)
            setRows([])
        } finally {
            setLoading(false)
        }
    }

    const empresaSeleccionada = empresas.find(e => e.id === empresaId)
    const confirmacionEsperada = empresaSeleccionada ? `BORRAR ${empresaSeleccionada.nombre.toUpperCase()}` : ''

    // Borrado permanente — siempre acotado a una empresa puntual (nunca
    // "todas") y al mismo rango de fechas ya aplicado en la búsqueda.
    async function borrar() {
        if (!empresaId || confirmText.trim() !== confirmacionEsperada) return
        setDeleting(true)
        try {
            const { data, error } = await supabase.rpc('borrar_historial_sesiones', {
                p_empresa_id: empresaId,
                p_desde: desde ? `${desde}T00:00:00` : null,
                p_hasta: hasta ? `${hasta}T23:59:59` : null,
            })
            if (error) throw error
            alert(`Se borraron ${data ?? 0} registros del historial.`)
            setConfirmText('')
            await buscar()
        } catch (e: any) {
            alert(`Error al borrar: ${e.message}`)
        } finally {
            setDeleting(false)
        }
    }

    // Dispositivos distintos por usuario en el período — evidencia rápida
    // de una cuenta de 1 usuario usada desde varios dispositivos.
    const dispositivosPorUsuario = useMemo(() => {
        const mapa = new Map<string, Set<string>>()
        for (const r of rows) {
            if (!mapa.has(r.user_id)) mapa.set(r.user_id, new Set())
            mapa.get(r.user_id)!.add(r.dispositivo || 'Desconocido')
        }
        return [...mapa.entries()]
            .map(([userId, dispositivos]) => ({
                userId,
                nombre: nombresPorUserId[userId] || userId,
                cantidad: dispositivos.size,
            }))
            .filter(u => u.cantidad >= 2)
            .sort((a, b) => b.cantidad - a.cantidad)
    }, [rows, nombresPorUserId])

    return (
        <div className="max-w-5xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center">
                    <History className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Log de Sesiones</h1>
                    <p className="text-sm text-slate-500">
                        Historial de cierres de sesión (logout, desplazamientos por nuevo login). Solo lectura.
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap items-end gap-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Empresa</label>
                    <select
                        value={empresaId}
                        onChange={e => setEmpresaId(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none min-w-[220px]"
                    >
                        <option value="">— Todas las empresas —</option>
                        {empresas.map(e => (
                            <option key={e.id} value={e.id}>{e.nombre} ({e.ruc})</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Desde</label>
                    <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Hasta</label>
                    <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <button
                    onClick={buscar}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-semibold"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar
                </button>
            </div>

            {empresaId && buscado && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-red-800">Borrado permanente</p>
                            <p className="text-sm text-red-700">
                                Borra del historial los registros de <strong>{empresaSeleccionada?.nombre}</strong> entre
                                {' '}{desde} y {hasta} — no se puede deshacer. Para confirmar, escribe exactamente:
                                {' '}<span className="font-mono text-red-800">{confirmacionEsperada}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            placeholder={confirmacionEsperada}
                            className="flex-1 px-3 py-2 border border-red-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-red-400"
                        />
                        <button
                            onClick={borrar}
                            disabled={deleting || confirmText.trim() !== confirmacionEsperada}
                            className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-semibold shrink-0"
                        >
                            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Borrar historial filtrado
                        </button>
                    </div>
                </div>
            )}

            {dispositivosPorUsuario.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                    <h2 className="flex items-center gap-2 font-semibold text-amber-800 mb-3">
                        <Users className="w-4 h-4" /> Usuarios con 2+ dispositivos distintos en el período
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {dispositivosPorUsuario.map(u => (
                            <span key={u.userId} className="px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-sm text-amber-800">
                                <strong>{u.nombre}</strong> — {u.cantidad} dispositivos
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-slate-600 text-left">
                                <th className="px-4 py-2.5 font-semibold">Cerrada</th>
                                <th className="px-4 py-2.5 font-semibold">Usuario</th>
                                <th className="px-4 py-2.5 font-semibold">Motivo</th>
                                <th className="px-4 py-2.5 font-semibold">Dispositivo</th>
                                <th className="px-4 py-2.5 font-semibold">IP</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(r => {
                                const motivo = MOTIVO_LABEL[r.cerrada_por]
                                return (
                                    <tr key={r.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                                            {new Date(r.cerrada_en).toLocaleString('es-EC')}
                                        </td>
                                        <td className="px-4 py-2 font-medium text-slate-800">
                                            {nombresPorUserId[r.user_id] || r.user_id}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', motivo.className)}>
                                                {motivo.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-600">{r.dispositivo || '—'}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.ip || '—'}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                {buscado && !loading && rows.length === 0 && (
                    <p className="text-center text-slate-400 py-8 text-sm">Sin resultados para el filtro seleccionado.</p>
                )}
            </div>
        </div>
    )
}
