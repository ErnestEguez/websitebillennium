// ============================================================
// Tipos TypeScript — Módulo VendorManagement
// ============================================================

// ── Bodegas ─────────────────────────────────────────────────
export interface Bodega {
    id: string
    empresa_id: string
    nombre: string
    codigo?: string
    descripcion?: string
    direccion?: string
    cuenta_inventario_id?:     string | null
    cuenta_inventario_codigo?: string | null
    cuenta_inventario_nombre?: string | null
    es_principal: boolean
    activo: boolean
    created_at?: string
    updated_at?: string
}

export interface StockBodega {
    id?: string
    empresa_id: string
    bodega_id: string
    producto_id: string
    cantidad: number
    costo_promedio: number
    updated_at?: string
    // Joins opcionales
    bodega?:   Pick<Bodega, 'nombre' | 'codigo'>
    producto?: { nombre: string; codigo: string | null }
}

export type TipoIdentificacion = 'RUC' | 'CEDULA' | 'PASAPORTE' | 'EXTERIOR'
export type TipoProveedor      = 'PERSONA_NATURAL' | 'SOCIEDAD'
export type EstadoProveedor    = 'ACTIVO' | 'INACTIVO'
export type CondicionPago      = 'CONTADO' | 'CREDITO'
export type TipoRegimen        = 'GENERAL' | 'RIMPE_EMPRENDEDOR' | 'RIMPE_NEGOCIO_POPULAR'

export interface Proveedor {
    id: string
    empresa_id: string
    ruc: string
    nombre_empresa: string
    nombre_encargado?: string
    direccion?: string
    correo?: string
    telefono?: string
    // Campos nuevos
    tipo_identificacion:  TipoIdentificacion
    tipo_proveedor:       TipoProveedor
    estado:               EstadoProveedor
    condicion_pago:       CondicionPago
    dias_credito?:        number
    ciudad?:              string
    provincia?:           string
    pais:                 string
    contribuyente_especial: boolean
    agente_retencion:     boolean
    tipo_regimen:         TipoRegimen
    // Retenciones automáticas predeterminadas (solo código; porcentaje viene de codigos_retencion)
    ret_fuente_codigo?:      string | null
    ret_iva_codigo?:         string | null
    created_at?: string
    updated_at?: string
}

// ── Compras (cabecera ingresos_stock extendida) ─────────────
export type TipoCompra   = 'INVENTARIO' | 'SERVICIO'
export type EstadoCompra = 'ACTIVO' | 'ANULADO' | 'DEVUELTO'
export type OrigenCompra = 'MANUAL' | 'SRI' | 'OC'
export type FormaPago    = 'CONTADO' | 'CREDITO'
export type TipoSustento = '01' | '02' | '03' | '04' | '05'
export type TipoRegimenPago = '01' | '02'

export interface Compra {
    id: string
    empresa_id: string
    proveedor_id?: string
    numero_factura?: string
    fecha_ingreso: string
    observaciones?: string
    total: number
    created_by?: string
    created_at?: string
    // Nuevos
    tipo_compra:   TipoCompra
    estado:        EstadoCompra
    origen:        OrigenCompra
    fecha_emision?: string
    estab?:         string
    pto_emi?:       string
    secuencial?:    string
    numero_autorizacion?: string
    clave_acceso?:  string
    base_iva_0:    number
    base_iva_5:    number
    base_iva_15:   number
    subtotal:      number
    valor_iva:     number
    forma_pago:    FormaPago
    fecha_vencimiento?: string
    motivo_anulacion?:  string
    fecha_anulacion?:   string
    anulado_por?:       string
    tipo_sustento:      TipoSustento
    tipo_regimen_pago:  TipoRegimenPago
    pais_pago_exterior?: string
    aplica_convenio_ddi: boolean
    orden_compra_id?:   string
    bodega_id?:         string
    // Joins opcionales
    proveedor?: Pick<Proveedor, 'nombre_empresa' | 'ruc'>
    bodega?:    Pick<Bodega, 'nombre' | 'codigo'>
}

export interface CompraConDetalle extends Compra {
    detalle_ingresos_stock?: DetalleInventario[]
    detalle_servicios?:      DetalleServicio[]
    retenciones?:            RetencionCompra[]
    cxp?:                    CuentaPorPagar
    cxpError?:               string
}

// ── Detalle inventario ──────────────────────────────────────
export interface DetalleInventario {
    id?: string
    ingreso_id: string
    producto_id: string
    cantidad: number
    costo_unitario: number
    descuento?: number
    subtotal?: number
    bodega_id?: string
    producto?: { nombre: string; codigo: string }
}

// ── Detalle servicios ───────────────────────────────────────
export type TipoGasto =
    | 'HONORARIOS' | 'SERVICIOS_BASICOS' | 'ARRENDAMIENTO'
    | 'TRANSPORTE'  | 'PUBLICIDAD'        | 'MANTENIMIENTO'
    | 'SEGUROS'     | 'SERVICIOS'         | 'OTROS'

