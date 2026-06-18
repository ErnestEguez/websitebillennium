import { supabase } from '../../lib/supabase'
import { supabaseContabilidad } from '../../lib/supabaseContabilidad'
import { cuentasNominaService } from './cuentasNominaService'
import { parametrosNominaService } from './parametrosNominaService'
import type { CuentasNomina } from '../../types/nominas'

const r2 = (n: number) => Math.round(n * 100) / 100
const nominas = () => supabase.schema('nominas')

// ─── Internal types ───────────────────────────────────────────────────────────

type Linea = { cuenta_id: string; monto: number; desc: string }

type Ctx = {
    db: any
    lpEmpresaId: string
    periodoLpId: string
    tipoId: string
    tipoCodigo: string
    c: CuentasNomina   // cuentas LP directo desde nominas.cuentas_nomina
}

// ─── Shared: initialize LP context ───────────────────────────────────────────

async function initCtx(empresaId: string, fecha: string): Promise<Ctx | null> {
    try {
        // Cuentas contables de nómina (nominas.cuentas_nomina)
        const c = await cuentasNominaService.obtener(empresaId)
        if (!c) {
            console.warn('[nomContab] Sin cuentas de nómina configuradas en Nómina → Configuración')
            return null
        }

        const db = supabaseContabilidad as any

        // LP empresa — match por RUC de la empresa portal
        const { data: emp } = await supabase.from('empresas').select('ruc').eq('id', empresaId).single()
        const portalRuc = emp?.ruc ?? ''

        const { data: memberships } = await db
            .from('lp_usuarios_empresa')
            .select('empresa_id, empresa:lp_empresas(id, ruc)')
            .eq('activo', true)
        const lista = (memberships ?? []) as Array<{ empresa_id: string; empresa: { id: string; ruc?: string | null } }>
        if (!lista.length) {
            console.warn('[nomContab] Sin empresa LP configurada')
            return null
        }
        let lpEmpresaId = lista[0].empresa_id
        if (portalRuc) {
            const match = lista.find(m => m.empresa?.ruc === portalRuc)
            if (match) lpEmpresaId = match.empresa_id
        }

        // Período LP abierto para la fecha del proceso
        const [añoNum, mesNum] = fecha.split('-').map(Number)
        const { data: periodo } = await db
            .from('lp_periodos').select('id')
            .eq('empresa_id', lpEmpresaId).eq('año', añoNum).eq('mes', mesNum)
            .in('estado', ['abierto']).maybeSingle()
        if (!periodo) {
            console.warn(`[nomContab] Sin período LP abierto para ${mesNum}/${añoNum} en empresa LP ${lpEmpresaId}`)
            return null
        }

        // Tipo de comprobante: NOM > CI > IN > primero disponible
        const { data: tipos } = await db
            .from('lp_tipos_comprobante').select('id, codigo').eq('activo', true).order('codigo')
        const listaTipos = (tipos ?? []) as Array<{ id: string; codigo: string }>
        let tipoId: string | null = null
        let tipoCodigo = 'NOM'
        for (const pref of ['NOM', 'CI', 'IN', 'V']) {
            const t = listaTipos.find(t => t.codigo === pref)
            if (t) { tipoId = t.id; tipoCodigo = t.codigo; break }
        }
        if (!tipoId && listaTipos.length > 0) {
            tipoId = listaTipos[0].id; tipoCodigo = listaTipos[0].codigo
        }
        if (!tipoId) {
            console.warn('[nomContab] Sin tipo de comprobante LP disponible')
            return null
        }

        return { db, lpEmpresaId, periodoLpId: periodo.id, tipoId, tipoCodigo, c }
    } catch (e) {
        console.error('[nomContab] Error al inicializar contexto LP:', e)
        return null
    }
}

// ─── Shared: batch-resolve cuenta_contable codes to LP IDs ───────────────────

async function resolverCodigos(
    db: any, lpEmpresaId: string, codigos: Set<string>,
): Promise<Map<string, string>> {
    if (!codigos.size) return new Map()
    const { data } = await db.from('lp_cuentas')
        .select('id, codigo').eq('empresa_id', lpEmpresaId).in('codigo', Array.from(codigos))
    return new Map((data ?? []).map((c: any) => [c.codigo, c.id]))
}

