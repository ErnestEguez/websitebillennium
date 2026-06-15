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
