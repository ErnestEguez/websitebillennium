import { supabaseContabilidad } from '../lib/supabaseContabilidad'
import type { TipoMovimiento, SentidoMovimiento, LineaDistribucionContable } from '../types/finance'

export interface AsientoMovimientoInput {
    empresaId:        string
    portalRuc:        string
    fecha:            string
    tipo:             TipoMovimiento
    sentido:          SentidoMovimiento
    monto:            number
    /** cuenta_contable_id de la cuenta bancaria del movimiento */
    cuentaContableId: string | null
    descripcion?:     string | null
    movimientoId?:    string
    /** Distribución contable de la contrapartida — debe sumar igual a monto */
    lineas:           LineaDistribucionContable[]
}

// 'cheque' y 'transferencia' representan traslados entre cuentas propias y no
// generan asiento automático (requieren elegir cuenta destino — no soportado aún).
const TIPOS_SIN_ASIENTO = new Set<TipoMovimiento>(['cheque', 'transferencia'])

const TIPO_GLOSA: Record<TipoMovimiento, string> = {
    deposito:         'Depósito',
    nota_debito:      'Nota de débito bancaria',
    nota_credito:     'Nota de crédito bancaria',
    comision:         'Comisión bancaria',
    interes:          'Interés ganado',
    cargo_automatico: 'Cargo automático',
    cheque:           'Cheque',
    transferencia:    'Transferencia',
    otro:             'Movimiento bancario',
}

