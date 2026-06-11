// ============================================================
// Tipos TypeScript — Finance Suite (schema finance)
// ============================================================

// ── Bancos ──────────────────────────────────────────────────
export interface Banco {
    id: string
    codigo: string
    nombre: string
    abreviatura: string | null
    ruc: string | null
    pais: string
    activo: boolean
    created_at: string
}

// ── Cuentas Bancarias ────────────────────────────────────────
export type TipoCuenta   = 'corriente' | 'ahorros'
export type EstadoCuenta = 'activa' | 'bloqueada' | 'cerrada'

export interface CuentaBancaria {
    id: string
    empresa_id: string
    banco_id: string
    numero_cuenta: string
    tipo: TipoCuenta
    moneda: string
    descripcion: string | null
    estado: EstadoCuenta
    saldo_inicial: number
    fecha_apertura: string | null
    cuenta_contable_id: string | null
    participa_conciliacion: boolean
    cheque_desde: number | null
    cheque_hasta: number | null
    cheque_siguiente: number | null
    created_at: string
    updated_at: string
    // joins
    banco?: Pick<Banco, 'nombre' | 'abreviatura' | 'codigo'>
    saldo_actual?: number
}

// ── Configuración empresa ────────────────────────────────────
export interface ConfiguracionEmpresa {
    id: string
    empresa_id: string
    cuenta_banco_defecto_id: string | null
    cuenta_cxp_defecto_id: string | null
    cuenta_ret_fuente_id: string | null
    cuenta_ret_iva_id: string | null
    prefijo_egreso: string
    siguiente_numero_egreso: number
    tipo_secuencia_egreso: 'mensual' | 'anual'
    consideracion_cheques: 'emision' | 'cobro'
    created_at: string
    updated_at: string
}

// ── Comprobantes de Egreso ───────────────────────────────────
export type FormasPagoEgreso =
    | 'efectivo'
    | 'transferencia'
    | 'cheque'
    | 'cheque_postfechado'
    | 'tarjeta_credito'
    | 'nota_credito'
    | 'cruce_contable'

export type EstadoEgreso = 'emitido' | 'anulado'

export interface ComprobanteEgreso {
    id: string
    empresa_id: string
    numero: string
    fecha: string
    proveedor_id: string
    forma_pago: FormasPagoEgreso
    cuenta_bancaria_id: string | null
    monto_total: number
    referencia: string | null
    concepto: string | null
    estado: EstadoEgreso
    tiene_asiento: boolean
    comprobante_contable_id: string | null
    anulado_por: string | null
    motivo_anulacion: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    // joins
    proveedor?: { nombre_empresa: string; ruc: string }
    cuenta_bancaria?: Pick<CuentaBancaria, 'numero_cuenta' | 'tipo'> & { banco?: Pick<Banco, 'nombre'> }
    pagos_cxp?: EgresoPagoCxP[]
    // aviso no-fatal: el egreso se guardó pero el asiento contable falló
    avisoContable?: string | null
}

// ── Detalle egreso → Anticipo ────────────────────────────────
export interface EgresoAnticipo {
    id: string
    empresa_id: string
    egreso_id: string
    anticipo_id: string
    monto_aplicado: number
    created_at: string
}

// ── Detalle egreso → CxP ─────────────────────────────────────
export interface EgresoPagoCxP {
    id: string
    empresa_id: string
    egreso_id: string
    cxp_id: string
    monto_aplicado: number
    created_at: string
    // join
    cxp?: CuentaPorPagar
}

// ── Cheques ──────────────────────────────────────────────────
export type EstadoCheque = 'emitido' | 'cobrado' | 'anulado' | 'en_transito'

export interface Cheque {
    id: string
    empresa_id: string
    cuenta_bancaria_id: string
    egreso_id: string | null
    numero_cheque: string
    beneficiario: string
    monto: number
    fecha_emision: string
    fecha_cobro: string | null
    es_postfechado: boolean
    estado: EstadoCheque
    fecha_cobro_real: string | null
    movimiento_cobro_id: string | null
    notas: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    // joins
    cuenta_bancaria?: Pick<CuentaBancaria, 'numero_cuenta' | 'tipo'> & { banco?: Pick<Banco, 'nombre'> }
}

// ── Anticipos a Proveedores ──────────────────────────────────
export type EstadoAnticipo = 'disponible' | 'aplicado_parcial' | 'aplicado_total' | 'anulado'
export type TipoBeneficiario = 'proveedor' | 'empleado' | 'otro'

export interface AnticipoProveedor {
    id: string
    empresa_id: string
    proveedor_id: string | null
    beneficiario_libre: string | null
    tipo_beneficiario: TipoBeneficiario
    cuenta_bancaria_id: string | null
    forma_pago: 'transferencia' | 'cheque'
    monto: number
    monto_aplicado: number
    fecha: string
    referencia: string | null
    concepto: string | null
    estado: EstadoAnticipo
    tiene_asiento: boolean
    comprobante_contable_id: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    // joins
    proveedor?: { nombre_empresa: string; ruc: string }
    cuenta_bancaria?: Pick<CuentaBancaria, 'numero_cuenta'> & { banco?: Pick<Banco, 'nombre'> }
}

