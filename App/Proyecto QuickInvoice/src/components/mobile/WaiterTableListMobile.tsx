import { Users, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Mesa } from '../../services/mesaService'
import type { Reserva } from '../../services/reservaService'

interface WaiterTableListMobileProps {
    mesas: Mesa[]
    reservas: Reserva[]
    onMesaClick: (mesa: Mesa) => void
    filter: string
    setFilter: (filter: any) => void
    loading: boolean
}

export function WaiterTableListMobile({
    mesas,
    reservas,
    onMesaClick,
    filter,
    setFilter,
    loading
}: WaiterTableListMobileProps) {

    const getMesaReserva = (mesaId: string) => {
        const ahora = new Date()
        const limite = new Date(ahora.getTime() + 90 * 60000)
        return reservas.find(r =>
            r.mesa_id === mesaId &&
            new Date(r.fecha_hora) >= ahora &&
            new Date(r.fecha_hora) <= limite
        )
    }

    const filteredMesas = mesas.filter(m => {
        const hasReserva = getMesaReserva(m.id)
        const ambientEstado = (m.estado === 'libre' && hasReserva) ? 'reservada' : m.estado

        if (filter === 'Libres') return ambientEstado === 'libre'
        if (filter === 'Ocupadas') return ambientEstado === 'ocupada' || ambientEstado === 'atendida'
        if (filter === 'Reservadas') return ambientEstado === 'reservada'
        return true
    })

    const statusColors: Record<string, string> = {
        libre: 'bg-emerald-100 border-emerald-300 text-emerald-800',
        ocupada: 'bg-amber-100 border-amber-300 text-amber-800',
        reservada: 'bg-indigo-100 border-indigo-300 text-indigo-800',
        atendida: 'bg-blue-100 border-blue-300 text-blue-800',
    }

    return (
        <div className="pb-20 bg-slate-50 min-h-screen">
            {/* Sticky Header Filters */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 py-3 shadow-sm">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {['Todas', 'Libres', 'Ocupadas'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-bold transition-all border",
                                f === filter
                                    ? "bg-slate-900 text-white border-slate-900 shadow-md"
                                    : "bg-white text-slate-600 border-slate-200"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Container with conditional loading */}
            {loading ? (
                <div className="space-y-4 p-4">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse border-2 border-slate-200/50" />
                    ))}
                </div>
            ) : (
                <div className="p-4 space-y-4">
                    {filteredMesas.map((mesa) => {
                        const reserva = getMesaReserva(mesa.id)
                        const ambientEstado = (mesa.estado === 'libre' && reserva) ? 'reservada' : mesa.estado
                        const colorClass = statusColors[ambientEstado] || 'bg-slate-100 border-slate-300 text-slate-800'

                        return (
                            <button
                                key={mesa.id}
                                onClick={() => onMesaClick(mesa)}
                                className={cn(
                                    "w-full text-left rounded-2xl border-2 p-5 transition-transform active:scale-95 shadow-sm relative overflow-hidden",
                                    colorClass
                                )}
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-4xl font-black tracking-tight opacity-90">
                                        {mesa.numero}
                                    </span>
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                                            {ambientEstado === 'libre' ? 'Disponible' : ambientEstado}
                                        </span>
                                        {reserva && (
                                            <div className="mt-1 flex items-center gap-1 text-[10px] bg-white/50 px-2 py-0.5 rounded-full font-bold">
                                                <Clock className="w-3 h-3" />
                                                {new Date(reserva.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 opacity-60 text-sm font-medium">
                                    <Users className="w-4 h-4" />
                                    <span>Capacidad: {mesa.capacidad}</span>
                                </div>

                                {/* Touch feedback ripple effect could go here */}
                            </button>
                        )
                    })}

                    {mesas.length === 0 && (
                        <div className="text-center py-10 text-slate-400">
                            <p>No hay mesas configuradas.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
