import { supabase } from '../../lib/supabase'
import type { SeccionNomina, CargoNomina } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const estructuraOrganizativaService = {

    // ── Secciones (departamentos) ────────────────────────────────

    async listarSecciones(empresaId: string): Promise<SeccionNomina[]> {
        const { data, error } = await nominas()
            .from('secciones')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('nombre')
        if (error) throw error
        return data as SeccionNomina[]
    },

    async listarSeccionesTodas(empresaId: string): Promise<SeccionNomina[]> {
        const { data, error } = await nominas()
            .from('secciones')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre')
        if (error) throw error
        return data as SeccionNomina[]
    },

    async crearSeccion(seccion: Omit<SeccionNomina, 'id' | 'created_at' | 'updated_at' | 'activo'>): Promise<SeccionNomina> {
        const { data, error } = await nominas()
            .from('secciones')
            .insert(seccion)
            .select()
            .single()
        if (error) throw error
        return data as SeccionNomina
    },

    async actualizarSeccion(id: string, campos: Partial<SeccionNomina>): Promise<SeccionNomina> {
        const { data, error } = await nominas()
            .from('secciones')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as SeccionNomina
    },

    async desactivarSeccion(id: string): Promise<void> {
        const { error } = await nominas()
            .from('secciones')
            .update({ activo: false })
            .eq('id', id)
        if (error) throw error
    },

    // ── Cargos (puestos) ──────────────────────────────────────────

    async listarCargos(empresaId: string): Promise<CargoNomina[]> {
        const { data, error } = await nominas()
            .from('cargos')
            .select('*, seccion:secciones(nombre)')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('nombre')
        if (error) throw error
        return data as unknown as CargoNomina[]
    },

    async listarCargosTodas(empresaId: string): Promise<CargoNomina[]> {
        const { data, error } = await nominas()
            .from('cargos')
            .select('*, seccion:secciones(nombre)')
            .eq('empresa_id', empresaId)
            .order('nombre')
        if (error) throw error
        return data as unknown as CargoNomina[]
    },

    async crearCargo(cargo: Omit<CargoNomina, 'id' | 'created_at' | 'updated_at' | 'activo' | 'seccion'>): Promise<CargoNomina> {
        const { data, error } = await nominas()
            .from('cargos')
            .insert(cargo)
            .select()
            .single()
        if (error) throw error
        return data as CargoNomina
    },

    async actualizarCargo(id: string, campos: Partial<Omit<CargoNomina, 'seccion'>>): Promise<CargoNomina> {
        const { data, error } = await nominas()
            .from('cargos')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as CargoNomina
    },

    async desactivarCargo(id: string): Promise<void> {
        const { error } = await nominas()
            .from('cargos')
            .update({ activo: false })
            .eq('id', id)
        if (error) throw error
    },
}
