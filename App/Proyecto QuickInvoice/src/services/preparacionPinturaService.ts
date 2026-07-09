import { supabase } from '../lib/supabase'
import { kardexService } from './kardexService'

export type EstadoPrep = 'PENDIENTE' | 'PROFORMADA' | 'FACTURADA' | 'ANULADA'
export type TipoInsumo = 'BASE' | 'MEZCLA'

export interface PreparacionInsumo {
    id?: string
    preparacion_id?: string
    tipo: TipoInsumo
    producto_id: string
    descripcion?: string | null
    cantidad: number
    unidad: string
    costo_unitario: number
    costo_total: number
    producto?: {
        nombre: string
        codigo: string
        costo_promedio: number
        iva_porcentaje: number
        stock: number
    }
}

export interface PreparacionPintura {
    id: string
    empresa_id: string
    fecha: string
    descripcion: string
    cantidad_producida: number
    unidad: string
    costo_total: number
    iva_porcentaje: number
    precio_con_iva?: number | null
    precio_sin_iva?: number | null
    iva_valor?: number | null
    codigo_producto: string
    comprobante_id?: string | null
    proforma_id?: string | null
    estado: EstadoPrep
    created_by?: string | null
    created_at: string
    insumos?: PreparacionInsumo[]
}

export interface PreparacionInput {
    empresa_id: string
    descripcion: string
    cantidad_producida: number
    unidad: string
    costo_total: number
    iva_porcentaje: number
    precio_con_iva: number
    precio_sin_iva: number
    iva_valor: number
    codigo_producto: string
    created_by?: string | null
    insumos: Omit<PreparacionInsumo, 'id' | 'preparacion_id' | 'producto'>[]
}

export const preparacionPinturaService = {

    async crear(input: PreparacionInput): Promise<PreparacionPintura> {
        const { insumos, ...cabecera } = input

        const { data: prep, error } = await supabase
            .from('preparaciones_pintura')
            .insert({ ...cabecera, estado: 'PENDIENTE' })
            .select()
            .single()
        if (error) throw error

        if (insumos.length > 0) {
            const { error: errIns } = await supabase
                .from('preparacion_insumos')
                .insert(insumos.map(i => ({ ...i, preparacion_id: (prep as PreparacionPintura).id })))
            if (errIns) throw errIns
        }

        // Registrar salidas de kardex para cada insumo
        for (const ins of insumos) {
            try {
                await kardexService.registrarMovimiento({
                    empresa_id: input.empresa_id,
                    producto_id: ins.producto_id,
                    tipo_movimiento: 'SALIDA',
                    motivo: `Prep. Pintura: ${input.descripcion.substring(0, 60)}`,
                    documento_referencia: (prep as PreparacionPintura).id,
                    cantidad: ins.cantidad,
                    costo_unitario: ins.costo_unitario,
                    fecha: new Date().toISOString(),
                })
            } catch (e) {
                console.error('Error registrando kardex para insumo:', ins.producto_id, e)
            }
        }

        return prep as PreparacionPintura
    },

    async listar(empresaId: string): Promise<PreparacionPintura[]> {
        const { data, error } = await supabase
            .from('preparaciones_pintura')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })
            .limit(200)
        if (error) throw error
        return (data || []) as PreparacionPintura[]
    },

    async getCompleta(id: string): Promise<PreparacionPintura> {
        const { data, error } = await supabase
            .from('preparaciones_pintura')
            .select('*, insumos:preparacion_insumos(*, producto:productos(nombre, codigo, costo_promedio, iva_porcentaje, stock))')
            .eq('id', id)
            .single()
        if (error) throw error
        return data as PreparacionPintura
    },

    async anular(id: string, empresaId: string): Promise<void> {
        const prep = await this.getCompleta(id)
        if (prep.estado === 'ANULADA') return

        const { error } = await supabase
            .from('preparaciones_pintura')
            .update({ estado: 'ANULADA' })
            .eq('id', id)
        if (error) throw error

        // Revertir salidas de kardex
        for (const ins of (prep.insumos || [])) {
            try {
                await kardexService.registrarMovimiento({
                    empresa_id: empresaId,
                    producto_id: ins.producto_id,
                    tipo_movimiento: 'ENTRADA',
                    motivo: `Anulación Prep. Pintura: ${prep.descripcion.substring(0, 50)}`,
                    documento_referencia: id,
                    cantidad: ins.cantidad,
                    costo_unitario: ins.costo_unitario,
                    fecha: new Date().toISOString(),
                })
            } catch (e) {
                console.error('Error revirtiendo kardex:', e)
            }
        }
    },

    async vincularComprobante(id: string, comprobanteId: string): Promise<void> {
        const { error } = await supabase
            .from('preparaciones_pintura')
            .update({ comprobante_id: comprobanteId, estado: 'FACTURADA' })
            .eq('id', id)
        if (error) throw error
    },

    async vincularProforma(id: string, proformaId: string): Promise<void> {
        const { error } = await supabase
            .from('preparaciones_pintura')
            .update({ proforma_id: proformaId, estado: 'PROFORMADA' })
            .eq('id', id)
        if (error) throw error
    },
}
