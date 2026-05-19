import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { supabasePortal } from '../lib/supabasePortal'
import { supabasePublic } from '../lib/supabasePublic'

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

    // ── Usuarios del Portal para dropdown ────────────────────
    // Lee de public.users (tabla del portal — todos los usuarios registrados)

    async getPortalUsers(): Promise<StaffMember[]> {
        const { data, error } = await supabasePublic
            .from('users')
            .select('id, name, email, role, company_name')
            .eq('is_active', true)
            .neq('role', 'admin')
            .order('name')
        if (error) throw error
        return (data || []).map((u: any) => ({
            id:         u.id,
            nombre:     u.name || u.email,
            email:      u.email,
            rol:        'oficina' as const,
            empresa_id: '',
        }))
    },

    // Asigna usuario del portal a empresa usando RPC dar_acceso_portal
    // Crea/actualiza el registro en facturacion.profiles
    async asignarUsuarioEmpresa(userId: string, empresaId: string): Promise<void> {
        // Obtener email y nombre desde public.users
        const { data: userData, error: userErr } = await supabasePublic
            .from('users')
            .select('email, name')
            .eq('id', userId)
            .single()
        if (userErr || !userData) throw new Error('Usuario no encontrado en el portal')

        // Llamar RPC dar_acceso_portal (igual que QuickInvoice)
        const { data: result, error: rpcErr } = await supabasePortal.rpc('dar_acceso_portal', {
            p_email:      userData.email.trim().toLowerCase(),
            p_empresa_id: empresaId,
            p_nombre:     userData.name || userData.email,
            p_rol:        'oficina',
        })
        if (rpcErr) throw rpcErr
        if (result && !result.ok) throw new Error(result.error || 'Error al asignar usuario')
    },

    // Usuarios ya asignados: lee de facturacion.profiles (oficina)
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
