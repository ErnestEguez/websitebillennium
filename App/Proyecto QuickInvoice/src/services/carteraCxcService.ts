import { contabilidadVentasService } from './contabilidadVentasService'
import { contableConfigService } from './contableConfigService'
import { movimientoService } from './finance/movimientoService'
import { supabase } from '../lib/supabase'
import { auditService } from './auditoria/auditService'
import type { LineaDistribucionContable } from '../types/finance'

export interface CarteraCxc {
    id: string
    empresa_id: string
    comprobante_id: string
    cliente_id: string
    fecha_emision: string
    fecha_vencimiento: string | null
    valor_original: number
    saldo: number
    estado: 'pendiente' | 'parcial' | 'pagada' | 'anulada'
    observaciones: string | null
    // Solo en cartera migrada (comprobante_id null) — número de factura del
    // sistema anterior, capturado en la migración. Ver MigrarCarteraPage.tsx.
    numero_documento_externo?: string | null
    created_at: string
    updated_at: string
    // joins
    clientes?: { nombre: string; identificacion: string }
    comprobantes?: { secuencial: string; total: number }
}

// Número de factura a mostrar: el real si tiene comprobante vinculado, o el
// capturado en la migración si es cartera migrada (comprobante_id null).
export function numeroFacturaCartera(c: Pick<CarteraCxc, 'comprobantes' | 'numero_documento_externo'>): string {
    return c.comprobantes?.secuencial || c.numero_documento_externo || '—'
}

export interface CarteraCxcPago {
    id: string
    cartera_id: string
    empresa_id: string
    fecha_pago: string
    valor: number
    metodo_pago: 'efectivo' | 'transferencia' | 'cheque' | 'cheque_fecha' | 'tarjeta' | 'nota_credito' | 'otros' | 'retencion_fuente' | 'retencion_iva'
    referencia: string | null
    usuario_id: string | null
    created_at: string
    // Reversa / trazabilidad contable
    estado: 'activo' | 'reversado' | 'en_custodia'
    lp_comprobante_id: string | null
    reversado_at: string | null
    reversado_por: string | null
    motivo_reversa: string | null
    // Solo cuando metodo_pago = 'cheque_fecha' — ver ChequeCliente
    cheque_cliente_id?: string | null
}

// Cheque a fecha recibido de un cliente como garantía de la deuda ("en
// custodia"): mientras no se deposite, las facturas que cubre siguen
// pendientes — el pago se registra con estado 'en_custodia' (excluido del
// cálculo de saldo por fn_actualizar_saldo_cxc) y solo pasa a 'activo' el
// día que se deposita en el banco. Ver DepositoChequesCustodiaPage.tsx.
export interface ChequeCliente {
    id: string
    empresa_id: string
    cliente_id: string
    numero_cheque: string
    banco_emisor: string | null
    monto: number
    fecha_emision: string
    fecha_cobro: string
    estado: 'en_custodia' | 'depositado' | 'rechazado' | 'anulado'
    cuenta_bancaria_destino_id: string | null
    movimiento_bancario_id: string | null
    numero_comprobante_deposito: string | null
    fecha_deposito: string | null
    lp_comprobante_id: string | null
    observaciones: string | null
    motivo_rechazo: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    // joins
    clientes?: { nombre: string; identificacion: string }
}

