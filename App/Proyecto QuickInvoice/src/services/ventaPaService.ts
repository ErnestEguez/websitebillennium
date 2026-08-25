// Plan Acumulativo (PA) — ventas que se acumulan como deuda SIN factura
// electrónica inmediata (a diferencia de Crédito, que sí factura de una vez
// y solo queda pendiente el cobro). Cuando el cliente cancela el saldo
// TOTAL acumulado, se consolidan todas sus ventas PA en una sola factura.
//
// El saldo pendiente nunca se guarda en una columna — siempre se calcula en
// vivo a partir de ventas_pa (ACUMULADO) y ventas_pa_pagos, para no
// arriesgar una desincronización.
import { supabase } from '../lib/supabase'
import { facturaDirectaService, calcularLinea, type DetalleFacturaDirecta, type PagoFactura } from './facturaDirectaService'
import { kardexService } from './kardexService'

export interface VentaPaDetalleInput {
    producto_id: string | null
    nombre_producto: string
    cantidad: number
    precio_unitario: number
    descuento: number
    iva_porcentaje: number
    talla?: string | null
    color?: string | null
}

export interface CrearVentaPaInput {
    empresa_id: string
    cliente_id: string
    detalles: VentaPaDetalleInput[]
    bodega_id?: string | null
    vendedor_id?: string | null
    created_by?: string | null
}

export interface SaldoPaCliente {
    cliente_id: string
    nombre: string
    identificacion: string
    total_acumulado: number
    total_pagado: number
    saldo: number
}

