// Tipos del sistema de auditoría/trazabilidad centralizado.
// Ver facturacion.auditoria_eventos (supabase/migrations/20260731d_auditoria_eventos.sql).

export type AuditoriaModulo =
    | 'facturacion'
    | 'compras'
    | 'cierres'
    | 'bodegas'
    | 'cartera_cxc'
    | 'cartera_cxp'
    | 'bancos'
    | 'nomina'
    | 'talento_humano'
    | 'lopdp'
    | 'configuracion'

export type AuditoriaAccion =
    | 'crear'
    | 'actualizar'
    | 'anular'
    | 'eliminar'
    | 'cerrar'
    | 'transferir'
    | 'aprobar'
    | 'rechazar'
    | 'notificar'
    | 'reversar'
    | 'liquidar'

export type AuditoriaEstado = 'exitoso' | 'fallido' | 'intento'

export type AuditoriaNivel = 'operativo' | 'sensible' | 'compliance'

export interface AuditoriaCambio {
    antes: unknown
    despues: unknown
}

export interface LogEventInput {
    empresaId: string
    /** UUID que agrupa varios eventos de una misma operación de negocio. Si se omite, se genera uno nuevo. */
    correlationId?: string
    modulo: AuditoriaModulo
    accion: AuditoriaAccion
    /** Nombre de la entidad de negocio: 'comprobante', 'empleado', 'brecha_seguridad', etc. */
    entidad: string
    entidadId?: string
    tipoDocumento?: string
    numeroDocumento?: string
    sucursalId?: string
    serie?: string
    bodegaId?: string
    /** Resumen legible, ej. "Anulación de factura No. 001-002-000044555". */
    resumen: string
    detalle?: Record<string, unknown>
    /** Solo campos explícitamente sensibles: { campo: { antes, despues } }. */
    cambios?: Record<string, AuditoriaCambio>
    estado?: AuditoriaEstado
    errorMensaje?: string
    nivel?: AuditoriaNivel
}

export interface AuditoriaEvento {
    id: string
    correlationId: string
    empresaId: string
    userId: string | null
    userNombre: string | null
    userRol: string | null
    ip: string | null
    userAgent: string | null
    origen: string
    modulo: AuditoriaModulo
    accion: AuditoriaAccion
    entidad: string
    entidadId: string | null
    tipoDocumento: string | null
    numeroDocumento: string | null
    sucursalId: string | null
    serie: string | null
    bodegaId: string | null
    resumen: string
    detalle: Record<string, unknown> | null
    cambios: Record<string, AuditoriaCambio> | null
    estado: AuditoriaEstado
    errorMensaje: string | null
    nivel: AuditoriaNivel
    createdAt: string
}

export interface AuditoriaFiltros {
    empresaId?: string
    sucursalId?: string
    serie?: string
    bodegaId?: string
    userId?: string
    rol?: string
    desde?: string
    hasta?: string
    modulo?: AuditoriaModulo
    accion?: AuditoriaAccion
    estado?: AuditoriaEstado
    texto?: string
}
