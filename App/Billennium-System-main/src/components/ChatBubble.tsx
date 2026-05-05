import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, User, ChevronDown } from 'lucide-react';
import { chatService, ChatMessage } from '../lib/chatService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const GEO_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

export function ChatBubble() {
    const { vendedor } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [hasNewMessage, setHasNewMessage] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Enviar ubicación actual al servidor
    const actualizarUbicacion = (id: string) => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                await supabase
                    .from('vendedores')
                    .update({
                        ultima_latitud: pos.coords.latitude,
                        ultima_longitud: pos.coords.longitude,
                        ultima_ubicacion_at: new Date().toISOString(),
                    })
                    .eq('id', id);
            },
            () => { /* silencioso */ },
            { timeout: 8000, maximumAge: 30000 }
        );
    };

    useEffect(() => {
        let subscription: any = null;
        let geoInterval: ReturnType<typeof setInterval> | null = null;

        const initChat = async () => {
            if (!vendedor || !vendedor.empresa_id) return;
            try {
                const id = await chatService.getOrCreateRoom(vendedor.id, vendedor.empresa_id);
                console.log('🔵 Chat room ID:', id);
                setRoomId(id);
                const history = await chatService.getMessages(id);
                console.log('📜 Historial cargado:', history.length, 'mensajes');
                setMessages(history);

                // Suscribirse a nuevos mensajes
                subscription = chatService.subscribeToMessages(id, (newMessage) => {
                    console.log('✉️ Nuevo mensaje recibido:', newMessage);
                    setMessages(prev => [...prev, newMessage]);
                    if (!isOpen) setHasNewMessage(true);
                });

                console.log('✅ Suscripción a chat activada');
            } catch (err) {
                console.error('❌ Error inicializando chat:', err);
            }
        };

        if (vendedor && !vendedor.is_office && !vendedor.is_admin) {
            initChat();
            // Capturar ubicación al iniciar y cada 5 min
            actualizarUbicacion(vendedor.id);
            geoInterval = setInterval(() => actualizarUbicacion(vendedor.id), GEO_INTERVAL_MS);
        }

        // Cleanup cuando el componente se desmonte
        return () => {
            if (subscription) {
                console.log('🔴 Limpiando suscripción de chat');
                subscription.unsubscribe();
            }
            if (geoInterval) clearInterval(geoInterval);
        };
    }, [vendedor]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || !roomId || !vendedor) return;

        try {
            await chatService.sendMessage(roomId, vendedor.id, message);
            setMessage('');
        } catch (err) {
            console.error('Error enviando mensaje:', err);
        }
    };

    if (!vendedor || vendedor.is_office || vendedor.is_admin) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {/* Botón Flotante */}
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                    setHasNewMessage(false);
                }}
                className={`relative p-4 rounded-full shadow-2xl transition-all hover:scale-110 active:scale-95 ${isOpen ? 'bg-red-500' : 'bg-blue-600'
                    } text-white`}
            >
                {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
                {!isOpen && hasNewMessage && (
                    <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 border-2 border-white rounded-full animate-bounce" />
                )}
            </button>

            {/* Ventana de Chat */}
            {isOpen && (
                <div className="absolute bottom-16 right-0 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col h-[500px] animate-in slide-in-from-bottom-4">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                            <div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center">
                                <User className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm">Oficina Central</h3>
                                <p className="text-[10px] opacity-80">En línea para ayudarte</p>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)}>
                            <ChevronDown className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Mensajes */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                        {messages.length === 0 && (
                            <div className="text-center py-10">
                                <MessageCircle className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                <p className="text-gray-500 text-sm italic">¿Necesitas algo de la oficina? <br />¡Escribe aquí!</p>
                            </div>
                        )}
                        {messages.map((msg) => {
                            const isMine = msg.sender_id === vendedor.id;
                            return (
                                <div
                                    key={msg.id}
                                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${isMine
                                            ? 'bg-blue-600 text-white rounded-tr-none'
                                            : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                            }`}
                                    >
                                        {msg.content}
                                        <div className={`text-[10px] mt-1 opacity-70 ${isMine ? 'text-right' : 'text-left'}`}>
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-100">
                        <div className="flex items-center space-x-2">
                            <input
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Escribe un mensaje..."
                                className="flex-1 px-4 py-2 bg-gray-100 border-none rounded-full text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            />
                            <button
                                type="submit"
                                disabled={!message.trim()}
                                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:scale-95 transition-all"
                            >
                                <Send className="h-4 w-4" />
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
