import { supabase } from '../lib/supabase'
import { supabaseContabilidad } from '../lib/supabaseContabilidad'
import { contableConfigService } from './contableConfigService'

export interface RetLineContable {
    tipo:   string   // 'FUENTE' | 'IVA'
    codigo: string   // código SRI ej. '303', '725'
    valor:  number
}

export interface AsientoCompraInput {
    empresaId:       string
    portalRuc:       string
    fecha:           string
    numeroFactura:   string
    proveedorNombre: string
    subtotal:        number
    valorIva:        number
    retenciones:     RetLineContable[]   // líneas individuales con código SRI
    tipoCompra:      'INVENTARIO' | 'SERVICIO'
    compraId?:       string
}

export const contabilidadComprasService = {

    async crearAsientoCompra(input: AsientoCompraInput): Promise<void> {
        const db = supabaseContabilidad as any
        const { empresaId, portalRuc, fecha, numeroFactura, proveedorNombre,
                subtotal, valorIva, retenciones, tipoCompra, compraId } = input

        const r2 = (n: number) => Math.round(n * 100) / 100

        // ── 1. Mapeo contable ────────────────────────────────────
        const mapeoMap = await contableConfigService.getMapeoAsMap(empresaId)
        const cuentaMapeo = (proceso: string, concepto: string): string | null =>
            mapeoMap[`${proceso}:${concepto}`]?.cuenta_id ?? null

        // ── 2. Cuentas de retención desde codigos_retencion ──────
        // Para cada código SRI buscamos su cuenta_contable_id en la tabla maestra
        const codigosUsados = retenciones.map(r => r.codigo)
        let cuentaPorCodigo: Record<string, string | null> = {}

        if (codigosUsados.length > 0) {
            const { data: codRows, error: codError } = await supabase
                .from('codigos_retencion')
                .select('codigo, tipo, cuenta_contable_id')
                .eq('empresa_id', empresaId)
                .in('codigo', codigosUsados)

            console.log('[asientoCompra] codigos_retencion query:', { empresaId, codigosUsados, codRows, codError })

            if (codError) throw new Error(`Error leyendo codigos_retencion: ${codError.message}`)

            for (const row of codRows ?? []) {
                cuentaPorCodigo[`${row.tipo}:${row.codigo}`] = row.cuenta_contable_id
            }
        }

        // ── 3. LP empresa ────────────────────────────────────────
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

        // ── 4. Período abierto ───────────────────────────────────
        const [año, mes] = fecha.split('-').map(Number)
        const { data: periodo, error: errPeriodo } = await db
            .from('lp_periodos')
            .select('id')
            .eq('empresa_id', lpEmpresaId)
            .eq('año', año)
            .eq('mes', mes)
            .in('estado', ['abierto'])
            .maybeSingle()

        if (errPeriodo) throw new Error(`Error consultando período LP: ${errPeriodo.message}`)
        if (!periodo) throw new Error(`No hay período abierto en LedgerPro para ${mes}/${año}. Ábrelo en Contabilidad → Períodos.`)

        // ── 5. Tipo comprobante ──────────────────────────────────
        const { data: tipos } = await db
            .from('lp_tipos_comprobante')
            .select('id, codigo')
            .eq('activo', true)
            .order('codigo')

        const listaTipos: Array<{ id: string; codigo: string }> = tipos ?? []
        const tipoPrefs = ['CP', 'CO', 'CI', 'V']
        let tipoId: string | null = null
        let tipoCodigo = 'CP'

        for (const pref of tipoPrefs) {
            const t = listaTipos.find(t => t.codigo === pref)
            if (t) { tipoId = t.id; tipoCodigo = t.codigo; break }
        }
        if (!tipoId && listaTipos.length > 0) {
            tipoId = listaTipos[0].id
            tipoCodigo = listaTipos[0].codigo
        }
        if (!tipoId) throw new Error('Sin tipos de comprobante en LedgerPro.')

        // ── 6. Número correlativo propio ─────────────────────────
        // Buscamos el último secuencial del mismo tipo+período y sumamos 1
        const { data: lastComp } = await db
            .from('lp_comprobantes')
            .select('secuencial')
            .eq('empresa_id', lpEmpresaId)
            .eq('tipo_comprobante_id', tipoId)
            .eq('periodo_id', periodo.id)
            .order('secuencial', { ascending: false })
            .limit(1)
            .maybeSingle()

        const nextSecuencial = ((lastComp?.secuencial as number) ?? 0) + 1
        const mesStr = String(mes).padStart(2, '0')
        const numeroFinal = `${tipoCodigo}-${año}${mesStr}-${String(nextSecuencial).padStart(4, '0')}`

        // ── 7. Construir líneas ──────────────────────────────────
        type Linea = { cuenta_id: string; monto: number; desc: string }
        const debe:  Linea[] = []
        const haber: Linea[] = []

        // DEBE: inventario o gasto
        const ctaActivoClave = tipoCompra === 'INVENTARIO' ? 'INVENTARIO' : 'GASTO_SERVICIO'
        const ctaActivo = cuentaMapeo('COMPRAS', ctaActivoClave)
        if (!ctaActivo) throw new Error(`Cuenta COMPRAS:${ctaActivoClave} no mapeada. Ve a Ajustes → Contabilidad → sección Compras.`)
        if (subtotal > 0.001)
            debe.push({ cuenta_id: ctaActivo, monto: r2(subtotal), desc: tipoCompra === 'INVENTARIO' ? 'Inventario comprado' : 'Gasto/servicio' })

        // DEBE: IVA crédito fiscal
        if (valorIva > 0.001) {
            const ctaIva = cuentaMapeo('COMPRAS', 'IVA_PAGADO')
            if (ctaIva)
                debe.push({ cuenta_id: ctaIva, monto: r2(valorIva), desc: 'IVA en compras' })
        }

        // HABER: retenciones — cuenta por código SRI, agrupadas por cuenta
        const totalRetenciones = r2(retenciones.reduce((s, r) => s + r.valor, 0))
        if (totalRetenciones > 0.001) {
            const haberRetMap = new Map<string, number>()

            const sinCuenta: string[] = []
            for (const ret of retenciones) {
                if (ret.valor < 0.001) continue
                const ctaEspecifica = cuentaPorCodigo[`${ret.tipo}:${ret.codigo}`]
                const ctaFallback   = cuentaMapeo('COMPRAS', 'RETENCION_FUENTE')
                const ctaId         = ctaEspecifica ?? ctaFallback

                if (!ctaId) { sinCuenta.push(ret.codigo); continue }
                haberRetMap.set(ctaId, (haberRetMap.get(ctaId) ?? 0) + ret.valor)
            }
            if (sinCuenta.length > 0) {
                throw new Error(
                    `Los códigos de retención ${sinCuenta.join(', ')} no tienen cuenta contable asignada.\n` +
                    `Asígnalas en Ajustes → Códigos Ret. SRI (editando cada código),\n` +
                    `o mapea una cuenta general en Ajustes → Contabilidad → Compras → "Retención Fuente".`
                )
            }

            for (const [ctaId, monto] of haberRetMap) {
                haber.push({ cuenta_id: ctaId, monto: r2(monto), desc: 'Retenciones por pagar' })
            }
        }

        // HABER: proveedores / CxP (neto después de retenciones)
        const ctaCxP = cuentaMapeo('COMPRAS', 'PROVEEDORES_CXP')
        if (!ctaCxP) throw new Error('Cuenta COMPRAS:PROVEEDORES_CXP no mapeada. Ve a Ajustes → Contabilidad → sección Compras.')
        const netoCxP = r2(subtotal + valorIva - totalRetenciones)
        if (netoCxP > 0.001)
            haber.push({ cuenta_id: ctaCxP, monto: netoCxP, desc: 'Proveedores / CxP' })

        // ── 8. Validar líneas ────────────────────────────────────
        if (debe.length === 0 || haber.length === 0)
            throw new Error('Asiento sin líneas suficientes — revisa el mapeo de cuentas COMPRAS.')

        const totalDebe  = r2(debe.reduce((s, l) => s + l.monto, 0))
        const totalHaber = r2(haber.reduce((s, l) => s + l.monto, 0))

        if (Math.abs(totalDebe - totalHaber) > 0.02)
            console.warn(`[asientoCompra] Descuadre residual: DEBE=${totalDebe} HABER=${totalHaber}`)

        // ── 9. Insertar comprobante LP ───────────────────────────
        const tipoLabel = tipoCompra === 'INVENTARIO' ? 'inventario' : 'servicio'
        const glosa = `Compra ${tipoLabel} ${numeroFactura} — ${proveedorNombre}`

        const { data: comp, error: errComp } = await db
            .from('lp_comprobantes')
            .insert({
                empresa_id:          lpEmpresaId,
                periodo_id:          periodo.id,
                tipo_comprobante_id: tipoId,
                numero:              numeroFinal,
                secuencial:          nextSecuencial,
                fecha,
                glosa,
                estado:              'confirmado',
                total_debe:          totalDebe,
                total_haber:         totalHaber,
                moneda_id:           null,
                tipo_cambio:         1,
                origen:              'quickinvoice',
                referencia_externa:  compraId ?? null,
                created_by:          null,
            })
            .select('id')
            .single()

        if (errComp || !comp) throw errComp ?? new Error('Error creando comprobante LP')

        // ── 10. Insertar líneas ──────────────────────────────────
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

        // ── 11. Actualizar saldos LP ─────────────────────────────
        await db.rpc('lp_actualizar_saldos', {
            p_comprobante_id: comp.id,
            p_operacion: 'sumar',
        })

        console.log(`[asientoCompra] ✅ ${numeroFinal} creado — DEBE ${totalDebe} HABER ${totalHaber}`)
    },
}
