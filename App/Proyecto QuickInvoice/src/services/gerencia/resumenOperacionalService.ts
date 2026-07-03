import { supabase } from '../../lib/supabase'
import { supabaseContabilidad } from '../../lib/supabaseContabilidad'

const db = supabaseContabilidad as any

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface GastoManual {
    id?: string
    categoria: string
    descripcion: string
    valor: number
}

export interface TopItem {
    nombre: string
    total: number
    cantidad?: number
}

export interface ResumenLinea {
    label: string
    valor_actual: number
    valor_anterior: number
    variacion: number
    pct_variacion: number | null
    pct_ingresos: number
    nivel: 'ingreso' | 'costo' | 'resultado' | 'impuesto' | 'sub'
    negrita?: boolean
    signo?: '+' | '-' | '='
}

export interface ResumenCompleto {
    periodo_actual:   { desde: string; hasta: string; label: string }
    periodo_anterior: { desde: string; hasta: string; label: string }
    lineas: ResumenLinea[]
    ytd_actual:   number | null   // YTD solo en modo M
    ytd_anterior: number | null
    tiene_contabilidad: boolean
    gastos_manuales: GastoManual[]
    gastos_detalle: { categoria: string; valor: number; color: string }[]
    top_clientes: TopItem[]
    top_productos: TopItem[]
    umbrales: UmbralesGerencia
    margen_neto: number
    estado_semaforo: 'saludable' | 'observacion' | 'riesgo' | 'perdida'
    texto_semaforo: string
}

export interface UmbralesGerencia {
    saludable:   number   // default 15
    observacion: number   // default 5
}

const COLORES_GASTOS = [
    '#3b82f6','#f59e0b','#10b981','#8b5cf6','#f43f5e',
    '#06b6d4','#84cc16','#fb923c','#a855f7','#14b8a6',
]

// ─── Helpers de período ──────────────────────────────────────────────────────

export function getPeriodoRange(tipo: 'D' | 'M' | 'A', valor: string): { desde: string; hasta: string } {
    if (tipo === 'D') return { desde: valor, hasta: valor }
    if (tipo === 'M') {
        const [y, m] = valor.split('-').map(Number)
        const last = new Date(y, m, 0).getDate()
        return {
            desde: `${y}-${String(m).padStart(2,'0')}-01`,
            hasta: `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`,
        }
    }
    return { desde: `${valor}-01-01`, hasta: `${valor}-12-31` }
}

export function getPeriodoAnterior(tipo: 'D' | 'M' | 'A', valor: string): string {
    if (tipo === 'D') {
        const d = new Date(valor + 'T12:00:00')
        d.setDate(d.getDate() - 7)
        return d.toISOString().split('T')[0]
    }
    if (tipo === 'M') {
        const [y, m] = valor.split('-').map(Number)
        return `${y - 1}-${String(m).padStart(2,'0')}`
    }
    return String(Number(valor) - 1)
}

export function periodoLabel(tipo: 'D' | 'M' | 'A', valor: string): string {
    if (tipo === 'D') return new Date(valor + 'T12:00:00').toLocaleDateString('es-EC', { day:'2-digit', month:'short', year:'numeric' })
    if (tipo === 'M') {
        const [y, m] = valor.split('-').map(Number)
        return new Date(y, m - 1, 1).toLocaleDateString('es-EC', { month:'long', year:'numeric' })
    }
    return `Año ${valor}`
}

// ─── Detección de contabilidad ───────────────────────────────────────────────

export async function detectarContabilidad(): Promise<{ tiene: boolean; lpEmpresaId: string | null }> {
    try {
        const { data } = await db.from('lp_usuarios_empresa').select('empresa_id').eq('activo', true).limit(1)
        if (!data?.length) return { tiene: false, lpEmpresaId: null }
        return { tiene: true, lpEmpresaId: data[0].empresa_id }
    } catch {
        return { tiene: false, lpEmpresaId: null }
    }
}

// ─── Fuentes de datos ────────────────────────────────────────────────────────

