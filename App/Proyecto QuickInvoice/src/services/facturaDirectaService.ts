import { supabase } from '../lib/supabase'
import { sriService } from './sriService'
import { kardexService } from './kardexService'
import { contableConfigService } from './contableConfigService'
import { contabilidadVentasService } from './contabilidadVentasService'
import { puntoEmisionService } from './puntoEmisionService'

export interface DetalleFacturaDirecta {
    producto_id: string | null
    nombre_producto: string
    cantidad: number
    precio_unitario: number
    descuento: number       // porcentaje de descuento (0-100)
    iva_porcentaje: number  // 0, 5, 15, etc.
    // Subproductos: si se seleccionó una presentación, almacenar su id y factor
    subproducto_id?: string | null
    factor_conversion?: number  // fracción del producto maestro por unidad vendida
}

export interface PagoFactura {
    metodo: 'efectivo' | 'transferencia' | 'credito' | 'cheque' | 'cheque_fecha' | 'otros' | 'tarjeta'
    valor: number
    referencia?: string
    cuenta_bancaria_id?: string | null           // solo para transferencia
    cuenta_bancaria_contable_id?: string | null  // cuenta_contable_id de la cuenta bancaria
}

export interface FacturaDirectaInput {
    empresa_id: string
    cliente_id: string
    detalles: DetalleFacturaDirecta[]
    pagos: PagoFactura[]
    caja_sesion_id?: string
    observaciones?: string
    vendedor_id?: string | null      // FK a vendedores.id (puede ser null)
    dias_plazo_credito?: number      // Solo aplica cuando hay pago a crédito; default 30
    bodega_id?: string | null        // Bodega desde la que se descuenta el stock
}

// Calcula los valores de una línea de detalle
export function calcularLinea(detalle: DetalleFacturaDirecta) {
    const subtotal_bruto = detalle.precio_unitario * detalle.cantidad
    const descuento_valor = subtotal_bruto * (detalle.descuento / 100)
    const subtotal_neto = subtotal_bruto - descuento_valor
    const iva_valor = subtotal_neto * (detalle.iva_porcentaje / 100)
    const total = subtotal_neto + iva_valor
    return { subtotal_bruto, descuento_valor, subtotal_neto, iva_valor, total }
}

// Calcula los totales de toda la factura
export function calcularTotalesFactura(detalles: DetalleFacturaDirecta[]) {
    let subtotal = 0
    let descuentos = 0
    let iva = 0
    let total = 0

    for (const d of detalles) {
        if (d.cantidad <= 0 || d.precio_unitario <= 0) continue
        const l = calcularLinea(d)
        subtotal += l.subtotal_neto
        descuentos += l.descuento_valor
        iva += l.iva_valor
        total += l.total
    }

    return { subtotal, descuentos, iva, total }
}

