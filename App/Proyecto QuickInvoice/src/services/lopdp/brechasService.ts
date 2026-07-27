import { supabase } from '../../lib/supabase'
import type { BrechaSeguridad, SeveridadBrecha } from '../../types/lopdp'

const lopdp = () => supabase.schema('lopdp')

type CamposCreables = Omit<BrechaSeguridad,
    'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'activo'
    | 'plazo_spdp' | 'plazo_titulares' | 'fecha_notificacion_spdp' | 'estado_spdp'
    | 'fecha_notificacion_titulares' | 'estado_titulares'>

type CamposEditables = Partial<Omit<BrechaSeguridad,
    'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
    | 'plazo_spdp' | 'plazo_titulares'>>

const hoy = () => new Date().toISOString().slice(0, 10)

export const brechasService = {

    // Misma actualización perezosa que solicitudes_titulares — se corre
    // al listar porque esta pantalla no siempre pasa por el dashboard.
    async actualizarVencidas(empresaId: string): Promise<void> {
        const fecha = hoy()
        await lopdp()
            .from('brechas_seguridad')
            .update({ estado_spdp: 'vencida_sin_resolver' })
            .eq('empresa_id', empresaId)
            .in('estado_spdp', ['pendiente', 'en_proceso'])
            .lt('plazo_spdp', fecha)

        await lopdp()
            .from('brechas_seguridad')
            .update({ estado_titulares: 'vencida_sin_resolver' })
            .eq('empresa_id', empresaId)
            .eq('severidad', 'alto')
            .in('estado_titulares', ['pendiente', 'en_proceso'])
            .lt('plazo_titulares', fecha)
    },

    async listar(empresaId: string): Promise<BrechaSeguridad[]> {
        await this.actualizarVencidas(empresaId)
        const { data, error } = await lopdp()
            .from('brechas_seguridad')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('plazo_spdp')
        if (error) throw error
        return data as BrechaSeguridad[]
    },

    async crear(brecha: CamposCreables, userId: string): Promise<BrechaSeguridad> {
        const { data, error } = await lopdp()
            .from('brechas_seguridad')
            .insert({ ...brecha, created_by: userId, updated_by: userId })
            .select()
            .single()
        if (error) throw error
        return data as BrechaSeguridad
    },

    async actualizar(id: string, campos: CamposEditables, userId: string): Promise<BrechaSeguridad> {
        const { data, error } = await lopdp()
            .from('brechas_seguridad')
            .update({ ...campos, updated_by: userId })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as BrechaSeguridad
    },

    // El trigger de la BD decide a_tiempo/fuera_de_plazo — igual que en
    // solicitudesService.marcarResuelta().
    async marcarNotificadoSpdp(id: string, userId: string, plantilla?: string, fecha?: string): Promise<BrechaSeguridad> {
        const { data, error } = await lopdp()
            .from('brechas_seguridad')
            .update({
                fecha_notificacion_spdp: fecha ?? hoy(), estado_spdp: 'en_proceso',
                ...(plantilla !== undefined ? { plantilla_notificacion: plantilla } : {}),
                updated_by: userId,
            })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as BrechaSeguridad
    },

    async marcarNotificadoTitulares(id: string, userId: string, plantilla?: string, fecha?: string): Promise<BrechaSeguridad> {
        const { data, error } = await lopdp()
            .from('brechas_seguridad')
            .update({
                fecha_notificacion_titulares: fecha ?? hoy(), estado_titulares: 'en_proceso',
                ...(plantilla !== undefined ? { plantilla_notificacion: plantilla } : {}),
                updated_by: userId,
            })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as BrechaSeguridad
    },

    async archivar(id: string, userId: string): Promise<void> {
        const { error } = await lopdp()
            .from('brechas_seguridad')
            .update({ activo: false, updated_by: userId })
            .eq('id', id)
        if (error) throw error
    },
}

// Sugerencia de texto para la notificación — el usuario la edita antes de
// usarla. No es un envío automático, solo evita empezar de cero.
export function generarPlantillaNotificacion(params: {
    empresaNombre: string
    descripcion: string
    fechaDeteccion: string
    alcanceEstimado?: number | null
    severidad: SeveridadBrecha
}): string {
    const { empresaNombre, descripcion, fechaDeteccion, alcanceEstimado, severidad } = params
    return `Notificación de incidente de seguridad de datos personales

Responsable del tratamiento: ${empresaNombre}
Fecha de detección: ${fechaDeteccion}
Nivel de riesgo: ${severidad.toUpperCase()}

Descripción del incidente:
${descripcion}

Categorías y número aproximado de titulares afectados:
${alcanceEstimado ? `Aproximadamente ${alcanceEstimado} titular(es).` : '[completar estimación]'}

Consecuencias probables:
[describir el impacto esperado para los titulares]

Medidas adoptadas o propuestas para remediar el incidente:
[describir las medidas tomadas]

Datos de contacto para más información:
[nombre y contacto del responsable o DPD]`
}