export const contabilidadTesoreriaService = {

    /** Genera el asiento contable de un movimiento bancario manual. Devuelve null si el tipo no aplica (cheque/transferencia). */
    async crearAsientoMovimiento(input: AsientoMovimientoInput): Promise<string | null> {
        const db = supabaseContabilidad as any
        const { portalRuc, fecha, tipo, sentido, monto, cuentaContableId, descripcion, movimientoId, lineas } = input

        if (TIPOS_SIN_ASIENTO.has(tipo)) return null

        if (!cuentaContableId)
            throw new Error('La cuenta bancaria de este movimiento no tiene una cuenta contable vinculada. Ve a Tesorería → Bancos → Cuentas Bancarias y asígnale su cuenta contable.')

        const r2 = (n: number) => Math.round(n * 100) / 100
        const montoR = r2(monto)

        // ── 1. Validar distribución contable ──────────────────────
        if (!lineas || lineas.length === 0)
            throw new Error('Debes distribuir el valor del movimiento entre una o más cuentas contables.')

        const sumaLineas = r2(lineas.reduce((acc, l) => acc + l.monto, 0))
        if (Math.abs(sumaLineas - montoR) > 0.01)
            throw new Error(`La distribución contable (${sumaLineas.toFixed(2)}) no coincide con el monto del movimiento (${montoR.toFixed(2)}).`)

        // ── 2. LP empresa ────────────────────────────────────────
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

        // ── 3. Período abierto ───────────────────────────────────
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

        // ── 4. Tipo comprobante ───────────────────────────────────
        const { data: tipos } = await db
            .from('lp_tipos_comprobante')
            .select('id, codigo')
            .eq('activo', true)
            .order('codigo')

        const listaTipos: Array<{ id: string; codigo: string }> = tipos ?? []
        const tipoPrefs = ['NC', 'AJ', 'CE', 'V']
        let tipoId: string | null = null
        let tipoCodigo = 'NC'

        for (const pref of tipoPrefs) {
            const t = listaTipos.find(t => t.codigo === pref)
            if (t) { tipoId = t.id; tipoCodigo = t.codigo; break }
        }
        if (!tipoId && listaTipos.length > 0) {
            tipoId = listaTipos[0].id
            tipoCodigo = listaTipos[0].codigo
        }
        if (!tipoId) throw new Error('Sin tipos de comprobante en LedgerPro.')

        // ── 5. Número correlativo propio ──────────────────────────
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
        let numeroFinal = `${tipoCodigo}-${año}${mesStr}-${String(nextSecuencial).padStart(4, '0')}`

        // ── 6. Plan de líneas DEBE / HABER ─────────────────────────
        // 'credito' = entra dinero al banco → banco se debita (activo aumenta), contrapartidas al HABER
        // 'debito'  = sale dinero del banco → banco se acredita (activo disminuye), contrapartidas al DEBE
        const glosa = descripcion?.trim() || TIPO_GLOSA[tipo]

        const plan: Array<{ cuentaId: string; debe: number; haber: number }> = []
        if (sentido === 'credito') {
            plan.push({ cuentaId: cuentaContableId, debe: montoR, haber: 0 })
            for (const l of lineas) plan.push({ cuentaId: l.cuenta_id, debe: 0, haber: r2(l.monto) })
        } else {
            for (const l of lineas) plan.push({ cuentaId: l.cuenta_id, debe: r2(l.monto), haber: 0 })
            plan.push({ cuentaId: cuentaContableId, debe: 0, haber: montoR })
        }

        // ── 7. Insertar comprobante LP (con reintento de número) ───
        const comprobanteBase = {
            empresa_id:          lpEmpresaId,
            periodo_id:          periodo.id,
            tipo_comprobante_id: tipoId,
            secuencial:          nextSecuencial,
            fecha,
            glosa,
            estado:              'confirmado',
            total_debe:          montoR,
            total_haber:         montoR,
            moneda_id:           null,
            tipo_cambio:         1,
            origen:              'quickinvoice',
            referencia_externa:  movimientoId ?? null,
            created_by:          null,
        }

        let comp: { id: string }
        const primero = await db
            .from('lp_comprobantes')
            .insert({ ...comprobanteBase, numero: numeroFinal })
            .select('id')
            .single()

        if (primero.error || !primero.data) {
            const dup = primero.error?.code === '23505' || primero.error?.status === 409
            if (!dup) throw primero.error ?? new Error('Error creando comprobante LP')

            numeroFinal = `${tipoCodigo}-${año}${mesStr}-${Date.now()}`
            const reintento = await db
                .from('lp_comprobantes')
                .insert({ ...comprobanteBase, numero: numeroFinal })
                .select('id')
                .single()
            if (reintento.error || !reintento.data) throw reintento.error ?? new Error('Error creando comprobante LP')
            comp = reintento.data
        } else {
            comp = primero.data
        }

        // ── 8. Insertar líneas ──────────────────────────────────────
        const { error: errLineas } = await db.from('lp_comprobante_lineas').insert(
            plan.map((p, orden) => ({
                comprobante_id: comp.id,
                empresa_id:     lpEmpresaId,
                cuenta_id:      p.cuentaId,
                descripcion:    glosa,
                debe:           p.debe,
                haber:          p.haber,
                orden,
            }))
        )
        if (errLineas) throw errLineas

        // ── 9. Actualizar saldos LP ───────────────────────────────────
        await db.rpc('lp_actualizar_saldos', { p_comprobante_id: comp.id, p_operacion: 'sumar' })

        console.log(`[asientoMovimiento] ✅ ${numeroFinal} creado — DEBE/HABER ${montoR}`)
        return comp.id
    },

    /** Anula (reversa) el comprobante de un movimiento bancario. */
    async anularAsientoMovimiento(lpComprobanteId: string): Promise<void> {
        const db = supabaseContabilidad as any
        const { data: comp } = await db
            .from('lp_comprobantes')
            .select('id, estado')
            .eq('id', lpComprobanteId)
            .maybeSingle()

        if (!comp || comp.estado === 'anulado') return

        await db
            .from('lp_comprobantes')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('id', lpComprobanteId)

        if (comp.estado === 'confirmado') {
            await db.rpc('lp_actualizar_saldos', { p_comprobante_id: lpComprobanteId, p_operacion: 'restar' })
        }
    },
}
