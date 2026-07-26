// Tipos del módulo LOPDP — esquema Supabase `lopdp`

export type BaseLegal =
    | 'consentimiento'
    | 'ejecucion_contrato'
    | 'obligacion_legal'
    | 'interes_vital'
    | 'interes_publico'
    | 'interes_legitimo'

export const BASE_LEGAL_LABELS: Record<BaseLegal, string> = {
    consentimiento:      'Consentimiento del titular',
    ejecucion_contrato:  'Ejecución de un contrato',
    obligacion_legal:    'Cumplimiento de una obligación legal',
    interes_vital:       'Protección de intereses vitales',
    interes_publico:     'Cumplimiento de una misión de interés público',
    interes_legitimo:    'Interés legítimo del responsable',
}

export interface LopdpEmpresaConfig {
    empresa_id:    string
    lopdp_enabled: boolean
    created_at?:   string
    updated_at?:   string
}

export interface ActividadTratamiento {
    id:                          string
    empresa_id:                  string

    nombre:                      string
    finalidad:                   string

    categorias_datos:            string[]
    categoria_titulares:         string[]

    base_legal:                  BaseLegal
    base_legal_detalle?:         string | null

    plazo_retencion:             string

    hay_transferencia_terceros:  boolean
    terceros_detalle?:           string | null
    transferencia_internacional: boolean
    pais_transferencia?:         string | null

    medidas_seguridad?:          string | null

    activo:                      boolean
    created_at?:                 string
    updated_at?:                 string
    created_by?:                 string | null
    updated_by?:                 string | null
}

// Sugerencias para los MultiSelectChips — el usuario también puede escribir valores libres
export const CATEGORIAS_DATOS_SUGERIDAS = [
    'Identificación', 'Contacto', 'Financieros', 'Laborales',
    'Académicos', 'Ubicación', 'Salud', 'Biométricos',
    'Datos de menores', 'Navegación / cookies',
]

export const CATEGORIAS_TITULARES_SUGERIDAS = [
    'Clientes', 'Proveedores', 'Empleados', 'Candidatos',
    'Usuarios del portal web', 'Representantes legales',
]
