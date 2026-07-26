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

// ─── Fase 2: Solicitudes ARCO-POL ───────────────────────────────────────────

export type TipoSolicitud =
    | 'acceso'
    | 'rectificacion'
    | 'cancelacion'
    | 'oposicion'
    | 'portabilidad'
    | 'limitacion'

export const TIPO_SOLICITUD_LABELS: Record<TipoSolicitud, string> = {
    acceso:        'Acceso',
    rectificacion: 'Rectificación',
    cancelacion:   'Cancelación',
    oposicion:     'Oposición',
    portabilidad:  'Portabilidad',
    limitacion:    'Limitación',
}

export const TIPO_SOLICITUD_DESCRIPCION: Record<TipoSolicitud, string> = {
    acceso:        'El titular quiere saber qué datos suyos tenemos y para qué los usamos.',
    rectificacion: 'El titular pide corregir datos suyos que están incorrectos o desactualizados.',
    cancelacion:   'El titular pide eliminar sus datos (también llamado "derecho al olvido").',
    oposicion:     'El titular se opone a que sigamos usando sus datos para una finalidad específica.',
    portabilidad:  'El titular pide una copia de sus datos en un formato que pueda llevarse a otro proveedor.',
    limitacion:    'El titular pide que restrinjamos temporalmente el uso de sus datos, sin borrarlos, mientras se resuelve un reclamo.',
}

export type EstadoSolicitud =
    | 'pendiente'
    | 'en_proceso'
    | 'resuelta_a_tiempo'
    | 'resuelta_fuera_de_plazo'
    | 'vencida_sin_resolver'

export const ESTADO_SOLICITUD_LABELS: Record<EstadoSolicitud, string> = {
    pendiente:               'Pendiente',
    en_proceso:              'En proceso',
    resuelta_a_tiempo:       'Resuelta a tiempo',
    resuelta_fuera_de_plazo: 'Resuelta fuera de plazo',
    vencida_sin_resolver:    'Vencida sin resolver',
}

export interface SolicitudTitular {
    id:                     string
    empresa_id:             string

    tipo_solicitud:         TipoSolicitud

    nombre_titular:         string
    identificacion_titular?: string | null
    email_titular?:         string | null
    telefono_titular?:      string | null
    descripcion:            string

    fecha_recepcion:        string

    fecha_limite:           string
    fecha_limite_prorroga:  string
    prorroga_aplicada:      boolean
    prorroga_motivo?:       string | null
    fecha_limite_vigente:   string
    fecha_alerta:           string

    estado:                 EstadoSolicitud
    fecha_resolucion?:      string | null
    respuesta_titular?:     string | null

    activo:                 boolean
    created_at?:            string
    updated_at?:            string
    created_by?:            string | null
    updated_by?:            string | null
}