// ─── Shared: insert LP comprobante + lineas ───────────────────────────────────

async function postearComprobante(
    ctx: Ctx, glosa: string, fecha: string, referencia: string,
    debe: Linea[], haber: Linea[],
): Promise<string | null> {
    try {
        if (!debe.length || !haber.length) {
            console.warn(`[nomContab] Sin líneas para "${glosa}" — verifica cuentas en Nómina → Configuración`)
            return null
        }
        const { db, lpEmpresaId, periodoLpId, tipoId, tipoCodigo } = ctx
        const [añoNum, mesNum] = fecha.split('-').map(Number)

        const { data: numero } = await db.rpc('lp_generar_numero_comprobante', {
            p_empresa_id: lpEmpresaId, p_tipo_codigo: tipoCodigo, p_año: añoNum, p_mes: mesNum,
        })

        const totalDebe  = r2(debe.reduce((s, l) => s + l.monto, 0))
        const totalHaber = r2(haber.reduce((s, l) => s + l.monto, 0))

        const { data: comp, error: errComp } = await db.from('lp_comprobantes').insert({
            empresa_id: lpEmpresaId, periodo_id: periodoLpId,
            tipo_comprobante_id: tipoId, numero: numero || `NOM-${Date.now()}`,
            secuencial: 1, fecha, glosa, estado: 'confirmado',
            total_debe: totalDebe, total_haber: totalHaber,
            moneda_id: null, tipo_cambio: 1,
            origen: 'quickinvoice_nomina', referencia_externa: referencia, created_by: null,
        }).select('id').single()

        if (errComp || !comp) throw errComp ?? new Error('Error al insertar comprobante LP')

        const lineas = [
            ...debe.map((l, i) => ({
                comprobante_id: comp.id, empresa_id: lpEmpresaId,
                cuenta_id: l.cuenta_id, descripcion: l.desc, debe: l.monto, haber: 0, orden: i,
            })),
            ...haber.map((l, i) => ({
                comprobante_id: comp.id, empresa_id: lpEmpresaId,
                cuenta_id: l.cuenta_id, descripcion: l.desc, debe: 0, haber: l.monto, orden: debe.length + i,
            })),
        ]
        const { error: errLineas } = await db.from('lp_comprobante_lineas').insert(lineas)
        if (errLineas) throw errLineas

        console.log(`[nomContab] Comprobante LP creado: ${glosa} (${comp.id})`)
        return comp.id as string
    } catch (e) {
        console.error(`[nomContab] Error al crear comprobante "${glosa}":`, e)
        return null
    }
}

// ─── Shared: anular comprobante por referencia_externa ───────────────────────

async function anularPorReferencia(referencia: string, ctx: Ctx): Promise<void> {
    try {
        await ctx.db.from('lp_comprobantes')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('empresa_id', ctx.lpEmpresaId)
            .eq('referencia_externa', referencia)
    } catch (e) {
        console.error(`[nomContab] Error al anular "${referencia}":`, e)
    }
}

// ─── Shared: helper para agregar/acumular líneas por cuenta ──────────────────

