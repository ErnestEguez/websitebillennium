// ============================================================
// vendorService — Módulo VendorManagement
// ============================================================

import { supabase } from '../lib/supabase'
import { kardexService } from './kardexService'
import type {
    Proveedor, Compra, CompraConDetalle,
    DetalleInventario, DetalleServicio,
    RetencionCompra, CuentaPorPagar, PagoProveedor,
    OrdenCompra, DetalleOrdenCompra,
} from '../types/vendors'

const COMPRA_SELECT = `
    *,
    proveedor:proveedores(nombre_empresa, ruc)
`
const CXP_SELECT = `
    *,
    proveedor:proveedores(nombre_empresa, ruc),
    compra:ingresos_stock(numero_factura, fecha_emision, tipo_compra),
    liquidacion:liquidaciones_compra(establecimiento, punto_emision, secuencial)
`

// ── Proveedores ─────────────────────────────────────────────

export const proveedorService = {
    async listar(empresaId: string): Promise<Proveedor[]> {
        const { data, error } = await supabase
            .from('proveedores')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre_empresa')
        if (error) throw error
        return data as Proveedor[]
    },

    async buscar(empresaId: string, q: string): Promise<Proveedor[]> {
        const { data, error } = await supabase
            .from('proveedores')
            .select('*')
            .eq('empresa_id', empresaId)
            .or(`ruc.ilike.%${q}%,nombre_empresa.ilike.%${q}%`)
            .order('nombre_empresa')
            .limit(20)
        if (error) throw error
        return data as Proveedor[]
    },

    async obtener(id: string): Promise<Proveedor> {
        const { data, error } = await supabase
            .from('proveedores').select('*').eq('id', id).single()
        if (error) throw error
        return data as Proveedor
    },

    async crear(proveedor: Omit<Proveedor, 'id' | 'created_at' | 'updated_at'>): Promise<Proveedor> {
        // Verificar RUC duplicado en la misma empresa
        const { data: existente } = await supabase
            .from('proveedores')
            .select('id, nombre_empresa')
            .eq('empresa_id', proveedor.empresa_id)
            .eq('ruc', proveedor.ruc)
            .maybeSingle()
        if (existente)
            throw new Error(`Ya existe un proveedor con RUC ${proveedor.ruc}: "${(existente as any).nombre_empresa}"`)

        const { data, error } = await supabase
            .from('proveedores').insert(proveedor).select().single()
        if (error) throw error
        return data as Proveedor
    },

    async actualizar(id: string, cambios: Partial<Proveedor>): Promise<Proveedor> {
        const { data, error } = await supabase
            .from('proveedores')
            .update({ ...cambios, updated_at: new Date().toISOString() })
            .eq('id', id).select().single()
        if (error) throw error
        return data as Proveedor
    },

    async desactivar(id: string): Promise<void> {
        const { error } = await supabase
            .from('proveedores')
            .update({ estado: 'INACTIVO', updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },
}

// ── Compras ─────────────────────────────────────────────────

export const compraService = {
    async listar(empresaId: string, filtros?: {
        tipo?: string; estado?: string; proveedorId?: string
        desde?: string; hasta?: string
    }): Promise<Compra[]> {
        let q = supabase
            .from('ingresos_stock')
            .select(COMPRA_SELECT)
            .eq('empresa_id', empresaId)
            .order('fecha_ingreso', { ascending: false })

        if (filtros?.tipo)       q = q.eq('tipo_compra', filtros.tipo)
        if (filtros?.estado)     q = q.eq('estado', filtros.estado)
        if (filtros?.proveedorId) q = q.eq('proveedor_id', filtros.proveedorId)
        if (filtros?.desde)      q = q.gte('fecha_ingreso', filtros.desde)
        if (filtros?.hasta)      q = q.lte('fecha_ingreso', filtros.hasta)

        const { data, error } = await q
        if (error) throw error
        return data as Compra[]
    },

    async obtenerConDetalle(id: string): Promise<CompraConDetalle> {
        const [compraRes, detInvRes, detSrvRes, retRes, cxpRes] = await Promise.all([
            supabase.from('ingresos_stock').select(COMPRA_SELECT).eq('id', id).single(),
            supabase.from('detalle_ingresos_stock').select('*, producto:productos(nombre,codigo)').eq('ingreso_id', id),
            supabase.from('detalle_servicios').select('*').eq('compra_id', id).order('orden'),
            supabase.from('retenciones_compras').select('*').eq('compra_id', id),
            supabase.from('cuentas_por_pagar').select(CXP_SELECT).eq('compra_id', id).maybeSingle(),
        ])
        if (compraRes.error) throw compraRes.error
        return {
            ...compraRes.data,
            detalle_ingresos_stock: detInvRes.data ?? [],
            detalle_servicios: detSrvRes.data ?? [],
            retenciones: retRes.data ?? [],
            cxp: cxpRes.data ?? undefined,
        } as CompraConDetalle
    },

    async verificarDuplicado(empresaId: string, claveAcceso?: string, numeroFactura?: string, proveedorId?: string): Promise<boolean> {
        if (claveAcceso) {
            const { data } = await supabase
                .from('ingresos_stock')
                .select('id')
                .eq('empresa_id', empresaId)
                .eq('clave_acceso', claveAcceso)
                .maybeSingle()
            return !!data
        }
        if (numeroFactura && proveedorId) {
            const { data } = await supabase
                .from('ingresos_stock')
                .select('id')
                .eq('empresa_id', empresaId)
                .eq('numero_factura', numeroFactura)
                .eq('proveedor_id', proveedorId)
                .maybeSingle()
            return !!data
        }
        return false
    },

    async crearInventario(
        cabecera: Omit<Compra, 'id' | 'created_at'>,
        detalle: Omit<DetalleInventario, 'id' | 'ingreso_id'>[],
        retenciones: Omit<RetencionCompra, 'id' | 'compra_id' | 'created_at'>[] = []
    ): Promise<CompraConDetalle> {
        // 1. Crear cabecera
        const { data: compra, error: eCompra } = await supabase
            .from('ingresos_stock')
            .insert({ ...cabecera, tipo_compra: 'INVENTARIO' })
            .select().single()
        if (eCompra || !compra) throw eCompra ?? new Error('Error creando compra')

        // 2. Detalle inventario
        const { error: eDetalle } = await supabase.from('detalle_ingresos_stock')
            .insert(detalle.map(d => ({ ...d, ingreso_id: compra.id })))
        if (eDetalle) throw eDetalle

        // 3. Kardex ENTRADA — usa kardexService para actualizar stock_bodega correctamente
        for (const d of detalle) {
            await kardexService.registrarMovimiento({
                empresa_id:           cabecera.empresa_id,
                producto_id:          d.producto_id,
                bodega_id:            cabecera.bodega_id ?? d.bodega_id,
                tipo_movimiento:      'ENTRADA',
                motivo:               'Compra inventario',
                documento_referencia: cabecera.numero_factura ?? compra.id,
                cantidad:             d.cantidad,
                costo_unitario:       d.costo_unitario,
                fecha:                cabecera.fecha_ingreso,
            })
        }

        // 4. CxP si es crédito (saldo = total - suma retenciones)
        let cxpError: string | undefined
        if (cabecera.forma_pago === 'CREDITO' && cabecera.proveedor_id && cabecera.fecha_vencimiento) {
            const totalRet = retenciones.reduce((s, r) => s + r.valor, 0)
            try {
                await cxpService.crear({
                    empresa_id: cabecera.empresa_id, proveedor_id: cabecera.proveedor_id,
                    compra_id: compra.id, fecha_emision: cabecera.fecha_ingreso,
                    fecha_vencimiento: cabecera.fecha_vencimiento,
                    monto_original: cabecera.total,
                    saldo_pendiente: Math.max(cabecera.total - totalRet, 0),
                    estado: 'PENDIENTE',
                })
            } catch (e: any) {
                cxpError = e?.message ?? String(e)
            }
        }

        // 5. Retenciones (puede haber hasta 4)
        if (retenciones.length > 0) {
            await supabase.from('retenciones_compras')
                .insert(retenciones.map(r => ({ ...r, compra_id: compra.id, empresa_id: cabecera.empresa_id })))
        }

        const result = await compraService.obtenerConDetalle(compra.id)
        if (cxpError) result.cxpError = cxpError
        return result
    },

    async crearServicio(
        cabecera: Omit<Compra, 'id' | 'created_at'>,
        detalle: Omit<DetalleServicio, 'id' | 'compra_id' | 'empresa_id'>[],
        retenciones: Omit<RetencionCompra, 'id' | 'compra_id' | 'created_at'>[] = []
    ): Promise<CompraConDetalle> {
        // 1. Crear cabecera
        const { data: compra, error: eCompra } = await supabase
            .from('ingresos_stock')
            .insert({ ...cabecera, tipo_compra: 'SERVICIO' })
            .select().single()
        if (eCompra || !compra) throw eCompra ?? new Error('Error creando compra')

        // 2. Detalle servicios
        const { error: eDetalle } = await supabase.from('detalle_servicios')
            .insert(detalle.map((d, i) => ({ ...d, compra_id: compra.id, empresa_id: cabecera.empresa_id, orden: i + 1 })))
        if (eDetalle) throw eDetalle

        // 3. CxP si es crédito
        let cxpError: string | undefined
        if (cabecera.forma_pago === 'CREDITO' && cabecera.proveedor_id && cabecera.fecha_vencimiento) {
            const totalRet = retenciones.reduce((s, r) => s + r.valor, 0)
            try {
                await cxpService.crear({
                    empresa_id: cabecera.empresa_id, proveedor_id: cabecera.proveedor_id,
                    compra_id: compra.id, fecha_emision: cabecera.fecha_ingreso,
                    fecha_vencimiento: cabecera.fecha_vencimiento,
                    monto_original: cabecera.total,
                    saldo_pendiente: Math.max(cabecera.total - totalRet, 0),
                    estado: 'PENDIENTE',
                })
            } catch (e: any) {
                cxpError = e?.message ?? String(e)
            }
        }

        // 4. Retenciones
        if (retenciones.length > 0) {
            await supabase.from('retenciones_compras')
                .insert(retenciones.map(r => ({ ...r, compra_id: compra.id, empresa_id: cabecera.empresa_id })))
        }

        const result = await compraService.obtenerConDetalle(compra.id)
        if (cxpError) result.cxpError = cxpError
        return result
    },

    async anular(id: string, motivo: string, anuladoPor: string): Promise<void> {
        // Obtener compra para ver si necesita revertir kardex
        const compra = await compraService.obtenerConDetalle(id)
        if (compra.estado !== 'ACTIVO') throw new Error('Solo se pueden anular compras activas')

        // 1. Marcar cabecera como anulada
        const { error } = await supabase.from('ingresos_stock').update({
            estado: 'ANULADO',
            motivo_anulacion: motivo,
            fecha_anulacion: new Date().toISOString().split('T')[0],
            anulado_por: anuladoPor,
        }).eq('id', id)
        if (error) throw error

        // 2. Si era inventario, revertir ENTRADA en kardex con SALIDA
        if (compra.tipo_compra === 'INVENTARIO' && compra.detalle_ingresos_stock?.length) {
            const reversos = compra.detalle_ingresos_stock.map(d => ({
                empresa_id: compra.empresa_id,
                producto_id: d.producto_id,
                tipo_movimiento: 'SALIDA',
                motivo: `Anulación compra ${compra.numero_factura ?? id}`,
                documento_referencia: id,
                cantidad: d.cantidad,
                costo_unitario: d.costo_unitario,
            }))
            await supabase.from('kardex').insert(reversos)
        }

        // 3. Anular CxP si existe
        if (compra.cxp) {
            await supabase.from('cuentas_por_pagar')
                .update({ estado: 'ANULADO', updated_at: new Date().toISOString() })
                .eq('id', compra.cxp.id)
        }
    },
}

// ── CxP ─────────────────────────────────────────────────────

export const cxpService = {
    async crear(cxp: Omit<CuentaPorPagar, 'id' | 'created_at' | 'updated_at'>): Promise<CuentaPorPagar> {
        const { data, error } = await supabase
            .from('cuentas_por_pagar').insert(cxp).select().single()
        if (error) throw error
        return data as CuentaPorPagar
    },

    async listar(empresaId: string, filtros?: {
        estado?: string; proveedorId?: string; vencidas?: boolean
    }): Promise<CuentaPorPagar[]> {
        let q = supabase
            .from('cuentas_por_pagar')
            .select(CXP_SELECT)
            .eq('empresa_id', empresaId)
            .order('fecha_vencimiento')

        if (filtros?.estado)      q = q.eq('estado', filtros.estado)
        if (filtros?.proveedorId) q = q.eq('proveedor_id', filtros.proveedorId)
        if (filtros?.vencidas)    q = q.lt('fecha_vencimiento', new Date().toISOString().split('T')[0])
            .in('estado', ['PENDIENTE', 'PARCIALMENTE_PAGADO'])

        const { data, error } = await q
        if (error) throw error
        return data as CuentaPorPagar[]
    },

    async historialPagos(cxpId: string): Promise<PagoProveedor[]> {
        const { data, error } = await supabase
            .from('pagos_proveedores')
            .select('*')
            .eq('cxp_id', cxpId)
            .order('fecha_pago')
        if (error) throw error
        return data as PagoProveedor[]
    },
}

// ── Órdenes de Compra ────────────────────────────────────────

export const ocService = {
    async listar(empresaId: string): Promise<OrdenCompra[]> {
        const { data, error } = await supabase
            .from('ordenes_compra')
            .select('*, proveedor:proveedores(nombre_empresa, ruc)')
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return data as OrdenCompra[]
    },

    async obtener(id: string): Promise<OrdenCompra> {
        const { data, error } = await supabase
            .from('ordenes_compra')
            .select('*, proveedor:proveedores(nombre_empresa, ruc), detalle:detalle_ordenes_compra(*, producto:productos(nombre, codigo))')
            .eq('id', id).single()
        if (error) throw error
        return data as OrdenCompra
    },

    async crear(oc: Omit<OrdenCompra, 'id' | 'numero_oc' | 'created_at' | 'updated_at'>, detalle: Omit<DetalleOrdenCompra, 'id' | 'oc_id'>[]): Promise<OrdenCompra> {
        // Obtener número de OC
        const { data: numData } = await supabase
            .rpc('fn_siguiente_numero_oc', { p_empresa_id: oc.empresa_id })
        const numero_oc = numData as string

        const { data: ocData, error: eOC } = await supabase
            .from('ordenes_compra')
            .insert({ ...oc, numero_oc })
            .select().single()
        if (eOC || !ocData) throw eOC ?? new Error('Error creando OC')

        const detalleConId = detalle.map(d => ({ ...d, oc_id: ocData.id }))
        await supabase.from('detalle_ordenes_compra').insert(detalleConId)

        return ocService.obtener(ocData.id)
    },

    async recibirParcial(ocId: string, recepciones: { detalleId: string; cantidadRecibida: number }[]): Promise<void> {
        for (const r of recepciones) {
            await supabase.from('detalle_ordenes_compra')
                .update({ cantidad_recibida: r.cantidadRecibida })
                .eq('id', r.detalleId)
        }

        // Revisar si la OC está completa
        const { data: detalle } = await supabase
            .from('detalle_ordenes_compra')
            .select('cantidad_solicitada, cantidad_recibida')
            .eq('oc_id', ocId)

        if (detalle) {
            const completa = detalle.every(d => d.cantidad_recibida >= d.cantidad_solicitada)
            const parcial  = detalle.some(d => d.cantidad_recibida > 0)
            const estado: string = completa ? 'RECIBIDA' : parcial ? 'PARCIALMENTE_RECIBIDA' : 'ENVIADA'
            await supabase.from('ordenes_compra')
                .update({ estado, updated_at: new Date().toISOString() })
                .eq('id', ocId)
        }
    },

    async anular(ocId: string): Promise<void> {
        const { error } = await supabase.from('ordenes_compra')
            .update({ estado: 'ANULADA', updated_at: new Date().toISOString() })
            .eq('id', ocId)
        if (error) throw error
    },
}

// ── Retenciones ──────────────────────────────────────────────

export const retencionService = {
    async siguienteNumero(empresaId: string): Promise<string> {
        const { data } = await supabase
            .from('retenciones_compras')
            .select('numero_retencion')
            .eq('empresa_id', empresaId)
            .not('numero_retencion', 'is', null)
            .order('created_at', { ascending: false })
            .limit(200)
        let maxSeq = 0
        ;(data ?? []).forEach(r => {
            const match = r.numero_retencion?.match(/^\d{3}-\d{3}-(\d+)$/)
            if (match) {
                const seq = parseInt(match[1], 10)
                if (seq > maxSeq) maxSeq = seq
            }
        })
        return `001-001-${String(maxSeq + 1).padStart(9, '0')}`
    },
}

