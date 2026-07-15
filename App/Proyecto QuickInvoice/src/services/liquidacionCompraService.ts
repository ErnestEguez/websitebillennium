// ============================================================
// liquidacionCompraService — Liquidaciones de Compra (codDoc=03)
// ============================================================

import { supabase } from '../lib/supabase'
import type {
    LiquidacionCompra,
    LiquidacionCompraCompleta,
    CreateLiquidacionInput,
    KPIsLC,
} from '../types/liquidacionCompra'
import { LIMITES_LC } from '../types/liquidacionCompra'

const LC_SELECT = `
    *,
    proveedor:proveedores(nombre_empresa, ruc),
    punto:puntos_emision(establecimiento, punto_emision, nombre)
`

const LC_COMPLETA_SELECT = `
    *,
    proveedor:proveedores(nombre_empresa, ruc),
    punto:puntos_emision(establecimiento, punto_emision, nombre),
    detalles:liquidacion_compra_detalles(*),
    retenciones:retenciones_compras!liquidacion_id(*),
    cxp:cuentas_por_pagar(id, saldo_pendiente, estado, fecha_vencimiento)
`

export const liquidacionCompraService = {

    // ── Listar ────────────────────────────────────────────────────
    async listar(empresaId: string, filtros?: {
        estado?: string
        desde?: string
        hasta?: string
        busqueda?: string
    }): Promise<LiquidacionCompra[]> {
        let q = supabase
            .from('liquidaciones_compra')
            .select(LC_SELECT)
            .eq('empresa_id', empresaId)
            .order('fecha_emision', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(200)

        if (filtros?.estado)    q = q.eq('estado_sri', filtros.estado)
        if (filtros?.desde)     q = q.gte('fecha_emision', filtros.desde)
        if (filtros?.hasta)     q = q.lte('fecha_emision', filtros.hasta)
        if (filtros?.busqueda) {
            const b = filtros.busqueda
            q = q.or(`beneficiario_nombre.ilike.%${b}%,beneficiario_identificacion.ilike.%${b}%,secuencial.ilike.%${b}%`)
        }

        const { data, error } = await q
        if (error) throw error
        return data as LiquidacionCompra[]
    },

    // ── KPIs del año en curso ─────────────────────────────────────
    async getKPIs(empresaId: string, anio?: number): Promise<KPIsLC> {
        const y = anio ?? new Date().getFullYear()
        const { data, error } = await supabase
            .from('liquidaciones_compra')
            .select('estado_sri, total')
            .eq('empresa_id', empresaId)
            .gte('fecha_emision', `${y}-01-01`)
            .lte('fecha_emision', `${y}-12-31`)

        if (error) throw error
        const rows = data as { estado_sri: string; total: number }[]
        const activas = rows.filter(r => r.estado_sri !== 'ANULADO')

        return {
            total:            activas.length,
            autorizadas:      activas.filter(r => r.estado_sri === 'AUTORIZADO').length,
            pendientes:       activas.filter(r => r.estado_sri === 'PENDIENTE').length,
            rechazadas:       activas.filter(r => r.estado_sri === 'RECHAZADO').length,
            monto_total:      activas.reduce((s, r) => s + (r.total ?? 0), 0),
            monto_autorizado: activas.filter(r => r.estado_sri === 'AUTORIZADO').reduce((s, r) => s + (r.total ?? 0), 0),
        }
    },

    // ── Obtener con todos los joins ───────────────────────────────
    async obtenerCompleta(id: string): Promise<LiquidacionCompraCompleta> {
        const { data, error } = await supabase
            .from('liquidaciones_compra')
            .select(LC_COMPLETA_SELECT)
            .eq('id', id)
            .single()
        if (error) throw error
        return data as LiquidacionCompraCompleta
    },

    // ── Verificar límites anuales SRI ─────────────────────────────
    async verificarLimites(
        empresaId: string,
        beneficiarioIdentificacion: string,
        montoNuevo: number,
    ): Promise<{ porBeneficiario: number; totalAnio: number; alertaBeneficiario: boolean; alertaTotal: boolean }> {
        const y = new Date().getFullYear()
        const { data } = await supabase
            .from('liquidaciones_compra')
            .select('beneficiario_identificacion, total')
            .eq('empresa_id', empresaId)
            .gte('fecha_emision', `${y}-01-01`)
            .lte('fecha_emision', `${y}-12-31`)
            .neq('estado_sri', 'ANULADO')

        const rows = (data ?? []) as { beneficiario_identificacion: string; total: number }[]

        const porBeneficiario = rows
            .filter(r => r.beneficiario_identificacion === beneficiarioIdentificacion)
            .reduce((s, r) => s + (r.total ?? 0), 0) + montoNuevo

        const totalAnio = rows.reduce((s, r) => s + (r.total ?? 0), 0) + montoNuevo

        return {
            porBeneficiario,
            totalAnio,
            alertaBeneficiario: porBeneficiario > LIMITES_LC.POR_BENEFICIARIO_ANIO,
            alertaTotal:        totalAnio > LIMITES_LC.TOTAL_ANIO,
        }
    },

    // ── Crear LC + detalles + retenciones + CxP opcional ─────────
    async crear(input: CreateLiquidacionInput): Promise<LiquidacionCompra> {
        // 1. Obtener secuencial atómico
        const { data: seqData, error: seqError } = await supabase.rpc(
            'qi_next_secuencial_punto',
            { p_punto_emision_id: input.punto_emision_id, p_tipo_comprobante: 'LIQUIDACION' },
        )
        if (seqError) throw new Error(`Secuencial: ${seqError.message}`)
        const secuencial = String(seqData).padStart(9, '0')

        // 2. Datos del punto de emisión
        const { data: puntoData, error: puntoError } = await supabase
            .from('puntos_emision')
            .select('establecimiento, punto_emision')
            .eq('id', input.punto_emision_id)
            .single()
        if (puntoError) throw new Error(`Punto emisión: ${puntoError.message}`)
        const pe = puntoData as { establecimiento: string; punto_emision: string }

        // 3. Resolver proveedor (buscar por identificación o crear automáticamente)
        const TIPO_ID_PROV: Record<string, string> = {
            CEDULA: 'CEDULA', PASAPORTE: 'PASAPORTE', SIN_RUC: 'CEDULA', EXTERIOR: 'EXTERIOR',
        }
        let proveedorIdFinal = input.proveedor_id ?? null

        if (!proveedorIdFinal) {
            // Buscar si ya existe un proveedor con esa identificación en la empresa
            const { data: existente } = await supabase
                .from('proveedores')
                .select('id')
                .eq('empresa_id', input.empresa_id)
                .eq('ruc', input.beneficiario_identificacion)
                .maybeSingle()

            if (existente) {
                proveedorIdFinal = (existente as { id: string }).id
            } else {
                // Crear nuevo proveedor con los datos del beneficiario
                const { data: nuevo, error: provErr } = await supabase
                    .from('proveedores')
                    .insert({
                        empresa_id:             input.empresa_id,
                        ruc:                    input.beneficiario_identificacion,
                        nombre_empresa:         input.beneficiario_nombre,
                        tipo_identificacion:    TIPO_ID_PROV[input.beneficiario_tipo_id] ?? 'CEDULA',
                        tipo_proveedor:         'PERSONA_NATURAL',
                        estado:                 'ACTIVO',
                        condicion_pago:         input.forma_pago,
                        pais:                   'Ecuador',
                        correo:                 input.beneficiario_email ?? null,
                        direccion:              input.beneficiario_direccion ?? null,
                        contribuyente_especial: false,
                        agente_retencion:       false,
                        tipo_regimen:           'GENERAL',
                    })
                    .select('id')
                    .single()
                if (provErr) throw new Error(`Error creando proveedor automático: ${provErr.message}`)
                proveedorIdFinal = (nuevo as { id: string }).id
            }
        }

        // 4. Calcular totales
        const r2 = (n: number) => Math.round(n * 100) / 100
        const base_iva_0  = r2(input.detalles.filter(d => !d.aplica_iva).reduce((s, d) => s + d.subtotal, 0))
        const base_iva_15 = r2(input.detalles.filter(d => d.aplica_iva).reduce((s, d) => s + d.subtotal, 0))
        const subtotal    = r2(base_iva_0 + base_iva_15)
        const valor_iva   = r2(base_iva_15 * 0.15)
        const total       = r2(subtotal + valor_iva)
        const total_retenciones = r2(input.retenciones.reduce((s, r) => s + r.valor, 0))

        // 5. Insertar cabecera
        const { data: lc, error: lcError } = await supabase
            .from('liquidaciones_compra')
            .insert({
                empresa_id:                  input.empresa_id,
                punto_emision_id:            input.punto_emision_id,
                establecimiento:             pe.establecimiento,
                punto_emision:               pe.punto_emision,
                secuencial,
                proveedor_id:                proveedorIdFinal,
                beneficiario_tipo_id:        input.beneficiario_tipo_id,
                beneficiario_identificacion: input.beneficiario_identificacion,
                beneficiario_nombre:         input.beneficiario_nombre,
                beneficiario_direccion:      input.beneficiario_direccion ?? null,
                beneficiario_email:          input.beneficiario_email ?? null,
                fecha_emision:               input.fecha_emision,
                tipo_sustento:               input.tipo_sustento,
                tipo_regimen_pago:           input.tipo_regimen_pago,
                pais_pago_exterior:          input.pais_pago_exterior ?? null,
                aplica_convenio_ddi:         input.aplica_convenio_ddi,
                subtotal,
                base_iva_0,
                base_iva_15,
                valor_iva,
                total,
                total_retenciones,
                forma_pago:                  input.forma_pago,
                fecha_vencimiento:           input.fecha_vencimiento ?? null,
                observaciones:               input.observaciones ?? null,
                estado_sri:                  'PENDIENTE',
                created_by:                  input.created_by ?? null,
            })
            .select()
            .single()
        if (lcError) throw new Error(`Liquidación: ${lcError.message}`)
        const lcRecord = lc as LiquidacionCompra

        // 6. Detalles
        if (input.detalles.length > 0) {
            const { error: detErr } = await supabase
                .from('liquidacion_compra_detalles')
                .insert(input.detalles.map((d, i) => ({
                    ...d,
                    empresa_id:     input.empresa_id,
                    liquidacion_id: lcRecord.id,
                    orden:          i + 1,
                })))
            if (detErr) throw new Error(`Detalles: ${detErr.message}`)
        }

        // 7. Retenciones — se guardan en retenciones_compras (tabla unificada)
        if (input.retenciones.length > 0) {
            const { error: retErr } = await supabase
                .from('retenciones_compras')
                .insert(input.retenciones.map((r: any) => ({
                    empresa_id:       input.empresa_id,
                    liquidacion_id:   lcRecord.id,
                    compra_id:        null,
                    proveedor_id:     proveedorIdFinal,
                    fecha_emision:    input.fecha_emision,
                    tipo:             r.tipo === 'IR' ? 'FUENTE' : r.tipo,
                    codigo_retencion: r.codigo_retencion,
                    descripcion:      r.descripcion ?? null,
                    base_imponible:   r.base_imponible,
                    porcentaje:       r.porcentaje,
                    valor:            r.valor,
                    estado:           'ACTIVO',
                    origen:           'MANUAL',
                    estado_sri:       'NO_FIRMADA',
                })))
            if (retErr) throw new Error(`Retenciones: ${retErr.message}`)
        }

        // 8. CxP si es crédito — proveedorIdFinal siempre está resuelto
        if (input.forma_pago === 'CREDITO') {
            const numLC = `${lcRecord.establecimiento}-${lcRecord.punto_emision}-${lcRecord.secuencial}`
            await supabase.from('cuentas_por_pagar').insert({
                empresa_id:        input.empresa_id,
                proveedor_id:      proveedorIdFinal,
                liquidacion_id:    lcRecord.id,
                fecha_emision:     input.fecha_emision,
                fecha_vencimiento: input.fecha_vencimiento ?? input.fecha_emision,
                monto_original:    r2(total - total_retenciones),
                saldo_pendiente:   r2(total - total_retenciones),
                estado:            'PENDIENTE',
                observaciones:     `LC ${numLC} — ${input.beneficiario_nombre}`,
            })
        }

        return lcRecord
    },

    // ── Autorizar en SRI ──────────────────────────────────────────
    // Requiere que sri-signer procese el parámetro liquidacion_id con codDoc='03'
    async autorizar(id: string): Promise<LiquidacionCompra> {
        const { data, error } = await supabase.functions.invoke('sri-signer', {
            body: { liquidacion_id: id },
        })
        if (error) throw new Error(`Error invocando sri-signer: ${error.message}`)
        if (data?.error) throw new Error(data.error)

        // Releer con joins actualizados por la edge function
        const { data: updated, error: err2 } = await supabase
            .from('liquidaciones_compra')
            .select(LC_SELECT)
            .eq('id', id)
            .single()
        if (err2) throw err2
        return updated as LiquidacionCompra
    },

    // ── Anular ────────────────────────────────────────────────────
    async anular(id: string, motivo: string): Promise<void> {
        const { error } = await supabase
            .from('liquidaciones_compra')
            .update({ estado_sri: 'ANULADO', motivo_anulacion: motivo })
            .eq('id', id)
        if (error) throw error

        // También actualizar CxP relacionada si existe
        await supabase
            .from('cuentas_por_pagar')
            .update({ estado: 'ANULADO' })
            .eq('liquidacion_id', id)
    },

    // ── Datos para exportar a Excel ───────────────────────────────
    async paraExcel(empresaId: string, desde: string, hasta: string): Promise<LiquidacionCompra[]> {
        const { data, error } = await supabase
            .from('liquidaciones_compra')
            .select(LC_SELECT)
            .eq('empresa_id', empresaId)
            .gte('fecha_emision', desde)
            .lte('fecha_emision', hasta)
            .neq('estado_sri', 'ANULADO')
            .order('fecha_emision', { ascending: false })
        if (error) throw error
        return data as LiquidacionCompra[]
    },
}
