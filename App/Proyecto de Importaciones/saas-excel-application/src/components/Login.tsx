import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Ship, Lock, Mail, AlertCircle } from 'lucide-react';

export default function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

      if (error) {
        // Buscamos si el SuperAdmin ya lo creó en la tabla 'usuarios' con esa contraseña
        const { data: dbUser } = await supabase
          .from('usuarios')
          .select('*')
          .eq('email', email)
          .eq('password', password)
          .single();

        if (dbUser) {
          // Si existe en la tabla, lo registramos en Auth silenciosamente
          const { error: signUpError } = await supabase.auth.signUp({ email, password });
          if (!signUpError) {
            // Forzamos el login inmediatamente después de crearlo para que entre directo
            await supabase.auth.signInWithPassword({ email, password });
            return;
          }
        }
        
        setError('Credenciales inválidas o usuario no registrado.');
        setLoading(false);
        return;
      }

    // Role check for real Supabase logins
    const role = data.user.email === 'super@importcloud.com' ? 'SUPERADMIN' : 'USUARIO_EMPRESA';
    onLogin({ ...data.user, role });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-blue-600">
          <Ship size={48} />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          ImportCloud
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sistema Inteligente de Importaciones
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md flex items-center text-sm">
                <AlertCircle size={16} className="mr-2" />
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                  placeholder="usuario@empresa.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Contraseña</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
