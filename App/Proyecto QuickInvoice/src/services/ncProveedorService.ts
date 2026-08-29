import { supabase } from '../lib/supabase'
import { kardexService } from './kardexService'
import { contableConfigService } from './contableConfigService'
import { contabilidadComprasService } from './contabilidadComprasService'
import { auditService } from './auditoria/auditService'

export type TipoNCProveedor = 'DEVOLUCION_MERCADERIA' | 'NC_VALOR'
export type EstadoNCProveedor = 'ACTIVA' | 'ANULADA'

export interface NCProveedorDetalle {
    id?: string
    nc_proveedor_id?: string
    detalle_ingreso_id: string
    producto_id: string
    bodega_id?: string | null
    cantidad: number
    costo_unitario: number
    subtotal: number
    producto?: { nombre: string; codigo: string }
}

export interface NCProveedor {
    id: string
    empresa_id: string
    proveedor_id: string
    compra_id: string
    cxp_id?: string | null
    tipo: TipoNCProveedor
    numero_nc?: string | null
    autorizacion_nc?: string | null
    fecha_nc: string
    observacion?: string | null
    base_iva_0: number
    base_iva_5: number
    base_iva_15: number
    valor_iva: number
    total: number
    cuenta_contra_id?: string | null
    estado: EstadoNCProveedor
    // Documento modificado — respaldo manual cuando la compra vinculada no
    // tiene clave_acceso real, único caso en que el ATS no la puede armar
    // sola. Ver migración 20260828_docmod_manual_nc_nd_proveedores.sql.
    doc_mod_tipo?: string | null
    doc_mod_establecimiento?: string | null
    doc_mod_punto_emision?: string | null
    doc_mod_secuencial?: string | null
    doc_mod_autorizacion?: string | null
    motivo_anulacion?: string | null
    fecha_anulacion?: string | null
    anulado_por?: string | null
    lp_comprobante_id?: string | null
    created_by?: string | null
    created_at?: string
    updated_at?: string
    // Joins
    proveedor?: { nombre_empresa: string; ruc: string }
    compra?: { numero_factura: string | null; fecha_emision: string | null }
}

export interface NCProveedorConDetalle extends NCProveedor {
    detalle: NCProveedorDetalle[]
}

export interface NcProveedorInput {
    empresaId: string
    proveedorId: string
    compraId: string
    tipo: TipoNCProveedor
    numeroNc?: string
    autorizacionNc?: string
    fechaNc: string
    observacion?: string
    aplicarMismaFactura: boolean
    cxpDestinoId?: string | null
    baseIva0: number
    baseIva5: number
    baseIva15: number
    valorIva: number
    total: number
    cuentaContraId?: string | null
    // Documento modificado — solo hace falta llenarlo si la compra vinculada
    // no tiene clave_acceso real (proveedor sin factura electrónica).
    docModTipo?: string
    docModEstablecimiento?: string
    docModPuntoEmision?: string
    docModSecuencial?: string
    docModAutorizacion?: string
    detalle?: {
        detalleIngresoId: string
        productoId: string
        bodegaId?: string | null
        cantidad: number
        costoUnitario: number
        subtotal: number
    }[]
    usuarioId: string
    portalRuc: string
    proveedorNombre: string
}

const NC_SELECT = `
    *,
    proveedor:proveedores(nombre_empresa, ruc),
    compra:ingresos_stock(numero_factura, fecha_emision)
`

