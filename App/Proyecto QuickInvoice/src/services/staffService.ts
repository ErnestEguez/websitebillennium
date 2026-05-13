import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface StaffMember {
    id: string
    nombre: string
    rol: 'oficina' | 'mesero' | 'cocina' | 'admin_plataforma'
    empresa_id: string
    email?: string
    pin?: string
    estado?: 'activo' | 'baja'
    fecha_baja?: string
    motivo_baja?: string
    password?: string // Temporary field for creation
}

export const staffService = {
    async getStaffByEmpresa(empresaId: string) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true })

        if (error) throw error
        return data as StaffMember[]
    },

    async createStaffMember(member: Partial<StaffMember>) {
        // 1. Create Auth User if email and password are provided
        if (member.email && member.password) {
            // Create a temporary client WITHOUT session persistence to avoid logging out the current admin
            const tempSupabase = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                { auth: { persistSession: false } }
            )

            const { data: authData, error: authError } = await tempSupabase.auth.signUp({
                email: member.email,
                password: member.password,
                options: {
                    data: {
                        empresa_id: member.empresa_id,
                        rol: member.rol,
                        nombre: member.nombre
                    }
                }
            })

            if (authError) throw authError

            // Use the new user's ID for the profile record
            if (authData.user) {
                member.id = authData.user.id
            }
        }

        // Remove password before saving to profiles table
        const profileData = { ...member }
        delete profileData.password

        const { data, error } = await supabase
            .from('profiles')
            .insert(profileData)
            .select()
            .single()

        if (error) throw error
        return data as StaffMember
    },

    async updateStaffMember(id: string, updates: Partial<StaffMember>) {
        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as StaffMember
    },

    async deleteStaffMember(id: string) {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id)

        if (error) throw error
        return true
    }
}
