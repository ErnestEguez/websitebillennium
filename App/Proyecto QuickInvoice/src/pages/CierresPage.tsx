import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'
import {
    Search,
    Trash2
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function CierresPage() {
    const { empresa, profile } = useAuth()
    const [sesiones, setSesiones] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (empresa?.id) {
            loadSesiones()
        }
    }, [empresa?.id])

    async function loadSesiones() {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('caja_sesiones')
                .select('*, profiles:usuario_id(nombre, email)')
                .eq('empresa_id', empresa!.id)
                .order('fecha_apertura', { ascending: false })

            if (error) throw error
            setSesiones(data || [])
        } catch (error) {
            console.error('Error loading sessions:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Está seguro de eliminar este registro de cierre? Esta acción no se puede deshacer.')) return

        try {
            const { error } = await supabase
                .from('caja_sesiones')
                .delete()
                .eq('id', id)

            if (error) throw error

            setSesiones(sesiones.filter(s => s.id !== id))
        } catch (error: any) {
            console.error('Error deleting session:', error)
            alert('Error al eliminar: ' + error.message)
        }
    }

    const filtered = sesiones.filter(s =>
        s.profiles?.nombre?.toLowerCase().includes(search.toLowerCase()) ||
        s.estado.toLowerCase().includes(search.toLowerCase())
    )

    if (loading) return <div className="p-12 text-center text-slate-500">Cargando historial de cierres...</div>

    if (profile?.rol === 'admin_plataforma') {
        return (
            <div className="p-12 text-center space-y-4">
                <div className="bg-amber-50 border border-amber-100 p-8 rounded-2xl max-w-md mx-auto">
                    <h2 className="text-xl font-bold text-amber-900">Historial no disponible</h2>
                    <p className="text-amber-700 text-sm mt-2">
                        El historial de cierres de caja es gestionado individualmente por cada empresa y no es visible para el Administrador de Plataforma.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Historial de Cierres de Caja</h1>
                    <p className="text-slate-500">Consulta y gestión de turnos y arqueos realizados</p>
                </div>
            </div>

            <div className="card">
                <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por cajero..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 font-medium">Fecha Apertura</th>
                                <th className="px-6 py-4 font-medium">Cajero</th>
                                <th className="px-6 py-4 font-medium">Estado</th>
                                <th className="px-6 py-4 font-medium text-right">Base Fija</th>
                                <th className="px-6 py-4 font-medium text-right">Recaudado</th>
                                <th className="px-6 py-4 font-medium text-right">Total Caja</th>
                                <th className="px-6 py-4 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map((sesion) => {
                                const totalRecaudado = (sesion.total_efectivo || 0) +
                                    (sesion.total_tarjetas || 0) +
                                    (sesion.total_transferencia || 0) +
                                    (sesion.total_otros || 0);

                                return (
                                    <tr key={sesion.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-700">
                                                    {format(new Date(sesion.fecha_apertura), 'dd/MM/yyyy', { locale: es })}
                                                </span>
                                                <span className="text-xs">
                                                    {format(new Date(sesion.fecha_apertura), 'HH:mm', { locale: es })}
                                                    {sesion.fecha_cierre && ` - ${format(new Date(sesion.fecha_cierre), 'HH:mm', { locale: es })}`}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                                                    {sesion.profiles?.nombre?.[0] || 'U'}
                                                </div>
                                                <span className="text-sm font-medium text-slate-900">{sesion.profiles?.nombre || 'Usuario Eliminado'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
                                                sesion.estado === 'abierta' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                                            )}>
                                                <div className={cn("w-1.5 h-1.5 rounded-full", sesion.estado === 'abierta' ? "bg-emerald-500" : "bg-slate-500")} />
                                                {sesion.estado.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-sm text-slate-600">
                                            {formatCurrency(sesion.base_inicial)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-sm font-bold text-emerald-600">
                                            {formatCurrency(totalRecaudado)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-sm font-black text-slate-900">
                                            {formatCurrency(totalRecaudado + (sesion.base_inicial || 0))}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {(profile?.rol === 'admin_plataforma' || profile?.rol === 'oficina') && (
                                                    <button
                                                        onClick={() => handleDelete(sesion.id)}
                                                        className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                                                        title="Eliminar Registro"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm">
                                        No se encontraron registros de cierres de caja.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
