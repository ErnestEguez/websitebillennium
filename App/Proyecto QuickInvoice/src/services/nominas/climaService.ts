import { supabase } from '../../lib/supabase'
import type { EncuestaClima, RespuestaClima, PromediosClima } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const climaService = {

    async listarEncuestas(empresaId: string): Promise<EncuestaClima[]> {
        const { data, error } = await nominas()
            .from('encuestas_clima')
            .select('*, respuestas_count:respuestas_clima(count)')
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })
        if (error) throw error
        return ((data ?? []) as any[]).map((e: any) => ({
            ...e,
            respuestas_count: e.respuestas_count?.[0]?.count ?? 0,
        })) as EncuestaClima[]
    },

    async crearEncuesta(e: Omit<EncuestaClima, 'id' | 'created_at' | 'updated_at' | 'respuestas_count' | 'promedio_general'>): Promise<EncuestaClima> {
        const { data, error } = await nominas()
            .from('encuestas_clima')
            .insert(e)
            .select()
            .single()
        if (error) throw error
        return data as EncuestaClima
    },

    async actualizarEncuesta(id: string, campos: Partial<EncuestaClima>): Promise<EncuestaClima> {
        const { data, error } = await nominas()
            .from('encuestas_clima')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as EncuestaClima
    },

    async cerrarEncuesta(id: string): Promise<void> {
        const { error } = await nominas()
            .from('encuestas_clima')
            .update({ estado: 'cerrada' })
            .eq('id', id)
        if (error) throw error
    },

    async listarRespuestas(encuestaId: string): Promise<RespuestaClima[]> {
        const { data, error } = await nominas()
            .from('respuestas_clima')
            .select('*, empleado:empleados(nombres, apellidos)')
            .eq('encuesta_id', encuestaId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return (data ?? []) as RespuestaClima[]
    },

    async crearRespuesta(r: Omit<RespuestaClima, 'id' | 'created_at' | 'empleado'>): Promise<RespuestaClima> {
        const { data, error } = await nominas()
            .from('respuestas_clima')
            .insert(r)
            .select()
            .single()
        if (error) throw error
        return data as RespuestaClima
    },

    async eliminarRespuesta(id: string): Promise<void> {
        const { error } = await nominas()
            .from('respuestas_clima')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    calcularPromedios(respuestas: RespuestaClima[]): PromediosClima | null {
        if (respuestas.length === 0) return null
        const avg = (field: keyof RespuestaClima) => {
            const vals = respuestas.map(r => r[field] as number | null).filter(v => v != null) as number[]
            return vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0
        }
        return {
            satisfaccion_general: avg('satisfaccion_general'),
            ambiente_trabajo:     avg('ambiente_trabajo'),
            liderazgo:            avg('liderazgo'),
            crecimiento:          avg('crecimiento'),
            comunicacion:         avg('comunicacion'),
            total_respuestas:     respuestas.length,
        }
    },

    // Promedio global de la encuesta más reciente para el dashboard
    async promedioReciente(empresaId: string): Promise<{ promedio: number; encuesta: string } | null> {
        const { data: enc } = await nominas()
            .from('encuestas_clima')
            .select('id, nombre')
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })
            .limit(1)
        if (!enc || enc.length === 0) return null

        const { data: resp } = await nominas()
            .from('respuestas_clima')
            .select('satisfaccion_general, ambiente_trabajo, liderazgo, crecimiento, comunicacion')
            .eq('encuesta_id', (enc[0] as any).id)
        if (!resp || resp.length === 0) return null

        const allVals: number[] = []
        for (const r of resp as any[]) {
            const dims = [r.satisfaccion_general, r.ambiente_trabajo, r.liderazgo, r.crecimiento, r.comunicacion]
            allVals.push(...dims.filter((v: any) => v != null))
        }
        const prom = allVals.length > 0 ? Math.round((allVals.reduce((s, v) => s + v, 0) / allVals.length) * 10) / 10 : 0
        return { promedio: prom, encuesta: (enc[0] as any).nombre }
    },
}