// ── Movimientos Bancarios ────────────────────────────────────
export type TipoMovimiento =
    | 'deposito' | 'nota_debito' | 'nota_credito'
    | 'comision' | 'interes' | 'cargo_automatico'
    | 'cheque' | 'transferencia' | 'otro'

export type SentidoMovimiento = 'debito' | 'credito'
export type EstadoMovimiento  = 'activo' | 'anulado'

// Línea de distribución contable (contrapartida) de un movimiento bancario.
// La suma de monto de todas las líneas debe ser igual al monto del movimiento.
export interface LineaDistribucionContable {
    cuenta_id: string
    cuenta_codigo: string
    cuenta_nombre: string
    monto: number
}

export interface MovimientoBancario {
    id: string
    empresa_id: string
    cuenta_bancaria_id: string
    tipo: TipoMovimiento
    fecha: string
    monto: number
    sentido: SentidoMovimiento
    referencia: string | null
    descripcion: string | null
    estado: EstadoMovimiento
    conciliado: boolean
    conciliacion_id: string | null
    tiene_asiento: boolean
    comprobante_contable_id: string | null
    origen: 'manual' | 'egreso' | 'anticipo' | 'importacion'
    origen_id: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    // joins
    cuenta_bancaria?: Pick<CuentaBancaria, 'numero_cuenta' | 'tipo'> & { banco?: Pick<Banco, 'nombre'> }
    // aviso no-fatal: el movimiento se guardó pero el asiento contable falló
    avisoContable?: string | null
}

// ── Conciliaciones ───────────────────────────────────────────
export type EstadoConciliacion = 'borrador' | 'confirmada'

export interface Conciliacion {
    id: string
    empresa_id: string
    cuenta_bancaria_id: string
    periodo_año: number
    periodo_mes: number
    fecha_inicio: string
    fecha_fin: string
    saldo_segun_banco: number
    saldo_segun_libros: number
    estado: EstadoConciliacion
    notas: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    // joins
    cuenta_bancaria?: Pick<CuentaBancaria, 'numero_cuenta' | 'tipo'> & { banco?: Pick<Banco, 'nombre'> }
}

export interface ConciliacionLinea {
    id: string
    empresa_id: string
    conciliacion_id: string
    movimiento_id: string | null
    cheque_id: string | null
    tipo_linea: 'sistema' | 'extracto'
    descripcion: string | null
    monto: number
    fecha: string | null
    conciliado: boolean
    created_at: string
}

// ── CxP (desde facturacion — solo lectura para Finance Suite) ──
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
    observaciones: string | null
    created_at: string
    updated_at: string
    // joins
    proveedor?: { nombre_empresa: string; ruc: string }
    compra?: { numero_factura: string; fecha_emision: string; tipo_compra: string }
}

// ── Proveedor (desde facturacion — solo lectura) ─────────────
export interface Proveedor {
    id: string
    empresa_id: string
    ruc: string
    nombre_empresa: string
    nombre_encargado: string | null
    direccion: string | null
    correo: string | null
    telefono: string | null
    estado: 'ACTIVO' | 'INACTIVO'
    condicion_pago: 'CONTADO' | 'CREDITO'
}

// ── Cuenta contable (desde conta — solo para link contable) ──
export interface CuentaContable {
    id: string
    empresa_id: string
    codigo: string
    nombre: string
    tipo: string
    acepta_movimientos: boolean
    activa: boolean
}

// ── Helpers UI ───────────────────────────────────────────────
export const FORMA_PAGO_LABELS: Record<FormasPagoEgreso, string> = {
    efectivo:           'Efectivo',
    transferencia:      'Transferencia bancaria',
    cheque:             'Cheque al día',
    cheque_postfechado: 'Cheque post-fechado',
    tarjeta_credito:    'Tarjeta de crédito',
    nota_credito:       'Nota de crédito',
    cruce_contable:     'Cruce contable',
}

export const TIPO_MOVIMIENTO_LABELS: Record<TipoMovimiento, string> = {
    deposito:         'Depósito',
    nota_debito:      'Nota de débito',
    nota_credito:     'Nota de crédito',
    comision:         'Comisión',
    interes:          'Interés',
    cargo_automatico: 'Cargo automático',
    cheque:           'Cheque',
    transferencia:    'Transferencia',
    otro:             'Otro',
}

export const ESTADO_CXP_BADGE: Record<EstadoCxP, string> = {
    PENDIENTE:           'bg-amber-100 text-amber-700',
    PARCIALMENTE_PAGADO: 'bg-blue-100 text-blue-700',
    PAGADO:              'bg-green-100 text-green-700',
    ANULADO:             'bg-slate-100 text-slate-400',
}