async function getVentasNetas(empresaId: string, desde: string, hasta: string): Promise<number> {
    // Facturas activas (excluir ANULADA — valor exacto usado en el sistema)
    const { data: facturas } = await supabase
        .from('comprobantes')
        .select('total')
        .eq('empresa_id', empresaId)
        .eq('tipo_comprobante', 'FACTURA')
        .neq('estado_sistema', 'ANULADA')
        .gte('created_at', `${desde}T00:00:00`)
        .lte('created_at', `${hasta}T23:59:59`)
    const ventas = (facturas ?? []).reduce((s: number, f: any) => s + Number(f.total || 0), 0)

    // Notas de crédito del período (excluir ANULADA)
    const { data: ncs } = await supabase
        .from('notas_credito')
        .select('total')
        .eq('empresa_id', empresaId)
        .neq('estado_sistema', 'ANULADA')
        .gte('created_at', `${desde}T00:00:00`)
        .lte('created_at', `${hasta}T23:59:59`)
    const devoluciones = (ncs ?? []).reduce((s: number, n: any) => s + Number(n.total || 0), 0)

    return Math.max(0, ventas - devoluciones)
}

async function getCostoVentasKardex(empresaId: string, desde: string, hasta: string): Promise<number> {
    const { data } = await supabase
        .from('kardex')
        .select('cantidad, costo_unitario')
        .eq('empresa_id', empresaId)
        .eq('tipo_movimiento', 'SALIDA')
        .gte('fecha', desde)
        .lte('fecha', `${hasta}T23:59:59`)
    return (data ?? []).reduce((s: number, k: any) => s + Number(k.cantidad || 0) * Number(k.costo_unitario || 0), 0)
}

async function getCostoVentasLP(lpEmpresaId: string, desde: string, hasta: string): Promise<number> {
    try {
        // 1. IDs de comprobantes del período
        const { data: comps } = await db.from('lp_comprobantes')
            .select('id').eq('empresa_id', lpEmpresaId).eq('estado', 'confirmado')
            .gte('fecha', desde).lte('fecha', hasta)
        if (!comps?.length) return 0
        const compIds = comps.map((c: any) => c.id)

        // 2. Cuentas grupo 5.01 (Costo de Ventas)
        const { data: cuentas } = await db.from('lp_cuentas')
            .select('id').eq('empresa_id', lpEmpresaId).like('codigo', '5.01%')
        if (!cuentas?.length) return 0
        const cuentaIds = cuentas.map((c: any) => c.id)

        // 3. Suma de DEBE en esas líneas
        const { data: lineas } = await db.from('lp_comprobante_lineas')
            .select('debe').in('comprobante_id', compIds).in('cuenta_id', cuentaIds)
        return (lineas ?? []).reduce((s: number, l: any) => s + Number(l.debe || 0), 0)
    } catch {
        return 0
    }
}

async function getGastosLP(lpEmpresaId: string, desde: string, hasta: string): Promise<{ total: number; detalle: { categoria: string; valor: number }[] }> {
    try {
        const { data: comps } = await db.from('lp_comprobantes')
            .select('id').eq('empresa_id', lpEmpresaId).eq('estado', 'confirmado')
            .gte('fecha', desde).lte('fecha', hasta)
        if (!comps?.length) return { total: 0, detalle: [] }
        const compIds = comps.map((c: any) => c.id)

        // Cuentas grupo 5.02 (Gastos Operacionales)
        const { data: cuentas } = await db.from('lp_cuentas')
            .select('id, nombre').eq('empresa_id', lpEmpresaId).like('codigo', '5.02%')
        if (!cuentas?.length) return { total: 0, detalle: [] }
        const cuentaIds = cuentas.map((c: any) => c.id)

        const { data: lineas } = await db.from('lp_comprobante_lineas')
            .select('debe, cuenta_id').in('comprobante_id', compIds).in('cuenta_id', cuentaIds)

        const porCuenta: Record<string, number> = {}
        for (const l of (lineas ?? [])) {
            porCuenta[l.cuenta_id] = (porCuenta[l.cuenta_id] ?? 0) + Number(l.debe || 0)
        }

        const detalle = cuentas
            .filter((c: any) => porCuenta[c.id] > 0)
            .map((c: any) => ({ categoria: c.nombre, valor: porCuenta[c.id] }))

        return {
            total: Object.values(porCuenta).reduce((s, v) => s + v, 0),
            detalle,
        }
    } catch {
        return { total: 0, detalle: [] }
    }
}

// ─── Gastos manuales ─────────────────────────────────────────────────────────

export async function getGastosManuales(empresaId: string, tipo: string, valor: string): Promise<GastoManual[]> {
    const { data } = await supabase
        .from('gerencia_gastos_manuales')
        .select('id, categoria, descripcion, valor')
        .eq('empresa_id', empresaId)
        .eq('tipo_periodo', tipo)
        .eq('fecha_periodo', valor)
        .order('categoria')
    return (data ?? []) as GastoManual[]
}

