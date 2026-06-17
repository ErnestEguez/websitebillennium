// Tipos del módulo "Talento Humano y Nóminas" — esquema Supabase `nominas`

export interface SeccionNomina {
    id: string
    empresa_id: string
    nombre: string
    descripcion?: string | null
    activo: boolean
    created_at?: string
    updated_at?: string
}

export interface CargoNomina {
    id: string
    empresa_id: string
    seccion_id?: string | null
    nombre: string
    descripcion?: string | null
    activo: boolean
    created_at?: string
    updated_at?: string
    seccion?: { nombre: string } | null
}

export interface ParametrosNomina {
    empresa_id: string
    sbu: number
    aporte_personal_iess_pct: number
    aporte_patronal_iess_pct: number
    fondo_reserva_pct: number
    updated_at?: string
}

export type TipoConcepto = 'ingreso' | 'descuento'
export type FormulaConcepto = 'calculado' | 'fijo' | 'porcentaje_sueldo' | 'porcentaje_sbu'

export interface ConceptoNomina {
    id: string
    empresa_id: string
    codigo: string
    nombre: string
    tipo: TipoConcepto
    formula: FormulaConcepto
    valor_predeterminado?: number | null
    afecta_iess: boolean
    afecta_renta: boolean
    es_legal: boolean
    aplica_siempre: boolean
    orden: number
    activo: boolean
    cuenta_contable?: string | null
    created_at?: string
    updated_at?: string
}

export type TipoJornada = 'completa' | 'parcial'
export type TipoNomina = 'quincenal' | 'mensual' | 'quincenal_y_mensual' | 'por_hora' | 'destajo'
export type ModoDecimo = 'mensualizado' | 'acumulado'
export type ModoFondoReserva = 'mensual' | 'acumulado_iess' | 'no_aplica'

export type TipoContrato = 'indefinido' | 'plazo_fijo' | 'prueba' | 'honorarios' | 'servicios'
export type EstadoCivil  = 'soltero' | 'casado' | 'union_libre' | 'divorciado' | 'viudo'

export interface Empleado {
    id: string
    empresa_id: string

    // Datos personales
    nombres: string
    apellidos: string
    cedula: string
    fecha_nacimiento?: string | null
    telefono?: string | null
    email?: string | null
    direccion?: string | null

    // Datos personales adicionales (Etapa 2A)
    foto_url?: string | null
    estado_civil?: EstadoCivil | null
    nacionalidad?: string | null
    ciudad?: string | null

    // Datos laborales
    seccion_id?: string | null
    cargo_id?: string | null
    jefe_inmediato_id?: string | null
    fecha_ingreso: string
    fecha_salida?: string | null
    tipo_jornada: TipoJornada
    tipo_nomina: TipoNomina
    tipo_contrato?: TipoContrato | null
    sueldo_base: number
    afiliado_iess: boolean

    // Parámetros de nómina por empleado
    decimo_tercero_modo: ModoDecimo
    decimo_cuarto_modo: ModoDecimo
    fondo_reserva_modo: ModoFondoReserva
    cargas_familiares: number

    // Datos bancarios
    banco?: string | null
    tipo_cuenta?: string | null
    numero_cuenta?: string | null

    // Anticipo personal
    anticipo_tipo?: 'porcentaje' | 'fijo' | null
    anticipo_valor?: number | null

    // Contacto de emergencia (Etapa 2A)
    contacto_emergencia_nombre?: string | null
    contacto_emergencia_relacion?: string | null
    contacto_emergencia_telefono?: string | null

    // Observaciones
    observaciones?: string | null

    activo: boolean
    created_at?: string
    updated_at?: string

    // Joins opcionales
    seccion?: { nombre: string } | null
    cargo?: { nombre: string } | null
    jefe?: { nombres: string; apellidos: string } | null
}

// ── Etapa 2A: Historial de cambios salariales ────────────────────────────────