export const carteraCxcService = {

    async getCartera(empresaId: string, filtroEstado?: string): Promise<CarteraCxc[]> {
        let query = supabase
            .from('cartera_cxc')
            .select(`
                *,
                clientes (nombre, identificacion),
                comprobantes (secuencial, total)
            `)
            .eq('empresa_id', empresaId)
            .order('fecha_vencimiento', { ascending: true })

        if (filtroEstado === 'activos') {
            query = query.in('estado', ['pendiente', 'parcial'])
        } else if (filtroEstado && filtroEstado !== 'todos') {
            query = query.eq('estado', filtroEstado)
        }

        const { data, error } = await query
        if (error) throw error
        return (data || []) as CarteraCxc[]
    },

    async getPagosDeCartera(carteraId: string): Promise<CarteraCxcPago[]> {
        const { data, error } = await supabase
            .from('cartera_cxc_pagos')
            .select('*')
            .eq('cartera_id', carteraId)
            .order('fecha_pago', { ascending: false })

        if (error) throw error
        return (data || []) as CarteraCxcPago[]
    },

    async registrarPago(
        carteraId: string,
        empresaId: string,
        valor: number,
        metodoPago: CarteraCxcPago['metodo_pago'],
        referencia?: string
    ): Promise<CarteraCxcPago> {
        const { data: { user } } = await supabase.auth.getUser()

        const { data, error } = await supabase
            .from('cartera_cxc_pagos')
            .insert({
                cartera_id: carteraId,
                empresa_id: empresaId,
                fecha_pago: new Date().toISOString().split('T')[0],
                valor,
                metodo_pago: metodoPago,
                referencia: referencia || null,
                usuario_id: user?.id || null,
            })
            .select()
            .single()

        if (error) throw error
        // El trigger fn_actualizar_saldo_cxc actualiza el saldo y estado automáticamente

        const { data: carteraInfo } = await supabase
            .from('cartera_cxc').select('comprobantes(secuencial)').eq('id', carteraId).maybeSingle()
        const secuencial = (carteraInfo as any)?.comprobantes?.secuencial

        auditService.logEvent({
            empresaId,
            modulo: 'cartera_cxc',
            accion: 'crear',
            entidad: 'cartera_cxc_pago',
            entidadId: (data as any).id,
            numeroDocumento: secuencial,
            resumen: `Pago de cliente${secuencial ? ` — factura No. ${secuencial}` : ''} por ${valor}`,
            detalle: { metodo_pago: metodoPago, valor, referencia, cartera_id: carteraId },
        })

        return data as CarteraCxcPago
    },

    /**
     * Registra una retención que llegó DESPUÉS de facturar (el cliente no la
     * traía al momento de la venta, quedó como crédito, y ahora llega su
     * comprobante físico). Inserta el pago (rebaja el saldo vía el mismo
     * trigger de siempre) Y el detalle en retenciones_ventas (origen='CARTERA'),
     * igual que se hace al capturarla directo en la factura.
     */
    async registrarPagoRetencion(
        cartera: { id: string; comprobante_id: string; cliente_id: string },
        empresaId: string,
        retencion: { tipo: 'FUENTE' | 'IVA'; codigo: string; descripcion: string; base: number; pct: number; valor: number },
        numeroRetencion: string | undefined,
    ): Promise<CarteraCxcPago> {
        const { data: { user } } = await supabase.auth.getUser()
        const metodo: CarteraCxcPago['metodo_pago'] = retencion.tipo === 'FUENTE' ? 'retencion_fuente' : 'retencion_iva'
        const fecha = new Date().toISOString().split('T')[0]

        const { data: pago, error } = await supabase
            .from('cartera_cxc_pagos')
            .insert({
                cartera_id: cartera.id,
                empresa_id: empresaId,
                fecha_pago: fecha,
                valor: retencion.valor,
                metodo_pago: metodo,
                referencia: numeroRetencion || null,
                usuario_id: user?.id || null,
            })
            .select()
            .single()
        if (error) throw error

        const { error: errorRet } = await supabase
            .from('retenciones_ventas')
            .insert({
                empresa_id: empresaId,
                comprobante_id: cartera.comprobante_id,
                cliente_id: cartera.cliente_id,
                numero_retencion: numeroRetencion || null,
                fecha_emision: fecha,
                tipo: retencion.tipo,
                codigo_retencion: retencion.codigo,
                descripcion: retencion.descripcion || null,
                base_imponible: retencion.base,
                porcentaje: retencion.pct,
                valor: retencion.valor,
                origen: 'CARTERA',
                created_by: user?.id || null,
            })
        if (errorRet) console.error('Error registrando retenciones_ventas (cartera):', errorRet)

        // El trigger fn_actualizar_saldo_cxc actualiza el saldo y estado automáticamente

        const { data: comprobanteInfo } = await supabase
            .from('comprobantes').select('secuencial').eq('id', cartera.comprobante_id).maybeSingle()

        auditService.logEvent({
            empresaId,
            modulo: 'cartera_cxc',
            accion: 'crear',
            entidad: 'cartera_cxc_pago',
            entidadId: (pago as any).id,
            numeroDocumento: comprobanteInfo?.secuencial ?? undefined,
            resumen: `Retención de cliente registrada${comprobanteInfo?.secuencial ? ` — factura No. ${comprobanteInfo.secuencial}` : ''} por ${retencion.valor}`,
            detalle: { tipo: retencion.tipo, codigo: retencion.codigo, valor: retencion.valor, cartera_id: cartera.id },
        })

        return pago as CarteraCxcPago
    },

    /**
     * Bases imponibles reales de la factura para autocompletar la retención
     * capturada después desde Cartera: Fuente = subtotal sin IVA, IVA = valor
     * de IVA a pagar. Se suman desde comprobante_detalles (no hay columnas de
     * resumen en comprobantes).
     */
    async getBaseImponibleFactura(comprobanteId: string): Promise<{ baseFuente: number; baseIva: number }> {
        const { data, error } = await supabase
            .from('comprobante_detalles')
            .select('subtotal, iva_valor')
            .eq('comprobante_id', comprobanteId)
        if (error) throw error
        const baseFuente = (data || []).reduce((s, d: any) => s + Number(d.subtotal || 0), 0)
        const baseIva = (data || []).reduce((s, d: any) => s + Number(d.iva_valor || 0), 0)
        return {
            baseFuente: Math.round(baseFuente * 100) / 100,
            baseIva: Math.round(baseIva * 100) / 100,
        }
    },

    /** Vincula el asiento contable (lp_comprobantes) generado para un pago. */
    async actualizarComprobantePago(pagoId: string, lpComprobanteId: string): Promise<void> {
        const { error } = await supabase
            .from('cartera_cxc_pagos')
            .update({ lp_comprobante_id: lpComprobanteId })
            .eq('id', pagoId)
        if (error) throw error
    },

    /**
     * Reversa un pago sin borrarlo: anula el asiento contable vinculado
     * (si no es compartido con otros pagos activos) y marca el pago como
     * 'reversado'. El trigger recalcula el saldo de la cartera.
     */
    async reversarPago(pagoId: string, motivo?: string): Promise<void> {
        const { data: pago, error: errPago } = await supabase
            .from('cartera_cxc_pagos')
            .select('id, estado, lp_comprobante_id, empresa_id, cartera_id')
            .eq('id', pagoId)
            .single()
        if (errPago) throw errPago
        if (pago.estado === 'reversado') throw new Error('Este pago ya fue reversado')

        if (pago.lp_comprobante_id) {
            const { count } = await supabase
                .from('cartera_cxc_pagos')
                .select('id', { count: 'exact', head: true })
                .eq('lp_comprobante_id', pago.lp_comprobante_id)
                .eq('estado', 'activo')
                .neq('id', pagoId)

            if (!count) {
                await contabilidadVentasService.anularAsientoCobro(pago.lp_comprobante_id)
            }
        }

        const { data: { user } } = await supabase.auth.getUser()
        const { data: updated, error } = await supabase
            .from('cartera_cxc_pagos')
            .update({
                estado: 'reversado',
                reversado_at: new Date().toISOString(),
                reversado_por: user?.id || null,
                motivo_reversa: motivo || null,
            })
            .eq('id', pagoId)
            .select('id')
            .maybeSingle()
        if (error) throw error
        if (!updated) throw new Error('No se pudo reversar el pago: el registro no se actualizó (revisa permisos/RLS de cartera_cxc_pagos).')
        // El trigger fn_actualizar_saldo_cxc recalcula saldo/estado de la cartera

        auditService.logEvent({
            empresaId: pago.empresa_id,
            modulo: 'cartera_cxc',
            accion: 'reversar',
            entidad: 'cartera_cxc_pago',
            entidadId: pagoId,
            resumen: `Reversión de pago en cartera CxC`,
            detalle: { motivo, cartera_id: pago.cartera_id },
            nivel: 'sensible',
        })
    },

    async anularCartera(carteraId: string, observacion?: string): Promise<void> {
        const { data: carteraPrevia } = await supabase
            .from('cartera_cxc')
            .select('empresa_id, comprobantes(secuencial)')
            .eq('id', carteraId)
            .single()

        const { error } = await supabase
            .from('cartera_cxc')
            .update({
                estado: 'anulada',
                observaciones: observacion || 'Anulado manualmente',
                updated_at: new Date().toISOString(),
            })
            .eq('id', carteraId)

        if (error) throw error

        if (carteraPrevia) {
            const secuencial = (carteraPrevia as any).comprobantes?.secuencial
            auditService.logEvent({
                empresaId: carteraPrevia.empresa_id,
                modulo: 'cartera_cxc',
                accion: 'anular',
                entidad: 'cartera_cxc',
                entidadId: carteraId,
                numeroDocumento: secuencial,
                resumen: `Anulación de cartera CxC${secuencial ? ` (factura No. ${secuencial})` : ''}`,
                detalle: { observacion },
                nivel: 'sensible',
            })
        }
    },

    async getCarteraActivaPorCliente(empresaId: string, clienteId: string): Promise<CarteraCxc[]> {
        const { data, error } = await supabase
            .from('cartera_cxc')
            .select(`*, clientes (nombre, identificacion), comprobantes (secuencial, total)`)
            .eq('empresa_id', empresaId)
            .eq('cliente_id', clienteId)
            .in('estado', ['pendiente', 'parcial'])
            .order('fecha_emision', { ascending: true })
        if (error) throw error
        return (data || []) as CarteraCxc[]
    },

    async registrarPagoMultiple(
        distribuciones: { carteraId: string; valor: number }[],
        empresaId: string,
        metodoPago: CarteraCxcPago['metodo_pago'],
        referencia?: string
    ): Promise<CarteraCxcPago[]> {
        const { data: { user } } = await supabase.auth.getUser()
        const fecha = new Date().toISOString().split('T')[0]
        const pagos = distribuciones.map(d => ({
            cartera_id: d.carteraId,
            empresa_id: empresaId,
            fecha_pago: fecha,
            valor: d.valor,
            metodo_pago: metodoPago,
            referencia: referencia || null,
            usuario_id: user?.id || null,
        }))
        const { data, error } = await supabase.from('cartera_cxc_pagos').insert(pagos).select()
        if (error) throw error
        return (data || []) as CarteraCxcPago[]
    },

    /**
     * Registra un cheque a fecha recibido de un cliente como garantía de la
     * deuda ("en custodia"). NO paga las facturas: inserta los pagos con
     * estado='en_custodia' (fn_actualizar_saldo_cxc los ignora al calcular
     * saldo, así que las facturas siguen pendientes hasta el depósito real
     * — ver depositarChequeCustodia). No genera asiento contable todavía
     * (no hubo movimiento de dinero real).
     */
    async registrarPagoConChequeCustodia(
        distribuciones: { carteraId: string; valor: number }[],
        empresaId: string,
        clienteId: string,
        cheque: { numeroCheque: string; bancoEmisor?: string; fechaCobro: string },
    ): Promise<{ cheque: ChequeCliente; pagos: CarteraCxcPago[] }> {
        const { data: { user } } = await supabase.auth.getUser()
        const fecha = new Date().toISOString().split('T')[0]
        const total = Math.round(distribuciones.reduce((s, d) => s + d.valor, 0) * 100) / 100

        const { data: chequeData, error: errCheque } = await supabase
            .from('cheques_clientes')
            .insert({
                empresa_id: empresaId,
                cliente_id: clienteId,
                numero_cheque: cheque.numeroCheque,
                banco_emisor: cheque.bancoEmisor || null,
                monto: total,
                fecha_emision: fecha,
                fecha_cobro: cheque.fechaCobro,
                estado: 'en_custodia',
                created_by: user?.id || null,
            })
            .select()
            .single()
        if (errCheque) throw errCheque

        const pagos = distribuciones.map(d => ({
            cartera_id: d.carteraId,
            empresa_id: empresaId,
            fecha_pago: fecha,
            valor: d.valor,
            metodo_pago: 'cheque_fecha' as const,
            referencia: cheque.numeroCheque,
            usuario_id: user?.id || null,
            estado: 'en_custodia' as const,
            cheque_cliente_id: chequeData.id,
        }))
        const { data: pagosData, error: errPagos } = await supabase.from('cartera_cxc_pagos').insert(pagos).select()
        if (errPagos) throw errPagos

        auditService.logEvent({
            empresaId,
            modulo: 'cartera_cxc',
            accion: 'crear',
            entidad: 'cheque_cliente',
            entidadId: chequeData.id,
            resumen: `Cheque a fecha recibido en custodia — Nro. ${cheque.numeroCheque} por ${total}`,
            detalle: { cliente_id: clienteId, facturas: distribuciones.map(d => d.carteraId) },
            nivel: 'sensible',
        })

        return { cheque: chequeData as ChequeCliente, pagos: (pagosData || []) as CarteraCxcPago[] }
    },

    async getChequesEnCustodia(empresaId: string): Promise<ChequeCliente[]> {
        const { data, error } = await supabase
            .from('cheques_clientes')
            .select('*, clientes(nombre, identificacion)')
            .eq('empresa_id', empresaId)
            .eq('estado', 'en_custodia')
            .order('fecha_cobro', { ascending: true })
        if (error) throw error
        return (data || []) as ChequeCliente[]
    },

    /** Facturas cubiertas por un cheque (para mostrar el detalle antes de depositar). */
    async getFacturasDeCheque(chequeId: string) {
        const { data, error } = await supabase
            .from('cartera_cxc_pagos')
            .select('id, valor, cartera_id, cartera_cxc(id, saldo, valor_original, numero_documento_externo, comprobantes(secuencial))')
            .eq('cheque_cliente_id', chequeId)
        if (error) throw error
        return data || []
    },

    /**
     * Deposita un cheque en custodia: activa los pagos que cubría (pasan de
     * 'en_custodia' a 'activo' — el trigger recalcula el saldo de cada
     * factura recién en este momento), registra el movimiento bancario
     * (crédito a la cuenta destino, con su asiento contable si aplica) y
     * marca el cheque como depositado.
     */
    async depositarChequeCustodia(
        chequeId: string,
        empresaId: string,
        deposito: { cuentaBancariaId: string; numeroComprobante: string; fechaDeposito: string },
    ): Promise<{ avisoContable: string | null }> {
        const { data: { user } } = await supabase.auth.getUser()

        const { data: cheque, error: errCheque } = await supabase
            .from('cheques_clientes')
            .select('*, clientes(nombre)')
            .eq('id', chequeId)
            .single()
        if (errCheque) throw errCheque
        if (cheque.estado !== 'en_custodia') throw new Error('Este cheque ya no está en custodia')

        // Contrapartida contable del depósito: Cuentas por Cobrar Clientes
        // (mismo concepto COBROS:CREDITO que usa contabilidadVentasService
        // para un cobro normal). Si no hay mapeo configurado, el movimiento
        // se registra igual, solo sin asiento (avisoContable no-fatal).
        let lineas: LineaDistribucionContable[] = []
        try {
            const mapeoMap = await contableConfigService.getMapeoAsMap(empresaId)
            const ctaCredito = mapeoMap['COBROS:CREDITO']
            if (ctaCredito?.cuenta_id) {
                lineas = [{
                    cuenta_id: ctaCredito.cuenta_id,
                    cuenta_codigo: ctaCredito.cuenta_codigo ?? '',
                    cuenta_nombre: ctaCredito.cuenta_nombre ?? '',
                    monto: Number(cheque.monto),
                }]
            }
        } catch { /* sin mapeo — se ignora, el depósito se registra igual */ }

        const movimiento = await movimientoService.crear(
            {
                empresa_id: empresaId,
                cuenta_bancaria_id: deposito.cuentaBancariaId,
                tipo: 'deposito',
                fecha: deposito.fechaDeposito,
                monto: Number(cheque.monto),
                sentido: 'credito',
                referencia: deposito.numeroComprobante,
                descripcion: `Depósito cheque a fecha Nro. ${cheque.numero_cheque} — ${(cheque as any).clientes?.nombre ?? ''}`,
                estado: 'activo',
                conciliado: false,
                conciliacion_id: null,
                tiene_asiento: false,
                comprobante_contable_id: null,
                origen: 'manual',
                origen_id: chequeId,
                created_by: user?.id || null,
            },
            lineas,
        )

        const { error: errPagos } = await supabase
            .from('cartera_cxc_pagos')
            .update({ estado: 'activo', lp_comprobante_id: movimiento.comprobante_contable_id ?? null })
            .eq('cheque_cliente_id', chequeId)
            .eq('estado', 'en_custodia')
        if (errPagos) throw errPagos
        // El trigger fn_actualizar_saldo_cxc recalcula el saldo de cada factura al pasar estos pagos a 'activo'

        const { error: errUpdate } = await supabase
            .from('cheques_clientes')
            .update({
                estado: 'depositado',
                cuenta_bancaria_destino_id: deposito.cuentaBancariaId,
                movimiento_bancario_id: movimiento.id,
                numero_comprobante_deposito: deposito.numeroComprobante,
                fecha_deposito: deposito.fechaDeposito,
                lp_comprobante_id: movimiento.comprobante_contable_id ?? null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', chequeId)
        if (errUpdate) throw errUpdate

        auditService.logEvent({
            empresaId,
            modulo: 'cartera_cxc',
            accion: 'crear',
            entidad: 'cheque_cliente',
            entidadId: chequeId,
            resumen: `Depósito de cheque a fecha Nro. ${cheque.numero_cheque} por ${cheque.monto}`,
            detalle: { cuenta_bancaria_id: deposito.cuentaBancariaId, numero_comprobante: deposito.numeroComprobante },
            nivel: 'sensible',
        })

        return { avisoContable: (movimiento as any).avisoContable ?? null }
    },

    /** Rechaza/anula un cheque en custodia antes de depositarlo (p.ej. el cliente lo retira o se acuerda otra forma de pago). Las facturas nunca dejaron de estar pendientes, así que no hay saldo que restaurar. */
    async anularChequeCustodia(chequeId: string, motivo: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser()

        const { data: cheque, error: errCheque } = await supabase
            .from('cheques_clientes').select('estado, numero_cheque, empresa_id').eq('id', chequeId).single()
        if (errCheque) throw errCheque
        if (cheque.estado !== 'en_custodia') throw new Error('Este cheque ya no está en custodia')

        const { error: errPagos } = await supabase
            .from('cartera_cxc_pagos')
            .update({
                estado: 'reversado',
                motivo_reversa: motivo,
                reversado_at: new Date().toISOString(),
                reversado_por: user?.id || null,
            })
            .eq('cheque_cliente_id', chequeId)
            .eq('estado', 'en_custodia')
        if (errPagos) throw errPagos

        const { error } = await supabase
            .from('cheques_clientes')
            .update({ estado: 'rechazado', motivo_rechazo: motivo, updated_at: new Date().toISOString() })
            .eq('id', chequeId)
        if (error) throw error

        auditService.logEvent({
            empresaId: cheque.empresa_id,
            modulo: 'cartera_cxc',
            accion: 'anular',
            entidad: 'cheque_cliente',
            entidadId: chequeId,
            resumen: `Cheque a fecha Nro. ${cheque.numero_cheque} retirado de custodia`,
            detalle: { motivo },
            nivel: 'sensible',
        })
    },

    /** Suma de cheques a fecha en custodia ya pledged contra cada factura — evita que se vuelva a cobrar (o pledgear otro cheque) por encima de lo ya comprometido, aunque el saldo visible todavía no baje. */
    async getMontoEnCustodiaPorCartera(carteraIds: string[]): Promise<Record<string, number>> {
        if (carteraIds.length === 0) return {}
        const { data, error } = await supabase
            .from('cartera_cxc_pagos')
            .select('cartera_id, valor')
            .in('cartera_id', carteraIds)
            .eq('estado', 'en_custodia')
        if (error) throw error
        const map: Record<string, number> = {}
        for (const p of data || []) map[p.cartera_id] = Math.round(((map[p.cartera_id] || 0) + Number(p.valor)) * 100) / 100
        return map
    },

    async getEstadoCuentaCliente(empresaId: string, clienteId: string) {
        // Todas las carteras del cliente (cualquier estado)
        const { data: carteras, error: errC } = await supabase
            .from('cartera_cxc')
            .select(`*, comprobantes (secuencial, total)`)
            .eq('empresa_id', empresaId)
            .eq('cliente_id', clienteId)
            .order('fecha_emision', { ascending: true })
        if (errC) throw errC

        // Todos los pagos de esas carteras
        const carteraIds = (carteras || []).map(c => c.id)
        let pagos: any[] = []
        if (carteraIds.length > 0) {
            const { data: p, error: errP } = await supabase
                .from('cartera_cxc_pagos')
                .select('*')
                .in('cartera_id', carteraIds)
                .eq('estado', 'activo')
                .order('fecha_pago', { ascending: true })
            if (errP) throw errP
            pagos = p || []
        }

        // Agrupar pagos por cartera_id
        const pagosPorCartera: Record<string, typeof pagos> = {}
        for (const p of pagos) {
            if (!pagosPorCartera[p.cartera_id]) pagosPorCartera[p.cartera_id] = []
            pagosPorCartera[p.cartera_id].push(p)
        }

        return (carteras || []).map(c => ({
            ...c,
            pagos: pagosPorCartera[c.id] || [],
        }))
    },

    async getClientesConCartera(empresaId: string) {
        const { data, error } = await supabase
            .from('cartera_cxc')
            .select('cliente_id, clientes(id, nombre, identificacion)')
            .eq('empresa_id', empresaId)
            .order('cliente_id')
        if (error) throw error
        // Unique by cliente_id
        const map: Record<string, any> = {}
        for (const r of data || []) {
            if (!map[r.cliente_id]) map[r.cliente_id] = r.clientes
        }
        return Object.values(map).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre))
    },

    async getResumenPorCliente(empresaId: string) {
        const { data, error } = await supabase
            .from('cartera_cxc')
            .select(`
                cliente_id,
                saldo,
                estado,
                clientes (nombre, identificacion)
            `)
            .eq('empresa_id', empresaId)
            .in('estado', ['pendiente', 'parcial'])

        if (error) throw error

        // Agrupar por cliente
        const resumen: Record<string, { nombre: string; identificacion: string; total_saldo: number; facturas: number }> = {}
        for (const row of data || []) {
            const cid = row.cliente_id as string
            if (!resumen[cid]) {
                resumen[cid] = {
                    nombre: (row.clientes as any)?.nombre || 'Sin nombre',
                    identificacion: (row.clientes as any)?.identificacion || '',
                    total_saldo: 0,
                    facturas: 0,
                }
            }
            resumen[cid].total_saldo += Number(row.saldo)
            resumen[cid].facturas += 1
        }

        return Object.values(resumen).sort((a, b) => b.total_saldo - a.total_saldo)
    },
}