export async function guardarGastosManuales(empresaId: string, tipo: string, valor: string, gastos: GastoManual[]): Promise<void> {
    // Borrar existentes y re-insertar
    await supabase
        .from('gerencia_gastos_manuales')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('tipo_periodo', tipo)
        .eq('fecha_periodo', valor)

    if (gastos.length > 0) {
        await supabase.from('gerencia_gastos_manuales').insert(
            gastos.filter(g => g.valor > 0 || g.categoria).map(g => ({
                empresa_id:   empresaId,
                tipo_periodo: tipo,
                fecha_periodo: valor,
                categoria:    g.categoria || 'Sin categoría',
                descripcion:  g.descripcion || null,
                valor:        Number(g.valor) || 0,
            }))
        )
    }
}

// ─── Top 5 ───────────────────────────────────────────────────────────────────

async function getTopClientes(empresaId: string, desde: string, hasta: string): Promise<TopItem[]> {
    const { data } = await supabase
        .from('comprobantes')
        .select('total, clientes(nombre)')
        .eq('empresa_id', empresaId)
        .eq('tipo_comprobante', 'FACTURA')
        .neq('estado_sistema', 'ANULADA')
        .gte('created_at', `${desde}T00:00:00`)
        .lte('created_at', `${hasta}T23:59:59`)

    const mapa: Record<string, number> = {}
    for (const c of (data ?? []) as any[]) {
        const nombre = c.clientes?.nombre ?? 'Consumidor Final'
        mapa[nombre] = (mapa[nombre] ?? 0) + Number(c.total || 0)
    }
    return Object.entries(mapa)
        .map(([nombre, total]) => ({ nombre, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
}

async function getTopProductos(empresaId: string, desde: string, hasta: string): Promise<TopItem[]> {
    const { data } = await supabase
        .from('comprobante_detalles')
        .select('nombre_producto, cantidad, total, comprobantes!inner(empresa_id, estado_sistema, created_at)')
        .eq('comprobantes.empresa_id', empresaId)
        .neq('comprobantes.estado_sistema', 'ANULADA')
        .gte('comprobantes.created_at', `${desde}T00:00:00`)
        .lte('comprobantes.created_at', `${hasta}T23:59:59`)

    const mapa: Record<string, { total: number; cantidad: number }> = {}
    for (const d of (data ?? []) as any[]) {
        const nombre = d.nombre_producto ?? 'Sin nombre'
        if (!mapa[nombre]) mapa[nombre] = { total: 0, cantidad: 0 }
        mapa[nombre].total    += Number(d.total    || 0)
        mapa[nombre].cantidad += Number(d.cantidad || 0)
    }
    return Object.entries(mapa)
        .map(([nombre, v]) => ({ nombre, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
}

// ─── Umbrales ─────────────────────────────────────────────────────────────────

export async function getUmbrales(empresaId: string): Promise<UmbralesGerencia> {
    const { data } = await supabase
        .from('empresas')
        .select('config_gerencia')
        .eq('id', empresaId)
        .single()
    const cfg = (data?.config_gerencia ?? {}) as any
    return {
        saludable:   cfg.umbral_saludable   ?? 15,
        observacion: cfg.umbral_observacion ?? 5,
    }
}

export async function guardarUmbrales(empresaId: string, u: UmbralesGerencia): Promise<void> {
    const { data } = await supabase.from('empresas').select('config_gerencia').eq('id', empresaId).single()
    const cfg = { ...(data?.config_gerencia ?? {}), umbral_saludable: u.saludable, umbral_observacion: u.observacion }
    await supabase.from('empresas').update({ config_gerencia: cfg }).eq('id', empresaId)
}

// ─── Resumen principal ───────────────────────────────────────────────────────

function calcCascada(
    ingresos:   number,
    costo:      number,
    gastos:     number,
    _labelA:    string,
    _labelP:    string,
    ingresos_p: number,
    costo_p:    number,
    gastos_p:   number,
): ResumenLinea[] {
    const r2 = (n: number) => Math.round(n * 100) / 100

    const util_bruta     = r2(ingresos - costo)
    const res_oper       = r2(util_bruta - gastos)
    const pt             = r2(Math.max(0, res_oper * 0.15))
    const base_imponible = r2(Math.max(0, res_oper - pt))
    const ir             = r2(base_imponible * 0.25)
    const neto           = r2(base_imponible - ir)

    const ub_p   = r2(ingresos_p - costo_p)
    const ro_p   = r2(ub_p - gastos_p)
    const pt_p   = r2(Math.max(0, ro_p * 0.15))
    const bi_p   = r2(Math.max(0, ro_p - pt_p))
    const ir_p   = r2(bi_p * 0.25)
    const neto_p = r2(bi_p - ir_p)

    const pct_ing = (v: number) => ingresos > 0 ? r2(v / ingresos * 100) : 0
    const variacion = (a: number, p: number) => ({ variacion: r2(a - p), pct_variacion: p !== 0 ? r2((a - p) / Math.abs(p) * 100) : null })

    return [
        { label: '(+) Ingresos por Ventas', valor_actual: ingresos, valor_anterior: ingresos_p, ...variacion(ingresos, ingresos_p), pct_ingresos: 100, nivel: 'ingreso', negrita: false, signo: '+' },
        { label: '(-) Costo de lo Vendido', valor_actual: costo,    valor_anterior: costo_p,    ...variacion(costo, costo_p),    pct_ingresos: pct_ing(costo),    nivel: 'costo',     signo: '-' },
        { label: '(=) UTILIDAD BRUTA',      valor_actual: util_bruta, valor_anterior: ub_p,     ...variacion(util_bruta, ub_p),  pct_ingresos: pct_ing(util_bruta), nivel: 'resultado', negrita: true, signo: '=' },
        { label: '(-) Gastos Operacionales', valor_actual: gastos,   valor_anterior: gastos_p,  ...variacion(gastos, gastos_p),  pct_ingresos: pct_ing(gastos),   nivel: 'costo',     signo: '-' },
        { label: '(=) RESULTADO OPERACIONAL', valor_actual: res_oper, valor_anterior: ro_p,     ...variacion(res_oper, ro_p),    pct_ingresos: pct_ing(res_oper), nivel: 'resultado', negrita: true, signo: '=' },
        { label: '(-) 15% Part. Trabajadores', valor_actual: pt,     valor_anterior: pt_p,      ...variacion(pt, pt_p),          pct_ingresos: pct_ing(pt),       nivel: 'impuesto',  signo: '-' },
        { label: '(=) BASE IMPONIBLE',       valor_actual: base_imponible, valor_anterior: bi_p, ...variacion(base_imponible, bi_p), pct_ingresos: pct_ing(base_imponible), nivel: 'resultado', signo: '=' },
        { label: '(-) 25% Impuesto a la Renta', valor_actual: ir,   valor_anterior: ir_p,       ...variacion(ir, ir_p),          pct_ingresos: pct_ing(ir),       nivel: 'impuesto',  signo: '-' },
        { label: '(=) RESULTADO NETO',       valor_actual: neto,     valor_anterior: neto_p,     ...variacion(neto, neto_p),       pct_ingresos: pct_ing(neto),     nivel: 'resultado', negrita: true, signo: '=' },
    ]
}

function getSemaforo(margen: number, u: UmbralesGerencia): { estado: ResumenCompleto['estado_semaforo']; texto: string } {
    if (margen < 0)          return { estado: 'perdida',     texto: `Resultado neto negativo (${margen.toFixed(1)}%). Revisa urgentemente costos y gastos.` }
    if (margen < u.observacion)  return { estado: 'riesgo',      texto: `Margen neto ${margen.toFixed(1)}% — bajo el umbral mínimo. Revisa gastos operacionales.` }
    if (margen < u.saludable)    return { estado: 'observacion', texto: `Margen neto ${margen.toFixed(1)}% — en zona de observación. Hay oportunidad de mejora.` }
    return { estado: 'saludable', texto: `Margen neto ${margen.toFixed(1)}% — empresa saludable. Sigue así.` }
}

export async function getResumenCompleto(
    empresaId: string,
    tipo: 'D' | 'M' | 'A',
    valor: string
): Promise<ResumenCompleto> {
    const valorPrev = getPeriodoAnterior(tipo, valor)
    const rango     = getPeriodoRange(tipo, valor)
    const rangoPrev = getPeriodoRange(tipo, valorPrev)

    const [
        { tiene: tieneContabilidad, lpEmpresaId },
        umbrales,
        ingresos,
        ingresos_p,
        topClientes,
        topProductos,
    ] = await Promise.all([
        detectarContabilidad(),
        getUmbrales(empresaId),
        getVentasNetas(empresaId, rango.desde, rango.hasta),
        getVentasNetas(empresaId, rangoPrev.desde, rangoPrev.hasta),
        getTopClientes(empresaId, rango.desde, rango.hasta),
        getTopProductos(empresaId, rango.desde, rango.hasta),
    ])

    let costo = 0, costo_p = 0
    let gastos = 0, gastos_p = 0
    let gastosManuales: GastoManual[] = []
    let gastosDetalle: { categoria: string; valor: number }[] = []

    if (tieneContabilidad && lpEmpresaId) {
        const [cv, cv_p, gv, gv_p] = await Promise.all([
            getCostoVentasLP(lpEmpresaId, rango.desde, rango.hasta),
            getCostoVentasLP(lpEmpresaId, rangoPrev.desde, rangoPrev.hasta),
            getGastosLP(lpEmpresaId, rango.desde, rango.hasta),
            getGastosLP(lpEmpresaId, rangoPrev.desde, rangoPrev.hasta),
        ])
        costo   = cv;   costo_p   = cv_p
        gastos  = gv.total; gastos_p  = gv_p.total
        gastosDetalle = gv.detalle
    } else {
        const [cv, cv_p, gm] = await Promise.all([
            getCostoVentasKardex(empresaId, rango.desde, rango.hasta),
            getCostoVentasKardex(empresaId, rangoPrev.desde, rangoPrev.hasta),
            getGastosManuales(empresaId, tipo, valor),
        ])
        costo   = cv;   costo_p   = cv_p
        gastosManuales = gm
        gastos  = gm.reduce((s, g) => s + g.valor, 0)
        gastosDetalle = Object.entries(
            gm.reduce((acc, g) => {
                acc[g.categoria] = (acc[g.categoria] ?? 0) + g.valor
                return acc
            }, {} as Record<string, number>)
        ).map(([categoria, valor]) => ({ categoria, valor }))
    }

    const lineas = calcCascada(ingresos, costo, gastos, periodoLabel(tipo, valor), periodoLabel(tipo, valorPrev), ingresos_p, costo_p, gastos_p)
    const netoLinea = lineas.find(l => l.label.includes('RESULTADO NETO'))!
    const margenNeto = ingresos > 0 ? Math.round(netoLinea.valor_actual / ingresos * 100 * 10) / 10 : 0
    const { estado, texto } = getSemaforo(margenNeto, umbrales)

    // YTD solo en modo Mes
    let ytd_actual = null, ytd_anterior = null
    if (tipo === 'M') {
        const [anio, mes] = valor.split('-').map(Number)
        const ytdRange     = { desde: `${anio}-01-01`,   hasta: `${anio}-${String(mes).padStart(2,'0')}-${new Date(anio,mes,0).getDate()}` }
        const ytdRangePrev = { desde: `${anio-1}-01-01`, hasta: `${anio-1}-${String(mes).padStart(2,'0')}-${new Date(anio-1,mes,0).getDate()}` }
        const [ya, yp] = await Promise.all([
            getVentasNetas(empresaId, ytdRange.desde, ytdRange.hasta),
            getVentasNetas(empresaId, ytdRangePrev.desde, ytdRangePrev.hasta),
        ])
        ytd_actual = ya; ytd_anterior = yp
    }

    // Colores del gráfico de pastel
    const pieData: ResumenCompleto['gastos_detalle'] = [
        { categoria: 'Costo de Ventas', valor: costo, color: '#f43f5e' },
        ...gastosDetalle.map((g, i) => ({ ...g, color: COLORES_GASTOS[(i + 1) % COLORES_GASTOS.length] })),
        { categoria: 'Resultado Neto', valor: Math.max(0, netoLinea.valor_actual), color: '#10b981' },
    ].filter(d => d.valor > 0)

    return {
        periodo_actual:   { ...rango,     label: periodoLabel(tipo, valor)    },
        periodo_anterior: { ...rangoPrev, label: periodoLabel(tipo, valorPrev) },
        lineas,
        ytd_actual,
        ytd_anterior,
        tiene_contabilidad: tieneContabilidad,
        gastos_manuales:    gastosManuales,
        gastos_detalle:     pieData,
        top_clientes:       topClientes,
        top_productos:      topProductos,
        umbrales,
        margen_neto:        margenNeto,
        estado_semaforo:    estado,
        texto_semaforo:     texto,
    }
}
