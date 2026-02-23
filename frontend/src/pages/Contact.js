import { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { MapPin, Phone, Mail, Clock, Send, MessageSquare } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const contactInfo = [
  {
    icon: MapPin,
    title: 'Ubicación',
    lines: ['Cdla. La Garzota', 'Guayaquil - Ecuador'],
  },
  {
    icon: Phone,
    title: 'Teléfono',
    lines: ['+593 98 013 6389'],
  },
  {
    icon: Mail,
    title: 'Correo',
    lines: ['billenniumsystem@gmail.com', 'facturacion@billenniumsystem.com'],
  },
  {
    icon: Clock,
    title: 'Horarios',
    lines: ['Lunes a Viernes', '9:00 AM - 6:00 PM'],
  },
];

const products = [
  { value: 'restoflow', label: 'RestoFlow' },
  { value: 'sentinel', label: 'Pedidos Sentinel' },
  { value: 'importaciones', label: 'Módulo de Importaciones' },
  { value: 'lopdp', label: 'LOPDP' },
  { value: 'facturacion', label: 'Facturación Electrónica' },
  { value: 'dashboard', label: 'Dashboard Empresarial' },
  { value: 'otro', label: 'Otro / No estoy seguro' },
];

export const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    product_interest: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSelectChange = (value) => {
    setFormData({ ...formData, product_interest: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.message) {
      toast.error('Por favor completa los campos requeridos');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/contact`, formData);
      toast.success('¡Mensaje enviado! Nos pondremos en contacto pronto.');
      setFormData({
        name: '',
        email: '',
        phone: '',
        company: '',
        product_interest: '',
        message: '',
      });
    } catch (error) {
      toast.error('Error al enviar el mensaje. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-slate-900 to-blue-900">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <span className="inline-block px-4 py-2 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium mb-6">
              Estamos para ayudarte
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
              Contacto
            </h1>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              ¿Tienes preguntas sobre nuestros productos? ¿Necesitas una demostración? Escríbenos y te responderemos pronto.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Form & Info */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid lg:grid-cols-3 gap-12">
            {/* Contact Info */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-1"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Información de Contacto</h2>
              
              <div className="space-y-6">
                {contactInfo.map((info, i) => {
                  const Icon = info.icon;
                  return (
                    <div key={i} className="flex gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{info.title}</h3>
                        {info.lines.map((line, j) => (
                          <p key={j} className="text-slate-600">{line}</p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* WhatsApp CTA */}
              <Card className="mt-8 bg-green-50 border-green-200">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <MessageSquare className="h-6 w-6 text-green-600" />
                    <h3 className="font-semibold text-slate-900">¿Prefieres WhatsApp?</h3>
                  </div>
                  <p className="text-slate-600 mb-4 text-sm">
                    Escríbenos directamente y te responderemos lo antes posible.
                  </p>
                  <a href="https://wa.me/593980136389" target="_blank" rel="noopener noreferrer">
                    <Button className="w-full bg-green-600 hover:bg-green-700" data-testid="contact-whatsapp-btn">
                      Abrir WhatsApp
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </motion.div>

            {/* Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-2"
            >
              <Card className="border-slate-200">
                <CardContent className="p-8">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Envíanos un mensaje</h2>
                  
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="name">Nombre *</Label>
                        <Input
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="Tu nombre"
                          required
                          data-testid="contact-name-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Correo electrónico *</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="tu@email.com"
                          required
                          data-testid="contact-email-input"
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono</Label>
                        <Input
                          id="phone"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          placeholder="+593 99 999 9999"
                          data-testid="contact-phone-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="company">Empresa</Label>
                        <Input
                          id="company"
                          name="company"
                          value={formData.company}
                          onChange={handleChange}
                          placeholder="Nombre de tu empresa"
                          data-testid="contact-company-input"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="product">Producto de interés</Label>
                      <Select value={formData.product_interest} onValueChange={handleSelectChange}>
                        <SelectTrigger data-testid="contact-product-select">
                          <SelectValue placeholder="Selecciona un producto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.value} value={product.value}>
                              {product.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">Mensaje *</Label>
                      <Textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        placeholder="Cuéntanos en qué podemos ayudarte..."
                        rows={5}
                        required
                        data-testid="contact-message-input"
                      />
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                      disabled={loading}
                      data-testid="contact-submit-btn"
                    >
                      {loading ? (
                        'Enviando...'
                      ) : (
                        <>
                          Enviar Mensaje
                          <Send className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Contact;
