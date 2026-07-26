import { supabase } from '../../lib/supabase'
import type {
    PoliticaPrivacidad, PoliticaPrivacidadVersion, PoliticaPrivacidadPublica,
} from '../../types/lopdp'

const lopdp = () => supabase.schema('lopdp')

type CamposEditables = Partial<Omit<PoliticaPrivacidad,
    'empresa_id' | 'slug' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>>

export const politicaPrivacidadService = {

    async obtener(empresaId: string): Promise<PoliticaPrivacidad | null> {
        const { data, error } = await lopdp()
            .from('politicas_privacidad')
            .select('*')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        if (error) throw error
        return data as PoliticaPrivacidad | null
    },

    // Upsert manual: crea la fila la primera vez, luego solo actualiza.
    // El slug nunca se envía aquí — lo genera la BD una sola vez al crear.
    async guardar(empresaId: string, campos: CamposEditables, userId: string): Promise<PoliticaPrivacidad> {
        const existente = await this.obtener(empresaId)

        if (existente) {
            const { data, error } = await lopdp()
                .from('politicas_privacidad')
                .update({ ...campos, updated_by: userId })
                .eq('empresa_id', empresaId)
                .select()
                .single()
            if (error) throw error
            return data as PoliticaPrivacidad
        }

        const { data, error } = await lopdp()
            .from('politicas_privacidad')
            .insert({ ...campos, empresa_id: empresaId, created_by: userId, updated_by: userId })
            .select()
            .single()
        if (error) throw error
        return data as PoliticaPrivacidad
    },

    // El trigger de la BD arma el snapshot inmutable — el frontend solo dispara la acción.
    async publicar(empresaId: string, userId: string): Promise<PoliticaPrivacidadVersion> {
        const { data, error } = await lopdp().rpc('publicar_politica_privacidad', {
            p_empresa_id: empresaId,
            p_user_id: userId,
        })
        if (error) throw error
        return data as PoliticaPrivacidadVersion
    },

    async listarVersiones(empresaId: string): Promise<PoliticaPrivacidadVersion[]> {
        const { data, error } = await lopdp()
            .from('politicas_privacidad_versiones')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('numero_version', { ascending: false })
        if (error) throw error
        return data as PoliticaPrivacidadVersion[]
    },

    // Público — sin autenticación. Columnas explícitas, coincide 1:1 con el
    // GRANT de columnas otorgado a `anon` en la migración (nunca pedir `*`
    // aquí: si se agrega una columna interna nueva a la tabla más adelante,
    // este `select` explícito evita exponerla por accidente).
    async obtenerPublicaPorSlug(slug: string): Promise<PoliticaPrivacidadPublica | null> {
        const { data, error } = await lopdp()
            .from('politicas_privacidad_versiones')
            .select('empresa_id, slug, numero_version, fecha_publicacion, contenido')
            .eq('slug', slug)
            .order('numero_version', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (error) throw error
        return data as PoliticaPrivacidadPublica | null
    },
}
