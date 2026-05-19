import { supabase } from '../lib/supabase'

export interface IngresoStock {
    id: string
    empresa_id: string
    proveedor_id?: string
    numero_factura?: string
    fecha_ingreso: string
    observaciones?: string
    total: number
    created_by?: string
    created_at?: string
}

export interface DetalleIngresoStock {
    id?: string
    ingreso_id: string
    producto_id: string
    cantidad: number
    costo_unitario: number
    subtotal?: number
}

export interface IngresoConDetalles extends IngresoStock {
    detalles: DetalleIngresoStock[]
    proveedor?: {
        nombre_empresa: string
    }
}

export const inventarioService = {
    async getIngresosByEmpresa(empresaId: string): Promise<any[]> {
        const { data, error } = await supabase
            .from('ingresos_stock')
            .select(`
                *,
                proveedor:proveedores(nombre_empresa)
            `)
            .eq('empresa_id', empresaId)
            .order('fecha_ingreso', { ascending: false })

        if (error) throw error
        return (data || []) as any[]
    },

    async getDetalleIngreso(ingresoId: string): Promise<DetalleIngresoStock[]> {
        const { data, error } = await supabase
            .from('detalle_ingresos_stock')
            .select(`
                *,
                producto:productos(nombre)
            `)
            .eq('ingreso_id', ingresoId)

        if (error) throw error
        return data || []
    },

    async createIngreso(
        ingreso: Partial<IngresoStock>,
        detalles: Omit<DetalleIngresoStock, 'ingreso_id'>[]
    ): Promise<IngresoStock> {
        // Calcular total
        const total = detalles.reduce((sum, det) => sum + (det.cantidad * det.costo_unitario), 0)

        // Insertar cabecera
        const { data: ingresoData, error: ingresoError } = await supabase
            .from('ingresos_stock')
            .insert({
                ...ingreso,
                total,
                created_at: new Date().toISOString()
            })
            .select()
            .single()

        if (ingresoError) throw ingresoError

        // Insertar detalles
        const detallesConIngreso = detalles.map(det => ({
            ...det,
            ingreso_id: ingresoData.id
        }))

        const { error: detallesError } = await supabase
            .from('detalle_ingresos_stock')
            .insert(detallesConIngreso)

        if (detallesError) throw detallesError

        return ingresoData
    },

    async getStockByEmpresa(empresaId: string) {
        const { data, error } = await supabase
            .from('productos')
            .select('id, nombre, stock, costo_promedio, maneja_stock')
            .eq('empresa_id', empresaId)
            .eq('maneja_stock', true)
            .order('nombre')

        if (error) throw error
        return data || []
    }
}
