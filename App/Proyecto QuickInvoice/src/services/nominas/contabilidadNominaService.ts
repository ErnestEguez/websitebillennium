import { supabase } from '../../lib/supabase'
import { supabaseContabilidad } from '../../lib/supabaseContabilidad'
import { contableConfigService } from '../contableConfigService'
import { parametrosNominaService } from './parametrosNominaService'

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
    cuenta: (proceso: string, concepto: string) => string | null
}

// ─── Shared: initialize LP context ───────────────────────────────────────────

async function initCtx(empresaId: string, fecha: string): Promise<Ctx | null> {
    try {
        const db = supabaseContabilidad as any

        // mapeo NOMINA:* accounts
        const mapeoMap = await contableConfigService.getMapeoAsMap(empresaId)
        const cuenta = (proceso: string, concepto: string): string | null =>
            mapeoMap[`${proceso}:${concepto}`]?.cuenta_id ?? null

        // LP empresa — match by RUC if available
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

        // Open LP period
        const [añoNum, mesNum] = fecha.split('-').map(Number)
        const { data: periodo } = await db
            .from('lp_periodos').select('id')
            .eq('empresa_id', lpEmpresaId).eq('año', añoNum).eq('mes', mesNum)
            .in('estado', ['abierto']).maybeSingle()
        if (!periodo) {
            console.warn(`[nomContab] Sin período LP abierto ${mesNum}/${añoNum}`)
            return null
        }

        // Preferred voucher type: NOM > CI > IN > first available
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
            console.warn('[nomContab] Sin tipo comprobante LP disponible')
            return null
        }

        return { db, lpEmpresaId, periodoLpId: periodo.id, tipoId, tipoCodigo, cuenta }
    } catch (e) {
        console.error('[nomContab] Error al inicializar contexto LP:', e)
        return null
    }
}

// ─── Shared: insert LP comprobante + lineas ───────────────────────────────────

async function postearComprobante(
    ctx: Ctx,
    glosa: string,
    fecha: string,
    referencia: string,
    debe: Linea[],
    haber: Linea[],
): Promise<string | null> {
    try {
        if (!debe.length || !haber.length) {
            console.warn(`[nomContab] Sin líneas para asiento "${glosa}" — configura mapeo Contabilidad → Nómina`)
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
            tipo_comprobante_id: tipoId,
            numero: numero || `NOM-${Date.now()}`,
            secuencial: 1, fecha, glosa,
            estado: 'confirmado',
            total_debe: totalDebe, total_haber: totalHaber,
            moneda_id: null, tipo_cambio: 1,
            origen: 'quickinvoice_nomina',
            referencia_externa: referencia,
            created_by: null,
        }).select('id').single()

        if (errComp || !comp) throw errComp ?? new Error('Error al insertar comprobante LP')

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

        return comp.id as string
    } catch (e) {
        console.error(`[nomContab] Error al insertar comprobante "${glosa}":`, e)
        return null
    }
}

// ─── Shared: anular comprobantes LP por referencia ───────────────────────────

async function anularPorReferencia(referencia: string, lpEmpresaId: string, db: any): Promise<void> {
    try {
        await db.from('lp_comprobantes')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('empresa_id', lpEmpresaId)
            .eq('referencia_externa', referencia)
    } catch (e) {
        console.error(`[nomContab] Error al anular referencia "${referencia}":`, e)
    }
}

// ─── Shared: batch resolve account codes to LP IDs ───────────────────────────

async function resolverCodigos(
    db: any,
    lpEmpresaId: string,
    codigos: Set<string>,
): Promise<Map<string, string>> {
    if (!codigos.size) return new Map()
    const { data } = await db.from('lp_cuentas')
        .select('id, codigo')
        .eq('empresa_id', lpEmpresaId)
        .in('codigo', Array.from(codigos))
    return new Map((data ?? []).map((c: any) => [c.codigo, c.id]))
}

// ─── Shared: check contabilidad_en_linea flag ─────────────────────────────────

