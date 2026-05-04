import { supabase } from './supabase';
import type { Vendedor, Articulo, ProformaCompleta, Cliente, Empresa } from './supabase';

export const proformaService = {
  async getVendedores(): Promise<Vendedor[]> {
    const { data, error } = await supabase
      .from('vendedores')
      .select('*')
      .eq('activo', true)
      .eq('is_admin', false)
      .order('nombre');

    if (error) throw error;
    return data || [];
  },

  async getArticulos(busqueda?: string, empresaId?: string): Promise<Articulo[]> {
    let query = supabase
      .from('articulos')
      .select('*')
      .eq('activo', true);

    if (empresaId) {
      query = query.eq('empresa_id', empresaId);
    }

    if (busqueda) {
      query = query.ilike('descripcion', `%${busqueda}%`);
    }

    const { data, error } = await query.order('descripcion').limit(100);

    if (error) throw error;
    return data || [];
  },

  async buscarCliente(ruc: string): Promise<Cliente | null> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('ruc', ruc)
      .eq('activo', true)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async buscarClientes(termino: string): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('activo', true)
      .or(`ruc.ilike.%${termino}%,nombres_completos.ilike.%${termino}%,nombre_negocio.ilike.%${termino}%`)
      .order('nombres_completos')
      .limit(10);

    if (error) throw error;
    return data || [];
  },

  async createCliente(cliente: Omit<Cliente, 'activo'> & { nombre_negocio?: string | null }): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .insert({
        ruc: cliente.ruc,
        nombres_completos: cliente.nombres_completos,
        nombre_negocio: cliente.nombre_negocio || null,
        correo: cliente.correo,
        telefono: cliente.telefono,
        activo: true
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateCliente(ruc: string, datos: Partial<Omit<Cliente, 'ruc' | 'activo'>> & { nombre_negocio?: string | null }): Promise<void> {
    const updateData: any = {};
    if (datos.nombres_completos !== undefined) updateData.nombres_completos = datos.nombres_completos;
    if (datos.nombre_negocio !== undefined) updateData.nombre_negocio = datos.nombre_negocio;
    if (datos.correo !== undefined) updateData.correo = datos.correo;
    if (datos.telefono !== undefined) updateData.telefono = datos.telefono;

    const { error } = await supabase
      .from('clientes')
      .update(updateData)
      .eq('ruc', ruc);

    if (error) throw error;
  },

  async createProforma(
    rucCliente: string,
    nombreCliente: string,
    vendedorId: string,
    empresaId: string,
    detalles: Array<{
      articulo_id: string;
      descripcion: string;
      cantidad: number;
      precio: number;
      costo: number;
      tasa_iva?: number;
    }>,
    formaPago?: string,
    observaciones?: string,
    codvenErp?: number | null
  ): Promise<ProformaCompleta> {
    const subtotal = detalles.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);
    const impuesto = detalles.reduce((sum, item) => sum + (item.cantidad * item.precio * ((item.tasa_iva ?? 15) / 100)), 0);
    const total = subtotal + impuesto;

    // Generar número ANTES de insertar
    const { data: numeroGenerado } = await supabase.rpc('generar_numero_proforma', { p_empresa_id: empresaId });
    const numero = numeroGenerado || 'PRO-TEMP';

    const { data: proformaData, error: proformaError } = await supabase
      .from('proforma_cabecera')
      .insert({
        numero: numero,
        ruc_cliente: rucCliente,
        nombre_cliente: nombreCliente,
        vendedor_id: vendedorId,
        empresa_id: empresaId,
        cliente_ruc: rucCliente,
        subtotal: subtotal,
        impuesto: impuesto,
        total: total,
        estado: 'PENDIENTE',
        sincronizada: false,
        forma_pago: formaPago || null,
        observaciones: observaciones || null,
        codven_erp: codvenErp || null
      })
      .select()
      .single();

    if (proformaError) throw proformaError;

    const detallesConId = detalles.map(detalle => ({
      proforma_id: proformaData.id,
      articulo_id: detalle.articulo_id,
      empresa_id: empresaId,
      descripcion: detalle.descripcion,
      cantidad: detalle.cantidad,
      precio: detalle.precio,
      costo: detalle.costo,
      subtotal: detalle.cantidad * detalle.precio,
      tasa_iva: detalle.tasa_iva ?? 15,
      utilidad_porcentaje: detalle.costo > 0 ? ((detalle.precio - detalle.costo) / detalle.costo) * 100 : 0
    }));

    const { error: detallesError } = await supabase
      .from('proforma_detalle')
      .insert(detallesConId);

    if (detallesError) throw detallesError;

    return { ...proformaData, detalles: detallesConId } as ProformaCompleta;
  },

  async updateProforma(
    proformaId: string,
    rucCliente: string,
    nombreCliente: string,
    vendedorId: string,
    empresaId: string,
    detalles: Array<{ articulo_id: string; descripcion: string; cantidad: number; precio: number; costo: number; tasa_iva?: number; }>,
    formaPago?: string,
    observaciones?: string
  ): Promise<void> {
    const subtotal = detalles.reduce((sum, d) => sum + (d.cantidad * d.precio), 0);
    const impuesto = detalles.reduce((sum, d) => sum + (d.cantidad * d.precio * ((d.tasa_iva ?? 15) / 100)), 0);
    const total = subtotal + impuesto;

    const { error: proformaError } = await supabase
      .from('proforma_cabecera')
      .update({
        ruc_cliente: rucCliente,
        nombre_cliente: nombreCliente,
        vendedor_id: vendedorId,
        subtotal: subtotal,
        impuesto: impuesto,
        total: total,
        forma_pago: formaPago || null,
        observaciones: observaciones || null
      })
      .eq('id', proformaId);

    if (proformaError) throw proformaError;

    const { error: deleteError } = await supabase
      .from('proforma_detalle')
      .delete()
      .eq('proforma_id', proformaId);

    if (deleteError) throw deleteError;

    const detallesConId = detalles.map(detalle => ({
      proforma_id: proformaId,
      articulo_id: detalle.articulo_id,
      empresa_id: empresaId,
      descripcion: detalle.descripcion,
      cantidad: detalle.cantidad,
      precio: detalle.precio,
      costo: detalle.costo,
      subtotal: detalle.cantidad * detalle.precio,
      tasa_iva: detalle.tasa_iva ?? 15,
      utilidad_porcentaje: detalle.costo > 0 ? ((detalle.precio - detalle.costo) / detalle.costo) * 100 : 0
    }));

    const { error: detallesError } = await supabase
      .from('proforma_detalle')
      .insert(detallesConId);

    if (detallesError) throw detallesError;
  },

  async getProformas(limite: number = 50, empresaId?: string): Promise<ProformaCompleta[]> {
    let query = supabase
      .from('proforma_cabecera')
      .select(`
        *,
        vendedor:vendedores!proforma_cabecera_vendedor_id_fkey(id, nombre, email, telefono),
        detalles:proforma_detalle(*)
      `);

    if (empresaId) {
      query = query.eq('empresa_id', empresaId);
    }

    // Nota: Aunque aquí el filtro de vendedor se aplica por RLS, 
    // lo agregamos explícitamente por consistencia si no es admin.
    // Esto se manejará mejor pasando el contexto del vendedor si fuera necesario.

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limite);

    if (error) throw error;
    return data || [];
  },

  async getProforma(id: string): Promise<ProformaCompleta | null> {
    const { data, error } = await supabase
      .from('proforma_cabecera')
      .select(`
        *,
        vendedor:vendedores!proforma_cabecera_vendedor_id_fkey(id, nombre, email, telefono),
        detalles:proforma_detalle(*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getProformasPendientes(): Promise<ProformaCompleta[]> {
    const { data, error } = await supabase
      .from('proforma_cabecera')
      .select(`
        *,
        vendedor:vendedores!proforma_cabecera_vendedor_id_fkey(id, nombre, email, telefono),
        detalles:proforma_detalle(*)
      `)
      .eq('sincronizada', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async marcarComoSincronizada(id: string): Promise<void> {
    const { error } = await supabase
      .from('proforma_cabecera')
      .update({ sincronizada: true })
      .eq('id', id);

    if (error) throw error;
  },

  async deleteProforma(id: string): Promise<void> {
    const { error: detallesError } = await supabase
      .from('proforma_detalle')
      .delete()
      .eq('proforma_id', id);

    if (detallesError) throw detallesError;

    const { error: cabeceraError } = await supabase
      .from('proforma_cabecera')
      .delete()
      .eq('id', id);

    if (cabeceraError) throw cabeceraError;
  },

  async convertirProformaAPedido(proformaId: string): Promise<string> {
    const { data: proforma, error: proformaError } = await supabase
      .from('proforma_cabecera')
      .select(`
        *,
        detalles:proforma_detalle(*)
      `)
      .eq('id', proformaId)
      .maybeSingle();

    if (proformaError) throw proformaError;
    if (!proforma) throw new Error('Proforma no encontrada');

    const { data: numeroGenerado } = await supabase.rpc('generar_numero_pedido', { p_empresa_id: proforma.empresa_id });
    const numero = numeroGenerado || 'PED-TEMP';

    const { data: pedido, error: pedidoError } = await supabase
      .from('pedido_cabecera')
      .insert({
        numero: numero,
        ruc_cliente: proforma.ruc_cliente,
        nombre_cliente: proforma.nombre_cliente,
        cliente_ruc: proforma.cliente_ruc,
        vendedor_id: proforma.vendedor_id,
        empresa_id: proforma.empresa_id,
        subtotal: proforma.subtotal,
        impuesto: proforma.impuesto,
        total: proforma.total,
        forma_pago: proforma.forma_pago,
        observaciones: proforma.observaciones,
        codven_erp: proforma.codven_erp,
        estado: 'Pendiente',
        sincronizada: false
      })
      .select()
      .single();

    if (pedidoError) throw pedidoError;

    const detallesPedido = (proforma.detalles || []).map((detalle: any) => ({
      pedido_id: pedido.id,
      articulo_id: detalle.articulo_id,
      descripcion: detalle.descripcion,
      cantidad: detalle.cantidad,
      precio: detalle.precio,
      costo: detalle.costo,
      subtotal: detalle.subtotal,
      tasa_iva: detalle.tasa_iva,
      utilidad_porcentaje: detalle.utilidad_porcentaje,
      empresa_id: proforma.empresa_id
    }));

    const { error: detallesError } = await supabase
      .from('pedido_detalle')
      .insert(detallesPedido);

    if (detallesError) throw detallesError;

    return pedido.id;
  }
};

export function calcularUtilidad(precio: number, costo: number): number {
  if (costo <= 0) return 0;
  return ((precio - costo) / costo) * 100;
}
