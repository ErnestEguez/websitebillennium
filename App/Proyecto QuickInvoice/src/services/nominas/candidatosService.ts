import { supabase } from '../../lib/supabase'
import type { Candidato, CandidatoEvento, EtapaCandidato } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const candidatosService = {

    // ─── Candidatos ──────────────────────────────────────────────────────────

    async listarPorVacante(vacanteId: string): Promise<Candidato[]> {
        const { data, error } = await nominas()
            .from('candidatos')
            .select('*')
            .eq('vacante_id', vacanteId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return (data ?? []) as Candidato[]
    },

    async crear(c: Omit<Candidato, 'id' | 'created_at' | 'updated_at' | 'eventos'>): Promise<Candidato> {
        const { data, error } = await nominas()
            .from('candidatos')
            .insert(c)
            .select()
            .single()
        if (error) throw error
        return data as Candidato
    },

    async actualizar(id: string, campos: Partial<Omit<Candidato, 'eventos'>>): Promise<Candidato> {
        const { data, error } = await nominas()
            .from('candidatos')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as Candidato
    },

    async cambiarEtapa(id: string, etapa: EtapaCandidato): Promise<void> {
        const { error } = await nominas()
            .from('candidatos')
            .update({ etapa })
            .eq('id', id)
        if (error) throw error
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('candidatos')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    // ─── Eventos por candidato ───────────────────────────────────────────────

    async listarEventos(candidatoId: string): Promise<CandidatoEvento[]> {
        const { data, error } = await nominas()
            .from('candidato_eventos')
            .select('*')
            .eq('candidato_id', candidatoId)
            .order('fecha', { ascending: false })
        if (error) throw error
        return (data ?? []) as CandidatoEvento[]
    },

    async crearEvento(e: Omit<CandidatoEvento, 'id' | 'created_at'>): Promise<CandidatoEvento> {
        const { data, error } = await nominas()
            .from('candidato_eventos')
            .insert(e)
            .select()
            .single()
        if (error) throw error
        return data as CandidatoEvento
    },

    async eliminarEvento(id: string): Promise<void> {
        const { error } = await nominas()
            .from('candidato_eventos')
            .delete()
            .eq('id', id)
        if (error) throw error
    },
}