export const ventaPaService = {

    // Registra una venta PA: cabecera + detalle + descuento de stock
    // inmediato (la mercadería sale de la tienda ya, aunque no haya factura
    // todavía). NO toca comprobantes/SRI — eso solo ocurre al consolidar.
    async crearVentaPA(input: CrearVentaPaInput) {
        const { empresa_id, cliente_id, detalles, bodega_id, vendedor_id, created_by } = input
        const detallesValidos = detalles.filter(d => d.cantidad > 0 && d.precio_unitario > 0)
        if (!detallesValidos.length) throw new Error('Agrega al menos un artículo válido')

        const total = detallesValidos.reduce(
            (sum, d) => sum + calcularLinea(d as DetalleFacturaDirecta).total, 0
        )

        const { data: venta, error } = await supabase
            .from('ventas_pa')
            .insert({
                empresa_id, cliente_id,
                total: Math.round(total * 100) / 100,
                estado: 'ACUMULADO',
                bodega_id: bodega_id || null,
                vendedor_id: vendedor_id || null,
                created_by: created_by || null,
            })
            .select()
            .single()
        if (error) throw error

        const { error: errorDet } = await supabase
            .from('ventas_pa_detalles')
            .insert(detallesValidos.map(d => ({
                venta_pa_id: venta.id,
                producto_id: d.producto_id,
                nombre_producto: d.nombre_producto,
                cantidad: d.cantidad,
                precio_unitario: d.precio_unitario,
                descuento: d.descuento,
                iva_porcentaje: d.iva_porcentaje,
                talla: d.talla || null,
                color: d.color || null,
            })))
        if (errorDet) throw errorDet

        const kardexItems = detallesValidos
            .filter(d => d.producto_id)
            .map(d => ({
                producto_id: d.producto_id,
                cantidad: d.cantidad,
                precio_unitario: d.precio_unitario,
                subtotal: calcularLinea(d as DetalleFacturaDirecta).subtotal_neto,
                productos: { nombre: d.nombre_producto, maneja_stock: true },
            }))
        if (kardexItems.length > 0) {
            kardexService
                .generarSalidaVenta(empresa_id, venta.id, kardexItems, bodega_id ?? undefined)
                .catch(err => console.error('[kardex PA] Error en background:', err))
        }

        return venta
    },

    // Saldo pendiente en vivo: total de ventas_pa ACUMULADO menos pagos ya
    // registrados. Nunca negativo en la práctica (registrarPago bloquea
    // pagos mayores al saldo).
    async calcularSaldoPendiente(empresaId: string, clienteId: string): Promise<number> {
        const [{ data: acumuladas, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
            supabase.from('ventas_pa').select('total')
                .eq('empresa_id', empresaId).eq('cliente_id', clienteId).eq('estado', 'ACUMULADO'),
            supabase.from('ventas_pa_pagos').select('valor')
                .eq('empresa_id', empresaId).eq('cliente_id', clienteId),
        ])
        if (e1) throw e1
        if (e2) throw e2
        const totalAcumulado = (acumuladas ?? []).reduce((s, v) => s + Number(v.total), 0)
        const totalPagado = (pagos ?? []).reduce((s, p) => s + Number(p.valor), 0)
        return Math.round((totalAcumulado - totalPagado) * 100) / 100
    },

    // Lista de clientes con saldo PA pendiente (> 0), para la pantalla de
    // Cartera Plan Acumulativo — nunca se mezcla con Cartera CxC (Crédito).
    async listarClientesConSaldo(empresaId: string): Promise<SaldoPaCliente[]> {
        const [{ data: ventas, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
            supabase.from('ventas_pa')
                .select('cliente_id, total, clientes(nombre, identificacion)')
                .eq('empresa_id', empresaId).eq('estado', 'ACUMULADO'),
            supabase.from('ventas_pa_pagos').select('cliente_id, valor').eq('empresa_id', empresaId),
        ])
        if (e1) throw e1
        if (e2) throw e2

        const acumPorCliente = new Map<string, { total: number; nombre: string; identificacion: string }>()
        for (const v of ventas ?? []) {
            const cli = (v as any).clientes
            const prev = acumPorCliente.get(v.cliente_id) ?? { total: 0, nombre: cli?.nombre ?? '', identificacion: cli?.identificacion ?? '' }
            prev.total += Number(v.total)
            acumPorCliente.set(v.cliente_id, prev)
        }
        const pagPorCliente = new Map<string, number>()
        for (const p of pagos ?? []) {
            pagPorCliente.set(p.cliente_id, (pagPorCliente.get(p.cliente_id) ?? 0) + Number(p.valor))
        }

        return Array.from(acumPorCliente.entries())
            .map(([cliente_id, info]) => {
                const total_pagado = pagPorCliente.get(cliente_id) ?? 0
                return {
                    cliente_id,
                    nombre: info.nombre,
                    identificacion: info.identificacion,
                    total_acumulado: Math.round(info.total * 100) / 100,
                    total_pagado: Math.round(total_pagado * 100) / 100,
                    saldo: Math.round((info.total - total_pagado) * 100) / 100,
                }
            })
            // OJO: se filtra por total_acumulado, NO por saldo — un cliente que ya
            // pagó el 100% (saldo = 0) tiene que seguir apareciendo aquí para poder
            // presionar "Facturar". Filtrar por saldo > 0 lo hacía desaparecer justo
            // en el momento en que ya estaba listo para facturar.
            .filter(c => c.total_acumulado > 0.01)
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
    },

    // Registra un abono contra el saldo PA del cliente (no contra una venta
    // puntual — el saldo siempre es agregado). Bloquea si el abono supera el
    // saldo pendiente. Devuelve si con este abono ya se puede consolidar.
    async registrarPago(input: {
        empresa_id: string; cliente_id: string; valor: number
        metodo_pago: string; referencia?: string
        cuenta_bancaria_id?: string | null
        numero_documento?: string | null
        observaciones?: string | null
        created_by?: string | null
    }) {
        const {
            empresa_id, cliente_id, valor, metodo_pago, referencia,
            cuenta_bancaria_id, numero_documento, observaciones, created_by,
        } = input
        if (valor <= 0) throw new Error('El valor del pago debe ser mayor a cero')

        const saldoAntes = await this.calcularSaldoPendiente(empresa_id, cliente_id)
        if (saldoAntes <= 0.01) throw new Error('Este cliente no tiene saldo pendiente en Plan Acumulativo')
        if (valor > saldoAntes + 0.01) {
            throw new Error(`El pago ($${valor.toFixed(2)}) no puede ser mayor al saldo pendiente ($${saldoAntes.toFixed(2)})`)
        }

        const { error } = await supabase
            .from('ventas_pa_pagos')
            .insert({
                empresa_id, cliente_id, valor, metodo_pago,
                referencia: referencia || null,
                cuenta_bancaria_id: cuenta_bancaria_id || null,
                numero_documento: numero_documento || null,
                observaciones: observaciones || null,
                created_by: created_by || null,
            })
        if (error) throw error

        const saldoDespues = await this.calcularSaldoPendiente(empresa_id, cliente_id)
        return { saldoDespues, listoParaConsolidar: saldoDespues <= 0.01 }
    },

    // Trae todas las ventas_pa ACUMULADO de un cliente con su detalle
    // completo, para armar la factura de consolidación — una línea de
    // factura por cada línea original (no se fusionan/suman).
    async obtenerPendientesParaConsolidar(empresaId: string, clienteId: string) {
        const { data, error } = await supabase
            .from('ventas_pa')
            .select('id, fecha, bodega_id, vendedor_id, ventas_pa_detalles(*)')
            .eq('empresa_id', empresaId)
            .eq('cliente_id', clienteId)
            .eq('estado', 'ACUMULADO')
            .order('fecha')
        if (error) throw error
        return data ?? []
    },

    // Todos los pagos registrados contra el saldo PA de un cliente (para
    // reflejarlos como formas de pago de la factura consolidada final).
    async obtenerPagosPendientes(empresaId: string, clienteId: string) {
        const { data, error } = await supabase
            .from('ventas_pa_pagos')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('cliente_id', clienteId)
            .order('fecha')
        if (error) throw error
        return data ?? []
    },

    // Cierra el ciclo: marca como FACTURADO las ventas_pa consolidadas y
    // enlaza el comprobante resultante.
    async marcarFacturadas(ventaPaIds: string[], comprobanteId: string) {
        if (!ventaPaIds.length) return
        const { error } = await supabase
            .from('ventas_pa')
            .update({ estado: 'FACTURADO', comprobante_id: comprobanteId })
            .in('id', ventaPaIds)
        if (error) throw error
    },

    // Solo se puede llamar cuando el saldo llegó a $0 (cancelación total).
    // Junta TODAS las líneas de TODAS las ventas PA acumuladas del cliente
    // en una sola factura (sin fusionar líneas), usa los pagos ya
    // registrados como formas de pago de esa factura, omite el descuento de
    // stock (ya ocurrió en cada venta PA original) y cierra el ciclo.
    async consolidarYFacturar(input: {
        empresa_id: string
        cliente_id: string
        caja_sesion_id?: string | null
        created_by?: string | null
    }) {
        const { empresa_id, cliente_id, caja_sesion_id, created_by } = input

        const saldo = await this.calcularSaldoPendiente(empresa_id, cliente_id)
        if (saldo > 0.01) {
            throw new Error(`Aún queda saldo pendiente ($${saldo.toFixed(2)}) — solo se puede facturar cuando el cliente cancela el 100%`)
        }

        const pendientes = await this.obtenerPendientesParaConsolidar(empresa_id, cliente_id)
        if (!pendientes.length) throw new Error('No hay ventas de Plan Acumulativo pendientes de facturar para este cliente')

        const detalles: DetalleFacturaDirecta[] = pendientes.flatMap(v =>
            ((v as any).ventas_pa_detalles ?? []).map((d: any) => ({
                producto_id: d.producto_id,
                nombre_producto: d.nombre_producto,
                cantidad: Number(d.cantidad),
                precio_unitario: Number(d.precio_unitario),
                descuento: Number(d.descuento) || 0,
                iva_porcentaje: Number(d.iva_porcentaje) || 0,
                talla: d.talla,
                color: d.color,
            }))
        )
        if (!detalles.length) throw new Error('Las ventas pendientes no tienen líneas de detalle')

        const bodega_id = pendientes.find((v: any) => v.bodega_id)?.bodega_id ?? null
        const vendedor_id = pendientes.find((v: any) => v.vendedor_id)?.vendedor_id ?? null

        const pagosPa = await this.obtenerPagosPendientes(empresa_id, cliente_id)
        const totalFactura = detalles.reduce((s, d) => s + calcularLinea(d).total, 0)
        const pagos: PagoFactura[] = pagosPa.length > 0
            ? pagosPa.map(p => ({
                metodo: (p.metodo_pago as PagoFactura['metodo']) || 'efectivo',
                valor: Number(p.valor),
                referencia: p.referencia || undefined,
                cuenta_bancaria_id: p.cuenta_bancaria_id || null,
                numero_documento: p.numero_documento || undefined,
                observaciones: p.observaciones || undefined,
            }))
            : [{ metodo: 'efectivo', valor: Math.round(totalFactura * 100) / 100 }]

        const factura = await facturaDirectaService.generarFacturaDirecta({
            empresa_id, cliente_id, detalles, pagos,
            caja_sesion_id: caja_sesion_id || undefined,
            bodega_id: bodega_id || undefined,
            vendedor_id: vendedor_id || undefined,
            observaciones: 'Consolidación de Plan Acumulativo',
            created_by: created_by || undefined,
            omitir_kardex: true,
        })

        await this.marcarFacturadas(pendientes.map((v: any) => v.id), factura.id)

        return factura
    },
}
