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
    created_at?: string
    updated_at?: string
}

export type TipoJornada = 'completa' | 'parcial'
export type TipoNomina = 'quincenal' | 'mensual' | 'quincenal_y_mensual' | 'por_hora' | 'destajo'
export type ModoDecimo = 'mensualizado' | 'acumulado'
export type ModoFondoReserva = 'mensual' | 'acumulado_iess' | 'no_aplica'

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

    // Datos laborales
    seccion_id?: string | null
    cargo_id?: string | null
    jefe_inmediato_id?: string | null
    fecha_ingreso: string
    fecha_salida?: string | null
    tipo_jornada: TipoJornada
    tipo_nomina: TipoNomina
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

    activo: boolean
    created_at?: string
    updated_at?: string

    // Joins opcionales
    seccion?: { nombre: string } | null
    cargo?: { nombre: string } | null
    jefe?: { nombres: string; apellidos: string } | null
}

// ── Etapa 3: Períodos y Rol de Pagos ──────────────────────────────────────────

export type EstadoPeriodo = 'borrador' | 'cerrado'
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
    concepto?: { afecta_iess: boolean } | null
}
