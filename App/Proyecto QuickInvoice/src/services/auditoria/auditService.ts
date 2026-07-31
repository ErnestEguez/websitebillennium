import { supabase } from '../../lib/supabase'
import type { LogEventInput } from './types'

// Servicio central de auditoría/trazabilidad. Cualquier módulo de
// negocio llama a logEvent() DESPUÉS de confirmar (o fallar) su
// operación real — nunca antes, y nunca como parte de la misma
// transacción de negocio.
//
// Contrato: logEvent() NUNCA lanza. Es fire-and-forget: si Supabase
// está lento o caído, o si fn_registrar_auditoria falla del lado del
// servidor, el flujo de negocio que llamó a este servicio no se debe
// ver afectado. Por eso no se expone ningún valor de retorno útil.
export const auditService = {
    // Genera un correlation_id para agrupar varios eventos de una
    // misma operación de negocio (ej. factura creada + resultado SRI).
    nuevaCorrelacion(): string {
        return crypto.randomUUID()
    },

    async logEvent(input: LogEventInput): Promise<void> {
        try {
            const { error } = await supabase.rpc('fn_registrar_auditoria', {
                p_empresa_id: input.empresaId,
                p_correlation_id: input.correlationId ?? crypto.randomUUID(),
                p_modulo: input.modulo,
                p_accion: input.accion,
                p_entidad: input.entidad,
                p_entidad_id: input.entidadId ?? null,
                p_tipo_documento: input.tipoDocumento ?? null,
                p_numero_documento: input.numeroDocumento ?? null,
                p_sucursal_id: input.sucursalId ?? null,
                p_serie: input.serie ?? null,
                p_bodega_id: input.bodegaId ?? null,
                p_resumen: input.resumen,
                p_detalle: input.detalle ?? null,
                p_cambios: input.cambios ?? null,
                p_estado: input.estado ?? 'exitoso',
                p_error_mensaje: input.errorMensaje ?? null,
                p_nivel: input.nivel ?? 'operativo',
                p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            })
            if (error) throw error
        } catch (e) {
            console.error('[auditoria] no se pudo registrar el evento (no bloqueante):', e)
        }
    },
}
