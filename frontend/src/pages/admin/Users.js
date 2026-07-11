import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Users, Search, UserCheck, UserX, KeyRound,
  Eye, EyeOff, RefreshCw, Copy, Check, X,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import AdminLayout from '../../components/AdminLayout';
import { toast } from 'sonner';

const API = '/api';

// ── Generador de contraseñas seguras ─────────────────────────────────────────
const UPPER   = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
const LOWER   = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS  = '23456789';
const SPECIAL = '!#$%&@*+-=';
const ALL     = UPPER + LOWER + DIGITS + SPECIAL;

function generatePassword(length = 14) {
  const mandatory = [
    UPPER  [Math.floor(Math.random() * UPPER.length)],
    UPPER  [Math.floor(Math.random() * UPPER.length)],
    LOWER  [Math.floor(Math.random() * LOWER.length)],
    LOWER  [Math.floor(Math.random() * LOWER.length)],
    DIGITS [Math.floor(Math.random() * DIGITS.length)],
    DIGITS [Math.floor(Math.random() * DIGITS.length)],
    SPECIAL[Math.floor(Math.random() * SPECIAL.length)],
  ];
  const rest = Array.from({ length: length - mandatory.length }, () =>
    ALL[Math.floor(Math.random() * ALL.length)]
  );
  return [...mandatory, ...rest].sort(() => Math.random() - 0.5).join('');
}

// ── Modal cambio de contraseña ────────────────────────────────────────────────
function ChangePasswordModal({ user, onClose }) {
  const [password, setPassword]     = useState(() => generatePassword());
  const [showPwd, setShowPwd]       = useState(true);
  const [copied, setCopied]         = useState(false);
  const [saving, setSaving]         = useState(false);

  const handleGenerate = () => {
    setPassword(generatePassword());
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!password || password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API}/admin/users/${user.id}/change-password`,
        { new_password: password },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Contraseña actualizada para ${user.name}`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  };

  // Calcular fortaleza
  const strength = (() => {
    let s = 0;
    if (password.length >= 10) s++;
    if (password.length >= 14) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[a-z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[!#$%&@*+\-=]/.test(password)) s++;
    if (s <= 2) return { label: 'Débil',   color: 'bg-red-500',    w: 'w-1/4' };
    if (s <= 4) return { label: 'Regular', color: 'bg-amber-500',  w: 'w-2/4' };
    if (s <= 5) return { label: 'Fuerte',  color: 'bg-blue-500',   w: 'w-3/4' };
    return              { label: 'Muy fuerte', color: 'bg-green-500', w: 'w-full' };
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-600" />
              Cambiar contraseña
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{user.name} — {user.email}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Campo contraseña */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Nueva contraseña</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setCopied(false); }}
                className="pr-10 font-mono text-sm"
                placeholder="Ingresa o genera una contraseña"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {/* Copiar */}
            <button
              type="button"
              onClick={handleCopy}
              title="Copiar contraseña"
              className="p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-500"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Barra de fortaleza */}
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.w}`} />
          </div>
          <p className="text-xs text-slate-500">Fortaleza: <span className="font-medium">{strength.label}</span></p>
        </div>

        {/* Botón generador */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Gestor de contraseñas seguras
          </p>
          <p className="text-xs text-slate-500">
            Genera contraseñas de 14 caracteres con mayúsculas, minúsculas, números y símbolos.
            Sin letras/números ambiguos (O/0, I/l/1).
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={handleGenerate}
          >
            <RefreshCw className="h-4 w-4" />
            Generar contraseña segura
          </Button>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {saving ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export const AdminUsers = () => {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [toggling, setToggling]     = useState(null);
  const [pwdModal, setPwdModal]     = useState(null); // user object | null

  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (error) {
      toast.error('Error al cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleToggleActive = async (userId, currentActive) => {
    setToggling(userId);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/admin/users/${userId}/toggle-active`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(users => users.map(u =>
        u.id === userId ? { ...u, is_active: !currentActive } : u
      ));
      toast.success(`Usuario ${!currentActive ? 'activado' : 'desactivado'}`);
    } catch {
      toast.error('Error al actualizar el usuario');
    } finally {
      setToggling(null);
    }
  };

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(search.toLowerCase()) ||
    user.email?.toLowerCase().includes(search.toLowerCase()) ||
    user.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Modal cambio de contraseña */}
      <AnimatePresence>
        {pwdModal && (
          <ChangePasswordModal user={pwdModal} onClose={() => setPwdModal(null)} />
        )}
      </AnimatePresence>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
          <p className="text-slate-600">Gestiona los usuarios registrados en el sistema</p>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre, email o empresa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
            data-testid="users-search"
          />
        </div>

        {/* Users List */}
        {filteredUsers.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <Users className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">No hay usuarios</h2>
              <p className="text-slate-600">No se encontraron usuarios con los criterios de búsqueda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredUsers.map((user, i) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="border-slate-200 hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-lg">
                          {user.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900">{user.name}</p>
                            {user.role === 'admin' && (
                              <Badge className="bg-purple-100 text-purple-800">Admin</Badge>
                            )}
                          </div>
                          <p className="text-slate-600">{user.email}</p>
                          {user.company_name && (
                            <p className="text-sm text-slate-500">{user.company_name}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Badge className={user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>

                        {/* Cambiar contraseña */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPwdModal(user)}
                          className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Cambiar clave
                        </Button>

                        {user.role !== 'admin' && (
                          <Button
                            variant={user.is_active ? 'destructive' : 'default'}
                            size="sm"
                            onClick={() => handleToggleActive(user.id, user.is_active)}
                            disabled={toggling === user.id}
                            data-testid={`toggle-user-${user.id}`}
                          >
                            {user.is_active ? (
                              <><UserX className="h-4 w-4 mr-1" />Desactivar</>
                            ) : (
                              <><UserCheck className="h-4 w-4 mr-1" />Activar</>
                            )}
                          </Button>
                        )}
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

export default AdminUsers;
