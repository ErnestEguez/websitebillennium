import { supabaseContabilidad } from '../lib/supabaseContabilidad'
import { contableConfigService } from './contableConfigService'

// Mapa de método de pago → concepto COBROS en el mapeo contable
const METODO_COBROS: Record<string, string> = {
    efectivo:      'EFECTIVO',
    cheque:        'CHEQUE',
    cheque_fecha:  'CHEQUE_FECHA',
    tarjeta:       'TARJETA',
    nc:            'NC',
    otros:         'EFECTIVO',  // fallback genérico
}

export interface PagoContable {
    metodo: string
    valor: number
    cuenta_bancaria_id?: string | null          // solo para 'transferencia'
    cuenta_bancaria_contable_id?: string | null  // cuenta_contable_id de la cuenta bancaria
}

export interface DetalleContable {
    subtotal: number      // neto (sin IVA)
    iva_porcentaje: number
    iva_valor: number
    // Costo de ventas (solo para productos con inventario)
    costo_total?: number         // costo_promedio × cantidad (pre-calculado)
    cuenta_costo_id?: string | null  // cuenta_costo_id del producto en LP
}

export interface AsientoVentaInput {
    facturaId:      string
    empresaId:      string   // ID en facturacion.empresas
    portalRuc:      string   // RUC de la empresa (para matchear con LP)
    secuencial:     string
    clienteNombre:  string
    fecha:          string   // 'YYYY-MM-DD'
    detalles:       DetalleContable[]
    pagos:          PagoContable[]
}

