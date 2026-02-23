import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { MessageSquare, Mail, Phone, Building, Package, Check, Search } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import AdminLayout from '../components/AdminLayout';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AdminMessages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [marking, setMarking] = useState(null);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/admin/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Error al cargar los mensajes');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (messageId) => {
    setMarking(messageId);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/admin/messages/${messageId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMessages(msgs => msgs.map(m => 
        m.id === messageId ? { ...m, is_read: true } : m
      ));
      
      toast.success('Mensaje marcado como leído');
    } catch (error) {
      toast.error('Error al actualizar el mensaje');
    } finally {
      setMarking(null);
    }
  };

  const filteredMessages = messages.filter(msg => 
    msg.name?.toLowerCase().includes(search.toLowerCase()) ||
    msg.email?.toLowerCase().includes(search.toLowerCase()) ||
    msg.company?.toLowerCase().includes(search.toLowerCase()) ||
    msg.message?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mensajes de Contacto</h1>
          <p className="text-slate-600">Revisa los mensajes enviados desde el formulario de contacto</p>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar mensajes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="messages-search"
          />
        </div>

        {/* Messages List */}
        {filteredMessages.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <MessageSquare className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">No hay mensajes</h2>
              <p className="text-slate-600">No se encontraron mensajes con los criterios de búsqueda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredMessages.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className={`border-slate-200 ${!msg.is_read ? 'bg-blue-50/50 border-blue-200' : ''}`}>
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold">
                              {msg.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{msg.name}</p>
                              <p className="text-sm text-slate-500">
                                {new Date(msg.created_at).toLocaleString('es-EC')}
                              </p>
                            </div>
                          </div>
                          
                          {!msg.is_read && (
                            <Badge className="bg-blue-500 text-white">Nuevo</Badge>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-4 text-sm">
                          <span className="flex items-center gap-1 text-slate-600">
                            <Mail className="h-4 w-4" />
                            {msg.email}
                          </span>
                          {msg.phone && (
                            <span className="flex items-center gap-1 text-slate-600">
                              <Phone className="h-4 w-4" />
                              {msg.phone}
                            </span>
                          )}
                          {msg.company && (
                            <span className="flex items-center gap-1 text-slate-600">
                              <Building className="h-4 w-4" />
                              {msg.company}
                            </span>
                          )}
                          {msg.product_interest && (
                            <span className="flex items-center gap-1 text-slate-600">
                              <Package className="h-4 w-4" />
                              {msg.product_interest}
                            </span>
                          )}
                        </div>
                        
                        <div className="bg-slate-50 rounded-lg p-4">
                          <p className="text-slate-700 whitespace-pre-wrap">{msg.message}</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {!msg.is_read && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkRead(msg.id)}
                            disabled={marking === msg.id}
                            data-testid={`mark-read-${msg.id}`}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Marcar leído
                          </Button>
                        )}
                        <a href={`mailto:${msg.email}`}>
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                            <Mail className="h-4 w-4 mr-1" />
                            Responder
                          </Button>
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminMessages;
