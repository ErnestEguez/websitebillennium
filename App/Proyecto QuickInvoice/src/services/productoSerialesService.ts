// ============================================================
// Series de artículos (número de serie por unidad vendida) — tabla
// facturacion.producto_seriales. Solo aplica a ventas a crédito de
// electrodomésticos: el serial se digita opcionalmente por línea en
// Nueva Factura, se guarda en comprobante_detalles.serial (fuente de
// verdad) y se replica aquí para el candado anti-doble-venta y el
// historial (ej. "Serie del Artículo" en el Contrato impreso).
// ============================================================
import { supabase } from '../lib/supabase'

export interface ProductoSerial {
    id: string
    empresa_id: string
    producto_id: string
    serial: string
    estado: 'vendido' | 'devuelto'
    comprobante_id: string | null
    comprobante_detalle_id: string | null
    credito_id: string | null
    created_at: string
}

export const productoSerialesService = {
    /**
     * Replica hacia producto_seriales las líneas de comprobante_detalles de
     * esta factura que sí traen serial — se llama DESPUÉS de grabar la
     * factura (necesita el id real de cada línea). Si dos ventas intentan
     * registrar el mismo serial, el índice único de la tabla rechaza la
     * segunda — el caller decide qué avisar, esta función no lo oculta.
     */
    async registrarSerialesDeFactura(empresaId: string, facturaId: string): Promise<void> {
        const { data: detalles, error: errDet } = await supabase
            .from('comprobante_detalles')
            .select('id, producto_id, serial')
            .eq('comprobante_id', facturaId)
            .not('serial', 'is', null)
        if (errDet) throw errDet

        const conSerial = (detalles ?? []).filter((d: any) => d.serial && d.producto_id) as { id: string; producto_id: string; serial: string }[]
        if (conSerial.length === 0) return

        const filas = conSerial.map(d => ({
            empresa_id: empresaId,
            producto_id: d.producto_id,
            serial: d.serial,
            estado: 'vendido',
            comprobante_id: facturaId,
            comprobante_detalle_id: d.id,
        }))

        const { error } = await supabase.from('producto_seriales').insert(filas)
        if (error) throw error
    },
}
