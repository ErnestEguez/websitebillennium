import { supabase } from '../lib/supabase'
import { auditService } from './auditoria/auditService'
import {
    calcularCreditoElectrodomesticos,
    type ParametrosCredito,
    type ResultadoAmortizacion,
    type Periodicidad,
    type TipoTasa,
} from './creditoElectrodomesticosCalculo'
import { distribuirPagoCuotas, type CuotaParaCobro, type ResultadoDistribucionPago } from './creditoElectrodomesticosCobro'

// ============================================================
// Orquestador — Ventas a Crédito de Electrodomésticos (Fase 2)
// ============================================================
// Decide QUÉ se le pasa al motor puro de Fase 1 (ej. resolverSaldoADiferir,
// que resuelve el Caso 6 del requerimiento: base SALDO_DESPUES_ENTRADA vs
// TOTAL_VENTA) y persiste el resultado atómicamente vía la RPC
// fn_crear_credito_electrodomestico (cabecera + cuotas en una sola
// transacción — nunca puede quedar una sin la otra).
// ============================================================

export type BaseCalculoInteres = 'SALDO_DESPUES_ENTRADA' | 'TOTAL_VENTA'
export type EstadoCredito = 'CALCULADO' | 'VIGENTE' | 'EN_MORA' | 'LIQUIDADO' | 'ANULADO'
export type EstadoCuota = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA' | 'ANULADA'

export interface ConfigCreditoElectrodomesticos {
    empresa_id: string
    permite_garante_opcional: boolean
    permite_periodicidad_diaria: boolean
    permite_periodicidad_semanal: boolean
    permite_periodicidad_mensual: boolean
    permite_pago_anticipado: boolean
    permite_mora: boolean
    dias_gracia_mora: number
    tasa_mora_default: number
    redondeo_cuota: number
    base_calculo_interes: BaseCalculoInteres
    prefijo_contrato: string | null
    prefijo_pagare: string | null
}

export const CONFIG_CREDITO_DEFAULTS: Omit<ConfigCreditoElectrodomesticos, 'empresa_id'> = {
    permite_garante_opcional: true,
    permite_periodicidad_diaria: true,
    permite_periodicidad_semanal: true,
    permite_periodicidad_mensual: true,
    permite_pago_anticipado: true,
    permite_mora: false,
    dias_gracia_mora: 0,
    tasa_mora_default: 0,
    redondeo_cuota: 0.01,
    base_calculo_interes: 'SALDO_DESPUES_ENTRADA',
    prefijo_contrato: null,
    prefijo_pagare: null,
}

export interface CuotaCredito {
    id: string
    credito_id: string
    numero_cuota: number
    fecha_vencimiento: string
    saldo_inicial: number
    capital_programado: number
    interes_programado: number
    cuota_programada: number
    saldo_final_programado: number
    capital_pagado: number
    interes_pagado: number
    mora_pagada: number
    total_pagado: number
    saldo_pendiente: number
    estado: EstadoCuota
}

export type MetodoPagoCredito = 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | 'nota_credito' | 'otros'

export interface PagoCuotaCredito {
    id: string
    cuota_id: string
    credito_id: string
    empresa_id: string
    fecha_pago: string
    valor: number
    metodo_pago: MetodoPagoCredito
    referencia: string | null
    // Cancelación Oficina — ver 20260909b: interno = consecutivo del sistema,
    // externo = número que el cajero escribe a mano desde su talonario físico.
    recibo_interno: number | null
    recibo_externo: string | null
    cuenta_bancaria_id: string | null
    papeleta_deposito: string | null
    mora_aplicada: number
    interes_aplicado: number
    capital_aplicado: number
    estado: 'activo' | 'reversado'
    reversado_at: string | null
    motivo_reversa: string | null
    created_at: string
}

export interface CreditoElectrodomesticos {
    id: string
    empresa_id: string
    factura_id: string
    cliente_id: string
    garante_cliente_id: string | null
    cobrador_id: string
    fecha_venta: string
    fecha_primer_vencimiento: string
    fecha_ultimo_vencimiento: string
    total_factura: number
    valor_entrada: number
    saldo_a_diferir: number
    base_calculo_interes: BaseCalculoInteres
    tipo_tasa: TipoTasa
    tasa_valor: number
    periodicidad: Periodicidad
    numero_cuotas: number
    valor_cuota_referencial: number
    total_intereses: number
    total_financiado: number
    total_pagado: number
    saldo_pendiente: number
    contrato_numero: string | null
    pagare_numero: string | null
    estado: EstadoCredito
    observaciones: string | null
    created_at: string
    // joins
    clientes?: { nombre: string; identificacion: string }
    garante?: { nombre: string; identificacion: string } | null
    cobradores?: { nombres: string; codigo: string | null }
    comprobantes?: { secuencial: string } | null
    cuotas?: CuotaCredito[]
}

