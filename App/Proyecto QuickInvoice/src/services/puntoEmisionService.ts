import { supabase } from '../lib/supabase'
import type { PuntoEmision } from '../types/puntosEmision'
import { getPuntoEmisionDispositivo } from '../lib/dispositivoPuntoEmision'

export const puntoEmisionService = {

    async listar(empresaId: string): Promise<PuntoEmision[]> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('es_principal', { ascending: false })
            .order('establecimiento')
            .order('punto_emision')
        if (error) throw error
        return data as PuntoEmision[]
    },

    async listarTodas(empresaId: string): Promise<PuntoEmision[]> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('es_principal', { ascending: false })
            .order('establecimiento')
            .order('punto_emision')
        if (error) throw error
        return data as PuntoEmision[]
    },

    async obtener(id: string): Promise<PuntoEmision> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .select('*')
            .eq('id', id)
            .single()
        if (error) throw error
        return data as PuntoEmision
    },

    async getPrincipal(empresaId: string): Promise<PuntoEmision | null> {
        const { data } = await supabase
            .from('puntos_emision')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('es_principal', true)
            .eq('activo', true)
            .maybeSingle()
        return (data as PuntoEmision) ?? null
    },

    // Punto de emisión con el que factura ESTE dispositivo (asignación guardada
    // en localStorage desde Configuración). Si no hay asignación, o el punto
    // guardado ya no es válido/activo, usa el "Principal" de la empresa.
    async resolverParaDispositivo(empresaId: string): Promise<PuntoEmision | null> {
        const idDispositivo = getPuntoEmisionDispositivo(empresaId)
        if (idDispositivo) {
            const { data } = await supabase
                .from('puntos_emision')
                .select('*')
                .eq('id', idDispositivo)
                .eq('empresa_id', empresaId)
                .eq('activo', true)
                .maybeSingle()
            if (data) return data as PuntoEmision
        }
        return this.getPrincipal(empresaId)
    },

    async crear(puntoEmision: Omit<PuntoEmision, 'id' | 'created_at' | 'updated_at' | 'secuenciales'>): Promise<PuntoEmision> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .insert({ ...puntoEmision, secuenciales: {} })
            .select()
            .single()
        if (error) throw error
        return data as PuntoEmision
    },

    async actualizar(id: string, campos: Partial<PuntoEmision>): Promise<PuntoEmision> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .update({ ...campos, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as PuntoEmision
    },

    async desactivar(id: string): Promise<void> {
        const { error } = await supabase
            .from('puntos_emision')
            .update({ activo: false, updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },

    // Siguiente secuencial atómico (FOR UPDATE en Postgres) para un punto de emisión + tipo de comprobante.
    async siguienteSecuencial(puntoEmisionId: string, tipoComprobante: string = 'FACTURA'): Promise<number> {
        const { data, error } = await supabase
            .rpc('qi_next_secuencial_punto', { p_punto_emision_id: puntoEmisionId, p_tipo_comprobante: tipoComprobante })
        if (error) throw error
        return data as number
    },
}
