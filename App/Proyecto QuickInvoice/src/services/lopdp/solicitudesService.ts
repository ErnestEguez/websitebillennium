import { supabase } from '../../lib/supabase'
import type { SolicitudTitular } from '../../types/lopdp'
import { auditService } from '../auditoria/auditService'

const lopdp = () => supabase.schema('lopdp')

type CamposCreables = Omit<SolicitudTitular,
    'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'activo'
    | 'fecha_limite' | 'fecha_limite_prorroga' | 'fecha_limite_vigente' | 'fecha_alerta'
    | 'estado' | 'fecha_resolucion' | 'respuesta_titular' | 'prorroga_aplicada' | 'prorroga_motivo'>

type CamposEditables = Partial<Omit<SolicitudTitular,
    'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
    | 'fecha_limite' | 'fecha_limite_prorroga' | 'fecha_limite_vigente' | 'fecha_alerta'>>

export const solicitudesService = {

    // Actualización perezosa: no hay scheduler en este stack, así que cada
    // vez que se lista, primero se "cierran" en la BD las solicitudes que
    // ya vencieron sin resolver — el estado queda honesto apenas alguien mira.
    async actualizarVencidas(empresaId: string): Promise<void> {
        const hoy = new Date().toISOString().slice(0, 10)
        await lopdp()
            .from('solicitudes_titulares')
            .update({ estado: 'vencida_sin_resolver' })
            .eq('empresa_id', empresaId)
            .in('estado', ['pendiente', 'en_proceso'])
            .lt('fecha_limite_vigente', hoy)
    },

    async listar(empresaId: string): Promise<SolicitudTitular[]> {
        await this.actualizarVencidas(empresaId)
        const { data, error } = await lopdp()
            .from('solicitudes_titulares')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('fecha_limite_vigente')
        if (error) throw error
        return data as SolicitudTitular[]
    },

    async crear(solicitud: CamposCreables, userId: string): Promise<SolicitudTitular> {
        const { data, error } = await lopdp()
            .from('solicitudes_titulares')
            .insert({ ...solicitud, created_by: userId, updated_by: userId })
            .select()
            .single()
        if (error) throw error
        return data as SolicitudTitular
    },

    async actualizar(id: string, campos: CamposEditables, userId: string): Promise<SolicitudTitular> {
        const { data, error } = await lopdp()
            .from('solicitudes_titulares')
            .update({ ...campos, updated_by: userId })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as SolicitudTitular
    },

    // El trigger de la BD decide resuelta_a_tiempo vs. fuera_de_plazo
    // comparando fecha_resolucion contra fecha_limite_vigente — el cliente
    // solo informa que se resolvió y con qué respuesta.
    async marcarResuelta(id: string, respuestaTitular: string, userId: string, fechaResolucion?: string): Promise<SolicitudTitular> {
        const { data, error } = await lopdp()
            .from('solicitudes_titulares')
            .update({
                fecha_resolucion:  fechaResolucion ?? new Date().toISOString().slice(0, 10),
                respuesta_titular: respuestaTitular,
                estado: 'en_proceso', // valor provisional; el trigger lo reemplaza por el resultado real
                updated_by: userId,
            })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error

        auditService.logEvent({
            empresaId: (data as any).empresa_id,
            modulo: 'lopdp',
            accion: 'actualizar',
            entidad: 'solicitud_titular',
            entidadId: id,
            resumen: `Resolución de solicitud ${(data as any).tipo_solicitud} — ${(data as any).nombre_titular}`,
            detalle: { estado_resultante: (data as any).estado },
            nivel: 'compliance',
        })
        return data as SolicitudTitular
    },

    async aplicarProrroga(id: string, motivo: string, userId: string): Promise<SolicitudTitular> {
        const { data, error } = await lopdp()
            .from('solicitudes_titulares')
            .update({ prorroga_aplicada: true, prorroga_motivo: motivo, updated_by: userId })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as SolicitudTitular
    },

    async archivar(id: string, userId: string): Promise<void> {
        const { error } = await lopdp()
            .from('solicitudes_titulares')
            .update({ activo: false, updated_by: userId })
            .eq('id', id)
        if (error) throw error
    },

    // Portabilidad: cruce de solo lectura contra el schema core por
    // identificación del titular (sin FK formal — ver decisión de Fase 2).
    async buscarDatosCoreDelTitular(empresaId: string, identificacion: string) {
        if (!identificacion?.trim()) return { cliente: null, proveedor: null, empleado: null }

        const [{ data: cliente }, { data: proveedor }, { data: empleado }] = await Promise.all([
            supabase.from('clientes').select('*').eq('empresa_id', empresaId).eq('identificacion', identificacion).maybeSingle(),
            supabase.from('proveedores').select('*').eq('empresa_id', empresaId).eq('ruc', identificacion).maybeSingle(),
            supabase.schema('nominas').from('empleados').select('*').eq('empresa_id', empresaId).eq('cedula', identificacion).maybeSingle(),
        ])

        return { cliente: cliente ?? null, proveedor: proveedor ?? null, empleado: empleado ?? null }
    },
}
