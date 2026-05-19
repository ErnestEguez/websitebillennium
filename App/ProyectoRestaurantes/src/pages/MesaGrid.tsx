import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { mesaService, type Mesa } from '../services/mesaService'
import { reservaService, type Reserva } from '../services/reservaService'
import { useAuth, type Profile } from '../contexts/AuthContext'
import { cn } from '../lib/utils'
import { Users, Clock, RefreshCw, Plus } from 'lucide-react'
import { WaiterTableListMobile } from '../components/mobile/WaiterTableListMobile'

interface MesaCardProps {
    mesa: Mesa
    proximaReserva?: Reserva
    onClick: (mesa: Mesa) => void
    onReset: (mesa: Mesa) => void
    profile: Profile | null
}

function MesaCard({ mesa, proximaReserva, onClick, onReset, profile }: MesaCardProps) {
    // If it's free but has a reservation soon, we treat it as reserved
    const ambientEstado = (mesa.estado === 'libre' && proximaReserva) ? 'reservada' : mesa.estado

    const statusColors = {
        libre: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
        ocupada: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
        reservada: 'bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100',
        atendida: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
    }

    const dotColors = {
        libre: 'bg-emerald-500',
        ocupada: 'bg-amber-500',
        reservada: 'bg-primary-500',
        atendida: 'bg-blue-500',
    }

    return (
        <div className="relative group">
            <button
                onClick={() => onClick(mesa)}
                className={cn(
                    "card p-6 border-2 transition-all duration-200 text-left flex flex-col justify-between h-48 w-full",
                    statusColors[ambientEstado]
                )}
            >
                <div className="flex justify-between items-start">
                    <div>
                        <span className="text-3xl font-black">{mesa.numero}</span>
                        <div className="flex items-center gap-1.5 mt-1">
                            <div className={cn("w-2 h-2 rounded-full", dotColors[ambientEstado])} />
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                {ambientEstado}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1 text-xs font-bold opacity-60">
                            <Users className="w-3 h-3" />
                            {mesa.capacidad}
                        </div>
                    </div>
                </div>

                <div className="mt-2 pt-2 border-t border-current border-opacity-10 space-y-1">
                    {(proximaReserva && profile?.rol !== 'mesero') ? (
                        <div className="flex flex-col">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase opacity-60">Reserva</span>
                                <div className="flex items-center gap-1 text-[10px] font-black bg-white/50 px-1.5 py-0.5 rounded">
                                    <Clock className="w-2.5 h-2.5" />
                                    {new Date(proximaReserva.fecha_hora).toLocaleDateString([], { day: '2-digit', month: '2-digit' })} {new Date(proximaReserva.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                            <div className="text-[10px] font-bold truncate mt-0.5">
                                {proximaReserva.cliente_nombre} ({proximaReserva.personas})
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs font-bold uppercase tracking-wider text-right">
                            {ambientEstado === 'libre' ? 'Disponible' : ambientEstado}
                        </div>
                    )}
                </div>
            </button>
            {(mesa.estado !== 'libre' && profile?.rol !== 'mesero') && (
                <button
                    onClick={(e) => { e.stopPropagation(); onReset(mesa); }}
                    title="Resetear mesa / Liberar"
                    className="absolute -top-2 -right-2 p-2 bg-white rounded-full shadow-lg border border-slate-200 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            )}
        </div>
    )
}

export function MesaGrid() {
    const navigate = useNavigate()
    const [mesas, setMesas] = useState<Mesa[]>([])
    const [reservas, setReservas] = useState<Reserva[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'Todas' | 'Libres' | 'Ocupadas' | 'Reservadas'>('Todas')
    const [isReservaModalOpen, setIsReservaModalOpen] = useState(false)
    const [newReserva, setNewReserva] = useState<Partial<Reserva>>({
        cliente_nombre: '',
        personas: 2,
        fecha_hora: new Date(new Date().getTime() + 60 * 60000).toISOString().slice(0, 16), // 1 hora después por defecto
        estado: 'pendiente'
    })
    const { empresa, profile } = useAuth()

    useEffect(() => {
        loadMesas()

        const subscription = mesaService.subscribeToMesas(() => {
            console.log('🔄 Mesas updated, reloading...')
            loadMesas()
        })

        // También suscribir a cambios en pedidos y reservas para refrescar estados
        const pedidosChannel = supabase.channel('mesagrid-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => loadMesas())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, () => loadMesas())
            .subscribe()

        return () => {
            subscription.unsubscribe()
            supabase.removeChannel(pedidosChannel)
        }
    }, [empresa?.id])

    async function loadMesas() {
        try {
            const data = await mesaService.getMesas()
            setMesas(data)

            if (empresa?.id) {
                // Obtenemos todas las pendientes para hoy/futuro
                const resData = await reservaService.getReservas(empresa.id) || []
                setReservas(resData.filter((r: any) => r && r.estado === 'pendiente'))
            }
        } catch (error) {
            console.error('Error loading mesas:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSaveReserva() {
        if (!newReserva.cliente_nombre || !newReserva.mesa_id || !newReserva.fecha_hora) {
            alert('Por favor complete nombre, mesa y fecha/hora')
            return
        }
        try {
            setLoading(true)
            await reservaService.crearReserva({
                ...newReserva,
                empresa_id: empresa!.id
            })
            setIsReservaModalOpen(false)
            setNewReserva({
                cliente_nombre: '',
                personas: 2,
                fecha_hora: new Date(new Date().getTime() + 60 * 60000).toISOString().slice(0, 16),
                estado: 'pendiente'
            })
            loadMesas()
        } catch (error: any) {
            console.error('Error creating reserva:', error)
            alert(`Error al crear reserva: ${error.message || 'Error desconocido'}`)
        } finally {
            setLoading(false)
        }
    }

    const handleMesaClick = async (mesa: Mesa) => {
        const reserva = getMesaReserva(mesa.id)
        if (mesa.estado === 'reservada' || (mesa.estado === 'libre' && reserva)) {
            const ok = confirm(`Esta mesa tiene una reserva para las ${new Date(reserva?.fecha_hora || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. ¿Deseas atender esta reserva ahora?`)
            if (!ok) return

            // Marcar reserva como completada si existe
            if (reserva) {
                await reservaService.cambiarEstado(reserva.id, 'completada')
            }
            // Cambiar mesa a ocupada
            await mesaService.setMesaEstado(mesa.id, 'ocupada')
        }

        navigate(`/mesas/${mesa.id}/pedido`)
    }

    const getMesaReserva = (mesaId: string) => {
        const ahora = new Date()
        const limite = new Date(ahora.getTime() + 90 * 60000) // 90 minutos

        return (reservas || []).find(r =>
            r.mesa_id === mesaId &&
            new Date(r.fecha_hora) >= ahora &&
            new Date(r.fecha_hora) <= limite
        )
    }

    const handleResetMesa = async (mesa: Mesa) => {
        if (!confirm(`¿Estás seguro de resetear la Mesa ${mesa.numero}? Se cancelarán pedidos pendientes no facturados.`)) return
        try {
            await mesaService.resetMesa(mesa.id)
            loadMesas()
        } catch {
            alert('Error al resetear la mesa')
        }
    }

    const filteredMesas = mesas.filter(m => {
        const hasReserva = getMesaReserva(m.id)
        const ambientEstado = (m.estado === 'libre' && hasReserva) ? 'reservada' : m.estado

        if (filter === 'Libres') return ambientEstado === 'libre'
        if (filter === 'Ocupadas') return ambientEstado === 'ocupada' || ambientEstado === 'atendida'
        if (filter === 'Reservadas') return ambientEstado === 'reservada'
        return true
    })

    const isMesero = profile?.rol === 'mesero'

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Gestión de Mesas</h1>
                    <p className="text-slate-500">Vista en tiempo real del salón</p>
                </div>
                {!isMesero && (
                    <button
                        onClick={() => setIsReservaModalOpen(true)}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Nueva Reserva
                    </button>
                )}
            </div>

            {!isMesero && (
                <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
                    {['Todas', 'Libres', 'Ocupadas', 'Reservadas'].map((f: any) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                                f === filter
                                    ? "bg-slate-900 text-white"
                                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <div key={i} className="card h-48 animate-pulse bg-slate-100" />
                    ))}
                </div>
            ) : isMesero ? (
                <WaiterTableListMobile
                    mesas={mesas}
                    reservas={reservas}
                    onMesaClick={handleMesaClick}
                    filter={filter}
                    setFilter={setFilter}
                    loading={loading}
                />
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {filteredMesas.map((mesa) => (
                        <MesaCard
                            key={mesa.id}
                            mesa={mesa}
                            proximaReserva={getMesaReserva(mesa.id)}
                            onClick={handleMesaClick}
                            onReset={handleResetMesa}
                            profile={profile}
                        />
                    ))}
                    {mesas.length === 0 && (
                        <div className="col-span-full py-12 text-center card bg-slate-50 border-dashed">
                            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-slate-900">No hay mesas configuradas</h3>
                            <p className="text-slate-500 mt-1">Empieza por añadir algunas mesas a tu salón.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Modal Nueva Reserva */}
            {isReservaModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
                        <h2 className="text-xl font-bold text-slate-900">Nueva Reserva</h2>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del Cliente</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                                    placeholder="Nombre completo..."
                                    value={newReserva.cliente_nombre}
                                    onChange={e => setNewReserva({ ...newReserva, cliente_nombre: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Personas</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200"
                                        value={newReserva.personas}
                                        onChange={e => setNewReserva({ ...newReserva, personas: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mesa</label>
                                    <select
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white"
                                        value={newReserva.mesa_id || ''}
                                        onChange={e => setNewReserva({ ...newReserva, mesa_id: e.target.value })}
                                    >
                                        <option value="">Seleccione mesa...</option>
                                        {mesas.map(m => (
                                            <option key={m.id} value={m.id}>Mesa {m.numero}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha y Hora</label>
                                <input
                                    type="datetime-local"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                                    value={newReserva.fecha_hora}
                                    onChange={e => setNewReserva({ ...newReserva, fecha_hora: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 pt-4">
                            <button
                                onClick={() => setIsReservaModalOpen(false)}
                                className="flex-1 py-3 font-bold border rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveReserva}
                                className="flex-1 py-3 font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
                            >
                                Crear Reserva
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
