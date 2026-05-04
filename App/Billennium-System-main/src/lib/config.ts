import { supabase } from './supabase';
import type { Empresa, Vendedor } from './supabase';

export async function getEmpresa(): Promise<Empresa | null> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('No user logged in');
    return null;
  }

  const { data: vendedor, error: vendedorError } = await supabase
    .from('vendedores')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();

  if (vendedorError || !vendedor?.empresa_id) {
    console.error('Error loading vendedor or no empresa_id:', vendedorError);
    return null;
  }

  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('id', vendedor.empresa_id)
    .maybeSingle();

  if (error) {
    console.error('Error loading empresa:', error);
    return null;
  }

  return data;
}

export async function updateEmpresa(empresaId: string, empresa: Partial<Omit<Empresa, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
  const { error } = await supabase
    .from('empresas')
    .update(empresa)
    .eq('id', empresaId);

  if (error) throw error;
}

export async function updateVendedor(id: string, datos: Partial<Omit<Vendedor, 'id' | 'activo'>>): Promise<void> {
  const { error } = await supabase
    .from('vendedores')
    .update(datos)
    .eq('id', id);

  if (error) throw error;
}
