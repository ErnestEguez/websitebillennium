import { supabase } from '../lib/supabase'
import { kardexService } from './kardexService'

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
    iva_porcentaje?: number
    iva_valor?: number
    subtotal?: number
}

export interface IngresoConDetalles extends IngresoStock {
    detalles: DetalleIngresoStock[]
    proveedor?: { nombre_empresa: string }
}

export const inventarioService = {
    async getIngresosByEmpresa(empresaId: string): Promise<any[]> {
        const { data, error } = await supabase
            .from('ingresos_stock')
            .select('*, proveedor:proveedores(nombre_empresa)')
            .eq('empresa_id', empresaId)
            .order('fecha_ingreso', { ascending: false })
        if (error) throw error
        return (data || []) as any[]
    },

    async getDetalleIngreso(ingresoId: string): Promise<DetalleIngresoStock[]> {
        const { data, error } = await supabase
            .from('detalle_ingresos_stock')
            .select('*, producto:productos(nombre)')
            .eq('ingreso_id', ingresoId)
        if (error) throw error
        return data || []
    },

    async createIngreso(
        ingreso: Partial<IngresoStock>,
        detalles: Omit<DetalleIngresoStock, 'ingreso_id'>[]
    ): Promise<IngresoStock> {
        const subtotal  = detalles.reduce((sum, d) => sum + d.cantidad * d.costo_unitario, 0)
        const valor_iva = detalles.reduce((sum, d) => {
            const pct = d.iva_porcentaje ?? 0
            return sum + Math.round(d.cantidad * d.costo_unitario * pct) / 100
        }, 0)
        const total = Math.round((subtotal + valor_iva) * 100) / 100

        // 1. Cabecera
        const { data: ingresoData, error: ingresoError } = await supabase
            .from('ingresos_stock')
            .insert({
                ...ingreso,
                subtotal,
                valor_iva,
                total,
                tipo_compra: 'INVENTARIO',
                forma_pago:  'CONTADO',
                estado:      'ACTIVO',
                created_at:  new Date().toISOString(),
            })
            .select()
            .single()
        if (ingresoError) throw ingresoError

        // 2. Detalles
        const detallesConIngreso = detalles.map(d => {
            const sub = d.cantidad * d.costo_unitario
            const iva = Math.round(sub * (d.iva_porcentaje ?? 0)) / 100
            return {
                ...d,
                ingreso_id: ingresoData.id,
                subtotal:       sub,
                iva_porcentaje: d.iva_porcentaje ?? 0,
                iva_valor:      iva,
            }
        })
        const { error: detallesError } = await supabase
            .from('detalle_ingresos_stock')
            .insert(detallesConIngreso)
        if (detallesError) throw detallesError

        // 3. ✅ Kardex: registrar ENTRADA por cada producto comprado
        for (const d of detalles) {
            try {
                await kardexService.registrarMovimiento({
                    empresa_id: ingreso.empresa_id!,
                    producto_id: d.producto_id,
                    tipo_movimiento: 'ENTRADA',
                    motivo: `Compra - Factura ${ingreso.numero_factura || 'S/N'}`,
                    documento_referencia: ingresoData.id,
                    cantidad: d.cantidad,
                    costo_unitario: d.costo_unitario,
                    fecha: ingreso.fecha_ingreso
                        ? new Date(ingreso.fecha_ingreso).toISOString()
                        : new Date().toISOString()
                })
            } catch (kardexErr) {
                // Loguear sin revertir toda la compra
                console.error('Error kardex producto', d.producto_id, kardexErr)
            }
        }

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
