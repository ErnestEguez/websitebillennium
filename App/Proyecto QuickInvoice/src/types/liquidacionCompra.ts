// ============================================================
// Tipos TypeScript — Módulo Liquidaciones de Compra (codDoc=03)
// ============================================================

export type EstadoLC        = 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO' | 'ANULADO'
export type TipoBeneficiario = 'CEDULA' | 'PASAPORTE' | 'SIN_RUC' | 'EXTERIOR'
export type TipoRetencionLC = 'IR' | 'IVA'

export interface LiquidacionCompra {
    id: string
    empresa_id: string
    punto_emision_id: string
    establecimiento: string
    punto_emision: string
    secuencial: string
    clave_acceso?: string | null
    ambiente: 'PRUEBAS' | 'PRODUCCION'
    estado_sri: EstadoLC
    // Beneficiario
    proveedor_id?: string | null
    beneficiario_tipo_id: TipoBeneficiario
    beneficiario_identificacion: string
    beneficiario_nombre: string
    beneficiario_direccion?: string | null
    beneficiario_email?: string | null
    // Fechas y sustento
    fecha_emision: string
    tipo_sustento: string
    tipo_regimen_pago: string
    pais_pago_exterior?: string | null
    aplica_convenio_ddi: boolean
    // Totales
    subtotal: number
    base_iva_0: number
    base_iva_15: number
    valor_iva: number
    total: number
    total_retenciones: number
    // Pago
    forma_pago: 'CONTADO' | 'CREDITO'
    fecha_vencimiento?: string | null
    // SRI
    numero_autorizacion?: string | null
    fecha_autorizacion?: string | null
    xml_firmado?: string | null
    observaciones_sri?: string | null
    motivo_anulacion?: string | null
    // Contabilidad
    asiento_id?: string | null
    // Auditoría
    observaciones?: string | null
    created_by?: string | null
    created_at?: string
    updated_at?: string
    // Joins opcionales
    proveedor?: { nombre_empresa: string; ruc: string } | null
    punto?: { establecimiento: string; punto_emision: string; nombre: string } | null
}

export interface LiquidacionDetalle {
    id?: string
    empresa_id: string
    liquidacion_id: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    descuento: number
    aplica_iva: boolean
    subtotal: number
    tipo_gasto: string
    cuenta_contable_id?: string | null
    orden: number
}

export interface LiquidacionRetencion {
    id?: string
    empresa_id: string
    liquidacion_id: string
    tipo: TipoRetencionLC
    codigo_retencion: string
    descripcion?: string | null
    base_imponible: number
    porcentaje: number
    valor: number
}

export interface LiquidacionCompraCompleta extends LiquidacionCompra {
    detalles: LiquidacionDetalle[]
    retenciones: LiquidacionRetencion[]
    cxp?: {
        id: string
        saldo_pendiente: number
        estado: string
        fecha_vencimiento: string
    } | null
}

export interface CreateLiquidacionInput {
    empresa_id: string
    punto_emision_id: string
    proveedor_id?: string | null
    beneficiario_tipo_id: TipoBeneficiario
    beneficiario_identificacion: string
    beneficiario_nombre: string
    beneficiario_direccion?: string | null
    beneficiario_email?: string | null
    fecha_emision: string
    tipo_sustento: string
    tipo_regimen_pago: string
    pais_pago_exterior?: string | null
    aplica_convenio_ddi: boolean
    forma_pago: 'CONTADO' | 'CREDITO'
    fecha_vencimiento?: string | null
    observaciones?: string | null
    detalles: Omit<LiquidacionDetalle, 'id' | 'empresa_id' | 'liquidacion_id'>[]
    retenciones: Omit<LiquidacionRetencion, 'id' | 'empresa_id' | 'liquidacion_id'>[]
    created_by?: string | null
}

export interface KPIsLC {
    total: number
    autorizadas: number
    pendientes: number
    rechazadas: number
    monto_total: number
    monto_autorizado: number
}

// ── Etiquetas UI ────────────────────────────────────────────────
export const TIPO_BENEFICIARIO_LABELS: Record<TipoBeneficiario, string> = {
    CEDULA:    'Cédula de Ciudadanía',
    PASAPORTE: 'Pasaporte',
    SIN_RUC:   'Sin RUC (nivel cultural/rusticidad)',
    EXTERIOR:  'Exterior (no residente)',
}

export const TIPO_BENEFICIARIO_SRI: Record<TipoBeneficiario, string> = {
    CEDULA:    '05',  // Código SRI para cédula
    PASAPORTE: '06',  // Código SRI para pasaporte
    SIN_RUC:   '07',  // Código SRI sin RUC
    EXTERIOR:  '08',  // Código SRI exterior
}

export const ESTADO_LC_BADGE: Record<EstadoLC, string> = {
    PENDIENTE:  'bg-amber-100 text-amber-700',
    AUTORIZADO: 'bg-green-100 text-green-700',
    RECHAZADO:  'bg-red-100 text-red-600',
    ANULADO:    'bg-slate-100 text-slate-500',
}

// ── Códigos SRI para retenciones de Liquidaciones de Compra ─────
// IR: Impuesto a la Renta — los más comunes para LC
export const CODIGOS_IR_LC = [
    { codigo: '340', descripcion: 'Por pagos a través de liquidación de compra (nivel cultural o rusticidad)', porcentaje: 2 },
    { codigo: '341', descripcion: 'Por compras a través de liquidaciones de compra (bienes agrícolas)', porcentaje: 1 },
    { codigo: '303', descripcion: 'Honorarios profesionales y demás pagos por servicios', porcentaje: 10 },
    { codigo: '304', descripcion: 'Servicios donde predomina la mano de obra', porcentaje: 2 },
    { codigo: '307', descripcion: 'Servicios de construcción', porcentaje: 1 },
    { codigo: '312', descripcion: 'Transporte privado de pasajeros o carga', porcentaje: 1 },
    { codigo: '319', descripcion: 'Otros servicios no contemplados en los anteriores', porcentaje: 2 },
    { codigo: '403', descripcion: 'Bienes agrícolas, avícolas, pecuarios, apícolas, cunículas', porcentaje: 1 },
    { codigo: '601', descripcion: 'Pagos al exterior — no registrados en el SRI', porcentaje: 0 },
]

// IVA: porcentaje retenido
export const CODIGOS_IVA_LC = [
    { codigo: '725', descripcion: 'Retención IVA 30% — bienes', porcentaje: 30 },
    { codigo: '726', descripcion: 'Retención IVA 70% — servicios', porcentaje: 70 },
    { codigo: '727', descripcion: 'Retención IVA 100% — servicios profesionales / LC', porcentaje: 100 },
]

// Límites SRI anuales para Liquidaciones de Compra (Art. 9 LORTI)
export const LIMITES_LC = {
    POR_BENEFICIARIO_ANIO: 5_000,
    TOTAL_ANIO:           60_000,
}