export const ncProveedorService = {

    async listar(empresaId: string, filtros?: { proveedorId?: string; tipo?: string; estado?: string }): Promise<NCProveedor[]> {
        let q = supabase
            .from('notas_credito_proveedores')
            .select(NC_SELECT)
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })

        if (filtros?.proveedorId) q = q.eq('proveedor_id', filtros.proveedorId)
        if (filtros?.tipo)        q = q.eq('tipo', filtros.tipo)
        if (filtros?.estado)      q = q.eq('estado', filtros.estado)

        const { data, error } = await q
        if (error) throw error
        return data as NCProveedor[]
    },

    async obtenerConDetalle(id: string): Promise<NCProveedorConDetalle> {
        const [ncRes, detRes] = await Promise.all([
            supabase.from('notas_credito_proveedores').select(NC_SELECT).eq('id', id).single(),
            supabase.from('notas_credito_proveedores_detalle').select('*, producto:productos(nombre,codigo)').eq('nc_proveedor_id', id),
        ])
        if (ncRes.error) throw ncRes.error
        return { ...ncRes.data, detalle: detRes.data ?? [] } as NCProveedorConDetalle
    },

    /** Busca compras del proveedor (o de cualquier proveedor si no se filtra) para elegir la factura origen de la N/C. */
    async buscarComprasParaNc(empresaId: string, texto: string): Promise<any[]> {
        const t = texto.trim()
        if (!t) return []
        const q = '%' + t.replace(/\*/g, '%') + '%'
        const { data, error } = await supabase
            .from('ingresos_stock')
            .select('*, proveedor:proveedores(id, nombre_empresa, ruc), cxp:cuentas_por_pagar(id, saldo_pendiente, estado)')
            .eq('empresa_id', empresaId)
            .in('estado', ['ACTIVO', 'DEVUELTO'])
            .or(`numero_factura.ilike.${q}`)
            .order('fecha_ingreso', { ascending: false })
            .limit(30)
        if (error) throw error
        return data ?? []
    },

    /** Cantidad ya devuelta por línea (detalle_ingreso_id) para una compra, por N/C activas. */
    async getCantidadesDevueltas(compraId: string): Promise<Record<string, number>> {
        const { data: ncs } = await supabase
            .from('notas_credito_proveedores')
            .select('id')
            .eq('compra_id', compraId)
            .eq('tipo', 'DEVOLUCION_MERCADERIA')
            .eq('estado', 'ACTIVA')

        if (!ncs || ncs.length === 0) return {}

        const { data: detalles } = await supabase
            .from('notas_credito_proveedores_detalle')
            .select('detalle_ingreso_id, cantidad')
            .in('nc_proveedor_id', ncs.map(n => n.id))

        const result: Record<string, number> = {}
        for (const d of (detalles ?? [])) {
            if (d.detalle_ingreso_id) {
                result[d.detalle_ingreso_id] = (result[d.detalle_ingreso_id] || 0) + Number(d.cantidad)
            }
        }
        return result
    },

    async crear(input: NcProveedorInput): Promise<NCProveedorConDetalle> {
        const r2 = (n: number) => Math.round(n * 100) / 100

        // 0. Validar N/C duplicada (mismo número + proveedor, ya registrada y ACTIVA).
        // Una N/C ANULADA no bloquea — permite corregir un error de digitación.
        if (input.numeroNc?.trim()) {
            // .limit(1) en vez de .maybeSingle(): con 2+ duplicados preexistentes
            // maybeSingle() falla (data=null) y el chequeo se desactiva solo.
            const { data: dup } = await supabase
                .from('notas_credito_proveedores')
                .select('id')
                .eq('empresa_id', input.empresaId)
                .eq('proveedor_id', input.proveedorId)
                .eq('numero_nc', input.numeroNc.trim())
                .eq('estado', 'ACTIVA')
                .limit(1)
            if (dup && dup.length > 0) throw new Error(`Ya existe una N/C activa con el número "${input.numeroNc.trim()}" para este proveedor.`)
        }

        // 1. Validar cantidades devueltas (solo DEVOLUCION_MERCADERIA)
        if (input.tipo === 'DEVOLUCION_MERCADERIA') {
            if (!input.detalle?.length) throw new Error('Agregue al menos una línea de producto a devolver')
            const yaDevuelto = await ncProveedorService.getCantidadesDevueltas(input.compraId)
            for (const d of input.detalle) {
                const disponibleInfo = yaDevuelto[d.detalleIngresoId] || 0
                if (disponibleInfo < 0) throw new Error('Cantidad devuelta inválida')
            }
        }

        // 2. Determinar CxP destino y monto a aplicar
        let cxpIdDestino: string | null = null
        if (input.aplicarMismaFactura) {
            const { data: cxpOrigen } = await supabase
                .from('cuentas_por_pagar').select('id, saldo_pendiente')
                .eq('compra_id', input.compraId).maybeSingle()
            cxpIdDestino = cxpOrigen?.id ?? null
        } else if (input.cxpDestinoId) {
            cxpIdDestino = input.cxpDestinoId
        }

        let montoAplicado = 0
        if (cxpIdDestino) {
            const { data: cxpDestino } = await supabase
                .from('cuentas_por_pagar').select('saldo_pendiente')
                .eq('id', cxpIdDestino).single()
            montoAplicado = Math.min(input.total, Number(cxpDestino?.saldo_pendiente ?? 0))
        }

        // 3. Insertar cabecera
        const { data: nc, error: eNc } = await supabase
            .from('notas_credito_proveedores')
            .insert({
                empresa_id: input.empresaId,
                proveedor_id: input.proveedorId,
                compra_id: input.compraId,
                cxp_id: cxpIdDestino,
                tipo: input.tipo,
                numero_nc: input.numeroNc || null,
                autorizacion_nc: input.autorizacionNc || null,
                fecha_nc: input.fechaNc,
                observacion: input.observacion || null,
                base_iva_0: r2(input.baseIva0),
                base_iva_5: r2(input.baseIva5),
                base_iva_15: r2(input.baseIva15),
                valor_iva: r2(input.valorIva),
                total: r2(input.total),
                cuenta_contra_id: input.cuentaContraId || null,
                estado: 'ACTIVA',
                created_by: input.usuarioId,
                doc_mod_tipo:             input.docModTipo || null,
                doc_mod_establecimiento:  input.docModEstablecimiento || null,
                doc_mod_punto_emision:    input.docModPuntoEmision || null,
                doc_mod_secuencial:       input.docModSecuencial || null,
                doc_mod_autorizacion:     input.docModAutorizacion || null,
            })
            .select().single()
        if (eNc || !nc) throw eNc ?? new Error('Error creando N/C de proveedor')

        auditService.logEvent({
            empresaId: input.empresaId,
            modulo: 'compras',
            accion: 'crear',
            entidad: 'nota_credito_proveedor',
            entidadId: nc.id,
            numeroDocumento: input.numeroNc ?? undefined,
            resumen: input.tipo === 'DEVOLUCION_MERCADERIA'
                ? `Devolución de compra a ${input.proveedorNombre}${input.numeroNc ? ` No. ${input.numeroNc}` : ''}`
                : `Nota de crédito de proveedor ${input.proveedorNombre}${input.numeroNc ? ` No. ${input.numeroNc}` : ''}`,
            detalle: { tipo: input.tipo, compra_id: input.compraId, total: input.total },
            nivel: 'sensible',
        })

        // 4. Detalle (solo DEVOLUCION_MERCADERIA)
        if (input.tipo === 'DEVOLUCION_MERCADERIA' && input.detalle?.length) {
            const { error: eDet } = await supabase
                .from('notas_credito_proveedores_detalle')
                .insert(input.detalle.map(d => ({
                    nc_proveedor_id: nc.id,
                    detalle_ingreso_id: d.detalleIngresoId,
                    producto_id: d.productoId,
                    bodega_id: d.bodegaId ?? null,
                    cantidad: d.cantidad,
                    costo_unitario: d.costoUnitario,
                    subtotal: r2(d.subtotal),
                })))
            if (eDet) throw eDet

            // 5. Kardex — SALIDA (reversa de la ENTRADA original), idempotente
            for (const d of input.detalle) {
                const motivo = `Devolución a proveedor — NC ${input.numeroNc || nc.id.slice(0, 8)}`
                const { data: yaExiste } = await supabase
                    .from('kardex').select('id')
                    .eq('documento_referencia', nc.id)
                    .eq('motivo', motivo)
                    .eq('producto_id', d.productoId)
                    .maybeSingle()
                if (yaExiste) continue

                await kardexService.registrarMovimiento({
                    empresa_id: input.empresaId,
                    producto_id: d.productoId,
                    bodega_id: d.bodegaId ?? undefined,
                    tipo_movimiento: 'SALIDA',
                    motivo,
                    documento_referencia: nc.id,
                    cantidad: d.cantidad,
                    costo_unitario: d.costoUnitario,
                    fecha: input.fechaNc,
                })
            }
        }

        // 6. Reducir CxP (reutiliza el trigger existente fn_actualizar_saldo_cxp)
        if (cxpIdDestino && montoAplicado > 0.001) {
            const { error: ePago } = await supabase.from('pagos_proveedores').insert({
                empresa_id: input.empresaId,
                cxp_id: cxpIdDestino,
                proveedor_id: input.proveedorId,
                fecha_pago: input.fechaNc,
                monto: r2(montoAplicado),
                forma_pago: 'NOTA_CREDITO',
                numero_referencia: input.numeroNc || null,
                observaciones: input.observacion || null,
                created_by: input.usuarioId,
                nota_credito_proveedor_id: nc.id,
            })
            if (ePago) console.error('[ncProveedorService] Error aplicando N/C a CxP:', ePago.message)
        }

        // 7. Asiento contable (si la empresa tiene contabilidad en línea activa)
        try {
            const config = await contableConfigService.getConfig(input.empresaId)
            if (config?.contabilidad_en_linea) {
                const baseTotal = r2(input.baseIva0 + input.baseIva5 + input.baseIva15)
                const lpComprobanteId = await contabilidadComprasService.crearAsientoNCProveedor({
                    empresaId: input.empresaId,
                    portalRuc: input.portalRuc,
                    fecha: input.fechaNc,
                    proveedorNombre: input.proveedorNombre,
                    tipo: input.tipo,
                    baseTotal,
                    valorIva: r2(input.valorIva),
                    total: r2(input.total),
                    cuentaContraId: input.cuentaContraId,
                    ncId: nc.id,
                })
                await supabase.from('notas_credito_proveedores')
                    .update({ lp_comprobante_id: lpComprobanteId })
                    .eq('id', nc.id)
            }
        } catch (e: any) {
            console.error('[ncProveedorService] Error generando asiento contable:', e?.message ?? e)
        }

        return ncProveedorService.obtenerConDetalle(nc.id)
    },

    async anular(id: string, motivo: string, anuladoPor: string): Promise<void> {
        const nc = await ncProveedorService.obtenerConDetalle(id)
        if (nc.estado !== 'ACTIVA') throw new Error('Solo se pueden anular N/C activas')

        // 1. Marcar cabecera como anulada
        const { error } = await supabase.from('notas_credito_proveedores').update({
            estado: 'ANULADA',
            motivo_anulacion: motivo,
            fecha_anulacion: new Date().toISOString().split('T')[0],
            anulado_por: anuladoPor,
            updated_at: new Date().toISOString(),
        }).eq('id', id)
        if (error) throw error

        auditService.logEvent({
            empresaId: nc.empresa_id,
            modulo: 'compras',
            accion: 'anular',
            entidad: 'nota_credito_proveedor',
            entidadId: id,
            numeroDocumento: nc.numero_nc ?? undefined,
            resumen: `Anulación de nota de crédito de proveedor${nc.numero_nc ? ` No. ${nc.numero_nc}` : ''}`,
            detalle: { motivo },
            nivel: 'sensible',
        })

        // 2. Revertir Kardex (ENTRADA — devuelve el stock que había salido), idempotente
        if (nc.tipo === 'DEVOLUCION_MERCADERIA' && nc.detalle?.length) {
            for (const d of nc.detalle) {
                const motivoReverso = `Anulación NC proveedor ${nc.numero_nc || nc.id.slice(0, 8)}`
                const { data: yaExiste } = await supabase
                    .from('kardex').select('id')
                    .eq('documento_referencia', nc.id)
                    .eq('motivo', motivoReverso)
                    .eq('producto_id', d.producto_id)
                    .maybeSingle()
                if (yaExiste) continue

                await kardexService.registrarMovimiento({
                    empresa_id: nc.empresa_id,
                    producto_id: d.producto_id,
                    bodega_id: d.bodega_id ?? undefined,
                    tipo_movimiento: 'ENTRADA',
                    motivo: motivoReverso,
                    documento_referencia: nc.id,
                    cantidad: d.cantidad,
                    costo_unitario: d.costo_unitario,
                })
            }
        }

        // 3. Revertir el pago aplicado a CxP (marca 'reversado', el trigger recalcula el saldo)
        await supabase.from('pagos_proveedores')
            .update({ estado: 'reversado' })
            .eq('nota_credito_proveedor_id', id)
            .eq('estado', 'activo')

        // 4. Anular el comprobante contable
        if (nc.lp_comprobante_id) {
            await contabilidadComprasService.anularAsientoPagoProveedor(nc.lp_comprobante_id)
        }
    },
}
