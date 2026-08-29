// ============================================================
// vendorService — Módulo VendorManagement
// ============================================================

import { supabase } from '../lib/supabase'
import { kardexService } from './kardexService'
import { auditService } from './auditoria/auditService'
import type {
    Proveedor, Compra, CompraConDetalle,
    DetalleInventario, DetalleServicio,
    RetencionCompra, CuentaPorPagar, PagoProveedor,
    OrdenCompra, DetalleOrdenCompra, TipoProveedor,
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
        const ruc = proveedor.ruc.trim()

        // Verificar RUC/Cédula duplicado en la misma empresa. Además de este
        // chequeo, la tabla tiene un índice único (empresa_id, ruc recortado)
        // como respaldo por si dos guardados casi simultáneos pasan ambos
        // esta verificación antes de que cualquiera termine de insertar.
        const { data: existente } = await supabase
            .from('proveedores')
            .select('id, nombre_empresa')
            .eq('empresa_id', proveedor.empresa_id)
            .eq('ruc', ruc)
            .maybeSingle()
        if (existente)
            throw new Error(`Ya existe un proveedor con RUC/Cédula ${ruc}: "${(existente as any).nombre_empresa}"`)

        const { data, error } = await supabase
            .from('proveedores').insert({ ...proveedor, ruc }).select().single()
        if (error) {
            if ((error as any).code === '23505') throw new Error(`Ya existe un proveedor con RUC/Cédula ${ruc}.`)
            throw error
        }
        return data as Proveedor
    },

    async actualizar(id: string, cambios: Partial<Proveedor>): Promise<Proveedor> {
        const payload = { ...cambios, updated_at: new Date().toISOString() }

        // Si se está cambiando el RUC/Cédula, verificar que no choque con
        // otro proveedor de la misma empresa (antes esta validación solo
        // corría al crear, no al editar).
        if (typeof cambios.ruc === 'string') {
            payload.ruc = cambios.ruc.trim()
            const { data: actual } = await supabase
                .from('proveedores').select('empresa_id, ruc').eq('id', id).single()
            if (actual && actual.ruc !== payload.ruc) {
                const { data: existente } = await supabase
                    .from('proveedores')
                    .select('id, nombre_empresa')
                    .eq('empresa_id', actual.empresa_id)
                    .eq('ruc', payload.ruc)
                    .neq('id', id)
                    .maybeSingle()
                if (existente)
                    throw new Error(`Ya existe un proveedor con RUC/Cédula ${payload.ruc}: "${(existente as any).nombre_empresa}"`)
            }
        }

        const { data, error } = await supabase
            .from('proveedores')
            .update(payload)
            .eq('id', id).select().single()
        if (error) {
            if ((error as any).code === '23505') throw new Error(`Ya existe un proveedor con RUC/Cédula ${payload.ruc}.`)
            throw error
        }
        return data as Proveedor
    },

    async desactivar(id: string): Promise<void> {
        const { error } = await supabase
            .from('proveedores')
            .update({ estado: 'INACTIVO', updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },

    // Busca un proveedor por RUC en la empresa; si no existe, lo crea
    // automáticamente (consultando el SRI por la razón social si hay
    // conexión). Mismo patrón que ya usaba MigrarCxPPage para la migración
    // de deuda — se reutiliza acá para el escaneo de facturas con IA
    // (ScanFacturaButton) en Compras Inventario/Servicios, N/C y N/D: antes
    // esas pantallas dejaban el proveedor sin seleccionar cuando el RUC
    // escaneado no existía todavía, y la compra se guardaba sin proveedor.
    async resolverPorRuc(
        empresaId: string,
        ruc: string,
        nombreSugerido?: string | null,
    ): Promise<{ id: string; nombre: string; creado: boolean } | { error: string }> {
        const { data: existente } = await supabase
            .from('proveedores')
            .select('id, nombre_empresa')
            .eq('empresa_id', empresaId)
            .eq('ruc', ruc)
            .maybeSingle()
        if (existente) return { id: existente.id, nombre: (existente as any).nombre_empresa, creado: false }

        let nombreSri: string | undefined
        try {
            const { data } = await supabase.functions.invoke('sri-lookup', { body: { identificacion: ruc } })
            nombreSri = data?.razonSocial || data?.nombreCompleto
        } catch { /* sin conexión al SRI — seguimos con el nombre sugerido si vino */ }

        const nombreFinal = nombreSri || nombreSugerido
        if (!nombreFinal) return { error: `RUC "${ruc}" no encontrado en el SRI ni en el sistema` }

        const tercerDigito = parseInt(ruc[2] ?? '9', 10)
        const tipoProveedor: TipoProveedor = tercerDigito <= 5 ? 'PERSONA_NATURAL' : 'SOCIEDAD'

        try {
            const nuevo = await proveedorService.crear({
                empresa_id:             empresaId,
                ruc,
                nombre_empresa:         nombreFinal,
                tipo_identificacion:    'RUC',
                tipo_proveedor:         tipoProveedor,
                estado:                 'ACTIVO',
                condicion_pago:         'CREDITO',
                pais:                   'Ecuador',
                contribuyente_especial: false,
                agente_retencion:       false,
                tipo_regimen:           'GENERAL',
            } as any)
            return { id: nuevo.id, nombre: nuevo.nombre_empresa, creado: true }
        } catch (e: any) {
            return { error: `No se pudo crear el proveedor: ${e.message}` }
        }
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

    // Duplicado = mismo número de factura+proveedor, O misma clave de acceso, ya
    // registrado y ACTIVO (un documento ANULADO no bloquea — permite corregir un
    // error de digitación y volver a ingresar el número correcto).
    async verificarDuplicado(empresaId: string, claveAcceso?: string, numeroFactura?: string, proveedorId?: string): Promise<boolean> {
        // Una cabecera puede quedar "huérfana" (sin ninguna línea de detalle)
        // si un guardado anterior falló a medio camino -- crearInventario/
        // crearServicio insertan la cabecera PRIMERO y el detalle/kardex
        // después, sin transacción; si el segundo paso falla (ej. error de
        // red), la cabecera queda grabada pero el usuario nunca vio la
        // compra como guardada. Sin este chequeo, esa cabecera bloqueaba
        // para siempre cualquier reintento legítimo del mismo número de
        // factura, con el mensaje de "ya existe" aunque nunca se guardó de
        // verdad. No se borra automáticamente (dato hasta cierto punto
        // recuperable) — solo se ignora como candidato a duplicado.
        const tieneDetalleReal = async (row: { id: string; tipo_compra: string | null }): Promise<boolean> => {
            const esServicio = row.tipo_compra === 'SERVICIO'
            const { count } = await supabase
                .from(esServicio ? 'detalle_servicios' : 'detalle_ingresos_stock')
                .select('id', { count: 'exact', head: true })
                .eq(esServicio ? 'compra_id' : 'ingreso_id', row.id)
            return (count ?? 0) > 0
        }

        if (claveAcceso) {
            const { data } = await supabase
                .from('ingresos_stock')
                .select('id, tipo_compra')
                .eq('empresa_id', empresaId)
                .eq('clave_acceso', claveAcceso)
                .eq('estado', 'ACTIVO')
            for (const row of data ?? []) {
                if (await tieneDetalleReal(row as any)) return true
            }
        }
        if (numeroFactura && proveedorId) {
            const { data } = await supabase
                .from('ingresos_stock')
                .select('id, tipo_compra')
                .eq('empresa_id', empresaId)
                .eq('numero_factura', numeroFactura)
                .eq('proveedor_id', proveedorId)
                .eq('estado', 'ACTIVO')
            for (const row of data ?? []) {
                if (await tieneDetalleReal(row as any)) return true
            }
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

        // 3. Kardex ENTRADA — usa kardexService para actualizar stock_bodega correctamente.
        // costo_unitario es el precio bruto de la factura; el costo que entra al
        // Kardex/costo promedio es el NETO (descontado el descuento de la línea).
        for (const d of detalle) {
            const costoNeto = d.cantidad > 0
                ? (d.cantidad * d.costo_unitario - (d.descuento ?? 0)) / d.cantidad
                : d.costo_unitario
            await kardexService.registrarMovimiento({
                empresa_id:           cabecera.empresa_id,
                producto_id:          d.producto_id,
                bodega_id:            cabecera.bodega_id ?? d.bodega_id,
                compra_id:            compra.id,
                tipo_movimiento:      'ENTRADA',
                motivo:               'Compra inventario',
                documento_referencia: cabecera.numero_factura ?? compra.id,
                cantidad:             d.cantidad,
                costo_unitario:       costoNeto,
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

        auditService.logEvent({
            empresaId: cabecera.empresa_id,
            modulo: 'compras',
            accion: 'crear',
            entidad: 'compra_inventario',
            entidadId: compra.id,
            numeroDocumento: cabecera.numero_factura ?? undefined,
            bodegaId: cabecera.bodega_id ?? undefined,
            resumen: `Compra Inventario a ${(result as any).proveedor?.nombre_empresa ?? 'proveedor'}${cabecera.numero_factura ? ` No. ${cabecera.numero_factura}` : ''}`,
        })

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

        auditService.logEvent({
            empresaId: cabecera.empresa_id,
            modulo: 'compras',
            accion: 'crear',
            entidad: 'compra_servicio',
            entidadId: compra.id,
            numeroDocumento: cabecera.numero_factura ?? undefined,
            resumen: `Compra Servicio a ${(result as any).proveedor?.nombre_empresa ?? 'proveedor'}${cabecera.numero_factura ? ` No. ${cabecera.numero_factura}` : ''}`,
        })

        return result
    },

    // Anulación con reversa completa: kardex (stock/costo recalculado),
    // CxP, retenciones y asiento contable, todo dentro de una sola
    // transacción en Postgres (facturacion.fn_anular_compra). A diferencia
    // de eliminarPermanente, aquí NO se borra nada — la compra, su detalle
    // y las retenciones quedan conservados con estado ANULADO. Bloquea si
    // la CxP ya tiene pagos aplicados o si existe una N/C de proveedor.
    async anular(id: string, motivo: string, _anuladoPor?: string): Promise<void> {
        const compraPrevia = await compraService.obtenerConDetalle(id)

        const { data: snapshot, error } = await supabase.rpc('fn_anular_compra', {
            p_compra_id: id,
            p_motivo: motivo,
        })
        if (error) throw error

        auditService.logEvent({
            empresaId: compraPrevia.empresa_id,
            modulo: 'compras',
            accion: 'anular',
            entidad: compraPrevia.tipo_compra === 'SERVICIO' ? 'compra_servicio' : 'compra_inventario',
            entidadId: id,
            numeroDocumento: compraPrevia.numero_factura ?? undefined,
            bodegaId: (compraPrevia as any).bodega_id ?? undefined,
            resumen: `Anulación de compra${compraPrevia.numero_factura ? ` No. ${compraPrevia.numero_factura}` : ` ${id}`}`,
            detalle: { motivo, snapshot },
            nivel: 'sensible',
        })
    },

    // Borrado permanente — reversa kardex (saldo corrido recalculado), CxP,
    // retenciones y asiento contable dentro de una sola transacción en
    // Postgres (facturacion.fn_eliminar_compra). Bloquea si la CxP ya tiene
    // pagos aplicados o si existe una N/C de proveedor asociada.
    async eliminarPermanente(compra: CompraConDetalle, motivo: string): Promise<void> {
        const { data: snapshot, error } = await supabase.rpc('fn_eliminar_compra', {
            p_compra_id: compra.id,
            p_motivo: motivo,
        })
        if (error) throw error

        auditService.logEvent({
            empresaId: compra.empresa_id,
            modulo: 'compras',
            accion: 'eliminar',
            entidad: compra.tipo_compra === 'SERVICIO' ? 'compra_servicio' : 'compra_inventario',
            entidadId: compra.id,
            numeroDocumento: compra.numero_factura ?? undefined,
            bodegaId: (compra as any).bodega_id ?? undefined,
            resumen: `Eliminación permanente de compra${compra.numero_factura ? ` No. ${compra.numero_factura}` : ` ${compra.id}`}`,
            detalle: { motivo, snapshot },
            nivel: 'sensible',
        })
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

