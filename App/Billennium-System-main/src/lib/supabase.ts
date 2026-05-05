import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'pedidosbillennium' },
});

export interface Vendedor {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  empresa_id: string | null;
  is_admin?: boolean;
  is_office?: boolean;
  codven_erp?: number | null;
  ultima_latitud?: number | null;
  ultima_longitud?: number | null;
  ultima_ubicacion_at?: string | null;
}

export interface Empresa {
  id: string;
  ruc: string;
  nombre_comercial: string;
  representante_legal: string;
  direccion: string;
  telefonos: string;
  correos: string;
  activo: boolean;
  logo_url: string | null;
  habilitar_proformas: boolean;
  habilitar_pedidos: boolean;
  created_at: string;
  updated_at: string;
}

export interface Articulo {
  id: string;
  descripcion: string;
  precio: number;
  costo: number;
  stock: number;
  activo: boolean;
  empresa_id: string | null;
  tasa_iva?: number | null;
}

export interface ProformaCabecera {
  id: string;
  numero: string | null;
  ruc_cliente: string;
  nombre_cliente: string;
  vendedor_id: string;
  empresa_id: string | null;
  subtotal: number;
  impuesto: number;
  total: number;
  estado: string;
  sincronizada: boolean;
  forma_pago?: string | null;
  observaciones?: string | null;
  fecha_autorizacion?: string | null;
  autorizada_por?: string | null;
  codven_erp?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProformaDetalle {
  id: string;
  proforma_id: string;
  articulo_id: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  costo: number;
  subtotal: number;
  utilidad_porcentaje: number;
  tasa_iva?: number | null;
}

export interface Cliente {
  ruc: string;
  nombres_completos: string;
  nombre_negocio?: string | null;
  correo: string | null;
  telefono: string | null;
  activo: boolean;
  direccion?: string | null;
  provincia?: string | null;
  ciudad?: string | null;
  latitud?: number | null;
  longitud?: number | null;
}

export interface ProformaCompleta extends ProformaCabecera {
  vendedor?: Vendedor;
  detalles?: ProformaDetalle[];
  cliente_ruc?: string;
}

export interface PedidoCabecera {
  id: string;
  numero: string | null;
  ruc_cliente: string;
  nombre_cliente: string;
  vendedor_id: string;
  empresa_id: string | null;
  subtotal: number;
  impuesto: number;
  total: number;
  estado: string;
  sincronizada: boolean;
  forma_pago?: string | null;
  observaciones?: string | null;
  fecha_autorizacion?: string | null;
  autorizada_por?: string | null;
  codven_erp?: number | null;
  created_at: string;
  updated_at: string;
}

export interface PedidoDetalle {
  id: string;
  pedido_id: string;
  articulo_id: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  costo: number;
  subtotal: number;
  utilidad_porcentaje: number;
  tasa_iva?: number | null;
}

export interface PedidoCompleto extends PedidoCabecera {
  vendedor?: Vendedor;
  detalles?: PedidoDetalle[];
  cliente_ruc?: string;
}