export const contabilidadVentasService = {

    /**
     * Genera el asiento contable de una venta en LedgerPro.
     * Se llama desde facturaDirectaService cuando contabilidad_en_linea = true.
     * Errores son no-bloqueantes: se loguean pero no interrumpen la facturación.
     */
    async crearAsientoVenta(input: AsientoVentaInput): Promise<void> {
        const db = supabaseContabilidad as any
        const { empresaId, portalRuc, secuencial, clienteNombre, fecha, detalles, pagos } = input

        // ── 1. Mapeo contable ────────────────────────────────────
        const mapeoMap = await contableConfigService.getMapeoAsMap(empresaId)
        const cuenta = (proceso: string, concepto: string): string | null =>
            mapeoMap[`${proceso}:${concepto}`]?.cuenta_id ?? null

        // ── 2. LP empresa del usuario ────────────────────────────
        const { data: memberships } = await db
            .from('lp_usuarios_empresa')
            .select('empresa_id, empresa:lp_empresas(id, ruc)')
            .eq('activo', true)

        const lista: Array<{ empresa_id: string; empresa: { id: string; ruc?: string | null } }> = memberships ?? []
        if (!lista.length) throw new Error('Sin empresa LP configurada')

        let lpEmpresaId = lista[0].empresa_id
        if (portalRuc) {
            const match = lista.find(m => m.empresa?.ruc === portalRuc)
            if (match) lpEmpresaId = match.empresa_id
        }

        // ── 3. Período abierto ───────────────────────────────────
        const [año, mes] = fecha.split('-').map(Number)
        const { data: periodo } = await db
            .from('lp_periodos')
            .select('id')
            .eq('empresa_id', lpEmpresaId)
            .eq('año', año)
            .eq('mes', mes)
            .in('estado', ['abierto'])
            .maybeSingle()

        if (!periodo) {
            console.warn(`[asientoVenta] Sin período abierto ${mes}/${año}. Asiento omitido.`)
            return
        }

        // ── 4. Tipo comprobante (CI, V, o primero disponible) ────
        const { data: tipos } = await db
            .from('lp_tipos_comprobante')
            .select('id, codigo')
            .eq('activo', true)
            .order('codigo')

        const listaTipos: Array<{ id: string; codigo: string }> = tipos ?? []
        const tipoPrefs = ['CI', 'V', 'IN', 'CV']
        let tipoId: string | null = null
        let tipoCodigo = 'CI'

        for (const pref of tipoPrefs) {
            const t = listaTipos.find(t => t.codigo === pref)
            if (t) { tipoId = t.id; tipoCodigo = t.codigo; break }
        }
        if (!tipoId && listaTipos.length > 0) {
            tipoId = listaTipos[0].id
            tipoCodigo = listaTipos[0].codigo
        }
        if (!tipoId) {
            console.warn('[asientoVenta] Sin tipo comprobante LP. Asiento omitido.')
            return
        }

        // ── 5. Número correlativo ────────────────────────────────
        const { data: numero } = await db.rpc('lp_generar_numero_comprobante', {
            p_empresa_id: lpEmpresaId,
            p_tipo_codigo: tipoCodigo,
            p_año: año,
            p_mes: mes,
        })

        // ── 6. Totales por tasa IVA ──────────────────────────────
        let base0 = 0, baseGravada = 0, ivaTotal = 0
        for (const d of detalles) {
            if (d.iva_porcentaje === 0) base0 += d.subtotal
            else baseGravada += d.subtotal
            ivaTotal += d.iva_valor
        }

        const r2 = (n: number) => Math.round(n * 100) / 100

        // ── 7. Líneas DEBE (cobros) ──────────────────────────────
        type Linea = { cuenta_id: string; monto: number; desc: string }
        const debe: Linea[] = []

        for (const p of pagos) {
            if (!p.valor || p.valor <= 0) continue
            const metodo = p.metodo.toLowerCase()
            let ctaId: string | null = null

            if (metodo === 'transferencia') {
                // Usa cuenta_contable_id de la cuenta bancaria específica
                ctaId = p.cuenta_bancaria_contable_id ?? cuenta('COBROS', 'BANCO')
            } else if (metodo === 'credito') {
                ctaId = cuenta('VENTAS', 'CARTERA_CLIENTES')
            } else {
                const concepto = METODO_COBROS[metodo] ?? 'EFECTIVO'
                ctaId = cuenta('COBROS', concepto)
            }

            if (!ctaId) {
                console.warn(`[asientoVenta] Sin cuenta mapeada para método '${p.metodo}'`)
                continue
            }
            debe.push({ cuenta_id: ctaId, monto: r2(p.valor), desc: p.metodo })
        }

        // ── 8. Líneas HABER (ingresos) ───────────────────────────
        const haber: Linea[] = []

        if (base0 > 0.001) {
            const cta = cuenta('VENTAS', 'VENTAS_BASE_0')
            if (cta) haber.push({ cuenta_id: cta, monto: r2(base0), desc: 'Ventas base 0%' })
        }
        if (baseGravada > 0.001) {
            const cta = cuenta('VENTAS', 'VENTAS_BASE_GRAVADA')
            if (cta) haber.push({ cuenta_id: cta, monto: r2(baseGravada), desc: 'Ventas base gravada' })
        }
        if (ivaTotal > 0.001) {
            const cta = cuenta('VENTAS', 'IVA_COBRADO')
            if (cta) haber.push({ cuenta_id: cta, monto: r2(ivaTotal), desc: 'IVA cobrado' })
        }

        // ── 8b. Líneas de Costo de Ventas (COGS) ────────────────
        // DEBE: Gasto Costo de Ventas (por cuenta del producto o fallback del mapeo)
        // HABER: Inventarios (VENTAS:INVENTARIOS del mapeo)
        const ctaInventarios = cuenta('VENTAS', 'INVENTARIOS')
        const detallesConCosto = detalles.filter(d => d.costo_total && d.costo_total > 0.001)

        if (detallesConCosto.length > 0 && ctaInventarios) {
            // Agrupar COGS por cuenta_costo_id del producto
            const costoMap = new Map<string, number>()
            let costoTotalGeneral = 0

            for (const d of detallesConCosto) {
                const monto = d.costo_total!
                costoTotalGeneral += monto
                const ctaCosto = d.cuenta_costo_id ?? cuenta('VENTAS', 'COSTO_VENTAS')
                if (ctaCosto) {
                    costoMap.set(ctaCosto, (costoMap.get(ctaCosto) ?? 0) + monto)
                } else {
                    console.warn('[asientoVenta] Sin cuenta Costo de Ventas para un artículo — configura la cuenta en el artículo o en el mapeo VENTAS:COSTO_VENTAS')
                }
            }

            for (const [ctaId, monto] of costoMap) {
                debe.push({ cuenta_id: ctaId, monto: r2(monto), desc: 'Costo de ventas' })
            }

            if (costoTotalGeneral > 0.001) {
                haber.push({ cuenta_id: ctaInventarios, monto: r2(costoTotalGeneral), desc: 'Reducción de inventario' })
            }
        }

        // ── 9. Validar que hay líneas suficientes ────────────────
        if (debe.length === 0 || haber.length === 0) {
            console.warn('[asientoVenta] Faltan cuentas mapeadas (VENTAS o COBROS). Configura el mapeo contable en Ajustes → Configuración → Contabilidad.')
            return
        }

        const totalDebe  = r2(debe.reduce((s, l) => s + l.monto, 0))
        const totalHaber = r2(haber.reduce((s, l) => s + l.monto, 0))

        if (Math.abs(totalDebe - totalHaber) > 0.02) {
            console.warn(`[asientoVenta] Cuadre: DEBE=${totalDebe} HABER=${totalHaber} — diferencia ${r2(totalDebe - totalHaber)}`)
        }

        // ── 10. Insertar comprobante LP ──────────────────────────
        const glosa = `Factura venta ${secuencial} — ${clienteNombre}`

        const { data: comp, error: errComp } = await db
            .from('lp_comprobantes')
            .insert({
                empresa_id:          lpEmpresaId,
                periodo_id:          periodo.id,
                tipo_comprobante_id: tipoId,
                numero:              numero || `VTA-${secuencial}`,
                secuencial:          1,
                fecha,
                glosa,
                estado:              'confirmado',
                total_debe:          totalDebe,
                total_haber:         totalHaber,
                moneda_id:           null,
                tipo_cambio:         1,
                origen:              'quickinvoice',
                referencia_externa:  input.facturaId,
                created_by:          null,
            })
            .select('id')
            .single()

        if (errComp || !comp) throw errComp ?? new Error('Error creando comprobante LP')

        // ── 11. Insertar líneas ──────────────────────────────────
        const lineas = [
            ...debe.map((l, i) => ({
                comprobante_id: comp.id, empresa_id: lpEmpresaId,
                cuenta_id: l.cuenta_id, descripcion: l.desc,
                debe: l.monto, haber: 0, orden: i,
            })),
            ...haber.map((l, i) => ({
                comprobante_id: comp.id, empresa_id: lpEmpresaId,
                cuenta_id: l.cuenta_id, descripcion: l.desc,
                debe: 0, haber: l.monto, orden: debe.length + i,
            })),
        ]

        const { error: errLineas } = await db.from('lp_comprobante_lineas').insert(lineas)
        if (errLineas) throw errLineas

        // ── 12. Actualizar saldos LP ─────────────────────────────
        await db.rpc('lp_actualizar_saldos', {
            p_comprobante_id: comp.id,
            p_operacion: 'sumar',
        })

        console.log(`[asientoVenta] ✅ Asiento ${comp.id} creado para factura ${secuencial}`)
    },

    // ── Asiento de cobro (abono / pago de cartera CxC) ─────────────────────
    async crearAsientoCobro(input: {
        empresaId: string
        portalRuc: string
        clienteNombre: string
        fecha: string
        valor: number
        metodoPago: string
        facturaSecuencial?: string
        cuentaContableId?: string   // cuenta_contable_id de la cuenta bancaria seleccionada (transferencia)
    }): Promise<string> {
        const db = supabaseContabilidad as any
        const { empresaId, portalRuc, clienteNombre, fecha, valor, metodoPago, facturaSecuencial, cuentaContableId } = input

        const mapeoMap = await contableConfigService.getMapeoAsMap(empresaId)
        const cuenta = (proceso: string, concepto: string): string | null =>
            mapeoMap[`${proceso}:${concepto}`]?.cuenta_id ?? null

        const { data: memberships } = await db
            .from('lp_usuarios_empresa')
            .select('empresa_id, empresa:lp_empresas(id, ruc)')
            .eq('activo', true)

        const lista: Array<{ empresa_id: string; empresa: { id: string; ruc?: string | null } }> = memberships ?? []
        if (!lista.length) throw new Error('Sin empresa LP configurada. Verifica que tienes acceso a LedgerPro.')

        let lpEmpresaId = lista[0].empresa_id
        if (portalRuc) {
            const match = lista.find(m => m.empresa?.ruc === portalRuc)
            if (match) lpEmpresaId = match.empresa_id
        }

        const [año, mes] = fecha.split('-').map(Number)
        const { data: periodo } = await db
            .from('lp_periodos').select('id')
            .eq('empresa_id', lpEmpresaId).eq('año', año).eq('mes', mes)
            .in('estado', ['abierto']).maybeSingle()

        if (!periodo) {
            throw new Error(`Sin período contable abierto para ${mes}/${año}. Abre el período en LedgerPro antes de registrar cobros.`)
        }

        const { data: tipos } = await db
            .from('lp_tipos_comprobante').select('id, codigo').eq('activo', true).order('codigo')
        const listaTipos: Array<{ id: string; codigo: string }> = tipos ?? []
        let tipoId: string | null = null
        let tipoCodigo = 'RC'
        for (const pref of ['RC', 'RV', 'CI', 'V']) {
            const t = listaTipos.find(t => t.codigo === pref)
            if (t) { tipoId = t.id; tipoCodigo = t.codigo; break }
        }
        if (!tipoId && listaTipos.length > 0) { tipoId = listaTipos[0].id; tipoCodigo = listaTipos[0].codigo }
        if (!tipoId) throw new Error('No existe ningún tipo de comprobante activo en LedgerPro. Crea al menos uno (RC, RV, CI o V).')

        const { data: numero } = await db.rpc('lp_generar_numero_comprobante', {
            p_empresa_id: lpEmpresaId, p_tipo_codigo: tipoCodigo, p_año: año, p_mes: mes,
        })

        const metodo = metodoPago.toLowerCase()
        // Transferencia: prioridad → cuenta_contable_id de la cuenta bancaria seleccionada
        //                fallback  → mapeo COBROS:BANCO (para cuentas sin enlace contable)
        const ctaDebe =
            metodo === 'transferencia' ? (cuentaContableId ?? cuenta('COBROS', 'BANCO'))
            : metodo === 'cheque'       ? cuenta('COBROS', 'CHEQUE')
            : metodo === 'tarjeta'      ? cuenta('COBROS', 'TARJETA')
            :                             cuenta('COBROS', 'EFECTIVO')

        // Cuenta por Cobrar Clientes que se acredita al recibir el cobro.
        // Es el campo "Crédito (Cartera CxC)" de Cobros — Cuentas por Forma de Pago
        // (NO el mapeo VENTAS:CARTERA_CLIENTES, que es la cuenta que se debita al facturar a crédito).
        const ctaHaber = cuenta('COBROS', 'CREDITO')

        if (!ctaDebe || !ctaHaber) {
            const debeMsg = !ctaDebe
                ? metodo === 'transferencia'
                    ? 'La cuenta bancaria seleccionada no tiene cuenta contable configurada. ' +
                      'Agrégala en Tesorería → Cuentas Bancarias, o mapea COBROS → BANCO ' +
                      '(fallback) en Configuración → Contabilidad → Mapeo.'
                    : `Falta mapear COBROS → ${metodo === 'cheque' ? 'CHEQUE' : metodo === 'tarjeta' ? 'TARJETA' : 'EFECTIVO'} ` +
                      'en Configuración → Contabilidad → Mapeo de cuentas.'
                : null
            const haberMsg = !ctaHaber
                ? 'Falta mapear COBROS → CRÉDITO (CARTERA CXC) en Configuración → Contabilidad → Mapeo de cuentas.'
                : null
            throw new Error([debeMsg, haberMsg].filter(Boolean).join(' | '))
        }

        const r2 = (n: number) => Math.round(n * 100) / 100
        const glosa = `Cobro cartera — ${clienteNombre}${facturaSecuencial ? ' / Fac. ' + facturaSecuencial : ''}`

        const comprobanteBase = {
            empresa_id: lpEmpresaId, periodo_id: periodo.id,
            tipo_comprobante_id: tipoId,
            secuencial: 1,
            fecha, glosa, estado: 'confirmado',
            total_debe: r2(valor), total_haber: r2(valor),
            moneda_id: null, tipo_cambio: 1,
            origen: 'quickinvoice', referencia_externa: null, created_by: null,
        }

        // Intento 1: número generado por el RPC
        let res = await db.from('lp_comprobantes')
            .insert({ ...comprobanteBase, numero: numero || `COB-${Date.now()}` })
            .select('id').single()

        // Si hay conflicto de número duplicado (error 23505 / HTTP 409), reintenta con número único
        if (res.error?.code === '23505' || res.error?.status === 409 || (res.error as any)?.status === 409) {
            const fallback = `COB-${tipoCodigo}-${Date.now()}`
            console.warn(`[asientoCobro] Número duplicado, reintentando con ${fallback}`)
            res = await db.from('lp_comprobantes')
                .insert({ ...comprobanteBase, numero: fallback })
                .select('id').single()
        }

        const comp = res.data
        const errComp = res.error
        if (errComp || !comp) throw errComp ?? new Error('Error creando comprobante LP cobro')

        const { error: errLineas } = await db.from('lp_comprobante_lineas').insert([
            { comprobante_id: comp.id, empresa_id: lpEmpresaId, cuenta_id: ctaDebe, descripcion: `Cobro ${metodoPago}`, debe: r2(valor), haber: 0, orden: 0 },
            { comprobante_id: comp.id, empresa_id: lpEmpresaId, cuenta_id: ctaHaber, descripcion: 'Cuentas por cobrar', debe: 0, haber: r2(valor), orden: 1 },
        ])
        if (errLineas) throw errLineas

        await db.rpc('lp_actualizar_saldos', { p_comprobante_id: comp.id, p_operacion: 'sumar' })
        console.log(`[asientoCobro] ✅ Asiento cobro creado`)
        return comp.id
    },

    // ── Anular el asiento de un cobro (reversar pago de cartera) ──────────
    async anularAsientoCobro(lpComprobanteId: string): Promise<void> {
        const db = supabaseContabilidad as any

        const { data: comp, error: errComp } = await db
            .from('lp_comprobantes')
            .select('id, estado')
            .eq('id', lpComprobanteId)
            .maybeSingle()

        if (errComp) throw errComp
        if (!comp || comp.estado === 'anulado') return

        const { error: errUpdate } = await db
            .from('lp_comprobantes')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('id', lpComprobanteId)
        if (errUpdate) throw errUpdate

        if (comp.estado === 'confirmado') {
            await db.rpc('lp_actualizar_saldos', { p_comprobante_id: lpComprobanteId, p_operacion: 'restar' })
        }
    },
}