export const facturaDirectaService = {

    async generarFacturaDirecta(input: FacturaDirectaInput) {
        const { empresa_id, cliente_id, detalles, pagos, caja_sesion_id, vendedor_id, dias_plazo_credito, bodega_id } = input

        // 1. Obtener configuración SRI
        const { data: empData } = await supabase
            .from('empresas')
            .select('ruc, config_sri')
            .eq('id', empresa_id)
            .single()

        if (!empData) throw new Error('No se encontró la empresa')

        const config = empData.config_sri || {}
        const rucEmpresa = empData.ruc || '1790000000001'

        // ✅ Punto de emisión: el asignado a este dispositivo (Configuración → Puntos de
        // Emisión), o el "Principal" de la empresa si el dispositivo no tiene asignación.
        // El secuencial se incrementa de forma atómica (FOR UPDATE) en ese punto de emisión,
        // evitando que dos cajas que facturan al mismo tiempo obtengan el mismo número.
        const puntoEmision = await puntoEmisionService.resolverParaDispositivo(empresa_id)

        let est: string
        let pto: string
        let nextSec: number
        let actualizarSecuencialInicio = false
        if (puntoEmision) {
            est = puntoEmision.establecimiento
            pto = puntoEmision.punto_emision
            const { data: nextSecData, error: errorSec } = await supabase
                .rpc('qi_next_secuencial_punto', { p_punto_emision_id: puntoEmision.id, p_tipo_comprobante: 'FACTURA' })
            if (errorSec) throw errorSec
            nextSec = nextSecData as number
        } else {
            // Fallback: empresa todavía sin punto de emisión migrado, usar MAX(secuencial)+1
            est = config.establecimiento || '001'
            pto = config.punto_emision || '001'
            const seriePrefix = `${est.padStart(3, '0')}-${pto.padStart(3, '0')}-`
            const { data: lastComprobante } = await supabase
                .from('comprobantes')
                .select('secuencial')
                .eq('empresa_id', empresa_id)
                .like('secuencial', `${seriePrefix}%`)
                .order('secuencial', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (lastComprobante?.secuencial) {
                const lastNum = parseInt(lastComprobante.secuencial.split('-').pop() || '0', 10)
                nextSec = lastNum + 1
            } else {
                nextSec = config.secuencial_inicio || 1
            }
            actualizarSecuencialInicio = true
        }

        const secuencialFormateado = `${est.padStart(3, '0')}-${pto.padStart(3, '0')}-${nextSec.toString().padStart(9, '0')}`

        // 2. Generar clave de acceso
        const claveAcceso = sriService.generarClaveAcceso(
            new Date(),
            rucEmpresa,
            config.ambiente || 'PRUEBAS',
            est,
            pto,
            secuencialFormateado
        )

        // 3. Calcular totales
        const totales = calcularTotalesFactura(detalles)

        // 4. Crear comprobante cabecera (pedido_id = null para factura directa)
        const { data: factura, error: errorFactura } = await supabase
            .from('comprobantes')
            .insert({
                empresa_id,
                pedido_id: null,
                cliente_id,
                tipo_comprobante: 'FACTURA',
                secuencial: secuencialFormateado,
                clave_acceso: claveAcceso,
                autorizacion_numero: null,
                ambiente: config.ambiente || 'PRUEBAS',
                total: totales.total,
                estado_sri: 'PENDIENTE',
                fecha_autorizacion: null,
                fecha_emision: new Date().toLocaleDateString('en-CA'),
                sri_utilizacion_sistema_financiero: false,
                caja_sesion_id: caja_sesion_id || null,
                vendedor_id: vendedor_id || null,
                bodega_id: bodega_id || null,
            })
            .select()
            .single()

        if (errorFactura) throw errorFactura

        // 5. Insertar detalles del comprobante
        const detallesParaInsertar = detalles
            .filter(d => d.cantidad > 0 && d.precio_unitario > 0)
            .map(d => {
                const l = calcularLinea(d)
                return {
                    comprobante_id: factura.id,
                    producto_id: d.producto_id,
                    nombre_producto: d.nombre_producto,
                    cantidad: d.cantidad,
                    precio_unitario: d.precio_unitario,
                    descuento: d.descuento,
                    subtotal: l.subtotal_neto,
                    iva_porcentaje: d.iva_porcentaje,
                    iva_valor: l.iva_valor,
                    total: l.total,
                    subproducto_id: d.subproducto_id || null,
                }
            })

        if (detallesParaInsertar.length > 0) {
            const { error: errorDet } = await supabase
                .from('comprobante_detalles')
                .insert(detallesParaInsertar)
            if (errorDet) console.error('Error insertando detalles:', errorDet)
        }

        // 6. Insertar pagos
        const pagosFormateados = pagos.map(p => ({
            comprobante_id: factura.id,
            metodo_pago: p.metodo,
            valor: p.valor,
            referencia: p.referencia || null
        }))

        if (pagosFormateados.length > 0) {
            const { error: errorPagos } = await supabase
                .from('comprobante_pagos')
                .insert(pagosFormateados)
            if (errorPagos) console.error('Error insertando pagos:', errorPagos)
        }

        // 6.1 Cartera CxC — solo cuando hay pago a crédito
        const pagosCredito = pagos.filter(p => p.metodo === 'credito' && p.valor > 0)
        if (pagosCredito.length > 0) {
            const montoCredito = pagosCredito.reduce((sum, p) => sum + Number(p.valor), 0)
            const diasPlazo = dias_plazo_credito ?? 30
            const fechaEmision = new Date()
            const fechaVencimiento = new Date(fechaEmision)
            fechaVencimiento.setDate(fechaVencimiento.getDate() + diasPlazo)

            const { error: errorCartera } = await supabase
                .from('cartera_cxc')
                .insert({
                    empresa_id,
                    cliente_id,
                    comprobante_id: factura.id,
                    fecha_emision: fechaEmision.toISOString().split('T')[0],
                    fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0],
                    valor_original: montoCredito,
                    saldo: montoCredito,
                    estado: 'pendiente',
                })

            if (errorCartera) {
                // No bloquea la factura; se registra para revisión manual
                console.error('[cartera_cxc] Error al crear registro de cartera:', errorCartera)
            }
        }

        // 7. Actualizar secuencial en config_sri — solo en el fallback sin punto de emisión,
        //    ya que con el punto de emisión el contador atómico vive en puntos_emision.secuenciales
        if (actualizarSecuencialInicio) {
            await supabase
                .from('empresas')
                .update({
                    config_sri: {
                        ...config,
                        secuencial_inicio: nextSec + 1
                    }
                })
                .eq('id', empresa_id)
        }

        // 8. Salida de Kardex para productos con inventario
        // Si el detalle tiene factor_conversion (subproducto), la cantidad en Kardex
        // es cantidad_vendida × factor (fracción del producto maestro descontada).
        try {
            const kardexDetalles = detalles
                .filter(d => d.producto_id && d.cantidad > 0)
                .map(d => {
                    const factor = Number(d.factor_conversion || 1)
                    return {
                        producto_id: d.producto_id,
                        cantidad: d.cantidad * factor,
                        precio_unitario: d.precio_unitario,
                        subtotal: calcularLinea(d).subtotal_neto,
                        productos: { nombre: d.nombre_producto, maneja_stock: true }
                    }
                })

            if (kardexDetalles.length > 0) {
                await kardexService.generarSalidaVenta(empresa_id, factura.id, kardexDetalles, bodega_id ?? undefined)
            }
        } catch (kardexErr) {
            console.error('Error al registrar salida en Kardex:', kardexErr)
        }

        // 9a. Asiento contable automático (si contabilidad en línea activa)
        try {
            const contaConfig = await contableConfigService.getConfig(empresa_id)
            if (contaConfig?.contabilidad_en_linea) {
                // Obtener costo_promedio y cuenta_costo_id por producto para el COGS
                const prodIds = detalles.filter(d => d.producto_id).map(d => d.producto_id!)
                let prodCostoMap: Record<string, { costo_promedio: number; cuenta_costo_id: string | null }> = {}
                if (prodIds.length > 0) {
                    const { data: prodsCosto } = await supabase
                        .from('productos')
                        .select('id, costo_promedio, cuenta_costo_id')
                        .in('id', prodIds)
                    for (const p of (prodsCosto ?? [])) {
                        prodCostoMap[p.id] = {
                            costo_promedio:  Number(p.costo_promedio || 0),
                            cuenta_costo_id: p.cuenta_costo_id ?? null,
                        }
                    }
                }

                const detallesContables = detalles
                    .filter(d => d.cantidad > 0 && d.precio_unitario > 0)
                    .map(d => {
                        const l = calcularLinea(d)
                        const prodInfo = d.producto_id ? prodCostoMap[d.producto_id] : null
                        const factor = Number(d.factor_conversion || 1)
                        const cantidadReal = d.cantidad * factor
                        return {
                            subtotal:        l.subtotal_neto,
                            iva_porcentaje:  d.iva_porcentaje,
                            iva_valor:       l.iva_valor,
                            costo_total:     prodInfo ? prodInfo.costo_promedio * cantidadReal : 0,
                            cuenta_costo_id: prodInfo?.cuenta_costo_id ?? null,
                        }
                    })

                const { data: clienteData } = await supabase
                    .from('clientes').select('nombre').eq('id', cliente_id).single()

                await contabilidadVentasService.crearAsientoVenta({
                    facturaId:     factura.id,
                    empresaId:     empresa_id,
                    portalRuc:     rucEmpresa,
                    secuencial:    secuencialFormateado,
                    clienteNombre: clienteData?.nombre ?? '—',
                    fecha:         new Date().toISOString().split('T')[0],
                    detalles:      detallesContables,
                    pagos: pagos.map(p => ({
                        metodo:                      p.metodo,
                        valor:                       p.valor,
                        cuenta_bancaria_id:           p.cuenta_bancaria_id ?? null,
                        cuenta_bancaria_contable_id:  p.cuenta_bancaria_contable_id ?? null,
                    })),
                })
            }
        } catch (contaErr) {
            console.error('[asientoVenta] Error (no bloquea factura):', contaErr)
        }

        // 9. Invocar Edge Function sri-signer
        try {
            const { data: sriResult, error: sriErr } = await supabase.functions.invoke('sri-signer', {
                body: { comprobante_id: factura.id }
            })

            if (sriErr) {
                console.error('[sri-signer] Error:', sriErr)
            } else {
                console.log('[sri-signer] Resultado:', sriResult)
            }
        } catch (edgeFnErr) {
            console.error('[sri-signer] Excepción:', edgeFnErr)
        }

        // 10. Retornar comprobante actualizado
        const { data: facturaFinal } = await supabase
            .from('comprobantes')
            .select('*')
            .eq('id', factura.id)
            .single()

        return facturaFinal || factura
    },

    async getComprobanteCompleto(id: string) {
        const { data, error } = await supabase
            .from('comprobantes')
            .select(`
                *,
                clientes (*),
                empresas (*),
                comprobante_detalles (*),
                comprobante_pagos (*)
            `)
            .eq('id', id)
            .single()

        if (error) throw error
        return data
    }
}
