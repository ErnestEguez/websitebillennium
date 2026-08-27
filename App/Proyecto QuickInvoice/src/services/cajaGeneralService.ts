import { supabase } from '../lib/supabase'
import { auditService } from './auditoria/auditService'

export interface MovimientoCajaGeneral {
    id: string
    empresa_id: string
    fecha: string
    numero: string
    tipo: 'INGRESO' | 'EGRESO'
    motivo: string
    valor: number
    cuenta_contable_id?: string | null
    cuenta_contable_codigo?: string | null
    cuenta_contable_nombre?: string | null
    user_id?: string | null
    user_nombre?: string | null
    estado: 'ACTIVO' | 'ANULADO'
    cierre_id?: string | null
    created_at?: string
}

export interface CierreGeneral {
    id: string
    empresa_id: string
    fecha: string
    estado: 'ABIERTO' | 'CERRADO' | 'ANULADO'
    base_caja: number
    total_ventas_efectivo: number
    total_ventas_cheque: number
    total_ventas_otros: number
    total_ventas: number
    total_cartera_efectivo: number
    total_cartera_cheque: number
    total_cartera_otros: number
    total_cartera: number
    total_ingresos_extra: number
    total_egresos_extra: number
    total_efectivo_dia: number
    total_cheques_dia: number
    observaciones?: string | null
    con_detalle: boolean
    diario_id?: string | null
    user_cierre_nombre?: string | null
    fecha_cierre?: string | null
    motivo_anulacion?: string | null
    created_at?: string
}

export interface DepositoCierre {
    id?: string
    cierre_id?: string
    empresa_id?: string
    cuenta_banco_id?: string | null
    cuenta_banco_nombre: string
    cuenta_contable_banco_id?: string | null
    cuenta_contable_banco_codigo?: string | null
    cuenta_contable_banco_nombre?: string | null
    tipo_deposito: 'EFECTIVO' | 'CHEQUE'
    valor: number
    numero_comprobante?: string
    fecha_deposito?: string
}