export interface CrearCreditoInput {
    empresaId: string
    facturaId: string
    clienteId: string
    garanteClienteId?: string | null
    cobradorId: string
    totalFactura: number
    valorEntrada: number
    tipoTasa: TipoTasa
    tasaValor: number
    periodicidad: Periodicidad
    numeroCuotas: number
    fechaPrimerVencimiento: string
    /** Si no se pasa, se lee de config_credito_electrodomesticos (o el default). */
    baseCalculoInteres?: BaseCalculoInteres
    observaciones?: string
    createdBy?: string
}

export const creditoElectrodomesticosService = {

    async getConfig(empresaId: string): Promise<ConfigCreditoElectrodomesticos> {
        const { data, error } = await supabase
            .from('config_credito_electrodomesticos')
            .select('*')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        if (error) throw error
        return data ? (data as ConfigCreditoElectrodomesticos) : { empresa_id: empresaId, ...CONFIG_CREDITO_DEFAULTS }
    },

    async guardarConfig(config: ConfigCreditoElectrodomesticos): Promise<void> {
        const { error } = await supabase
            .from('config_credito_electrodomesticos')
            .upsert({ ...config, updated_at: new Date().toISOString() })
        if (error) throw error
    },

    // Caso 6 del requerimiento: la base sobre la que se calcula el interés.
    // SALDO_DESPUES_ENTRADA (default, recomendado) = total - entrada.
    // TOTAL_VENTA = la entrada NO reduce la base — el caller debe advertir
    // esto en la UI antes de confirmar (ver Fase 3), aquí solo se resuelve
    // el número.
    resolverSaldoADiferir(totalFactura: number, valorEntrada: number, base: BaseCalculoInteres): number {
        if (valorEntrada < 0) throw new Error('El valor de entrada no puede ser negativo')
        if (valorEntrada >= totalFactura) throw new Error('El valor de entrada debe ser menor al total de la venta')
        return base === 'TOTAL_VENTA' ? totalFactura : totalFactura - valorEntrada
    },

    /** Solo calcula — no persiste nada. Para la vista previa de la tabla de amortización antes de confirmar (Fase 3). */
    simular(input: Omit<CrearCreditoInput, 'empresaId' | 'facturaId' | 'clienteId' | 'cobradorId' | 'createdBy'> & { baseCalculoInteres: BaseCalculoInteres }): ResultadoAmortizacion {
        const saldoADiferir = this.resolverSaldoADiferir(input.totalFactura, input.valorEntrada, input.baseCalculoInteres)
        const params: ParametrosCredito = {
            saldoADiferir,
            tipoTasa: input.tipoTasa,
            tasaValor: input.tasaValor,
            periodicidad: input.periodicidad,
            numeroCuotas: input.numeroCuotas,
            fechaPrimerVencimiento: input.fechaPrimerVencimiento,
        }
        return calcularCreditoElectrodomesticos(params)
    },

    async crear(input: CrearCreditoInput): Promise<CreditoElectrodomesticos> {
        const config = input.baseCalculoInteres
            ? null
            : await this.getConfig(input.empresaId)
        const base = input.baseCalculoInteres ?? config?.base_calculo_interes ?? 'SALDO_DESPUES_ENTRADA'

        const saldoADiferir = this.resolverSaldoADiferir(input.totalFactura, input.valorEntrada, base)
        const resultado = calcularCreditoElectrodomesticos({
            saldoADiferir,
            tipoTasa: input.tipoTasa,
            tasaValor: input.tasaValor,
            periodicidad: input.periodicidad,
            numeroCuotas: input.numeroCuotas,
            fechaPrimerVencimiento: input.fechaPrimerVencimiento,
        })

        const fechaUltimoVencimiento = resultado.cuotas[resultado.cuotas.length - 1].fecha_vencimiento

        const creditoPayload = {
            empresa_id: input.empresaId,
            factura_id: input.facturaId,
            cliente_id: input.clienteId,
            garante_cliente_id: input.garanteClienteId || '',
            cobrador_id: input.cobradorId,
            fecha_venta: new Date().toISOString().slice(0, 10),
            fecha_primer_vencimiento: input.fechaPrimerVencimiento,
            fecha_ultimo_vencimiento: fechaUltimoVencimiento,
            total_factura: input.totalFactura,
            valor_entrada: input.valorEntrada,
            saldo_a_diferir: saldoADiferir,
            base_calculo_interes: base,
            tipo_tasa: input.tipoTasa,
            tasa_valor: input.tasaValor,
            periodicidad: input.periodicidad,
            numero_cuotas: input.numeroCuotas,
            valor_cuota_referencial: resultado.valor_cuota_referencial,
            total_intereses: resultado.total_intereses,
            total_financiado: resultado.total_financiado,
            observaciones: input.observaciones || '',
            created_by: input.createdBy || '',
        }

        const { data: creditoId, error } = await supabase.rpc('fn_crear_credito_electrodomestico', {
            p_credito: creditoPayload,
            p_cuotas: resultado.cuotas,
        })
        if (error) throw error

        return this.getCompleto(creditoId as string)
    },

    async getCompleto(id: string): Promise<CreditoElectrodomesticos> {
        const { data, error } = await supabase
            .from('creditos_electrodomesticos')
            .select(`
                *,
                clientes:cliente_id (nombre, identificacion),
                garante:garante_cliente_id (nombre, identificacion),
                cobradores (nombres, codigo),
                comprobantes:factura_id (secuencial),
                cuotas:creditos_electrodomesticos_cuotas (*)
            `)
            .eq('id', id)
            .single()
        if (error) throw error
        const credito = data as any
        if (credito.cuotas) credito.cuotas.sort((a: CuotaCredito, b: CuotaCredito) => a.numero_cuota - b.numero_cuota)
        return credito as CreditoElectrodomesticos
    },

    async listar(empresaId: string, filtroEstado?: EstadoCredito): Promise<CreditoElectrodomesticos[]> {
        let query = supabase
            .from('creditos_electrodomesticos')
            .select(`
                *,
                clientes:cliente_id (nombre, identificacion),
                cobradores (nombres, codigo),
                comprobantes:factura_id (secuencial)
            `)
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })

        if (filtroEstado) query = query.eq('estado', filtroEstado)

        const { data, error } = await query
        if (error) throw error
        return (data || []) as CreditoElectrodomesticos[]
    },

    async getPorFactura(facturaId: string): Promise<CreditoElectrodomesticos | null> {
        const { data, error } = await supabase
            .from('creditos_electrodomesticos')
            .select('*')
            .eq('factura_id', facturaId)
            .maybeSingle()
        if (error) throw error
        return data as CreditoElectrodomesticos | null
    },

    /** Factura ya autorizada por el SRI → el crédito pasa de CALCULADO a VIGENTE. */
    async marcarVigente(id: string): Promise<void> {
        const { error } = await supabase
            .from('creditos_electrodomesticos')
            .update({ estado: 'VIGENTE', updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('estado', 'CALCULADO')
        if (error) throw error
    },

    // ── Pagos de cuota ───────────────────────────────────────────────────
    // v1 (Fase 5, alcance reducido): un pago se aplica completo contra UNA
    // cuota (capital+interés juntos, sin desglose) — el orden mora→interés→
    // capital y el pago repartido entre varias cuotas de una vez quedan
    // para cuando se defina la política de mora (ver plan de Fase 5).

    async getPagosDeCuota(cuotaId: string): Promise<PagoCuotaCredito[]> {
        const { data, error } = await supabase
            .from('creditos_electrodomesticos_pagos')
            .select('*')
            .eq('cuota_id', cuotaId)
            .order('fecha_pago', { ascending: false })
        if (error) throw error
        return (data || []) as PagoCuotaCredito[]
    },

    async registrarPago(input: {
        cuotaId: string
        creditoId: string
        empresaId: string
        valor: number
        metodoPago: MetodoPagoCredito
        referencia?: string
    }): Promise<PagoCuotaCredito> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('creditos_electrodomesticos_pagos')
            .insert({
                cuota_id: input.cuotaId,
                credito_id: input.creditoId,
                empresa_id: input.empresaId,
                fecha_pago: new Date().toISOString().slice(0, 10),
                valor: input.valor,
                metodo_pago: input.metodoPago,
                referencia: input.referencia || null,
                usuario_id: user?.id || null,
            })
            .select()
            .single()
        if (error) throw error
        // El trigger fn_actualizar_saldo_cuota_credito_electro (y en cascada
        // fn_actualizar_credito_electro_desde_cuotas) recalculan saldo/estado.

        auditService.logEvent({
            empresaId: input.empresaId,
            modulo: 'credito_electrodomesticos',
            accion: 'crear',
            entidad: 'credito_electrodomesticos_pago',
            entidadId: (data as any).id,
            resumen: `Pago de cuota de crédito por ${input.valor}`,
            detalle: { cuota_id: input.cuotaId, credito_id: input.creditoId, metodo_pago: input.metodoPago, valor: input.valor },
        })

        return data as PagoCuotaCredito
    },

    async reversarPago(pagoId: string, motivo?: string): Promise<void> {
        const { data: pago, error: errPago } = await supabase
            .from('creditos_electrodomesticos_pagos')
            .select('id, estado, empresa_id, cuota_id, credito_id')
            .eq('id', pagoId)
            .single()
        if (errPago) throw errPago
        if (pago.estado === 'reversado') throw new Error('Este pago ya fue reversado')

        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('creditos_electrodomesticos_pagos')
            .update({
                estado: 'reversado',
                reversado_at: new Date().toISOString(),
                reversado_por: user?.id || null,
                motivo_reversa: motivo || null,
            })
            .eq('id', pagoId)
        if (error) throw error

        auditService.logEvent({
            empresaId: pago.empresa_id,
            modulo: 'credito_electrodomesticos',
            accion: 'reversar',
            entidad: 'credito_electrodomesticos_pago',
            entidadId: pagoId,
            resumen: 'Reversión de pago de cuota de crédito',
            detalle: { motivo, cuota_id: pago.cuota_id, credito_id: pago.credito_id },
            nivel: 'sensible',
        })
    },

    // ── Cancelación Oficina ──────────────────────────────────────────────

    /** Cambia el cobrador asignado a un crédito ya creado — el dropdown de Cancelación Oficina muestra el guardado pero permite cambiarlo. */
    async cambiarCobrador(creditoId: string, empresaId: string, cobradorId: string): Promise<void> {
        const { data: antes } = await supabase.from('creditos_electrodomesticos').select('cobrador_id').eq('id', creditoId).single()
        const { error } = await supabase
            .from('creditos_electrodomesticos')
            .update({ cobrador_id: cobradorId, updated_at: new Date().toISOString() })
            .eq('id', creditoId)
        if (error) throw error

        auditService.logEvent({
            empresaId,
            modulo: 'credito_electrodomesticos',
            accion: 'actualizar',
            entidad: 'credito_electrodomesticos',
            entidadId: creditoId,
            resumen: 'Reasignación de cobrador',
            cambios: { cobrador_id: { antes: antes?.cobrador_id ?? null, despues: cobradorId } },
        })
    },

    /** Clientes con al menos un crédito de electrodomésticos con saldo pendiente > 0 (paso 1 de Cancelación Oficina). */
    async buscarClientesConDeuda(empresaId: string, texto: string): Promise<{ id: string; nombre: string; identificacion: string; saldoTotal: number }[]> {
        const q = '%' + texto.trim() + '%'
        const { data, error } = await supabase
            .from('creditos_electrodomesticos')
            .select('cliente_id, saldo_pendiente, clientes:cliente_id (nombre, identificacion)')
            .eq('empresa_id', empresaId)
            .gt('saldo_pendiente', 0)
            .neq('estado', 'ANULADO')
            .or(`clientes.nombre.ilike.${q},clientes.identificacion.ilike.${q}`)
        if (error) throw error

        const porCliente = new Map<string, { id: string; nombre: string; identificacion: string; saldoTotal: number }>()
        for (const row of (data || []) as any[]) {
            if (!row.clientes) continue
            const existente = porCliente.get(row.cliente_id)
            if (existente) {
                existente.saldoTotal = existente.saldoTotal + Number(row.saldo_pendiente)
            } else {
                porCliente.set(row.cliente_id, {
                    id: row.cliente_id,
                    nombre: row.clientes.nombre,
                    identificacion: row.clientes.identificacion,
                    saldoTotal: Number(row.saldo_pendiente),
                })
            }
        }
        return Array.from(porCliente.values())
    },

    /** Créditos con deuda de un cliente ya elegido (paso 2 de Cancelación Oficina). */
    async listarCreditosConDeudaPorCliente(empresaId: string, clienteId: string): Promise<CreditoElectrodomesticos[]> {
        const { data, error } = await supabase
            .from('creditos_electrodomesticos')
            .select(`
                *,
                clientes:cliente_id (nombre, identificacion),
                cobradores (nombres, codigo),
                comprobantes:factura_id (secuencial)
            `)
            .eq('empresa_id', empresaId)
            .eq('cliente_id', clienteId)
            .gt('saldo_pendiente', 0)
            .neq('estado', 'ANULADO')
            .order('fecha_venta', { ascending: true })
        if (error) throw error
        return (data || []) as CreditoElectrodomesticos[]
    },

    /**
     * Cobro que puede repartirse entre varias cuotas de un mismo crédito
     * (mora → interés → capital dentro de cada una, cascada de sobrante a
     * la siguiente) — Cancelación Oficina. Genera un recibo interno
     * automático (consecutivo por empresa) y guarda el recibo externo tal
     * como lo escribió el cajero, si aplica.
     */
    async registrarCobroMultiple(input: {
        empresaId: string
        creditoId: string
        cuotas: CuotaParaCobro[] // ya ordenadas, más antigua primero
        montoTotal: number
        fechaHoy: string
        metodoPago: MetodoPagoCredito
        referencia?: string
        cuentaBancariaId?: string | null
        papeletaDeposito?: string | null
        reciboExterno?: string | null
    }): Promise<{ distribucion: ResultadoDistribucionPago; reciboInterno: number; pagos: PagoCuotaCredito[] }> {
        if (input.montoTotal <= 0) throw new Error('El monto a cobrar debe ser mayor a cero')

        const config = await this.getConfig(input.empresaId)
        const tasaMora = config.permite_mora ? config.tasa_mora_default : 0

        const distribucion = distribuirPagoCuotas(input.cuotas, input.montoTotal, input.fechaHoy, tasaMora, config.dias_gracia_mora)
        if (distribucion.aplicaciones.length === 0) {
            throw new Error('El monto ingresado no se pudo aplicar a ninguna cuota (¿ya están todas pagadas?).')
        }
        if (distribucion.montoSobrante > 0) {
            throw new Error(
                `El monto ingresado (${input.montoTotal}) supera la deuda total seleccionada por ${distribucion.montoSobrante.toFixed(2)}. ` +
                `Incluye más cuotas o reduce el valor.`
            )
        }

        const { data: reciboInterno, error: errRecibo } = await supabase.rpc('fn_next_recibo_interno_credito', { p_empresa_id: input.empresaId })
        if (errRecibo) throw errRecibo

        const { data: { user } } = await supabase.auth.getUser()
        const filas = distribucion.aplicaciones.map(a => ({
            cuota_id: a.cuotaId,
            credito_id: input.creditoId,
            empresa_id: input.empresaId,
            fecha_pago: input.fechaHoy,
            valor: a.totalAplicado,
            metodo_pago: input.metodoPago,
            referencia: input.referencia || null,
            recibo_interno: reciboInterno,
            recibo_externo: input.reciboExterno || null,
            cuenta_bancaria_id: input.cuentaBancariaId || null,
            papeleta_deposito: input.papeletaDeposito || null,
            mora_aplicada: a.moraAplicada,
            interes_aplicado: a.interesAplicado,
            capital_aplicado: a.capitalAplicado,
            usuario_id: user?.id || null,
        }))

        const { data: pagos, error } = await supabase.from('creditos_electrodomesticos_pagos').insert(filas).select()
        if (error) throw error
        // Los triggers de Fase 2 (extendidos en 20260909b) recalculan saldo,
        // estado y el desglose mora/interés/capital pagado de cada cuota, y
        // en cascada el rollup de la cabecera del crédito.

        auditService.logEvent({
            empresaId: input.empresaId,
            modulo: 'credito_electrodomesticos',
            accion: 'crear',
            entidad: 'credito_electrodomesticos_cobro',
            entidadId: input.creditoId,
            numeroDocumento: String(reciboInterno),
            resumen: `Cobro de crédito — recibo interno #${reciboInterno} por ${input.montoTotal}`,
            detalle: {
                credito_id: input.creditoId,
                recibo_interno: reciboInterno,
                recibo_externo: input.reciboExterno,
                monto_total: input.montoTotal,
                cuotas_afectadas: distribucion.aplicaciones.map(a => a.numeroCuota),
            },
        })

        return { distribucion, reciboInterno: reciboInterno as number, pagos: (pagos || []) as PagoCuotaCredito[] }
    },
}
