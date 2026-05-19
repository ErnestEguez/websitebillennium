import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { supabasePortal } from '../lib/supabasePortal'

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
    password?: string
}

export const staffService = {
    // ── Mesero / Cocina ─────────────────────────────────────
    // Lee de restaurantes.staff (schema restaurantes)

    async getStaffByEmpresa(empresaId: string): Promise<StaffMember[]> {
        const { data, error } = await supabase
            .from('staff')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true })
        if (error) throw error
        return (data || []) as StaffMember[]
    },

    async createStaffMember(member: Partial<StaffMember>): Promise<StaffMember> {
        let userId = member.id

        // Crear usuario en Auth si se proporcionan credenciales
        if (member.email && (member as any).password) {
            const tempClient = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                { auth: { persistSession: false } }
            )
            const { data: authData, error: authError } = await tempClient.auth.signUp({
                email: member.email,
                password: (member as any).password,
                options: { data: { full_name: member.nombre } }
            })
            if (authError) throw authError
            if (authData.user) userId = authData.user.id
        }

        if (!userId) throw new Error('No se pudo obtener ID de usuario')

        const { data, error } = await supabase
            .from('staff')
            .insert({
                id:         userId,
                empresa_id: member.empresa_id,
                rol:        member.rol || 'mesero',
                nombre:     member.nombre,
                email:      member.email,
                pin:        member.pin,
                estado:     member.estado || 'activo',
            })
            .select()
            .single()

        if (error) throw error
        return data as StaffMember
    },

    async updateStaffMember(id: string, updates: Partial<StaffMember>): Promise<StaffMember> {
        const payload: Record<string, any> = {}
        if (updates.nombre      !== undefined) payload.nombre      = updates.nombre
        if (updates.rol         !== undefined) payload.rol         = updates.rol
        if (updates.empresa_id  !== undefined) payload.empresa_id  = updates.empresa_id
        if (updates.pin         !== undefined) payload.pin         = updates.pin
        if (updates.estado      !== undefined) payload.estado      = updates.estado
        if (updates.fecha_baja  !== undefined) payload.fecha_baja  = updates.fecha_baja
        if (updates.motivo_baja !== undefined) payload.motivo_baja = updates.motivo_baja

        const { data, error } = await supabase
            .from('staff')
            .update(payload)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as StaffMember
    },

    async deleteStaffMember(id: string): Promise<boolean> {
        const { error } = await supabase.from('staff').delete().eq('id', id)
        if (error) throw error
        return true
    },

    // ── Usuarios del Portal (para el formulario de asignación) ───
    // Lee de facturacion.profiles (supabasePortal)

    async getPortalUsers(): Promise<StaffMember[]> {
        const { data, error } = await supabasePortal
            .from('profiles')
            .select('id, nombre, email, rol, empresa_id')
            .neq('rol', 'admin_plataforma')
            .order('nombre')
        if (error) throw error
        return (data || []) as StaffMember[]
    },

    // Asigna un usuario del portal a una empresa (actualiza facturacion.profiles)
    async asignarUsuarioEmpresa(userId: string, empresaId: string): Promise<void> {
        const { error } = await supabasePortal
            .from('profiles')
            .update({ empresa_id: empresaId })
            .eq('id', userId)
        if (error) throw error
    },

    // Obtiene usuarios del portal con rol oficina
    async getOficinaUsers(): Promise<StaffMember[]> {
        const { data, error } = await supabasePortal
            .from('profiles')
            .select('id, nombre, email, rol, empresa_id')
            .eq('rol', 'oficina')
            .order('nombre')
        if (error) throw error
        return (data || []) as StaffMember[]
    },
}
