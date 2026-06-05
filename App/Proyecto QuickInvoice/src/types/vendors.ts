// ============================================================
// Tipos TypeScript — Módulo VendorManagement
// ============================================================

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
    // Joins opcionales
    proveedor?: Pick<Proveedor, 'nombre_empresa' | 'ruc'>
}

export interface CompraConDetalle extends Compra {
    detalle_ingresos_stock?: DetalleInventario[]
    detalle_servicios?:      DetalleServicio[]
    retenciones?:            RetencionCompra[]
    cxp?:                    CuentaPorPagar
}

// ── Detalle inventario (existente, sin cambios) ─────────────
export interface DetalleInventario {
    id?: string
    ingreso_id: string
    producto_id: string
    cantidad: number
    costo_unitario: number
    subtotal?: number
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
    compra_id: string
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
    compra?: Pick<Compra, 'numero_factura' | 'fecha_emision' | 'tipo_compra'>
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
    created_by?: string
    created_at?: string
    updated_at?: string
    // Joins
    proveedor?: Pick<Proveedor, 'nombre_empresa' | 'ruc'>
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

// Códigos de retención frecuentes (fuente)
export const CODIGOS_RETENCION_FUENTE = [
    { codigo: '303', descripcion: 'Honorarios profesionales y demás pagos por servicios', porcentaje: 10 },
    { codigo: '304', descripcion: 'Servicios predomina mano de obra', porcentaje: 2 },
    { codigo: '307', descripcion: 'Servicios de construcción', porcentaje: 1 },
    { codigo: '309', descripcion: 'Arrendamiento de bienes inmuebles', porcentaje: 8 },
    { codigo: '310', descripcion: 'Seguros y reaseguros', porcentaje: 1 },
    { codigo: '312', descripcion: 'Transporte privado de pasajeros o servicio público o privado de carga', porcentaje: 1 },
    { codigo: '319', descripcion: 'Otros servicios no contemplados', porcentaje: 2 },
    { codigo: '320', descripcion: 'Arrendamiento bienes muebles', porcentaje: 2 },
    { codigo: '322', descripcion: 'Seguros y reaseguros primas y cesiones', porcentaje: 1 },
    { codigo: '327', descripcion: 'Energía eléctrica', porcentaje: 1 },
    { codigo: '340', descripcion: 'Por pagos a través de liquidación de compra (nivel cultural o rusticidad)', porcentaje: 2 },
    { codigo: '341', descripcion: 'Por compras a través de liquidaciones de compra', porcentaje: 1 },
    { codigo: '403', descripcion: 'Compras de bienes agrícolas, avícolas, pecuarios, apícolas, cunículas, bioacuáticos', porcentaje: 1 },
    { codigo: '601', descripcion: 'No Registrados', porcentaje: 0 },
    { codigo: '721', descripcion: 'Bienes no producidos en el país - con impuesto a la renta - pagos al exterior', porcentaje: 0 },
]

export const CODIGOS_RETENCION_IVA = [
    { codigo: '725', descripcion: 'Ret. IVA 30% - Bienes', porcentaje: 30 },
    { codigo: '726', descripcion: 'Ret. IVA 70% - Servicios', porcentaje: 70 },
    { codigo: '727', descripcion: 'Ret. IVA 100% - Servicios profesionales', porcentaje: 100 },
]
