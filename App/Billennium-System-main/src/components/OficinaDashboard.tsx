import { useState, useEffect, useRef } from 'react';
import { MessageSquare, User, Send, Search, Trash2, MapPin, Map } from 'lucide-react';
import { chatService, ChatRoom, ChatMessage } from '../lib/chatService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icon path broken by bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

export function OficinaDashboard() {
    const { vendedor: oficinaUser, signOut } = useAuth();
    const [rooms, setRooms] = useState<ChatRoom[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [showDeleteMenu, setShowDeleteMenu] = useState(false);
    const [showMap, setShowMap] = useState(false);
    const [vendedorUbicacion, setVendedorUbicacion] = useState<{ lat: number; lng: number; at: string } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadRooms();
    }, [oficinaUser]);

    useEffect(() => {
        if (selectedRoom) {
            console.log('🏢 Oficina: Cargando room', selectedRoom.id);
            loadMessages(selectedRoom.id);
            setShowMap(false);
            setVendedorUbicacion(null);

            // Cargar ubicación del vendedor
            if (selectedRoom.vendedor_id) {
                supabase
                    .from('vendedores')
                    .select('ultima_latitud,ultima_longitud,ultima_ubicacion_at')
                    .eq('id', selectedRoom.vendedor_id)
                    .maybeSingle()
                    .then(({ data }) => {
                        if (data?.ultima_latitud && data?.ultima_longitud) {
                            setVendedorUbicacion({
                                lat: data.ultima_latitud,
                                lng: data.ultima_longitud,
                                at: data.ultima_ubicacion_at || '',
                            });
                        }
                    });
            }

            const subscription = chatService.subscribeToMessages(selectedRoom.id, (msg) => {
                console.log('🏢 Oficina: Nuevo mensaje recibido', msg);
                setMessages(prev => [...prev, msg]);
            });

            console.log('✅ Oficina: Suscripción activada para room', selectedRoom.id);

            return () => {
                console.log('🔴 Oficina: Limpiando suscripción');
                subscription.unsubscribe();
            };
        }
    }, [selectedRoom]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadRooms = async () => {
        console.log('🏢 Oficina: Iniciando carga de rooms...');
        console.log('🏢 Oficina: Usuario actual:', oficinaUser);
        console.log('🏢 Oficina: Empresa ID:', oficinaUser?.empresa_id);
        console.log('🏢 Oficina: is_office:', oficinaUser?.is_office);

        if (!oficinaUser?.empresa_id) {
            console.error('❌ Oficina: No hay empresa_id');
            return;
        }

        try {
            const activeRooms = await chatService.getActiveRooms(oficinaUser.empresa_id);
            console.log('📋 Rooms cargados:', activeRooms.length);
            console.log('📋 Detalles de rooms:', activeRooms);
            setRooms(activeRooms);
        } catch (err) {
            console.error('❌ Error cargando rooms:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadMessages = async (roomId: string) => {
        try {
            const history = await chatService.getMessages(roomId);
            console.log('📜 Oficina: Historial cargado:', history.length, 'mensajes');
            setMessages(history);
        } catch (err) {
            console.error('❌ Error cargando mensajes:', err);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedRoom || !oficinaUser) return;

        try {
            await chatService.sendMessage(selectedRoom.id, oficinaUser.id, newMessage);
            setNewMessage('');
        } catch (err) {
            console.error('Error enviando mensaje:', err);
        }
    };

    const handleDeleteMessages = async (daysBack?: number) => {
        if (!selectedRoom) return;

        const confirmMsg = daysBack
            ? `¿Eliminar mensajes de los últimos ${daysBack} días del chat con ${selectedRoom.vendedor?.nombre}?`
            : `¿Eliminar TODOS los mensajes del chat con ${selectedRoom.vendedor?.nombre}?`;

        if (!confirm(confirmMsg)) return;

        try {
            await chatService.deleteMessages(selectedRoom.id, daysBack);
            await loadMessages(selectedRoom.id);
            setShowDeleteMenu(false);
            alert('Mensajes eliminados correctamente');
        } catch (err) {
            console.error('Error eliminando mensajes:', err);
            alert('Error al eliminar mensajes: ' + (err as Error).message);
        }
    };

    const filteredRooms = rooms.filter(r =>
        r.vendedor?.nombre.toLowerCase().includes(busqueda.toLowerCase())
    );

    return (
        <div className="flex h-[calc(100-2rem)] bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 min-h-[600px]">
            {/* Sidebar - Lista de Vendedores */}
            <div className="w-80 border-r border-gray-100 flex flex-col bg-gray-50/50">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-900">Mensajería</h2>
                        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar vendedor..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-4 text-center text-gray-500">Cargando chats...</div>
                    ) : filteredRooms.length === 0 ? (
                        <div className="p-10 text-center text-gray-400">
                            <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">No hay chats activos</p>
                        </div>
                    ) : (
                        filteredRooms.map((room) => (
                            <button
                                key={room.id}
                                onClick={() => setSelectedRoom(room)}
                                className={`w-full p-4 flex items-center space-x-3 transition-all hover:bg-white border-b border-gray-50 ${selectedRoom?.id === room.id ? 'bg-white border-l-4 border-l-blue-600 shadow-sm' : ''
                                    }`}
                            >
                                <div className="h-12 w-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                                    <User className="h-6 w-6" />
                                </div>
                                <div className="text-left flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">
                                        {room.vendedor?.nombre}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {room.vendedor?.email}
                                    </p>
                                </div>
                                <div className="text-[10px] text-gray-400">
                                    {new Date(room.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </button>
                        ))
                    )}
                </div>

                <div className="p-4 bg-white border-t border-gray-100">
                    <button
                        onClick={() => signOut()}
                        className="w-full flex items-center justify-center space-x-2 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                    >
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-white">
                {selectedRoom ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between shadow-sm">
                            <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 bg-blue-600 rounded-full flex items-center justify-center text-white">
                                    <User className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">{selectedRoom.vendedor?.nombre}</h3>
                                    {vendedorUbicacion ? (
                                        <p className="text-xs text-blue-500 flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {new Date(vendedorUbicacion.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-500 flex items-center">
                                            <span className="h-1.5 w-1.5 bg-green-500 rounded-full mr-1.5" />
                                            Chat de soporte activo
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                            {/* Map toggle button */}
                            {vendedorUbicacion && (
                                <button
                                    type="button"
                                    onClick={() => setShowMap(v => !v)}
                                    className={`p-2 rounded-lg transition-colors ${showMap ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                                    title={showMap ? 'Ocultar mapa' : 'Ver ubicación en mapa'}
                                >
                                    <Map className="h-5 w-5" />
                                </button>
                            )}

                            {/* Delete Messages Button */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Borrar mensajes"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>

                                {showDeleteMenu && (
                                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-10">
                                        <div className="p-2">
                                            <p className="text-xs text-gray-500 px-3 py-2 font-semibold">Borrar mensajes</p>
                                            <button
                                                onClick={() => handleDeleteMessages(7)}
                                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                                            >
                                                Últimos 7 días
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMessages(30)}
                                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                                            >
                                                Últimos 30 días
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMessages(90)}
                                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                                            >
                                                Últimos 90 días
                                            </button>
                                            <div className="border-t border-gray-200 my-1"></div>
                                            <button
                                                onClick={() => handleDeleteMessages()}
                                                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors font-semibold"
                                            >
                                                Borrar TODO
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            </div>{/* end flex items-center gap-2 */}
                        </div>

                        {/* Mapa de ubicación */}
                        {showMap && vendedorUbicacion && (
                            <div className="h-64 border-b border-gray-100">
                                <MapContainer
                                    center={[vendedorUbicacion.lat, vendedorUbicacion.lng]}
                                    zoom={15}
                                    style={{ height: '100%', width: '100%' }}
                                >
                                    <TileLayer
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    />
                                    <Marker position={[vendedorUbicacion.lat, vendedorUbicacion.lng]}>
                                        <Popup>
                                            <strong>{selectedRoom.vendedor?.nombre}</strong><br />
                                            {new Date(vendedorUbicacion.at).toLocaleString()}
                                        </Popup>
                                    </Marker>
                                </MapContainer>
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/30">
                            {messages.map((msg) => {
                                const isMine = msg.sender_id === oficinaUser?.id;
                                return (
                                    <div
                                        key={msg.id}
                                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[70%] p-4 rounded-3xl shadow-sm ${isMine
                                                ? 'bg-blue-600 text-white rounded-tr-none'
                                                : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                                }`}
                                        >
                                            <p className="text-sm leading-relaxed">{msg.content}</p>
                                            <div className={`text-[10px] mt-2 opacity-50 ${isMine ? 'text-blue-100' : 'text-gray-400'}`}>
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Chat Input */}
                        <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-100">
                            <div className="flex items-center space-x-3">
                                <input
                                    type="text"
                                    placeholder="Escribe una respuesta para el vendedor..."
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    className="flex-1 px-6 py-3 bg-gray-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim()}
                                    className="p-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-200"
                                >
                                    <Send className="h-5 w-5" />
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-center p-10 bg-gray-50/20">
                        <div className="max-w-md">
                            <div className="h-24 w-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <MessageSquare className="h-12 w-12 text-blue-300" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">Panel de Soporte</h3>
                            <p className="text-gray-500">
                                Selecciona un vendedor de la lista para comenzar a chatear o ver el historial de conversaciones.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