export interface HistorialSalario {
    id: string
    empresa_id: string
    empleado_id: string
    fecha: string
    sueldo_anterior: number
    sueldo_nuevo: number
    motivo?: string | null
    created_at?: string
}

// ── Etapa 3: Períodos y Rol de Pagos ──────────────────────────────────────────

export type EstadoPeriodo = 'borrador' | 'cerrado' | 'liquidado'
export type TipoPeriodo   = 'quincenal' | 'mensual'

export interface PeriodoNomina {
    id: string
    empresa_id: string
    nombre: string
    tipo_nomina: TipoPeriodo
    fecha_inicio: string
    fecha_fin: string
    estado: EstadoPeriodo
    total_ingresos: number
    total_descuentos: number
    total_neto: number
    created_at?: string
    updated_at?: string
}

export interface RolCabecera {
    id: string
    periodo_id: string
    empleado_id: string
    empresa_id: string
    sueldo_base: number
    total_ingresos: number
    total_descuentos: number
    neto: number
    created_at?: string
    updated_at?: string
    empleado?: {
        nombres: string
        apellidos: string
        cargo?: { nombre: string } | null
    } | null
}

export interface RolLinea {
    id: string
    cabecera_id: string
    empresa_id: string
    concepto_id?: string | null
    codigo: string
    nombre: string
    tipo: TipoConcepto
    monto: number
    es_calculado: boolean
    orden: number
    horas?: number | null
    novedad_id?: string | null
    anticipo_linea_id?: string | null
    concepto?: { afecta_iess: boolean } | null
}

// ── Etapa 3b: Novedades (descuentos recurrentes y préstamos) ──────────────────

export type TipoNovedad = 'descuento_variable' | 'descuento_fijo' | 'prestamo_cuota' | 'prestamo_plazo'

export interface NovedadNomina {
    id: string
    empresa_id: string
    empleado_id: string
    concepto_id?: string | null
    codigo: string
    nombre: string
    tipo_novedad: TipoNovedad
    monto_fijo?: number | null
    saldo_inicial?: number | null
    saldo_pendiente?: number | null
    n_meses?: number | null
    n_cuotas_pagadas: number
    fecha_inicio: string
    activo: boolean
    created_at?: string
    updated_at?: string
    empleado?: { nombres: string; apellidos: string } | null
    concepto?: { nombre: string } | null
}

// ── Etapa 3d: Anticipo de Quincena ────────────────────────────────────────────

export type EstadoAnticipo = 'borrador' | 'liquidado'

export interface AnticipoNomina {
    id: string
    empresa_id: string
    periodo_id: string
    nombre: string
    estado: EstadoAnticipo
    created_at?: string
    updated_at?: string
}

export interface AnticipoLinea {
    id: string
    anticipo_id: string
    empresa_id: string
    empleado_id: string
    tipo_calculo: 'porcentaje' | 'fijo'
    porcentaje: number
    monto_anticipo: number
    desc1_nombre: string | null
    desc1_monto: number
    desc2_nombre: string | null
    desc2_monto: number
    neto: number
    created_at?: string
    updated_at?: string
    empleado?: { nombres: string; apellidos: string; sueldo_base: number } | null
}

// ── Etapa 3c: Configuración contable de nómina ────────────────────────────────

export interface CuentasNomina {
    empresa_id: string
    // Gastos (Débito)
    cta_sueldos?: string | null
    cta_horas_extra?: string | null
    cta_dec_tercero?: string | null
    cta_dec_cuarto?: string | null
    cta_fondo_reserva?: string | null
    cta_iess_patronal?: string | null
    cta_vacaciones?: string | null
    // Pasivos (Crédito)
    cta_sueldos_pagar?: string | null
    cta_iess_pagar?: string | null
    cta_prov_dec_tercero?: string | null
    cta_prov_dec_cuarto?: string | null
    cta_prov_fondo_reserva?: string | null
    cta_prov_vacaciones?: string | null
    // Activo
    cta_anticipos_empleados?: string | null
    updated_at?: string
}
