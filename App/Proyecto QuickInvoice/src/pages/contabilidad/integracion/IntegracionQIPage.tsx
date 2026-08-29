import { Fragment, useEffect, useState } from 'react'
import { HelpButton } from '../../../components/help/HelpButton'
import {
    Zap, Loader2, CheckCircle, AlertTriangle,
    RefreshCw, Settings, Eye, List, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'
import type { LpPeriodo } from '../../../types/conta'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface CuentaOpc {
    id: string
    codigo: string
    nombre: string
}

interface PagoQI {
    metodo_pago: string
    valor: number
}

interface FacturaQI {
    id: string
    secuencial: string
    fecha: string
    clienteNombre: string
    base_cero: number
    base_iva: number
    total_iva: number
    total: number
    pagos: PagoQI[]
    yaImportada: boolean
}

interface LineaAsiento {
    cuenta_id: string
    cuentaLabel: string
    descripcion: string
    debe: number
    haber: number
    orden: number
}

interface AsientoPreview {
    factura?: FacturaQI
    glosa: string
    fecha: string
    lineas: LineaAsiento[]
    cuadra: boolean
    totalDebe: number
    totalHaber: number
}

// ── Configuración de mapeo de cuentas ─────────────────────────────────────

const TIPO_MOV = 'ventas_qi'

const CATEGORIAS = [
    { key: 'ventas',             label: 'Ingresos por Ventas',      required: true,  grupo: 'haber' },
    { key: 'iva_ventas',         label: 'IVA en Ventas',            required: false, grupo: 'haber' },
    { key: 'pago_efectivo',      label: 'Cobro en Efectivo (Caja)', required: false, grupo: 'debe' },
    { key: 'pago_transferencia', label: 'Cobro por Transferencia',  required: false, grupo: 'debe' },
    { key: 'pago_cheque',        label: 'Cobro con Cheque',         required: false, grupo: 'debe' },
    { key: 'pago_tarjeta',       label: 'Cobro con Tarjeta',        required: false, grupo: 'debe' },
    { key: 'pago_credito',       label: 'Cobro a Crédito (CxC)',    required: true,  grupo: 'debe' },
    { key: 'pago_otros',         label: 'Otros Cobros',             required: false, grupo: 'debe' },
] as const

type CatKey = typeof CATEGORIAS[number]['key']

const METODO_CAT: Record<string, CatKey> = {
    efectivo:      'pago_efectivo',
    transferencia: 'pago_transferencia',
    cheque:        'pago_cheque',
    tarjeta:       'pago_tarjeta',
    'crédito':     'pago_credito',
    credito:       'pago_credito',
    otros:         'pago_otros',
}

// ── Componente ─────────────────────────────────────────────────────────────

export function IntegracionQIPage() {
    const { empresaActiva } = useAuth()

    const [tab, setTab]   = useState<'config' | 'preview' | 'log'>('config')

    // Config (persiste en DB)
    const [modo, setModo]     = useState<'detalle' | 'resumen'>('detalle')
    const [mapeo, setMapeo]   = useState<Partial<Record<CatKey, string>>>({})

    // Filtros de importación
    const [periodoId, setPeriodoId]     = useState('')
    const [fechaDesde, setFechaDesde]   = useState('')
    const [fechaHasta, setFechaHasta]   = useState('')

    // Datos base
    const [periodos, setPeriodos]   = useState<LpPeriodo[]>([])
    const [cuentas, setCuentas]     = useState<CuentaOpc[]>([])

    // Resultados
    const [facturas, setFacturas]   = useState<FacturaQI[]>([])
    const [asientos, setAsientos]   = useState<AsientoPreview[]>([])
    const [expandida, setExpandida] = useState<string | null>(null)
    const [log, setLog]             = useState<string[]>([])

    // Estado UI
    const [iniciando, setIniciando]           = useState(false)
    const [guardando, setGuardando]           = useState(false)
    const [cargandoFact, setCargandoFact]     = useState(false)
    const [generando, setGenerando]           = useState(false)
    const [configOk, setConfigOk]             = useState(false)
    const [error, setError]                   = useState('')

    useEffect(() => {
        if (empresaActiva) inicializar()
    }, [empresaActiva])

    // ── Inicialización ─────────────────────────────────────────────────────

    async function inicializar() {
        if (!empresaActiva) return
        setIniciando(true)
        await Promise.all([cargarCuentasYPeriodos(), cargarConfigDB()])
        setIniciando(false)
    }

    async function cargarCuentasYPeriodos() {
        if (!empresaActiva) return
        const [{ data: peri }, { data: ctas }] = await Promise.all([
            supabase.from('lp_periodos')
                .select('*')
                .eq('empresa_id', empresaActiva.id)
                .eq('estado', 'abierto')
                .order('año').order('mes'),
            supabase.from('lp_cuentas')
                .select('id, codigo, nombre')
                .eq('empresa_id', empresaActiva.id)
                .eq('acepta_movimientos', true)
                .order('codigo'),
        ])
        setPeriodos(peri ?? [])
        setCuentas(ctas ?? [])
        if (peri?.length) setPeriodoId(p => p || peri[peri.length - 1].id)
    }

    async function cargarConfigDB() {
        if (!empresaActiva) return
        const [{ data: cfg }, { data: mapeos }] = await Promise.all([
            supabase.from('lp_config_integracion')
                .select('*')
                .eq('empresa_id', empresaActiva.id)
                .maybeSingle(),
            supabase.from('lp_mapeo_cuentas')
                .select('categoria_externa, cuenta_id')
                .eq('empresa_id', empresaActiva.id)
                .eq('tipo_movimiento', TIPO_MOV),
        ])
        if (cfg) {
            setModo(cfg.modo_asiento_ventas === 'resumen' ? 'resumen' : 'detalle')
        }
        if (mapeos?.length) {
            const m: Partial<Record<CatKey, string>> = {}
            for (const row of mapeos) m[row.categoria_externa as CatKey] = row.cuenta_id
            setMapeo(m)
        }
    }

    // ── Guardar configuración ──────────────────────────────────────────────

    async function guardarConfig() {
        if (!empresaActiva) return
        setGuardando(true)
        setError('')

        const { error: e1 } = await supabase.from('lp_config_integracion').upsert({
            empresa_id:          empresaActiva.id,
            modo_asiento_ventas: modo,
            activa:              true,
            updated_at:          new Date().toISOString(),
        }, { onConflict: 'empresa_id' })

        if (e1) { setError(e1.message); setGuardando(false); return }

        // Reemplazar mapeos
        await supabase.from('lp_mapeo_cuentas')
            .delete()
            .eq('empresa_id', empresaActiva.id)
            .eq('tipo_movimiento', TIPO_MOV)

        const filas = Object.entries(mapeo)
            .filter(([, cta]) => !!cta)
            .map(([cat, cuenta_id]) => ({
                empresa_id:        empresaActiva.id,
                tipo_movimiento:   TIPO_MOV,
                categoria_externa: cat,
                cuenta_id,
            }))

        if (filas.length) {
            const { error: e2 } = await supabase.from('lp_mapeo_cuentas').insert(filas)
            if (e2) { setError(e2.message); setGuardando(false); return }
        }

        setConfigOk(true)
        setTimeout(() => setConfigOk(false), 2500)
        setGuardando(false)
    }

    // ── Cargar facturas de QuickInvoice ────────────────────────────────────

    async function cargarFacturas() {
        if (!empresaActiva) return
        if (!fechaDesde || !fechaHasta) { setError('Selecciona el rango de fechas.'); return }
        if (!periodoId)                 { setError('Selecciona el período contable destino.'); return }
        if (!mapeo.ventas)              { setError('Configura la cuenta de Ingresos por Ventas antes de cargar.'); return }

        setCargandoFact(true)
        setError('')
        setFacturas([])
        setAsientos([])

        // Forzar conexión fresca al pool para ver últimas facturas de QI
        await supabase.auth.getSession()

        const { data, error: eComp } = await supabase.rpc('lp_get_facturas_qi', {
            p_empresa_id:  empresaActiva.id,
            p_fecha_desde: fechaDesde,
            p_fecha_hasta: fechaHasta,
        })

        if (eComp) {
            setError(`Error al leer facturas de Corina ERP: ${eComp.message}`)
            setCargandoFact(false)
            return
        }

        const filas: any[] = data ?? []

        if (!filas.length) {
            setError('No se encontraron facturas con estado VIGENTE en el rango de fechas.')
            setCargandoFact(false)
            return
        }

        const facturasCalc: FacturaQI[] = filas.map((row: any) => ({
            id:            row.id,
            secuencial:    String(row.secuencial),
            fecha:         String(row.fecha),
            clienteNombre: row.cliente_nombre ?? `Cliente ${row.id}`,
            base_iva:      Number(row.base_iva),
            base_cero:     Number(row.base_cero),
            total_iva:     Number(row.total_iva),
            total:         Number(row.total),
            pagos:         (row.pagos ?? []).map((p: any) => ({
                metodo_pago: String(p.metodo_pago ?? '').toLowerCase().trim(),
                valor:       Number(p.valor ?? 0),
            })),
            yaImportada:   Boolean(row.ya_importada),
        }))

        setFacturas(facturasCalc)

        const pendientes = facturasCalc.filter(f => !f.yaImportada)
        setAsientos(calcularAsientos(pendientes))

        setCargandoFact(false)
        setTab('preview')
    }

    // ── Construir asientos ─────────────────────────────────────────────────

    function labelCuenta(id: string) {
        const c = cuentas.find(x => x.id === id)
        return c ? `${c.codigo} — ${c.nombre}` : '(cuenta no encontrada)'
    }

    function calcularAsientos(pendientes: FacturaQI[]): AsientoPreview[] {
        return modo === 'detalle'
            ? pendientes.map(f => asientoPorFactura(f))
            : pendientes.length ? [asientoResumen(pendientes)] : []
    }

    function asientoPorFactura(f: FacturaQI): AsientoPreview {
        const lineas: LineaAsiento[] = []
        let orden = 1

        // DEBE: agrupar pagos por método → cuenta
        const porMetodo: Record<string, number> = {}
        for (const p of f.pagos) {
            porMetodo[p.metodo_pago] = (porMetodo[p.metodo_pago] ?? 0) + p.valor
        }
        for (const [metodo, valor] of Object.entries(porMetodo)) {
            if (valor <= 0) continue
            const cat      = METODO_CAT[metodo] ?? 'pago_otros'
            const cuenta_id = mapeo[cat]
            if (!cuenta_id) continue
            lineas.push({
                cuenta_id,
                cuentaLabel: labelCuenta(cuenta_id),
                descripcion: `Fact. ${f.secuencial} — ${f.clienteNombre} [${metodo}]`,
                debe: valor, haber: 0, orden: orden++,
            })
        }

        // HABER: ventas
        const baseTotal = f.base_iva + f.base_cero
        if (baseTotal > 0 && mapeo.ventas) {
            lineas.push({
                cuenta_id:   mapeo.ventas,
                cuentaLabel: labelCuenta(mapeo.ventas),
                descripcion: `Venta — Fact. ${f.secuencial} — ${f.clienteNombre}`,
                debe: 0, haber: baseTotal, orden: orden++,
            })
        }

        // HABER: IVA
        if (f.total_iva > 0.001 && mapeo.iva_ventas) {
            lineas.push({
                cuenta_id:   mapeo.iva_ventas,
                cuentaLabel: labelCuenta(mapeo.iva_ventas),
                descripcion: 'IVA en Ventas',
                debe: 0, haber: f.total_iva, orden: orden++,
            })
        }

        const totalDebe  = lineas.reduce((s, l) => s + l.debe,  0)
        const totalHaber = lineas.reduce((s, l) => s + l.haber, 0)
        return {
            factura: f,
            glosa:   `Venta QI — Fact. ${f.secuencial} — ${f.clienteNombre}`,
            fecha:   f.fecha,
            lineas,
            cuadra:  Math.abs(totalDebe - totalHaber) < 0.01,
            totalDebe,
            totalHaber,
        }
    }

    function asientoResumen(pendientes: FacturaQI[]): AsientoPreview {
        const lineas: LineaAsiento[] = []
        let orden = 1

        // DEBE: suma por método de pago
        const porMetodo: Record<string, number> = {}
        for (const f of pendientes)
            for (const p of f.pagos)
                porMetodo[p.metodo_pago] = (porMetodo[p.metodo_pago] ?? 0) + p.valor

        for (const [metodo, valor] of Object.entries(porMetodo)) {
            if (valor <= 0) continue
            const cat       = METODO_CAT[metodo] ?? 'pago_otros'
            const cuenta_id = mapeo[cat]
            if (!cuenta_id) continue
            lineas.push({
                cuenta_id,
                cuentaLabel: labelCuenta(cuenta_id),
                descripcion: `Cobros ${metodo} — ${pendientes.length} facturas`,
                debe: valor, haber: 0, orden: orden++,
            })
        }

        // HABER: ventas acumuladas
        const totalVentas = pendientes.reduce((s, f) => s + f.base_iva + f.base_cero, 0)
        const totalIVA    = pendientes.reduce((s, f) => s + f.total_iva, 0)

        if (totalVentas > 0 && mapeo.ventas) {
            lineas.push({
                cuenta_id:   mapeo.ventas,
                cuentaLabel: labelCuenta(mapeo.ventas),
                descripcion: `Ventas del período (${pendientes.length} facturas)`,
                debe: 0, haber: totalVentas, orden: orden++,
            })
        }
        if (totalIVA > 0.001 && mapeo.iva_ventas) {
            lineas.push({
                cuenta_id:   mapeo.iva_ventas,
                cuentaLabel: labelCuenta(mapeo.iva_ventas),
                descripcion: 'IVA en Ventas del período',
                debe: 0, haber: totalIVA, orden: orden++,
            })
        }

        const totalDebe  = lineas.reduce((s, l) => s + l.debe,  0)
        const totalHaber = lineas.reduce((s, l) => s + l.haber, 0)
        const ultimaFecha = pendientes[pendientes.length - 1]?.fecha ?? fechaHasta

        return {
            glosa:  `Diario de Ventas QI — ${fechaDesde} al ${fechaHasta}`,
            fecha:  ultimaFecha,
            lineas,
            cuadra: Math.abs(totalDebe - totalHaber) < 0.01,
            totalDebe,
            totalHaber,
        }
    }

    // ── Generar diarios contables ──────────────────────────────────────────

    async function generarDiarios() {
        if (!empresaActiva || !periodoId || !asientos.length) return
        setGenerando(true)
        setError('')
        setLog([])
        addLog('Iniciando generación de diarios contables...')

        // Tipo CI
        const { data: tc } = await supabase.from('lp_tipos_comprobante')
            .select('id').eq('codigo', 'CI').maybeSingle()
        if (!tc) {
            setError('No se encontró el tipo de comprobante CI.')
            setGenerando(false); return
        }

        const periodo = periodos.find(p => p.id === periodoId)
        if (!periodo) { setError('Período no válido.'); setGenerando(false); return }
        const mes    = periodo.mes ?? new Date().getMonth() + 1
        const mesStr = String(mes).padStart(2, '0')
        const prefijo = `CI-${periodo.año}-${mesStr}-`

        // Buscar el último número CI usado para este período y empresa
        // (más confiable que MAX(secuencial) que puede estar en 0 por registros anteriores)
        const { data: ultimoComp } = await supabase
            .from('lp_comprobantes')
            .select('numero')
            .eq('empresa_id', empresaActiva.id)
            .like('numero', `${prefijo}%`)
            .order('numero', { ascending: false })
            .limit(1)

        let lastSecuencial = ultimoComp?.length
            ? parseInt(ultimoComp[0].numero.replace(prefijo, ''), 10) || 0
            : 0

        let importados = 0
        let errores    = 0

        for (const asiento of asientos) {
            if (!asiento.cuadra) {
                addLog(`✗ Omitido (no cuadra): ${asiento.glosa}`)
                errores++; continue
            }

            try {
                // Incrementar localmente — evita race conditions y registros con secuencial=0
                lastSecuencial++
                const secuencial = lastSecuencial
                const numero     = `${prefijo}${String(secuencial).padStart(6, '0')}`

                // Insertar cabecera
                const { data: comp, error: eComp } = await supabase
                    .from('lp_comprobantes')
                    .insert({
                        empresa_id:          empresaActiva.id,
                        periodo_id:          periodoId,
                        tipo_comprobante_id: tc.id,
                        numero,
                        secuencial,
                        fecha:               asiento.fecha,
                        glosa:               asiento.glosa,
                        estado:              'confirmado',
                        total_debe:          asiento.totalDebe,
                        total_haber:         asiento.totalHaber,
                        origen:              'quickinvoice',
                        referencia_externa:  asiento.factura?.id ?? null,
                    })
                    .select('id')
                    .single()

                if (eComp || !comp) throw new Error(eComp?.message ?? 'Error al crear comprobante')

                // Insertar líneas
                const { error: eLineas } = await supabase
                    .from('lp_comprobante_lineas')
                    .insert(asiento.lineas.map(l => ({
                        comprobante_id: comp.id,
                        empresa_id:     empresaActiva.id,
                        cuenta_id:      l.cuenta_id,
                        descripcion:    l.descripcion,
                        debe:           l.debe,
                        haber:          l.haber,
                        orden:          l.orden,
                    })))
                if (eLineas) throw new Error(eLineas.message)

                // Actualizar saldos
                await supabase.rpc('lp_actualizar_saldos', {
                    p_comprobante_id: comp.id,
                    p_operacion:      'sumar',
                })

                addLog(`✓ ${numero} — ${asiento.glosa}`)
                importados++
            } catch (e: any) {
                addLog(`✗ Error: ${asiento.glosa} — ${e.message}`)
                errores++
            }
        }

        addLog(`──────────────────────────────────────`)
        addLog(`Completado: ${importados} asiento(s) generado(s), ${errores} error(es).`)
        setGenerando(false)
        setTab('log')
    }

    function addLog(msg: string) {
        const hora = new Date().toLocaleTimeString('es-EC')
        setLog(prev => [...prev, `[${hora}] ${msg}`])
    }

    // ── Valores derivados ──────────────────────────────────────────────────

    const sym           = empresaActiva?.moneda?.simbolo ?? '$'
    const pendientes    = facturas.filter(f => !f.yaImportada)
    const yaImportadas  = facturas.filter(f => f.yaImportada)
    const sinCuadrar    = asientos.filter(a => !a.cuadra)
    const listos        = asientos.filter(a => a.cuadra)

    // ── Render ─────────────────────────────────────────────────────────────

    if (iniciando) {
        return (
            <div className="flex items-center justify-center py-20 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando configuración...
            </div>
        )
    }

    return (
        <div className="space-y-5 max-w-5xl">
            <div>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Integración con Facturación</h1>
                        <p className="text-slate-500 text-sm mt-0.5">
                            Genera asientos contables desde las facturas de ventas de Corina ERP
                        </p>
                    </div>
                    <HelpButton pageKey="integracion-qi" />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm w-fit">
                {([
                    ['config',  'Configuración', Settings ],
                    ['preview', 'Vista Previa',  Eye      ],
                    ['log',     'Resultado',     List     ],
                ] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setTab(id)}
                        className={cn(
                            'flex items-center gap-2 px-5 py-2.5 border-l border-slate-200 first:border-l-0',
                            tab === id
                                ? 'bg-primary-600 text-white font-medium'
                                : 'bg-white text-slate-600 hover:bg-slate-50',
                        )}>
                        <Icon className="w-4 h-4" />
                        {label}
                        {id === 'preview' && pendientes.length > 0 && (
                            <span className="ml-1 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                                {pendientes.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Error global */}
            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                Tab: Configuración
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'config' && (
                <div className="space-y-5">

                    {/* Modo de generación */}
                    <div className="card p-5 space-y-4">
                        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
                            ¿Cómo generar los asientos?
                        </h2>
                        <div className="flex gap-3">
                            {([
                                ['detalle', '1 asiento por factura',
                                 'Máxima trazabilidad. Genera un Comprobante de Ingreso (CI) por cada factura importada.'],
                                ['resumen', '1 asiento resumen del período',
                                 'Simplificado. Un solo CI que acumula todas las facturas del rango de fechas seleccionado.'],
                            ] as const).map(([val, titulo, desc]) => (
                                <button key={val} type="button" onClick={() => setModo(val)}
                                    className={cn(
                                        'flex-1 text-left p-4 rounded-lg border-2 transition-colors',
                                        modo === val
                                            ? 'border-primary-500 bg-primary-50'
                                            : 'border-slate-200 hover:border-slate-300',
                                    )}>
                                    <div className="font-semibold text-sm text-slate-800 mb-0.5">{titulo}</div>
                                    <div className="text-xs text-slate-500">{desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Mapeo de cuentas */}
                    <div className="card p-5 space-y-4">
                        <div>
                            <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
                                Mapeo de cuentas contables
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Asigna cada concepto a la cuenta del plan de cuentas que corresponda.
                            </p>
                        </div>

                        {/* Grupo HABER */}
                        <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">HABER — Ingresos</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {CATEGORIAS.filter(c => c.grupo === 'haber').map(({ key, label, required }) => (
                                    <div key={key}>
                                        <label className="label">
                                            {label}
                                            {required
                                                ? <span className="text-red-500 ml-0.5">*</span>
                                                : <span className="text-slate-400 text-xs ml-1">(opcional)</span>}
                                        </label>
                                        <select className="input w-full"
                                            value={mapeo[key] ?? ''}
                                            onChange={e => setMapeo(m => ({
                                                ...m, [key]: e.target.value || undefined,
                                            }))}>
                                            <option value="">— Sin asignar —</option>
                                            {cuentas.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.codigo} — {c.nombre}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Grupo DEBE */}
                        <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">DEBE — Formas de cobro</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {CATEGORIAS.filter(c => c.grupo === 'debe').map(({ key, label, required }) => (
                                    <div key={key}>
                                        <label className="label">
                                            {label}
                                            {required
                                                ? <span className="text-red-500 ml-0.5">*</span>
                                                : <span className="text-slate-400 text-xs ml-1">(opcional)</span>}
                                        </label>
                                        <select className="input w-full"
                                            value={mapeo[key] ?? ''}
                                            onChange={e => setMapeo(m => ({
                                                ...m, [key]: e.target.value || undefined,
                                            }))}>
                                            <option value="">— Sin asignar —</option>
                                            {cuentas.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.codigo} — {c.nombre}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Ejemplo visual del asiento */}
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                                Ejemplo — Factura $112 (base gravada $100 + IVA $12, cobrado: $50 efectivo + $62 crédito)
                            </p>
                            <table className="text-xs w-full max-w-md">
                                <thead>
                                    <tr className="text-[10px] text-slate-400 uppercase tracking-wide">
                                        <th className="text-left pb-1">Cuenta</th>
                                        <th className="text-right pb-1 w-20">Debe</th>
                                        <th className="text-right pb-1 w-20">Haber</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    <tr><td className="py-0.5 text-slate-600">Caja (efectivo)</td>        <td className="text-right font-mono">$ 50,00</td><td className="text-right text-slate-300">—</td></tr>
                                    <tr><td className="py-0.5 text-slate-600">Cuentas por Cobrar</td>    <td className="text-right font-mono">$ 62,00</td><td className="text-right text-slate-300">—</td></tr>
                                    <tr><td className="py-0.5 text-slate-600">Ingresos por Ventas</td>   <td className="text-right text-slate-300">—</td><td className="text-right font-mono">$100,00</td></tr>
                                    <tr><td className="py-0.5 text-slate-600">IVA en Ventas</td>         <td className="text-right text-slate-300">—</td><td className="text-right font-mono">$ 12,00</td></tr>
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-slate-200 font-semibold text-green-700">
                                        <td className="pt-1">TOTAL</td>
                                        <td className="pt-1 text-right font-mono">$112,00</td>
                                        <td className="pt-1 text-right font-mono">$112,00</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                            <button onClick={guardarConfig} disabled={guardando}
                                className="btn btn-primary gap-2">
                                {guardando
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : configOk
                                        ? <CheckCircle className="w-4 h-4" />
                                        : <Settings className="w-4 h-4" />}
                                {configOk ? 'Guardado' : 'Guardar configuración'}
                            </button>
                            <p className="text-xs text-slate-400">
                                La configuración se guarda en la base de datos por empresa.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                Tab: Vista Previa
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'preview' && (
                <div className="space-y-4">

                    {/* Filtros */}
                    <div className="card p-5 space-y-3">
                        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
                            Filtros de importación
                        </h2>
                        <div className="flex flex-wrap gap-4 items-end">
                            <div>
                                <label className="label">Período contable destino</label>
                                <select className="input" value={periodoId}
                                    onChange={e => setPeriodoId(e.target.value)}>
                                    <option value="">Seleccionar período...</option>
                                    {periodos.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.mes ? `${mesNombre(p.mes)} ${p.año}` : `Año ${p.año}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">Fecha desde</label>
                                <input type="date" className="input" value={fechaDesde}
                                    onChange={e => setFechaDesde(e.target.value)} />
                            </div>
                            <div>
                                <label className="label">Fecha hasta</label>
                                <input type="date" className="input" value={fechaHasta}
                                    onChange={e => setFechaHasta(e.target.value)} />
                            </div>
                            <button onClick={cargarFacturas}
                                disabled={cargandoFact || !periodoId}
                                className="btn btn-primary gap-2">
                                {cargandoFact
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <RefreshCw className="w-4 h-4" />}
                                Cargar facturas
                            </button>
                        </div>
                    </div>

                    {/* Estado vacío */}
                    {!facturas.length && !cargandoFact && (
                        <div className="card p-12 text-center text-slate-400">
                            <Eye className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                            <p className="text-sm">
                                Selecciona el período y rango de fechas,
                                luego presiona <strong>Cargar facturas</strong>.
                            </p>
                        </div>
                    )}

                    {/* Tabla de facturas */}
                    {facturas.length > 0 && (
                        <div className="card overflow-hidden">
                            <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm flex items-center justify-between">
                                <span>Facturas encontradas — {facturas.length}</span>
                                <span className="text-slate-300 text-xs font-normal">
                                    {pendientes.length} pendientes · {yaImportadas.length} ya importadas
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-2 w-8"></th>
                                            <th className="py-2 px-3 text-left">N° Fact.</th>
                                            <th className="py-2 px-3 text-left">Fecha</th>
                                            <th className="py-2 px-3 text-left">Cliente</th>
                                            <th className="py-2 px-3 text-right">Base 0%</th>
                                            <th className="py-2 px-3 text-right">Base Grav.</th>
                                            <th className="py-2 px-3 text-right">IVA</th>
                                            <th className="py-2 px-3 text-right">Total</th>
                                            <th className="py-2 px-3 text-center w-28">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {facturas.map(f => {
                                            const asiento    = asientos.find(a => a.factura?.id === f.id)
                                            const isExpanded = expandida === f.id
                                            return (
                                                <Fragment key={f.id}>
                                                    <tr className={cn(
                                                        'border-b border-slate-100 hover:bg-slate-50 transition-colors',
                                                        f.yaImportada && 'opacity-40',
                                                    )}>
                                                        <td className="py-2 px-2 text-center">
                                                            {!f.yaImportada && modo === 'detalle' && asiento && (
                                                                <button
                                                                    onClick={() => setExpandida(isExpanded ? null : f.id)}
                                                                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded">
                                                                    {isExpanded
                                                                        ? <ChevronUp  className="w-4 h-4" />
                                                                        : <ChevronDown className="w-4 h-4" />}
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3 font-mono text-xs text-slate-600">{f.secuencial}</td>
                                                        <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">{f.fecha}</td>
                                                        <td className="py-2 px-3 text-slate-700 max-w-[180px] truncate" title={f.clienteNombre}>
                                                            {f.clienteNombre}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono text-xs text-slate-500">
                                                            {f.base_cero > 0 ? formatMoneda(f.base_cero, sym) : '—'}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono text-xs text-slate-600">
                                                            {f.base_iva > 0 ? formatMoneda(f.base_iva, sym) : '—'}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono text-xs text-slate-500">
                                                            {f.total_iva > 0.001 ? formatMoneda(f.total_iva, sym) : '—'}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800">
                                                            {formatMoneda(f.total, sym)}
                                                        </td>
                                                        <td className="py-2 px-3 text-center">
                                                            {f.yaImportada ? (
                                                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                                                                    Ya importada
                                                                </span>
                                                            ) : asiento?.cuadra ? (
                                                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                                                    ✓ Lista
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    title="Falta mapear una cuenta de cobro"
                                                                    className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                                                    ⚠ Sin cuenta
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>

                                                    {/* Detalle del asiento expandido */}
                                                    {isExpanded && asiento && (
                                                        <tr className="bg-blue-50 border-b border-blue-100">
                                                            <td colSpan={9} className="px-10 py-3">
                                                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                                                    Asiento que se generará — {asiento.glosa}
                                                                </p>
                                                                <table className="text-xs w-full max-w-lg">
                                                                    <thead>
                                                                        <tr className="text-[10px] text-slate-400 uppercase tracking-wide">
                                                                            <th className="text-left pb-1">Cuenta</th>
                                                                            <th className="text-right pb-1 w-24">Debe</th>
                                                                            <th className="text-right pb-1 w-24">Haber</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {asiento.lineas.map((l, i) => (
                                                                            <tr key={i} className="border-t border-blue-100">
                                                                                <td className="py-0.5 text-slate-600 pr-4">{l.cuentaLabel}</td>
                                                                                <td className="text-right font-mono text-slate-700">
                                                                                    {l.debe  > 0 ? formatMoneda(l.debe,  sym) : '—'}
                                                                                </td>
                                                                                <td className="text-right font-mono text-slate-700">
                                                                                    {l.haber > 0 ? formatMoneda(l.haber, sym) : '—'}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                    <tfoot>
                                                                        <tr className="border-t border-slate-300 font-semibold">
                                                                            <td className="pt-1 text-slate-500">TOTAL</td>
                                                                            <td className={cn('pt-1 text-right font-mono', asiento.cuadra ? 'text-green-700' : 'text-red-600')}>
                                                                                {formatMoneda(asiento.totalDebe, sym)}
                                                                            </td>
                                                                            <td className={cn('pt-1 text-right font-mono', asiento.cuadra ? 'text-green-700' : 'text-red-600')}>
                                                                                {formatMoneda(asiento.totalHaber, sym)}
                                                                            </td>
                                                                        </tr>
                                                                    </tfoot>
                                                                </table>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-sm">
                                            <td colSpan={4} className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase tracking-wide">
                                                Totales pendientes ({pendientes.length})
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-xs">
                                                {formatMoneda(pendientes.reduce((s, f) => s + f.base_cero, 0), sym)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-xs">
                                                {formatMoneda(pendientes.reduce((s, f) => s + f.base_iva, 0), sym)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-xs">
                                                {formatMoneda(pendientes.reduce((s, f) => s + f.total_iva, 0), sym)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono">
                                                {formatMoneda(pendientes.reduce((s, f) => s + f.total, 0), sym)}
                                            </td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Asiento resumen preview */}
                    {modo === 'resumen' && asientos.length > 0 && (
                        <div className="card p-5">
                            <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide mb-3">
                                Asiento resumen que se generará
                            </h3>
                            {asientos.map((a, i) => (
                                <table key={i} className="text-sm w-full max-w-xl">
                                    <thead>
                                        <tr className="text-xs text-slate-400 uppercase tracking-wide">
                                            <th className="text-left pb-1">Cuenta</th>
                                            <th className="text-right pb-1 w-28">Debe</th>
                                            <th className="text-right pb-1 w-28">Haber</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {a.lineas.map((l, j) => (
                                            <tr key={j} className="border-t border-slate-100">
                                                <td className="py-1 text-slate-600">{l.cuentaLabel}</td>
                                                <td className="text-right font-mono">{l.debe  > 0 ? formatMoneda(l.debe,  sym) : '—'}</td>
                                                <td className="text-right font-mono">{l.haber > 0 ? formatMoneda(l.haber, sym) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-slate-300 font-semibold">
                                            <td className="pt-1 text-slate-500">TOTAL</td>
                                            <td className={cn('pt-1 text-right font-mono', a.cuadra ? 'text-green-700' : 'text-red-600')}>
                                                {formatMoneda(a.totalDebe, sym)}
                                            </td>
                                            <td className={cn('pt-1 text-right font-mono', a.cuadra ? 'text-green-700' : 'text-red-600')}>
                                                {formatMoneda(a.totalHaber, sym)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            ))}
                        </div>
                    )}

                    {/* Botón Generar */}
                    {pendientes.length > 0 && (
                        <div className={cn(
                            'card px-5 py-4 flex items-center gap-4 flex-wrap',
                            sinCuadrar.length
                                ? 'bg-amber-50 border-amber-200'
                                : 'bg-green-50 border-green-200',
                        )}>
                            <div className="flex-1 min-w-0">
                                {sinCuadrar.length > 0 ? (
                                    <p className="text-sm text-amber-800">
                                        <strong>{sinCuadrar.length} asiento(s) no cuadran</strong> porque
                                        falta mapear alguna cuenta de cobro. Revisa la configuración.
                                    </p>
                                ) : (
                                    <p className="text-sm text-green-800">
                                        <strong>{listos.length} asiento(s) listos</strong> para generar en el diario contable
                                        {modo === 'detalle' ? ' (1 CI por factura)' : ' (1 CI resumen)'}.
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={generarDiarios}
                                disabled={generando || sinCuadrar.length > 0 || !listos.length}
                                className="btn btn-primary gap-2 shrink-0">
                                {generando
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Zap className="w-4 h-4" />}
                                Generar diarios
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                Tab: Resultado
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'log' && (
                <div className="space-y-4">
                    {log.length > 0 ? (
                        <div className="card p-4 bg-slate-900 font-mono text-xs text-green-400 space-y-0.5 max-h-[480px] overflow-y-auto">
                            {log.map((l, i) => <div key={i}>{l}</div>)}
                        </div>
                    ) : (
                        <div className="card p-12 text-center text-slate-400">
                            <List className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                            <p className="text-sm">
                                El resultado aparece aquí después de generar los diarios.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}




