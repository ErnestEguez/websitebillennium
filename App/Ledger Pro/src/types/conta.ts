// ============================================================
// Tipos TypeScript para las tablas del schema conta (lp_)
// ============================================================

export interface LpMoneda {
    id: string
    codigo: string
    nombre: string
    simbolo: string
    decimales: number
    activa: boolean
}

export interface LpEmpresa {
    id: string
    nombre: string
    razon_social: string
    ruc: string | null
    direccion: string | null
    telefono: string | null
    email: string | null
    representante: string | null
    moneda_id: string
    logo_url: string | null
    activa: boolean
    qi_empresa_id: string | null
    created_at: string
    updated_at: string
    // join
    moneda?: LpMoneda
}

export interface LpUsuarioEmpresa {
    id: string
    user_id: string
    empresa_id: string
    rol: 'admin_conta' | 'contador' | 'auxiliar'
    activo: boolean
    created_at: string
}

export interface LpPeriodo {
    id: string
    empresa_id: string
    año: number
    mes: number | null
    estado: 'abierto' | 'cerrado' | 'bloqueado'
    fecha_apertura: string
    fecha_cierre: string | null
    created_at: string
}

export interface LpTipoComprobante {
    id: string
    codigo: string
    nombre: string
    naturaleza: 'ingreso' | 'egreso' | 'diario'
    activo: boolean
}

export interface LpCuenta {
    id: string
    empresa_id: string
    codigo: string
    nombre: string
    nivel: number
    tipo: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto'
    naturaleza: 'deudora' | 'acreedora'
    cuenta_padre_id: string | null
    acepta_movimientos: boolean
    codigo_sri: string | null
    codigo_supe: string | null
    plantilla_origen_id: string | null
    activa: boolean
    created_at: string
    updated_at: string
    // join
    hijos?: LpCuenta[]
}

export interface LpPlantilla {
    id: string
    nombre: string
    pais: string
    descripcion: string | null
    activa: boolean
}

export interface LpPlantillaCuenta {
    id: string
    plantilla_id: string
    codigo: string
    nombre: string
    nivel: number
    tipo: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto'
    naturaleza: 'deudora' | 'acreedora'
    codigo_padre: string | null
    acepta_movimientos: boolean
    codigo_sri: string | null
    codigo_supe: string | null
}

export interface LpComprobante {
    id: string
    empresa_id: string
    periodo_id: string
    tipo_comprobante_id: string
    numero: string
    secuencial: number
    fecha: string
    glosa: string
    estado: 'borrador' | 'confirmado' | 'anulado'
    total_debe: number
    total_haber: number
    moneda_id: string | null
    tipo_cambio: number
    origen: 'manual' | 'quickinvoice' | 'sri' | 'cierre' | 'apertura'
    referencia_externa: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    // joins
    tipo_comprobante?: LpTipoComprobante
    periodo?: LpPeriodo
    lineas?: LpComprobanteLinea[]
}

export interface LpComprobanteLinea {
    id: string
    comprobante_id: string
    empresa_id: string
    cuenta_id: string
    descripcion: string | null
    debe: number
    haber: number
    orden: number
    created_at: string
    // join
    cuenta?: LpCuenta
}

export interface LpSaldoCuenta {
    id: string
    empresa_id: string
    cuenta_id: string
    periodo_id: string
    saldo_inicial_debe: number
    saldo_inicial_haber: number
    movimientos_debe: number
    movimientos_haber: number
    updated_at: string
    // joins
    cuenta?: LpCuenta
    periodo?: LpPeriodo
}

export interface LpPresupuesto {
    id: string
    empresa_id: string
    año: number
    nombre: string
    estado: 'borrador' | 'aprobado'
    created_at: string
}

export interface LpPresupuestoDetalle {
    id: string
    presupuesto_id: string
    empresa_id: string
    cuenta_id: string
    periodo_id: string
    valor_presupuestado: number
    created_at: string
    // joins
    cuenta?: LpCuenta
    periodo?: LpPeriodo
}

// ── Tipos helpers ──────────────────────────────────────────

export type TipoCuenta = LpCuenta['tipo']
export type EstadoComprobante = LpComprobante['estado']
export type RolContable = LpUsuarioEmpresa['rol']

export interface LineaForm {
    cuenta_id: string
    descripcion: string
    debe: string
    haber: string
    orden: number
    // UI only
    _cuenta?: LpCuenta
}
