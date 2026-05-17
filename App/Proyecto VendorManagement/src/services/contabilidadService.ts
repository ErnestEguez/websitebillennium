import { supabaseContabilidad } from '../lib/supabaseContabilidad'

export interface CuentasCompras {
    inventarios:      string   // Cuenta Inventarios / Mercaderías
    gastos_servicios: string   // Cuenta Gastos (servicios, honorarios, etc.)
    iva_compras:      string   // Cuenta IVA Crédito Fiscal
    cuentas_por_pagar: string  // Cuenta CxP Proveedores
    efectivo:         string   // Cuenta Efectivo / Banco
    ret_fuente:       string   // Cuenta Retenciones Fuente x Pagar
    ret_iva:          string   // Cuenta Retenciones IVA x Pagar
}

export const CAMPOS_CUENTAS: { key: keyof CuentasCompras; label: string }[] = [
    { key: 'inventarios',       label: 'Inventarios / Mercaderías' },
    { key: 'gastos_servicios',  label: 'Gastos de Servicios' },
    { key: 'iva_compras',       label: 'IVA Crédito Fiscal (Compras)' },
    { key: 'cuentas_por_pagar', label: 'Cuentas por Pagar Proveedores' },
    { key: 'efectivo',          label: 'Efectivo / Banco' },
    { key: 'ret_fuente',        label: 'Retenciones Fuente x Pagar' },
    { key: 'ret_iva',           label: 'Retenciones IVA x Pagar' },
]

async function getPeriodo(empresaId: string, fecha: string): Promise<string> {
    const [año, mes] = fecha.split('-').map(Number)
    const { data, error } = await supabaseContabilidad
        .from('lp_periodos')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('año', año)
        .eq('mes', mes)
        .in('estado', ['abierto'])
        .single()
    if (error || !data) throw new Error(`Sin período abierto ${mes}/${año} en LedgerPro. Abre el período primero.`)
    return data.id
}

async function getTipo(codigo: string): Promise<string> {
    const { data, error } = await supabaseContabilidad
        .from('lp_tipos_comprobante')
        .select('id')
        .eq('codigo', codigo)
        .eq('activo', true)
        .single()
    if (error || !data) throw new Error(`Tipo comprobante '${codigo}' no encontrado en LedgerPro.`)
    return data.id
}

async function getNumero(empresaId: string, tipoCodigo: string, año: number, mes: number): Promise<string> {
    const { data, error } = await supabaseContabilidad.rpc('lp_generar_numero_comprobante', {
        p_empresa_id: empresaId,
        p_tipo_codigo: tipoCodigo,
        p_año: año,
        p_mes: mes,
    })
    if (error) throw error
    return data as string
}

type Linea = {
    comprobante_id: string
    empresa_id: string
    cuenta_id: string
    descripcion: string | null
    debe: number
    haber: number
    orden: number
}

async function insertarComprobante(empresaId: string, params: {
    periodoId: string; tipoId: string; numero: string
    fecha: string; glosa: string; origen: string
    totalDebe: number; totalHaber: number
    referenciaExterna?: string; creadoPor?: string
}): Promise<string> {
    const { data, error } = await supabaseContabilidad
        .from('lp_comprobantes')
        .insert({
            empresa_id:          empresaId,
            periodo_id:          params.periodoId,
            tipo_comprobante_id: params.tipoId,
            numero:              params.numero,
            secuencial:          1,
            fecha:               params.fecha,
            glosa:               params.glosa,
            estado:              'confirmado',
            total_debe:          params.totalDebe,
            total_haber:         params.totalHaber,
            moneda_id:           null,
            tipo_cambio:         1,
            origen:              params.origen,
            referencia_externa:  params.referenciaExterna ?? null,
            created_by:          params.creadoPor ?? null,
        })
        .select('id')
        .single()
    if (error || !data) throw error ?? new Error('Error creando comprobante')
    return data.id
}

async function insertarLineas(lineas: Linea[]): Promise<void> {
    const { error } = await supabaseContabilidad.from('lp_comprobante_lineas').insert(lineas)
    if (error) throw error
}

async function actualizarSaldos(comprobanteId: string): Promise<void> {
    await supabaseContabilidad.rpc('lp_actualizar_saldos', {
        p_comprobante_id: comprobanteId,
        p_operacion: 'sumar',
    })
}