export interface DetalleServicio {
    id?: string
    empresa_id: string
    compra_id: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    aplica_iva: boolean
    tipo_gasto: TipoGasto
    orden: number
    cuenta_contable_id?: string | null
}

// ── Retenciones ─────────────────────────────────────────────
export type TipoRetencion = 'FUENTE' | 'IVA'
export type EstadoRetencion = 'ACTIVO' | 'ANULADO'
export type OrigenRetencion = 'MANUAL' | 'SRI'

export interface RetencionCompra {
    id: string
    empresa_id: string
    compra_id: string
    proveedor_id?: string
    numero_retencion?: string
    fecha_emision: string
    tipo: TipoRetencion
    codigo_retencion: string
    descripcion?: string
    base_imponible: number
    porcentaje: number
    valor: number
    estado: EstadoRetencion
    origen: OrigenRetencion
    numero_autorizacion?: string
    clave_acceso?: string
    created_by?: string
    created_at?: string
}

// ── Cuentas por Pagar ───────────────────────────────────────
export type EstadoCxP = 'PENDIENTE' | 'PARCIALMENTE_PAGADO' | 'PAGADO' | 'ANULADO'

export interface CuentaPorPagar {
    id: string
    empresa_id: string
    proveedor_id: string
    compra_id?: string | null
    liquidacion_id?: string | null
    fecha_emision: string
    fecha_vencimiento: string
    monto_original: number
    saldo_pendiente: number
    estado: EstadoCxP
    observaciones?: string
    created_at?: string
    updated_at?: string
    // Joins
    proveedor?: Pick<Proveedor, 'nombre_empresa' | 'ruc'>
    compra?: Pick<Compra, 'numero_factura' | 'fecha_emision' | 'tipo_compra'> | null
    liquidacion?: { establecimiento: string; punto_emision: string; secuencial: string } | null
    pagos?: PagoProveedor[]
}

// ── Pagos ───────────────────────────────────────────────────
export type FormasPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'NOTA_DEBITO' | 'OTRO'

export interface PagoProveedor {
    id: string
    empresa_id: string
    cxp_id: string
    proveedor_id: string
    fecha_pago: string
    monto: number
    forma_pago: FormasPago
    numero_referencia?: string
    observaciones?: string
    created_by?: string
    created_at?: string
    // Reversa / trazabilidad contable
    estado: 'activo' | 'reversado'
    lp_comprobante_id: string | null
    reversado_at: string | null
    reversado_por: string | null
    motivo_reversa: string | null
}

// ── Órdenes de Compra ───────────────────────────────────────
export type EstadoOC = 'BORRADOR' | 'ENVIADA' | 'PARCIALMENTE_RECIBIDA' | 'RECIBIDA' | 'ANULADA'

export interface OrdenCompra {
    id: string
    empresa_id: string
    proveedor_id?: string
    numero_oc: string
    fecha_emision: string
    fecha_entrega_esperada?: string
    estado: EstadoOC
    observaciones?: string
    subtotal: number
    total: number
    bodega_id?: string
    created_by?: string
    created_at?: string
    updated_at?: string
    // Joins
    proveedor?: Pick<Proveedor, 'nombre_empresa' | 'ruc'>
    bodega?:    Pick<Bodega, 'nombre' | 'codigo'>
    detalle?: DetalleOrdenCompra[]
}

export interface DetalleOrdenCompra {
    id?: string
    oc_id: string
    producto_id?: string
    descripcion?: string
    cantidad_solicitada: number
    cantidad_recibida: number
    costo_unitario: number
    subtotal: number
    bodega_id?: string
    producto?: { nombre: string; codigo: string; unidad?: string }
}

// ── Helpers de UI ───────────────────────────────────────────
export const TIPO_SUSTENTO_LABELS: Record<TipoSustento, string> = {
    '01': 'Crédito tributario',
    '02': 'Costo o gasto',
    '03': 'Activo fijo',
    '04': 'Inventario',
    '05': 'No aplica',
}

export const TIPO_GASTO_LABELS: Record<TipoGasto, string> = {
    HONORARIOS:       'Honorarios profesionales',
    SERVICIOS_BASICOS:'Servicios básicos',
    ARRENDAMIENTO:    'Arrendamiento',
    TRANSPORTE:       'Transporte y logística',
    PUBLICIDAD:       'Publicidad y marketing',
    MANTENIMIENTO:    'Mantenimiento y reparaciones',
    SEGUROS:          'Seguros',
    SERVICIOS:        'Servicios generales',
    OTROS:            'Otros',
}

export const REGIMEN_LABELS: Record<TipoRegimen, string> = {
    GENERAL:                'Régimen General',
    RIMPE_EMPRENDEDOR:      'RIMPE Emprendedor',
    RIMPE_NEGOCIO_POPULAR:  'RIMPE Negocio Popular',
}

