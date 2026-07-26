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

// ─── Fase 3: Política de Privacidad Pública ─────────────────────────────────

export interface EncargadoTercero {
    nombre: string
    tipo:   string
    fijo?:  boolean   // true = QuickInvoice, no editable/eliminable desde la UI
}

export const ENCARGADO_QUICKINVOICE: EncargadoTercero = {
    nombre: 'QuickInvoice (Billennium System)',
    tipo:   'Encargado de tratamiento — proveedor de la plataforma tecnológica',
    fijo:   true,
}

export const FINALIDADES_SUGERIDAS = [
    'Facturación y cumplimiento tributario',
    'Gestión de nómina y talento humano',
    'Atención al cliente y soporte',
    'Gestión de proveedores y compras',
    'Marketing y comunicaciones comerciales',
    'Cumplimiento de obligaciones legales',
]

// Configuración "viva" / editable — un registro por empresa
export interface PoliticaPrivacidad {
    empresa_id:              string
    slug:                    string

    finalidades_tratamiento: string[]
    plazo_conservacion?:     string | null

    tiene_dpd:               boolean
    dpd_nombre?:             string | null
    dpd_contacto?:           string | null

    encargados_terceros:     EncargadoTercero[]

    email_contacto?:         string | null
    email_arco_pol:          string

    // Fase 4: mensaje legal editable — la URL pública NUNCA se guarda aquí,
    // el código siempre la concatena a partir de `slug` en tiempo de uso.
    aviso_lopdp_texto:       string   // largo — RIDE (PDF y HTML)
    aviso_lopdp_corto:       string   // corto — XML campoAdicional y ticket

    created_at?:             string
    updated_at?:             string
    created_by?:             string | null
    updated_by?:             string | null
}

// Snapshot autocontenido, tal como queda congelado en cada versión publicada
export interface PoliticaPrivacidadContenido {
    razon_social:             string
    nombre_comercial:         string
    ruc:                      string
    direccion?:               string | null
    finalidades_tratamiento:  string[]
    plazo_conservacion?:      string | null
    tiene_dpd:                boolean
    dpd_nombre?:              string | null
    dpd_contacto?:            string | null
    encargados_terceros:      EncargadoTercero[]
    email_contacto?:          string | null
    email_arco_pol:           string
}

// Histórico interno (oficina/admin) — incluye publicado_por
export interface PoliticaPrivacidadVersion {
    id:                string
    empresa_id:        string
    numero_version:    number
    fecha_publicacion: string
    publicado_por?:    string | null
    slug:              string
    contenido:         PoliticaPrivacidadContenido
}

// Lo único que expone la vista pública (coincide con el GRANT de columnas a anon)
export type PoliticaPrivacidadPublica = Pick<PoliticaPrivacidadVersion,
    'empresa_id' | 'slug' | 'numero_version' | 'fecha_publicacion' | 'contenido'>