async function isContabEnLinea(empresaId: string): Promise<boolean> {
    const config = await contableConfigService.getConfig(empresaId)
    return config?.contabilidad_en_linea ?? false
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public service
// ═══════════════════════════════════════════════════════════════════════════════

export const contabilidadNominaService = {

    // ── 1. Anticipo quincenal ─────────────────────────────────────────────────
    // DEBE: Anticipos a Empleados (activo corriente)
    // HABER: Banco pago nómina (neto) + Préstamos empleados (descuentos del anticipo)
    async postearAnticipo(anticipoId: string, empresaId: string): Promise<void> {
        try {
            if (!await isContabEnLinea(empresaId)) return

            const { data: anticipo } = await nominas()
                .from('anticipos').select('id, nombre, periodo_id')
                .eq('id', anticipoId).single()
            if (!anticipo) return

            const { data: lineas } = await nominas()
                .from('anticipo_lineas').select('monto_anticipo, neto, desc1_monto, desc2_monto')
                .eq('anticipo_id', anticipoId)
            if (!lineas?.length) return

            const totalAnticipo = r2(lineas.reduce((s, l) => s + (l.monto_anticipo ?? 0), 0))
            const totalNeto     = r2(lineas.reduce((s, l) => s + (l.neto ?? 0), 0))
            const totalDesc     = r2(totalAnticipo - totalNeto)
            if (totalAnticipo <= 0) return

            const { data: periodo } = await nominas()
                .from('periodos').select('fecha_fin').eq('id', anticipo.periodo_id).single()
            const fecha = periodo?.fecha_fin?.substring(0, 10) ?? new Date().toISOString().substring(0, 10)

            const ctx = await initCtx(empresaId, fecha)
            if (!ctx) return

            const ctaAnticipo = ctx.cuenta('NOMINA', 'ANTICIPOS_EMPLEADOS')
            const ctaBanco    = ctx.cuenta('NOMINA', 'BANCO_PAGO_NOMINA')
            const ctaPrest    = ctx.cuenta('NOMINA', 'PRESTAMOS_EMPLEADOS')

            if (!ctaAnticipo || !ctaBanco) {
                console.warn('[nomContab] Anticipo: configura NOMINA:ANTICIPOS_EMPLEADOS y NOMINA:BANCO_PAGO_NOMINA')
                return
            }

            const debe: Linea[] = [{ cuenta_id: ctaAnticipo, monto: totalAnticipo, desc: anticipo.nombre }]
            const haber: Linea[] = []

            if (totalNeto > 0)
                haber.push({ cuenta_id: ctaBanco, monto: totalNeto, desc: 'Pago anticipo' })
            if (totalDesc > 0.01)
                haber.push({ cuenta_id: ctaPrest ?? ctaBanco, monto: totalDesc, desc: 'Descuentos en anticipo' })

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
            await anularPorReferencia(`anticipo_${anticipoId}`, ctx.lpEmpresaId, ctx.db)
            await nominas().from('anticipos')
                .update({ lp_comprobante_id: null, updated_at: new Date().toISOString() })
                .eq('id', anticipoId)
        } catch (e) {
            console.error('[nomContab] anularAnticipo:', e)
        }
    },

    // ── 2+3. Rol mensual + Provisión leyes sociales ───────────────────────────
    // Asiento 2 — Rol mensual:
    //   DEBE:  cada línea ingreso agrupada por cuenta_contable del concepto
    //   HABER: IESS personal, IR, Anticipos, Préstamos, y Remuneraciones x pagar (neto)
    //
    // Asiento 3 — Provisión leyes:
    //   DEBE:  Gasto IESS patronal, D13, D14, Vacaciones, FR (calculados)
    //   HABER: sus cuentas de provisión/por pagar respectivas
    async postearRolMensual(periodoId: string, empresaId: string): Promise<void> {
        try {
            if (!await isContabEnLinea(empresaId)) return

            const { data: periodo } = await nominas()
                .from('periodos').select('id, nombre, fecha_fin')
                .eq('id', periodoId).single()
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
                .in('cabecera_id', cabIds)
                .gt('monto', 0)
            if (!lineas?.length) return

            const params = await parametrosNominaService.obtener(empresaId)
            const ctx = await initCtx(empresaId, fecha)
            if (!ctx) return

            // Batch-resolve all cuenta_contable codes to LP IDs
            const codigosSet = new Set<string>()
            for (const l of lineas) {
                const cod: string | null = (l.concepto as any)?.cuenta_contable ?? null
                if (cod) codigosSet.add(cod)
            }
            const codigoToId = await resolverCodigos(ctx.db, ctx.lpEmpresaId, codigosSet)

            const fallbackGasto = ctx.cuenta('NOMINA', 'GASTO_SUELDOS')
            const ctaRemu   = ctx.cuenta('NOMINA', 'REMUNERACIONES_X_PAGAR')
            const ctaIessP  = ctx.cuenta('NOMINA', 'IESS_PERSONAL_X_PAGAR')
            const ctaIR     = ctx.cuenta('NOMINA', 'IR_X_PAGAR')
            const ctaAnt    = ctx.cuenta('NOMINA', 'ANTICIPOS_EMPLEADOS')
            const ctaPrest  = ctx.cuenta('NOMINA', 'PRESTAMOS_EMPLEADOS')

            // ── Asiento 2: Rol mensual ─────────────────────────────────────
            // DEBE: agrupar ingresos por cuenta
            const cuentaDebeMap = new Map<string, number>()
            const debeDescMap   = new Map<string, string>()
            for (const l of lineas) {
                if (l.tipo !== 'ingreso') continue
                const cod: string | null = (l.concepto as any)?.cuenta_contable ?? null
                const ctaId = (cod ? codigoToId.get(cod) : null) ?? fallbackGasto
                if (!ctaId) continue
                cuentaDebeMap.set(ctaId, r2((cuentaDebeMap.get(ctaId) ?? 0) + l.monto))
                if (!debeDescMap.has(ctaId)) debeDescMap.set(ctaId, l.nombre ?? 'Gasto nómina')
            }
            const debe: Linea[] = Array.from(cuentaDebeMap.entries())
                .map(([cuenta_id, monto]) => ({ cuenta_id, monto, desc: debeDescMap.get(cuenta_id) ?? 'Gasto nómina' }))

            // HABER: cada descuento → su cuenta; neto → Remuneraciones x pagar
            const ANTICIPO_CODIGOS = new Set(['ANTICIPO', 'ANT_QUINCENA'])
            const IESS_P_CODIGOS   = new Set(['IESS_PERSONAL'])
            const IR_CODIGOS       = new Set(['IR_RENTA', 'RET_RENTA'])
            const PREST_CODIGOS    = new Set(['PRESTAMO_EMPRESA', 'PREST_EMPRESA', 'PRESTAMO_IESS'])

            const haberMap = new Map<string, number>()
            let totalDescuentos = 0

            function addHaber(ctaId: string | null, monto: number) {
                if (!ctaId || monto <= 0) return
                haberMap.set(ctaId, r2((haberMap.get(ctaId) ?? 0) + monto))
            }

            for (const l of lineas) {
                if (l.tipo !== 'descuento') continue
                totalDescuentos = r2(totalDescuentos + l.monto)

                if (ANTICIPO_CODIGOS.has(l.codigo))     addHaber(ctaAnt, l.monto)
                else if (IESS_P_CODIGOS.has(l.codigo))  addHaber(ctaIessP, l.monto)
                else if (IR_CODIGOS.has(l.codigo))      addHaber(ctaIR, l.monto)
                else if (PREST_CODIGOS.has(l.codigo))   addHaber(ctaPrest, l.monto)
                else {
                    const cod: string | null = (l.concepto as any)?.cuenta_contable ?? null
                    const ctaId = (cod ? codigoToId.get(cod) : null) ?? ctaRemu
                    addHaber(ctaId ?? null, l.monto)
                }
            }

            const totalIngresos = r2(cabs.reduce((s, c) => s + (c.total_ingresos ?? 0), 0))
            const neto = r2(totalIngresos - totalDescuentos)
            if (neto > 0) addHaber(ctaRemu, neto)

            const haber: Linea[] = Array.from(haberMap.entries()).map(([cuenta_id, monto]) => {
                const label =
                    cuenta_id === ctaAnt   ? 'Anticipo quincena' :
                    cuenta_id === ctaIessP ? 'IESS personal' :
                    cuenta_id === ctaIR    ? 'IR trabajadores' :
                    cuenta_id === ctaPrest ? 'Préstamos' :
                    cuenta_id === ctaRemu  ? 'Remuneraciones por pagar' : 'Descuentos'
                return { cuenta_id, monto, desc: label }
            })

            const compRolId = await postearComprobante(
                ctx, `Rol mensual — ${periodo.nombre}`,
                fecha, `rol_mensual_${periodoId}`, debe, haber,
            )

            // ── Asiento 3: Provisión leyes sociales ───────────────────────
            const compProvId = await postearProvisionLeyes(
                ctx, periodoId, periodo.nombre, cabs, lineas as any[], params, fecha,
            )

            if (compRolId) {
                await nominas().from('periodos')
                    .update({
                        lp_comprobante_rol_id:  compRolId,
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
            await anularPorReferencia(`rol_mensual_${periodoId}`,    ctx.lpEmpresaId, ctx.db)
            await anularPorReferencia(`provision_leyes_${periodoId}`, ctx.lpEmpresaId, ctx.db)
            await nominas().from('periodos')
                .update({
                    lp_comprobante_rol_id:  null,
                    lp_comprobante_prov_id: null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', periodoId)
        } catch (e) {
            console.error('[nomContab] anularRolMensual:', e)
        }
    },

    // ── 4. Pago Décimo Tercero ────────────────────────────────────────────────
    // DEBE: Provisión D13; HABER: Banco pago nómina
    async postearPagoDecimo3(
        liquidacionId: string, fecha: string, total: number, empresaId: string,
    ): Promise<void> {
        await pagarProvision(
            'PROVISION_D13', `dec3_pago_${liquidacionId}`,
            `Pago décimo tercero`, fecha, total, empresaId,
        )
    },

    // ── 5. Pago Décimo Cuarto ─────────────────────────────────────────────────
    async postearPagoDecimo4(
        liquidacionId: string, fecha: string, total: number, empresaId: string,
    ): Promise<void> {
        await pagarProvision(
            'PROVISION_D14', `dec4_pago_${liquidacionId}`,
            `Pago décimo cuarto`, fecha, total, empresaId,
        )
    },

    // ── 6. Pago Vacaciones ────────────────────────────────────────────────────
    async postearPagoVacaciones(
        liquidacionId: string, fecha: string, total: number, empresaId: string,
    ): Promise<void> {
        await pagarProvision(
            'PROVISION_VACACIONES', `vac_pago_${liquidacionId}`,
            `Pago vacaciones`, fecha, total, empresaId,
        )
    },

    // ── 7. Finiquito ──────────────────────────────────────────────────────────
    // DEBE: sueldos pendientes, vacaciones, décimos, FR, desahucio/indemnización
    // HABER: IESS, préstamos, anticipos, neto a pagar
    async postearFiniquito(finiquitoId: string, empresaId: string): Promise<void> {
        try {
            if (!await isContabEnLinea(empresaId)) return

            const { data: fin } = await nominas()
                .from('finiquitos')
                .select('*, empleado:empleados(nombres, apellidos)')
                .eq('id', finiquitoId).single()
            if (!fin) return

            const fecha = fin.fecha_salida?.substring(0, 10) ?? new Date().toISOString().substring(0, 10)
            const ctx = await initCtx(empresaId, fecha)
            if (!ctx) return

            const empNombre = `${(fin.empleado as any)?.nombres ?? ''} ${(fin.empleado as any)?.apellidos ?? ''}`.trim()

            const ctaGasto   = ctx.cuenta('NOMINA', 'GASTO_SUELDOS')
            const ctaProvD13 = ctx.cuenta('NOMINA', 'PROVISION_D13')
            const ctaProvD14 = ctx.cuenta('NOMINA', 'PROVISION_D14')
            const ctaProvVac = ctx.cuenta('NOMINA', 'PROVISION_VACACIONES')
            const ctaProvFR  = ctx.cuenta('NOMINA', 'PROVISION_FONDOS_RESERVA')
            const ctaIndem   = ctx.cuenta('NOMINA', 'GASTO_INDEMNIZACION')
            const ctaIessP   = ctx.cuenta('NOMINA', 'IESS_PERSONAL_X_PAGAR')
            const ctaPrest   = ctx.cuenta('NOMINA', 'PRESTAMOS_EMPLEADOS')
            const ctaAnt     = ctx.cuenta('NOMINA', 'ANTICIPOS_EMPLEADOS')
            const ctaBanco   = ctx.cuenta('NOMINA', 'BANCO_PAGO_NOMINA')
            const ctaRemu    = ctx.cuenta('NOMINA', 'REMUNERACIONES_X_PAGAR')

            const debe: Linea[] = []
            const haber: Linea[] = []

            const addDebe = (ctaId: string | null, monto: number, desc: string) => {
                if (!ctaId || monto <= 0.01) return
                debe.push({ cuenta_id: ctaId, monto: r2(monto), desc })
            }

            addDebe(ctaGasto,   (fin.v_sueldo_pendiente ?? 0) + (fin.v_horas_extras ?? 0), 'Sueldo y horas extras pendientes')
            addDebe(ctaProvVac, fin.v_vacaciones ?? 0,       'Vacaciones no gozadas')
            addDebe(ctaProvD13, fin.v_decimo_tercero ?? 0,   'D13 proporcional')
            addDebe(ctaProvD14, fin.v_decimo_cuarto ?? 0,    'D14 proporcional')
            addDebe(ctaProvFR,  fin.v_fondos_reserva ?? 0,   'Fondos de reserva')
            addDebe(ctaIndem,   (fin.v_bonif_desahucio ?? 0) + (fin.v_indemnizacion ?? 0), 'Desahucio / Indemnización')
            addDebe(ctaGasto,   fin.v_otros_ingresos ?? 0,   'Otros ingresos finiquito')

            const addHaber = (ctaId: string | null, monto: number, desc: string) => {
                if (!ctaId || monto <= 0.01) return
                const existing = haber.find(h => h.cuenta_id === ctaId)
                if (existing) existing.monto = r2(existing.monto + monto)
                else haber.push({ cuenta_id: ctaId, monto: r2(monto), desc })
            }

            addHaber(ctaIessP, (fin.d_iess_personal ?? 0) + (fin.d_prestamos_iess ?? 0), 'IESS personal y préstamos IESS')
            addHaber(ctaPrest,  fin.d_prestamos_empresa ?? 0, 'Préstamos empresa')
            addHaber(ctaAnt,    fin.d_anticipos ?? 0,          'Anticipos pendientes')

            const netoAPagar = r2(fin.neto_a_pagar ?? 0)
            addHaber(ctaBanco ?? ctaRemu, netoAPagar, 'Neto finiquito')

            if (!debe.length) {
                console.warn('[nomContab] Finiquito: configura NOMINA:GASTO_SUELDOS en mapeo contable')
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
            await anularPorReferencia(`finiquito_${finiquitoId}`, ctx.lpEmpresaId, ctx.db)
            await nominas().from('finiquitos')
                .update({ lp_comprobante_id: null, updated_at: new Date().toISOString() })
                .eq('id', finiquitoId)
        } catch (e) {
            console.error('[nomContab] anularFiniquito:', e)
        }
    },
}

// ─── Private: provision de leyes sociales ────────────────────────────────────

async function postearProvisionLeyes(
    ctx: Ctx,
    periodoId: string,
    periodoNombre: string,
    cabs: any[],
    lineas: any[],
    params: any,
    fecha: string,
): Promise<string | null> {
    try {
        const pctPatronal = params?.aporte_patronal_iess_pct ?? 11.15
        const pctFR       = params?.fondo_reserva_pct ?? 8.33
        const sbu         = params?.sbu ?? 460
        const nEmpleados  = cabs.length

        const iessBase = r2(lineas
            .filter(l => l.tipo === 'ingreso' && (l.concepto as any)?.afecta_iess)
            .reduce((s: number, l: any) => s + l.monto, 0))

        const totalIngresos = r2(cabs.reduce((s: number, c: any) => s + (c.total_ingresos ?? 0), 0))

        const provIessP = r2(iessBase * pctPatronal / 100)
        const provD13   = r2(totalIngresos / 12)
        const provD14   = r2((sbu / 12) * nEmpleados)
        const provVac   = r2(totalIngresos / 24)
        const provFR    = r2(totalIngresos * pctFR / 100 / 12)

        const debe: Linea[]  = []
        const haber: Linea[] = []

        function addPar(gastoKey: string, provKey: string, monto: number, label: string) {
            if (monto <= 0.01) return
            const ctaGasto = ctx.cuenta('NOMINA', gastoKey)
            const ctaProv  = ctx.cuenta('NOMINA', provKey)
            if (!ctaGasto || !ctaProv) return
            debe.push({ cuenta_id: ctaGasto, monto, desc: label })
            haber.push({ cuenta_id: ctaProv,  monto, desc: label })
        }

        addPar('GASTO_IESS_PATRONAL',    'IESS_PATRONAL_X_PAGAR',    provIessP, 'IESS patronal')
        addPar('GASTO_D13',              'PROVISION_D13',             provD13,   'Provisión D13')
        addPar('GASTO_D14',              'PROVISION_D14',             provD14,   'Provisión D14')
        addPar('GASTO_VACACIONES',       'PROVISION_VACACIONES',      provVac,   'Provisión vacaciones')
        addPar('GASTO_FONDOS_RESERVA',   'PROVISION_FONDOS_RESERVA',  provFR,    'Provisión fondos de reserva')

        if (!debe.length) {
            console.warn('[nomContab] Provisión leyes: sin cuentas mapeadas — configura Contabilidad → Nómina')
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

// ─── Private: pago de provisión genérico (D13/D14/Vacaciones) ────────────────

async function pagarProvision(
    ctaProvKey: string,
    referencia: string,
    glosa: string,
    fecha: string,
    total: number,
    empresaId: string,
): Promise<void> {
    if (total <= 0) return
    try {
        if (!await isContabEnLinea(empresaId)) return
        const ctx = await initCtx(empresaId, fecha)
        if (!ctx) return
        const ctaProv  = ctx.cuenta('NOMINA', ctaProvKey)
        const ctaBanco = ctx.cuenta('NOMINA', 'BANCO_PAGO_NOMINA')
        if (!ctaProv || !ctaBanco) {
            console.warn(`[nomContab] ${glosa}: configura NOMINA:${ctaProvKey} y NOMINA:BANCO_PAGO_NOMINA`)
            return
        }
        const debe:  Linea[] = [{ cuenta_id: ctaProv,  monto: r2(total), desc: glosa }]
        const haber: Linea[] = [{ cuenta_id: ctaBanco, monto: r2(total), desc: 'Pago vía banco' }]
        await postearComprobante(ctx, glosa, fecha, referencia, debe, haber)
    } catch (e) {
        console.error(`[nomContab] ${glosa}:`, e)
    }
}
