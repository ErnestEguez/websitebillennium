import { supabase } from '../lib/supabase'
import {
    calcularCreditoElectrodomesticos,
    type ParametrosCredito,
    type ResultadoAmortizacion,
    type Periodicidad,
    type TipoTasa,
} from './creditoElectrodomesticosCalculo'

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
                cobradores (nombres, codigo)
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
}
