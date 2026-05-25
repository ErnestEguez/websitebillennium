import { supabase } from '../lib/supabase'
import type { AnticipoProveedor } from '../types/finance'

const ANTICIPO_SELECT = `
    *,
    cuenta_bancaria:cuentas_bancarias(numero_cuenta, banco:bancos(nombre))
`

export const anticipoService = {
    async listar(empresaId: string, proveedorId?: string): Promise<AnticipoProveedor[]> {
        let q = supabase
            .from('anticipos_proveedores')
            .select(ANTICIPO_SELECT)
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })

        if (proveedorId) q = q.eq('proveedor_id', proveedorId)

        const { data, error } = await q
        if (error) throw error
        return data as AnticipoProveedor[]
    },

    async listarDisponibles(empresaId: string, proveedorId: string): Promise<AnticipoProveedor[]> {
        const { data, error } = await supabase
            .from('anticipos_proveedores')
            .select(ANTICIPO_SELECT)
            .eq('empresa_id', empresaId)
            .eq('proveedor_id', proveedorId)
            .in('estado', ['disponible', 'aplicado_parcial'])
            .order('fecha')
        if (error) throw error
        return data as AnticipoProveedor[]
    },

    async crear(anticipo: Omit<AnticipoProveedor, 'id' | 'monto_aplicado' | 'estado' | 'created_at' | 'updated_at' | 'proveedor' | 'cuenta_bancaria'>): Promise<AnticipoProveedor> {
        const payload = { ...anticipo, monto_aplicado: 0, estado: 'disponible' }
        const { data, error } = await supabase
            .from('anticipos_proveedores').insert(payload).select().single()
        if (error) throw error

        // Registrar movimiento bancario si tiene cuenta
        if (anticipo.cuenta_bancaria_id) {
            await supabase.from('movimientos_bancarios').insert({
                empresa_id:        anticipo.empresa_id,
                cuenta_bancaria_id: anticipo.cuenta_bancaria_id,
                tipo:              'otro',
                fecha:             anticipo.fecha,
                monto:             anticipo.monto,
                sentido:           'debito',
                referencia:        anticipo.referencia,
                descripcion:       `Anticipo proveedor — ${anticipo.concepto || ''}`,
                origen:            'anticipo',
                origen_id:         (data as AnticipoProveedor).id,
                created_by:        anticipo.created_by,
            })
        }

        return data as AnticipoProveedor
    },

    async anular(id: string): Promise<void> {
        const { error } = await supabase
            .from('anticipos_proveedores')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },
}
