import { supabase } from './supabase';
import type { PedidoDetalle, PedidoCompleto, Vendedor, Articulo, Cliente } from './supabase';

export const pedidoService = {
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
        direccion: cliente.direccion || null,
        provincia: cliente.provincia || null,
        ciudad: cliente.ciudad || null,
        latitud: cliente.latitud ?? null,
        longitud: cliente.longitud ?? null,
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
    if (datos.direccion !== undefined) updateData.direccion = datos.direccion;
    if (datos.provincia !== undefined) updateData.provincia = datos.provincia;
    if (datos.ciudad !== undefined) updateData.ciudad = datos.ciudad;

    const { error } = await supabase
      .from('clientes')
      .update(updateData)
      .eq('ruc', ruc);

    if (error) throw error;
  },

  async generarNumeroPedido(empresaId: string): Promise<string> {
    const { data, error } = await supabase.rpc('generar_numero_pedido', {
      p_empresa_id: empresaId
    });

    if (error) throw error;
    return data;
  },

  async createPedido(
    rucCliente: string,
    nombreCliente: string,
    vendedorId: string,
    empresaId: string,
    articulos: Array<{
      articulo_id: string;
      descripcion: string;
      cantidad: number;
      precio: number;
      costo: number;
      tasa_iva?: number;
      subtotal?: number;
      utilidad_porcentaje?: number;
    }>,
    formaPago?: string,
    observaciones?: string,
    codvenErp?: number | null
  ): Promise<PedidoCompleto> {
    const detallesConSubtotal = articulos.map(art => ({
      ...art,
      subtotal: art.subtotal ?? (art.cantidad * art.precio),
      utilidad_porcentaje: art.utilidad_porcentaje ?? ((art.precio - art.costo) / art.precio * 100),
      tasa_iva: art.tasa_iva ?? 15 // Default to 15 if not provided, though it should come from the article
    }));

    const subtotal = detallesConSubtotal.reduce((sum, art) => sum + art.subtotal, 0);
    const impuesto = detallesConSubtotal.reduce((sum, art) => sum + (art.subtotal * (art.tasa_iva / 100)), 0);
    const total = subtotal + impuesto;

    const numero = await this.generarNumeroPedido(empresaId);

    const { data: cabecera, error: errorCabecera } = await supabase
      .from('pedido_cabecera')
      .insert({
        numero,
        ruc_cliente: rucCliente,
        nombre_cliente: nombreCliente,
        cliente_ruc: rucCliente,
        vendedor_id: vendedorId,
        empresa_id: empresaId,
        subtotal,
        impuesto,
        total,
        forma_pago: formaPago || null,
        observaciones: observaciones || null,
        codven_erp: codvenErp || null,
        estado: 'Pendiente',
        sincronizada: false
      })
      .select()
      .single();

    if (errorCabecera) throw errorCabecera;

    const detallesConEmpresa = detallesConSubtotal.map(art => ({
      pedido_id: cabecera.id,
      articulo_id: art.articulo_id,
      descripcion: art.descripcion,
      cantidad: art.cantidad,
      precio: art.precio,
      costo: art.costo,
      subtotal: art.subtotal,
      utilidad_porcentaje: art.utilidad_porcentaje,
      tasa_iva: art.tasa_iva,
      empresa_id: empresaId
    }));

    const { error: errorDetalles } = await supabase
      .from('pedido_detalle')
      .insert(detallesConEmpresa);

    if (errorDetalles) throw errorDetalles;

    const { data: vendedor } = await supabase
      .from('vendedores')
      .select('*')
      .eq('id', vendedorId)
      .maybeSingle();

    return {
      ...cabecera,
      vendedor: vendedor || undefined,
      detalles: detallesConEmpresa as any as PedidoDetalle[]
    };
  },

  async updatePedido(
    pedidoId: string,
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

    const { error: pedidoError } = await supabase
      .from('pedido_cabecera')
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
      .eq('id', pedidoId);

    if (pedidoError) throw pedidoError;

    const { error: deleteError } = await supabase
      .from('pedido_detalle')
      .delete()
      .eq('pedido_id', pedidoId);

    if (deleteError) throw deleteError;

    const detallesConId = detalles.map(detalle => ({
      pedido_id: pedidoId,
      articulo_id: detalle.articulo_id,
      empresa_id: empresaId,
      descripcion: detalle.descripcion,
      cantidad: detalle.cantidad,
      precio: detalle.precio,
      costo: detalle.costo,
      subtotal: detalle.cantidad * detalle.precio,
      tasa_iva: detalle.tasa_iva ?? 15,
      utilidad_porcentaje: detalle.precio > 0 ? ((detalle.precio - detalle.costo) / detalle.precio) * 100 : 0
    }));

    const { error: detallesError } = await supabase
      .from('pedido_detalle')
      .insert(detallesConId);

    if (detallesError) throw detallesError;
  },

  async getPedidos(empresaId?: string): Promise<PedidoCompleto[]> {
    let query = supabase
      .from('pedido_cabecera')
      .select(`
        *,
        vendedor:vendedores!pedido_cabecera_vendedor_id_fkey(*)
      `)
      .order('created_at', { ascending: false });

    if (empresaId) {
      query = query.eq('empresa_id', empresaId);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data) return [];

    const pedidosConDetalles = await Promise.all(
      data.map(async (pedido) => {
        const { data: detalles } = await supabase
          .from('pedido_detalle')
          .select('*')
          .eq('pedido_id', pedido.id);

        return {
          ...pedido,
          detalles: detalles || []
        };
      })
    );

    return pedidosConDetalles;
  },

  async getPedidoById(id: string): Promise<PedidoCompleto | null> {
    const { data: cabecera, error: errorCabecera } = await supabase
      .from('pedido_cabecera')
      .select(`
        *,
        vendedor:vendedores!pedido_cabecera_vendedor_id_fkey(*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (errorCabecera) throw errorCabecera;
    if (!cabecera) return null;

    const { data: detalles } = await supabase
      .from('pedido_detalle')
      .select('*')
      .eq('pedido_id', id);

    return {
      ...cabecera,
      detalles: detalles || []
    };
  },

  async autorizarPedido(pedidoId: string, vendedorId: string): Promise<void> {
    const { error } = await supabase
      .from('pedido_cabecera')
      .update({
        estado: 'Autorizada',
        fecha_autorizacion: new Date().toISOString(),
        autorizada_por: vendedorId
      })
      .eq('id', pedidoId);

    if (error) throw error;
  },

  async desautorizarPedido(pedidoId: string): Promise<void> {
    const { error } = await supabase
      .from('pedido_cabecera')
      .update({
        estado: 'Pendiente',
        fecha_autorizacion: null,
        autorizada_por: null
      })
      .eq('id', pedidoId);

    if (error) throw error;
  },

  async deletePedido(id: string): Promise<void> {
    const { error } = await supabase
      .from('pedido_cabecera')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