export const cajaGeneralService = {
    // Get base_caja from empresa config
    async getBaseCaja(empresaId: string): Promise<number> {
        const { data } = await supabase
            .from('empresas')
            .select('config_caja')
            .eq('id', empresaId)
            .single()
        return (data?.config_caja as Record<string, number> | null)?.base_caja ?? 0
    },

    async setBaseCaja(empresaId: string, baseCaja: number): Promise<void> {
        await supabase
            .from('empresas')
            .update({ config_caja: { base_caja: baseCaja } })
            .eq('id', empresaId)
    },

    // Check if all cashiers have closed for the day
    async todosCajerosCerraron(empresaId: string, fecha: string): Promise<{ ok: boolean; pendientes: string[] }> {
        const { data } = await supabase
            .from('caja_sesiones')
            .select('id, usuario_nombre, estado')
            .eq('empresa_id', empresaId)
            .gte('fecha_apertura', fecha + 'T00:00:00')
            .lte('fecha_apertura', fecha + 'T23:59:59')
            .eq('estado', 'abierta')
        const pendientes = (data ?? []).map((s: Record<string, unknown>) => (s.usuario_nombre as string) || 'Sin nombre')
        return { ok: pendientes.length === 0, pendientes }
    },

    // Get or create today's cierre (ABIERTO state = working draft)
    async getCierreDelDia(empresaId: string, fecha: string): Promise<CierreGeneral | null> {
        const { data } = await supabase
            .from('caja_general_cierres')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('fecha', fecha)
            .neq('estado', 'ANULADO')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        return data as CierreGeneral | null
    },

    async crearCierre(empresaId: string, fecha: string, baseCaja: number): Promise<CierreGeneral> {
        const { data, error } = await supabase
            .from('caja_general_cierres')
            .insert({ empresa_id: empresaId, fecha, base_caja: baseCaja })
            .select()
            .single()
        if (error) throw error
        return data as CierreGeneral
    },

    // Movimientos CRUD
    async getMovimientosDia(empresaId: string, fecha: string): Promise<MovimientoCajaGeneral[]> {
        const { data } = await supabase
            .from('caja_general_movimientos')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('fecha', fecha)
            .eq('estado', 'ACTIVO')
            .order('created_at')
        return (data ?? []) as MovimientoCajaGeneral[]
    },

    async crearMovimiento(
        mov: Omit<MovimientoCajaGeneral, 'id' | 'numero' | 'created_at' | 'estado'>
    ): Promise<MovimientoCajaGeneral> {
        // Generate numero: count existing + 1
        const { count } = await supabase
            .from('caja_general_movimientos')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', mov.empresa_id)
            .eq('fecha', mov.fecha)
        const num = String((count ?? 0) + 1).padStart(3, '0')
        const numero = `MOV-${mov.fecha.replace(/-/g, '')}-${num}`
        const { data, error } = await supabase
            .from('caja_general_movimientos')
            .insert({ ...mov, numero })
            .select()
            .single()
        if (error) throw error
        return data as MovimientoCajaGeneral
    },

    // Get consolidated day data directly by date (no dependency on caja_sesiones)
    async getDatosConsolidados(
        empresaId: string,
        fecha: string
    ): Promise<{ ventas: unknown[]; cartera: unknown[]; cajasIds: string[] }> {
        const [ventasRes, carteraRes, paPagosRes] = await Promise.all([
            supabase
                .from('comprobantes')
                .select('id, secuencial, total, comprobante_pagos(metodo_pago, valor), clientes(nombre, identificacion), comprobante_detalles(subtotal, producto_id)')
                .eq('empresa_id', empresaId)
                .gte('created_at', `${fecha}T00:00:00`)
                .lte('created_at', `${fecha}T23:59:59`)
                .neq('estado_sistema', 'ANULADO')
                .order('created_at'),
            supabase
                .from('cartera_cxc_pagos')
                .select('id, valor, metodo_pago, referencia, cartera_cxc(cliente_id, clientes(nombre))')
                .eq('empresa_id', empresaId)
                .eq('fecha_pago', fecha)
                .eq('estado', 'activo')
                .order('created_at'),
            // Abonos de Plan Acumulativo — dinero cobrado el mismo día que
            // antes no se reflejaba para nada en el Cierre de Caja General.
            supabase
                .from('ventas_pa_pagos')
                .select('id, valor, metodo_pago, referencia, clientes(nombre)')
                .eq('empresa_id', empresaId)
                .eq('fecha', fecha)
                .order('created_at'),
        ])
        if (ventasRes.error) throw ventasRes.error
        if (carteraRes.error) throw carteraRes.error
        if (paPagosRes.error) throw paPagosRes.error

        // comprobante_detalles.producto_id es un UUID suelto, SIN foreign key
        // declarada hacia productos — pedirle a PostgREST que embeba
        // productos(...) directamente ahí hace fallar TODA la consulta de
        // ventas (sin lanzar error explícito, PostgREST simplemente no
        // encuentra la relación). Por eso se resuelve la categoría con una
        // segunda consulta aparte y se pega manualmente en cada detalle.
        const ventas = (ventasRes.data ?? []) as any[]
        const productoIds = [...new Set(
            ventas.flatMap(v => ((v.comprobante_detalles ?? []) as any[]).map(d => d.producto_id).filter(Boolean))
        )]
        const categoriaPorProducto = new Map<string, string>()
        if (productoIds.length > 0) {
            const { data: prods, error: prodErr } = await supabase
                .from('productos')
                .select('id, categorias(nombre)')
                .in('id', productoIds)
            if (prodErr) throw prodErr
            for (const p of (prods ?? []) as any[]) {
                categoriaPorProducto.set(p.id, p.categorias?.nombre ?? 'Sin categoría')
            }
        }
        for (const v of ventas) {
            for (const d of (v.comprobante_detalles ?? []) as any[]) {
                d.productos = { categorias: { nombre: d.producto_id ? (categoriaPorProducto.get(d.producto_id) ?? 'Sin categoría') : 'Sin categoría' } }
            }
        }

        // Se combinan con cartera_cxc_pagos en el mismo arreglo "cartera",
        // envolviendo el cliente en un "cartera_cxc" sintético para calzar
        // con la forma que ya espera el resto de la UI/reporte/correo — así
        // no hace falta tocar esos consumidores para que también los cuenten.
        const paPagos = ((paPagosRes.data ?? []) as any[]).map(p => ({
            id: p.id, valor: p.valor, metodo_pago: p.metodo_pago, referencia: p.referencia,
            cartera_cxc: { clientes: p.clientes },
        }))

        return {
            ventas,
            cartera: [...(carteraRes.data ?? []), ...paPagos],
            cajasIds: [],
        }
    },

    // Depositos
    async getDepositosCierre(cierreId: string): Promise<DepositoCierre[]> {
        const { data } = await supabase
            .from('caja_general_depositos')
            .select('*')
            .eq('cierre_id', cierreId)
            .order('created_at')
        return (data ?? []) as DepositoCierre[]
    },

    async guardarDepositos(
        cierreId: string,
        empresaId: string,
        depositos: DepositoCierre[]
    ): Promise<void> {
        await supabase.from('caja_general_depositos').delete().eq('cierre_id', cierreId)
        if (depositos.length > 0) {
            await supabase
                .from('caja_general_depositos')
                .insert(depositos.map(d => ({ ...d, cierre_id: cierreId, empresa_id: empresaId })))
        }
    },

    // Ejecutar cierre definitivo
    async ejecutarCierre(
        cierreId: string,
        datos: Partial<CierreGeneral>,
        userNombre: string,
        userId: string
    ): Promise<void> {
        const { error } = await supabase
            .from('caja_general_cierres')
            .update({
                ...datos,
                estado: 'CERRADO',
                user_cierre_nombre: userNombre,
                user_cierre_id: userId,
                fecha_cierre: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', cierreId)
        if (error) throw error
        // Link movimientos to this cierre
        await supabase
            .from('caja_general_movimientos')
            .update({ cierre_id: cierreId })
            .eq('empresa_id', datos.empresa_id!)
            .eq('fecha', datos.fecha!)
            .eq('estado', 'ACTIVO')
            .is('cierre_id', null)

        auditService.logEvent({
            empresaId: datos.empresa_id!,
            modulo: 'cierres',
            accion: 'cerrar',
            entidad: 'caja_general_cierre',
            entidadId: cierreId,
            resumen: `Cierre de caja general del ${datos.fecha}`,
            nivel: 'sensible',
        })
    },

    // Actualizar borrador (sin cerrar)
    async actualizarBorrador(
        cierreId: string,
        observaciones: string | null,
        conDetalle: boolean
    ): Promise<void> {
        await supabase
            .from('caja_general_cierres')
            .update({ observaciones, con_detalle: conDetalle, updated_at: new Date().toISOString() })
            .eq('id', cierreId)
    },

    // Reversar cierre
    async reversarCierre(cierreId: string, motivo: string, userId: string): Promise<void> {
        const { data: cierrePrevio } = await supabase
            .from('caja_general_cierres')
            .select('empresa_id, fecha')
            .eq('id', cierreId)
            .single()

        const { error } = await supabase
            .from('caja_general_cierres')
            .update({
                estado: 'ANULADO',
                anulado_por: userId,
                fecha_anulacion: new Date().toISOString(),
                motivo_anulacion: motivo,
                updated_at: new Date().toISOString(),
            })
            .eq('id', cierreId)
        if (error) throw error
        // Unlink movimientos
        await supabase
            .from('caja_general_movimientos')
            .update({ cierre_id: null })
            .eq('cierre_id', cierreId)

        if (cierrePrevio) {
            auditService.logEvent({
                empresaId: cierrePrevio.empresa_id,
                modulo: 'cierres',
                accion: 'anular',
                entidad: 'caja_general_cierre',
                entidadId: cierreId,
                resumen: `Reversión de cierre de caja general del ${cierrePrevio.fecha}`,
                detalle: { motivo },
                nivel: 'sensible',
            })
        }
    },

    // Historical closings
    async getHistorico(empresaId: string, limit = 30): Promise<CierreGeneral[]> {
        const { data } = await supabase
            .from('caja_general_cierres')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })
            .limit(limit)
        return (data ?? []) as CierreGeneral[]
    },
}
