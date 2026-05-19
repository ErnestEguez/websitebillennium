import { supabase } from '../lib/supabase'
import { sriService } from './sriService'
import { kardexService } from './kardexService'
// Nota: emailService ya no se usa directamente aquí.
// El correo se envía desde la Edge Function sri-signer vía Resend.

export interface Cliente {
    id: string
    empresa_id: string
    identificacion: string
    nombre: string
    email: string
    direccion: string
    telefono?: string
}

export interface SriConfig {
    ambiente: 'PRUEBAS' | 'PRODUCCION'
    establecimiento: string // 3 digits
    punto_emision: string    // 3 digits
    secuencial_inicio: number
    firma_url: string | null   // URL pública (legacy)
    firma_path: string | null  // Path en Storage (usado por Edge Function sri-signer)
    firma_password?: string
    mail_host?: string
    mail_port?: number
    mail_user?: string
    mail_pass?: string
    obligado_contabilidad?: 'SI' | 'NO'
    regimen_rimpe?: boolean
}

export const facturacionService = {
    async getClientes(empresaId: string) {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true })

        if (error) throw error
        return data as Cliente[]
    },

    async getConsumidorFinal(empresaId: string) {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('identificacion', '9999999999999')
            .single()

        if (error) throw error
        return data as Cliente
    },

    async createCliente(cliente: Partial<Cliente>) {
        const { data, error } = await supabase
            .from('clientes')
            .insert(cliente)
            .select()
            .single()

        if (error) throw error
        return data as Cliente
    },

    async updateCliente(id: string, updates: Partial<Cliente>) {
        const { data, error } = await supabase
            .from('clientes')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as Cliente
    },

    async deleteCliente(id: string) {
        // En lugar de eliminar, podríamos marcar como inactivo si tuviéramos esa columna.
        // Por ahora eliminamos físicamente para el prototipo.
        const { error } = await supabase
            .from('clientes')
            .delete()
            .eq('id', id)

        if (error) throw error
        return true
    },

    async getSriConfig(empresaId: string) {
        const { data, error } = await supabase
            .from('empresas')
            .select('config_sri')
            .eq('id', empresaId)
            .single()

        if (error) throw error
        return (data.config_sri || {}) as SriConfig
    },

    async updateSriConfig(empresaId: string, config: Partial<SriConfig>) {
        const { error } = await supabase
            .from('empresas')
            .update({ config_sri: config })
            .eq('id', empresaId)

        if (error) throw error
        return true
    },

    formatSecuencial(establecimiento: string, puntoEmision: string, numero: number): string {
        const numStr = numero.toString().padStart(9, '0')
        return `${establecimiento.padStart(3, '0')}-${puntoEmision.padStart(3, '0')}-${numStr}`
    },

    async generarFacturaDesdePedido(pedido: any, data: { clienteId: string, pagos: { metodo: string, valor: number, referencia?: string }[], sri_utilizacion_sistema_financiero?: boolean, caja_sesion_id?: string }) {
        try {
            const { clienteId, pagos, sri_utilizacion_sistema_financiero = false } = data
            // 1. Obtener configuración SRI de la empresa
            const config = await this.getSriConfig(pedido.empresa_id)
            const est = config.establecimiento || '001'
            const pto = config.punto_emision || '001'

            // Simulación de secuencial
            const nextSec = config.secuencial_inicio || 1
            const secuencialFormateado = this.formatSecuencial(est, pto, nextSec)

            // 1.5 Generar Clave de Acceso
            const { data: empData } = await supabase.from('empresas').select('ruc').eq('id', pedido.empresa_id).single()
            const rucEmpresa = empData?.ruc || '1790000000001'
            const claveAcceso = sriService.generarClaveAcceso(
                new Date(),
                rucEmpresa,
                config.ambiente || 'PRUEBAS',
                est,
                pto,
                secuencialFormateado
            )

            // 1. Crear el Comprobante (CABECERA) — arranca en PENDIENTE hasta que el backend confirme
            const { data: factura, error: errorFactura } = await supabase
                .from('comprobantes')
                .insert({
                    empresa_id: pedido.empresa_id,
                    pedido_id: pedido.id,
                    cliente_id: clienteId,
                    tipo_comprobante: 'FACTURA',
                    secuencial: secuencialFormateado,
                    clave_acceso: claveAcceso,
                    autorizacion_numero: null,
                    ambiente: config.ambiente || 'PRUEBAS',
                    total: pedido.total,
                    estado_sri: 'PENDIENTE',
                    fecha_autorizacion: null,
                    sri_utilizacion_sistema_financiero,
                    caja_sesion_id: data.caja_sesion_id
                })
                .select()
                .single()

            if (errorFactura) throw errorFactura

            // 1.1 Crear DETALLES (Snapshot)
            if (pedido.pedido_detalles && pedido.pedido_detalles.length > 0) {
                const detalles = pedido.pedido_detalles.map((d: any) => ({
                    comprobante_id: factura.id,
                    producto_id: d.producto_id,
                    nombre_producto: d.productos?.nombre || 'Producto',
                    cantidad: d.cantidad,
                    precio_unitario: d.precio_unitario,
                    subtotal: d.precio_unitario * d.cantidad,
                    iva_porcentaje: d.productos?.iva_porcentaje || 15,
                    iva_valor: (d.precio_unitario * d.cantidad) * ((d.productos?.iva_porcentaje || 15) / 100),
                    total: (d.precio_unitario * d.cantidad) * (1 + (d.productos?.iva_porcentaje || 15) / 100)
                }))
                const { error: errorDet } = await supabase.from('comprobante_detalles').insert(detalles)
                if (errorDet) console.error('Error inserting details:', errorDet)
            }

            // 1.2 Crear PAGOS
            const pagosFormatted = pagos.map(p => ({
                comprobante_id: factura.id,
                metodo_pago: p.metodo,
                valor: p.valor,
                referencia: p.referencia
            }))
            const { error: errorPagos } = await supabase.from('comprobante_pagos').insert(pagosFormatted)
            if (errorPagos) console.error('Error inserting payments:', errorPagos)

            // ACTUALIZAR SECUENCIAL
            await this.updateSriConfig(pedido.empresa_id, {
                ...config,
                secuencial_inicio: nextSec + 1
            })

            // 2. Actualizar el estado del pedido a 'facturado'
            await supabase.from('pedidos').update({ estado: 'facturado' }).eq('id', pedido.id)

            // 3. Liberar la mesa (solo si no hay otros pedidos activos en ella)
            if (pedido.mesa_id) {
                const { count } = await supabase
                    .from('pedidos')
                    .select('*', { count: 'exact', head: true })
                    .eq('mesa_id', pedido.mesa_id)
                    .neq('id', pedido.id) // Excluir el pedido actual que acabamos de facturar
                    .in('estado', ['pendiente', 'en_preparacion', 'servido'])

                if (!count || count === 0) {
                    await supabase.from('mesas').update({ estado: 'libre' }).eq('id', pedido.mesa_id)
                }
            }

            // 4. Salida de Kardex (Inventario)
            if (pedido.pedido_detalles && pedido.pedido_detalles.length > 0) {
                try {
                    await kardexService.generarSalidaVenta(pedido.empresa_id, pedido.id, pedido.pedido_detalles)
                } catch (kardexErr) {
                    console.error('Error al registrar salida en Kardex:', kardexErr)
                }
            }

            // 5. Invocar Edge Function sri-signer (firma XAdES-BES + SRI + correo Resend)
            try {
                const { data: sriResult, error: sriErr } = await supabase.functions.invoke('sri-signer', {
                    body: { comprobante_id: factura.id }
                })

                if (sriErr) {
                    console.error('[sri-signer] Error invocando Edge Function:', sriErr)
                    // No tiramos error: el comprobante queda en PENDIENTE y se puede reintentar
                } else if (sriResult?.success) {
                    console.log('[sri-signer] Resultado:', sriResult)
                } else {
                    console.warn('[sri-signer] Respuesta inesperada:', sriResult)
                }
            } catch (edgeFnErr) {
                console.error('[sri-signer] Excepción al invocar Edge Function:', edgeFnErr)
                // El comprobante sigue en PENDIENTE — no bloquea el flujo del cajero
            }

            // 6. Obtener estado actualizado del comprobante (post firma SRI)
            const { data: facturaActualizada } = await supabase
                .from('comprobantes')
                .select('*')
                .eq('id', factura.id)
                .single()

            return facturaActualizada || factura
        } catch (error) {
            console.error('Error en el flujo de facturación:', error)
            throw error
        }
    },

    async getComprobanteCompleto(id: string) {
        // Obtenemos cabecera con cliente y pedido con detalles (detalles están en pedido_detalles)
        const { data, error } = await supabase
            .from('comprobantes')
            .select(`
                *,
                clientes (*),
                pedidos (
                    id,
                    pedido_detalles (
                        *,
                        productos (*)
                    )
                ),
                empresas (*),
                comprobante_pagos (*)
            `)
            .eq('id', id)
            .single()

        if (error) throw error
        return data
    }
}