export const contabilidadService = {
    // ── Listar cuentas disponibles ───────────────────────────
    async listarCuentas(empresaId: string) {
        const { data } = await supabaseContabilidad
            .from('lp_cuentas')
            .select('id, codigo, nombre, tipo')
            .eq('empresa_id', empresaId)
            .eq('acepta_movimientos', true)
            .order('codigo')
        return data ?? []
    },

    // ── Asiento de compra (inventario o servicio) ────────────
    async crearAsientoCompra(p: {
        empresaId:      string
        fecha:          string
        glosa:          string
        subtotal:       number
        valorIva:       number
        retFuente:      number
        retIva:         number
        formaPago:      'CONTADO' | 'CREDITO'
        tipoCompra:     'INVENTARIO' | 'SERVICIO'
        cuentas:        CuentasCompras
        referencia?:    string
        creadoPor?:     string
        // Per-line accounts for service purchases
        lineasServicio?: { descripcion: string; subtotal: number; cuenta_contable_id?: string | null }[]
    }): Promise<void> {
        const [año, mes] = p.fecha.split('-').map(Number)
        const periodoId  = await getPeriodo(p.empresaId, p.fecha)
        const tipoId     = await getTipo('CD')
        const numero     = await getNumero(p.empresaId, 'CD', año, mes)

        const neto   = Math.round((p.subtotal + p.valorIva - p.retFuente - p.retIva) * 100) / 100
        const tdebe  = Math.round((p.subtotal + p.valorIva) * 100) / 100
        const thaber = Math.round((neto + p.retFuente + p.retIva) * 100) / 100
        const cuentaHaber = p.formaPago === 'CREDITO' ? p.cuentas.cuentas_por_pagar : p.cuentas.efectivo

        const id = await insertarComprobante(p.empresaId, {
            periodoId, tipoId, numero,
            fecha: p.fecha, glosa: p.glosa, origen: 'quickinvoice',
            totalDebe: tdebe, totalHaber: thaber,
            referenciaExterna: p.referencia, creadoPor: p.creadoPor,
        })

        const lineas: Linea[] = []
        let ord = 0

        if (p.tipoCompra === 'SERVICIO' && p.lineasServicio?.length) {
            // One DR per service line using its specific account (fallback to base)
            for (const ls of p.lineasServicio) {
                const cta = ls.cuenta_contable_id || p.cuentas.gastos_servicios
                if (cta && ls.subtotal > 0)
                    lineas.push({ comprobante_id: id, empresa_id: p.empresaId, cuenta_id: cta,
                        descripcion: ls.descripcion || null, debe: Math.round(ls.subtotal * 100) / 100, haber: 0, orden: ord++ })
            }
        } else {
            // Inventory: single DR for all
            const cuentaDebe = p.tipoCompra === 'INVENTARIO' ? p.cuentas.inventarios : p.cuentas.gastos_servicios
            lineas.push({ comprobante_id: id, empresa_id: p.empresaId, cuenta_id: cuentaDebe,
                descripcion: null, debe: p.subtotal, haber: 0, orden: ord++ })
        }

        if (p.valorIva > 0 && p.cuentas.iva_compras)
            lineas.push({ comprobante_id: id, empresa_id: p.empresaId, cuenta_id: p.cuentas.iva_compras,
                descripcion: null, debe: p.valorIva, haber: 0, orden: ord++ })
        if (neto > 0)
            lineas.push({ comprobante_id: id, empresa_id: p.empresaId, cuenta_id: cuentaHaber,
                descripcion: null, debe: 0, haber: neto, orden: ord++ })
        if (p.retFuente > 0 && p.cuentas.ret_fuente)
            lineas.push({ comprobante_id: id, empresa_id: p.empresaId, cuenta_id: p.cuentas.ret_fuente,
                descripcion: null, debe: 0, haber: p.retFuente, orden: ord++ })
        if (p.retIva > 0 && p.cuentas.ret_iva)
            lineas.push({ comprobante_id: id, empresa_id: p.empresaId, cuenta_id: p.cuentas.ret_iva,
                descripcion: null, debe: 0, haber: p.retIva, orden: ord++ })

        await insertarLineas(lineas)
        await actualizarSaldos(id)
    },

    // ── Asiento de pago a proveedor ──────────────────────────
    async crearAsientoPago(p: {
        empresaId:   string
        fecha:       string
        glosa:       string
        monto:       number
        cuentas:     CuentasCompras
        referencia?: string
        creadoPor?:  string
    }): Promise<void> {
        const [año, mes] = p.fecha.split('-').map(Number)
        const periodoId  = await getPeriodo(p.empresaId, p.fecha)
        const tipoId     = await getTipo('CE')
        const numero     = await getNumero(p.empresaId, 'CE', año, mes)

        const id = await insertarComprobante(p.empresaId, {
            periodoId, tipoId, numero,
            fecha: p.fecha, glosa: p.glosa, origen: 'quickinvoice',
            totalDebe: p.monto, totalHaber: p.monto,
            referenciaExterna: p.referencia, creadoPor: p.creadoPor,
        })

        await insertarLineas([
            { comprobante_id: id, empresa_id: p.empresaId, cuenta_id: p.cuentas.cuentas_por_pagar, descripcion: null, debe: p.monto, haber: 0,        orden: 0 },
            { comprobante_id: id, empresa_id: p.empresaId, cuenta_id: p.cuentas.efectivo,           descripcion: null, debe: 0,       haber: p.monto,  orden: 1 },
        ])
        await actualizarSaldos(id)
    },
}
