import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, Vendedor } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  vendedor: Vendedor | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadVendedor(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadVendedor(session.user.id);
      } else {
        setVendedor(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadVendedor = async (userId: string) => {
    try {
      console.log('Cargando vendedor para userId:', userId);
      const { data, error } = await supabase
        .from('vendedores')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      console.log('Resultado de carga de vendedor:', { data, error });

      if (error) {
        console.error('Error en query de vendedor:', error);
        throw error;
      }

      if (!data) {
        console.error('Vendedor not found for userId:', userId);
        alert('Error: Su usuario no tiene un perfil de vendedor asociado. Contacte al administrador.');
        await supabase.auth.signOut();
        setUser(null);
        setVendedor(null);
        return;
      }

      console.log('Vendedor cargado exitosamente:', data.nombre);
      setVendedor(data);
    } catch (error: any) {
      console.error('Error loading vendedor:', error);
      alert(`Error al cargar perfil de usuario: ${error.message || 'Error desconocido'}. Por favor intente de nuevo.`);
      await supabase.auth.signOut();
      setUser(null);
      setVendedor(null);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setVendedor(null);
  };

  return (
    <AuthContext.Provider value={{ user, vendedor, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