function addLinea(lineas: Linea[], ctaId: string | null | undefined, monto: number, desc: string) {
    if (!ctaId || monto <= 0.009) return
    const existing = lineas.find(l => l.cuenta_id === ctaId)
    if (existing) existing.monto = r2(existing.monto + monto)
    else lineas.push({ cuenta_id: ctaId, monto: r2(monto), desc })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public service
// ═══════════════════════════════════════════════════════════════════════════════

export const contabilidadNominaService = {

    // ── 1. Anticipo quincenal ─────────────────────────────────────────────────
    // DEBE: Anticipos a empleados (activo)
    // HABER: Sueldos por pagar (fallback; idealmente banco — agregar cta_banco_pagos)
    async postearAnticipo(anticipoId: string, empresaId: string): Promise<void> {
        try {
            const { data: anticipo } = await nominas()
                .from('anticipos').select('id, nombre, periodo_id').eq('id', anticipoId).single()
            if (!anticipo) return

            const { data: lineas } = await nominas()
                .from('anticipo_lineas').select('monto_anticipo, neto')
                .eq('anticipo_id', anticipoId)
            if (!lineas?.length) return

            const totalAnticipo = r2(lineas.reduce((s, l) => s + (l.monto_anticipo ?? 0), 0))
            if (totalAnticipo <= 0) return

            const { data: periodo } = await nominas()
                .from('periodos').select('fecha_fin').eq('id', anticipo.periodo_id).single()
            const fecha = periodo?.fecha_fin?.substring(0, 10) ?? new Date().toISOString().substring(0, 10)

            const ctx = await initCtx(empresaId, fecha)
            if (!ctx) return

            const { c } = ctx
            if (!c.cta_anticipos_empleados || !c.cta_sueldos_pagar) {
                console.warn('[nomContab] Anticipo: configura cta_anticipos_empleados y cta_sueldos_pagar')
                return
            }

            const debe:  Linea[] = [{ cuenta_id: c.cta_anticipos_empleados, monto: totalAnticipo, desc: anticipo.nombre }]
            const haber: Linea[] = [{ cuenta_id: c.cta_sueldos_pagar,       monto: totalAnticipo, desc: 'Anticipo por pagar' }]

            const compId = await postearComprobante(
                ctx, `Anticipo nómina — ${anticipo.nombre}`,
                fecha, `anticipo_${anticipoId}`, debe, haber,
            )
            if (compId) {
                await nominas().from('anticipos')
                    .update({ lp_comprobante_id: compId, updated_at: new Date().toISOString() })
                    .eq('id', anticipoId)
            }
        } catch (e) {
            console.error('[nomContab] postearAnticipo:', e)
        }
    },

    async anularAnticipo(anticipoId: string, empresaId: string): Promise<void> {
        try {
            const ctx = await initCtx(empresaId, new Date().toISOString().substring(0, 10))
            if (!ctx) return
            await anularPorReferencia(`anticipo_${anticipoId}`, ctx)
            await nominas().from('anticipos')
                .update({ lp_comprobante_id: null, updated_at: new Date().toISOString() })
                .eq('id', anticipoId)
        } catch (e) {
            console.error('[nomContab] anularAnticipo:', e)
        }
    },

    // ── 2+3. Rol mensual + Provisión leyes sociales ───────────────────────────
    //
    // Asiento 2 — Rol mensual:
    //   DEBE:  ingresos agrupados por cuenta (concepto.cuenta_contable o cta_sueldos/cta_horas_extra)
    //   HABER: anticipos (cta_anticipos_empleados), IESS personal (cta_iess_pagar),
    //          otros descuentos (por cuenta o cta_sueldos_pagar),
    //          neto remuneraciones (cta_sueldos_pagar)
    //
    // Asiento 3 — Provisión leyes:
    //   DEBE:  cta_iess_patronal, cta_dec_tercero, cta_dec_cuarto, cta_vacaciones, cta_fondo_reserva
    //   HABER: cta_iess_pagar, cta_prov_dec_tercero, cta_prov_dec_cuarto, cta_prov_vacaciones, cta_prov_fondo_reserva
    async postearRolMensual(periodoId: string, empresaId: string): Promise<void> {
        try {
            const { data: periodo } = await nominas()
                .from('periodos').select('id, nombre, fecha_fin').eq('id', periodoId).single()
            if (!periodo) return
            const fecha = periodo.fecha_fin?.substring(0, 10) ?? new Date().toISOString().substring(0, 10)

            const { data: cabs } = await nominas()
                .from('rol_cabecera').select('id, total_ingresos, total_descuentos, neto')
                .eq('periodo_id', periodoId)
            if (!cabs?.length) return

            const cabIds = cabs.map(c => c.id)
            const { data: lineas } = await nominas()
                .from('rol_lineas')
                .select('tipo, codigo, nombre, monto, concepto:conceptos(cuenta_contable, afecta_iess)')
                .in('cabecera_id', cabIds).gt('monto', 0)
            if (!lineas?.length) return

            const params = await parametrosNominaService.obtener(empresaId)
            const ctx = await initCtx(empresaId, fecha)
            if (!ctx) return

            const { c } = ctx

            // Batch-resolve cuenta_contable codes → LP IDs (para conceptos con código propio)
            const codigosSet = new Set<string>()
            for (const l of lineas) {
                const cod: string | null = (l.concepto as any)?.cuenta_contable ?? null
                if (cod) codigosSet.add(cod)
            }
            const codigoToId = await resolverCodigos(ctx.db, ctx.lpEmpresaId, codigosSet)

            const HRS_EXTRA = new Set(['HRS_EXTRA_50', 'HRS_EXTRA_100', 'HRS_NOCT_25'])
            const ANTICIPO  = new Set(['ANTICIPO', 'ANT_QUINCENA'])
            const IESS_P    = new Set(['IESS_PERSONAL'])
            const IR        = new Set(['IR_RENTA', 'RET_RENTA'])

            // ── Asiento 2: Rol mensual ─────────────────────────────────────
            const debe:  Linea[] = []
            const haber: Linea[] = []

            // DEBE: ingresos
            for (const l of lineas) {
                if (l.tipo !== 'ingreso') continue
                const cod: string | null = (l.concepto as any)?.cuenta_contable ?? null
                const ctaId = (cod ? codigoToId.get(cod) : null)
                    ?? (HRS_EXTRA.has(l.codigo) ? c.cta_horas_extra : c.cta_sueldos)
                addLinea(debe, ctaId, l.monto, l.nombre ?? 'Gasto nómina')
            }

            // HABER: descuentos por categoría
            let totalDescuentos = 0
            for (const l of lineas) {
                if (l.tipo !== 'descuento') continue
                totalDescuentos = r2(totalDescuentos + l.monto)

                if (ANTICIPO.has(l.codigo)) {
                    addLinea(haber, c.cta_anticipos_empleados, l.monto, 'Anticipo quincena')
                } else if (IESS_P.has(l.codigo)) {
                    addLinea(haber, c.cta_iess_pagar, l.monto, 'IESS personal')
                } else if (IR.has(l.codigo)) {
                    // IR: usar cuenta del concepto o fallback a sueldos_pagar
                    const cod: string | null = (l.concepto as any)?.cuenta_contable ?? null
                    const ctaId = (cod ? codigoToId.get(cod) : null) ?? c.cta_sueldos_pagar
                    addLinea(haber, ctaId, l.monto, 'Retención IR')
                } else {
                    // Otros descuentos: usar cuenta del concepto o fallback
                    const cod: string | null = (l.concepto as any)?.cuenta_contable ?? null
                    const ctaId = (cod ? codigoToId.get(cod) : null) ?? c.cta_sueldos_pagar
                    addLinea(haber, ctaId, l.monto, l.nombre ?? l.codigo)
                }
            }

            // HABER: neto = total_ingresos - total_descuentos → Remuneraciones x pagar
            const totalIngresos = r2(cabs.reduce((s, cab) => s + (cab.total_ingresos ?? 0), 0))
            const neto = r2(totalIngresos - totalDescuentos)
            addLinea(haber, c.cta_sueldos_pagar, neto, 'Remuneraciones por pagar')

            const compRolId = await postearComprobante(
                ctx, `Rol mensual — ${periodo.nombre}`,
                fecha, `rol_mensual_${periodoId}`, debe, haber,
            )

            // ── Asiento 3: Provisión leyes sociales ───────────────────────
            const compProvId = await postearProvisionLeyes(ctx, periodoId, periodo.nombre, cabs, lineas as any[], params, fecha)

            if (compRolId || compProvId) {
                await nominas().from('periodos')
                    .update({
                        lp_comprobante_rol_id:  compRolId  ?? null,
                        lp_comprobante_prov_id: compProvId ?? null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', periodoId)
            }
        } catch (e) {
            console.error('[nomContab] postearRolMensual:', e)
        }
    },

    async anularRolMensual(periodoId: string, empresaId: string): Promise<void> {
        try {
            const ctx = await initCtx(empresaId, new Date().toISOString().substring(0, 10))
            if (!ctx) return
            await anularPorReferencia(`rol_mensual_${periodoId}`,     ctx)
            await anularPorReferencia(`provision_leyes_${periodoId}`, ctx)
            await nominas().from('periodos')
                .update({ lp_comprobante_rol_id: null, lp_comprobante_prov_id: null, updated_at: new Date().toISOString() })
                .eq('id', periodoId)
        } catch (e) {
            console.error('[nomContab] anularRolMensual:', e)
        }
    },

    // ── 4. Pago Décimo Tercero ────────────────────────────────────────────────
    // DEBE: cta_prov_dec_tercero; HABER: cta_sueldos_pagar (proxy banco)
    async postearPagoDecimo3(liquidacionId: string, fecha: string, total: number, empresaId: string): Promise<void> {
        await pagarProvision('cta_prov_dec_tercero', `dec3_pago_${liquidacionId}`, `Pago décimo tercero`, fecha, total, empresaId)
    },

    // ── 5. Pago Décimo Cuarto ─────────────────────────────────────────────────
    async postearPagoDecimo4(liquidacionId: string, fecha: string, total: number, empresaId: string): Promise<void> {
        await pagarProvision('cta_prov_dec_cuarto', `dec4_pago_${liquidacionId}`, `Pago décimo cuarto`, fecha, total, empresaId)
    },

    // ── 6. Pago Vacaciones ────────────────────────────────────────────────────
    async postearPagoVacaciones(liquidacionId: string, fecha: string, total: number, empresaId: string): Promise<void> {
        await pagarProvision('cta_prov_vacaciones', `vac_pago_${liquidacionId}`, `Pago vacaciones`, fecha, total, empresaId)
    },

    // ── 7. Finiquito ──────────────────────────────────────────────────────────
    async postearFiniquito(finiquitoId: string, empresaId: string): Promise<void> {
        try {
            const { data: fin } = await nominas()
                .from('finiquitos').select('*, empleado:empleados(nombres, apellidos)')
                .eq('id', finiquitoId).single()
            if (!fin) return

            const fecha = fin.fecha_salida?.substring(0, 10) ?? new Date().toISOString().substring(0, 10)
            const ctx = await initCtx(empresaId, fecha)
            if (!ctx) return

            const { c } = ctx
            const empNombre = `${(fin.empleado as any)?.nombres ?? ''} ${(fin.empleado as any)?.apellidos ?? ''}`.trim()

            const debe:  Linea[] = []
            const haber: Linea[] = []

            // DEBE: rubros del finiquito
            addLinea(debe, c.cta_sueldos,           (fin.v_sueldo_pendiente ?? 0) + (fin.v_horas_extras ?? 0), 'Sueldo y horas extras pendientes')
            addLinea(debe, c.cta_prov_vacaciones,    fin.v_vacaciones      ?? 0, 'Vacaciones no gozadas')
            addLinea(debe, c.cta_prov_dec_tercero,   fin.v_decimo_tercero  ?? 0, 'D13 proporcional')
            addLinea(debe, c.cta_prov_dec_cuarto,    fin.v_decimo_cuarto   ?? 0, 'D14 proporcional')
            addLinea(debe, c.cta_prov_fondo_reserva, fin.v_fondos_reserva  ?? 0, 'Fondos de reserva')
            // Desahucio/indemnización: no tiene cuenta específica en cuentas_nomina → fallback cta_sueldos
            addLinea(debe, c.cta_sueldos,            (fin.v_bonif_desahucio ?? 0) + (fin.v_indemnizacion ?? 0), 'Desahucio / Indemnización')
            addLinea(debe, c.cta_sueldos,            fin.v_otros_ingresos  ?? 0, 'Otros ingresos finiquito')

            // HABER: descuentos + neto
            addLinea(haber, c.cta_iess_pagar,            (fin.d_iess_personal ?? 0) + (fin.d_prestamos_iess ?? 0), 'IESS personal y préstamos IESS')
            addLinea(haber, c.cta_anticipos_empleados,   fin.d_anticipos           ?? 0, 'Anticipos pendientes')
            addLinea(haber, c.cta_sueldos_pagar,         fin.d_prestamos_empresa   ?? 0, 'Préstamos empresa')
            addLinea(haber, c.cta_sueldos_pagar,         fin.neto_a_pagar          ?? 0, 'Neto finiquito a pagar')

            if (!debe.length) {
                console.warn('[nomContab] Finiquito: configura cta_sueldos en Nómina → Configuración')
                return
            }

            const compId = await postearComprobante(
                ctx, `Finiquito — ${empNombre}`,
                fecha, `finiquito_${finiquitoId}`, debe, haber,
            )
            if (compId) {
                await nominas().from('finiquitos')
                    .update({ lp_comprobante_id: compId, updated_at: new Date().toISOString() })
                    .eq('id', finiquitoId)
            }
        } catch (e) {
            console.error('[nomContab] postearFiniquito:', e)
        }
    },

    async anularFiniquito(finiquitoId: string, empresaId: string): Promise<void> {
        try {
            const ctx = await initCtx(empresaId, new Date().toISOString().substring(0, 10))
            if (!ctx) return
            await anularPorReferencia(`finiquito_${finiquitoId}`, ctx)
            await nominas().from('finiquitos')
                .update({ lp_comprobante_id: null, updated_at: new Date().toISOString() })
                .eq('id', finiquitoId)
        } catch (e) {
            console.error('[nomContab] anularFiniquito:', e)
        }
    },
}

// ─── Private: provisión leyes sociales ───────────────────────────────────────

async function postearProvisionLeyes(
    ctx: Ctx, periodoId: string, periodoNombre: string,
    cabs: any[], lineas: any[], params: any, fecha: string,
): Promise<string | null> {
    try {
        const { c } = ctx
        const pctPatronal = params?.aporte_patronal_iess_pct ?? 11.15
        const pctFR       = params?.fondo_reserva_pct        ?? 8.33
        const sbu         = params?.sbu                       ?? 460
        const nEmpleados  = cabs.length

        const iessBase      = r2(lineas.filter(l => l.tipo === 'ingreso' && (l.concepto as any)?.afecta_iess).reduce((s: number, l: any) => s + l.monto, 0))
        const totalIngresos = r2(cabs.reduce((s: number, cab: any) => s + (cab.total_ingresos ?? 0), 0))

        const provIessP = r2(iessBase * pctPatronal / 100)
        const provD13   = r2(totalIngresos / 12)
        const provD14   = r2((sbu / 12) * nEmpleados)
        const provVac   = r2(totalIngresos / 24)
        const provFR    = r2(totalIngresos * pctFR / 100 / 12)

        const debe:  Linea[] = []
        const haber: Linea[] = []

        const addPar = (ctaGasto: string | null | undefined, ctaProv: string | null | undefined, monto: number, label: string) => {
            if (!ctaGasto || !ctaProv || monto < 0.01) return
            addLinea(debe, ctaGasto, monto, label)
            addLinea(haber, ctaProv, monto, label)
        }

        addPar(c.cta_iess_patronal,  c.cta_iess_pagar,          provIessP, 'IESS patronal')
        addPar(c.cta_dec_tercero,    c.cta_prov_dec_tercero,    provD13,   'Provisión D13')
        addPar(c.cta_dec_cuarto,     c.cta_prov_dec_cuarto,     provD14,   'Provisión D14')
        addPar(c.cta_vacaciones,     c.cta_prov_vacaciones,     provVac,   'Provisión vacaciones')
        addPar(c.cta_fondo_reserva,  c.cta_prov_fondo_reserva,  provFR,    'Provisión fondos de reserva')

        if (!debe.length) {
            console.warn('[nomContab] Provisión leyes: sin cuentas configuradas en Nómina → Configuración')
            return null
        }

        return await postearComprobante(
            ctx, `Provisión leyes sociales — ${periodoNombre}`,
            fecha, `provision_leyes_${periodoId}`, debe, haber,
        )
    } catch (e) {
        console.error('[nomContab] postearProvisionLeyes:', e)
        return null
    }
}

// ─── Private: pago de provisión (D13 / D14 / Vacaciones) ─────────────────────

async function pagarProvision(
    ctaProvField: keyof CuentasNomina,
    referencia: string, glosa: string, fecha: string, total: number, empresaId: string,
): Promise<void> {
    if (total <= 0) return
    try {
        const ctx = await initCtx(empresaId, fecha)
        if (!ctx) return
        const ctaProv = ctx.c[ctaProvField] as string | null
        const ctaDestino = ctx.c.cta_sueldos_pagar
        if (!ctaProv || !ctaDestino) {
            console.warn(`[nomContab] ${glosa}: configura ${String(ctaProvField)} y cta_sueldos_pagar`)
            return
        }
        await postearComprobante(ctx, glosa, fecha, referencia,
            [{ cuenta_id: ctaProv,    monto: r2(total), desc: glosa }],
            [{ cuenta_id: ctaDestino, monto: r2(total), desc: 'Pago a empleados' }],
        )
    } catch (e) {
        console.error(`[nomContab] ${glosa}:`, e)
    }
}
