import { useState, useEffect } from 'react'
import { HelpButton } from '../components/help/HelpButton'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { kardexService } from '../services/kardexService'
import { bodegaService } from '../services/bodegaService'
import { useFormDraft } from '../hooks/useFormDraft'
import type { Bodega } from '../types/vendors'
import {
    Plus,
    Trash2,
    Save,
    Warehouse,
    ArrowRight,
    AlertCircle,
    Package,
    Loader2,
    FileText,
    Info,
    MoveRight,
    History,
    Filter,
    TrendingUp,
    TrendingDown,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { BuscadorProducto, type ProductoResultado } from '../components/BuscadorProducto'

interface LineaTransferencia {
    id: string
    producto_id: string
    producto_nombre: string
    producto_codigo: string
    cantidad: number | ''
    stock_origen: number | null    // stock disponible en bodega origen
    costo_promedio: number         // costo a mantener al traspasar
    observacion: string            // nota específica de esta línea
}

const hoy = () => new Date().toISOString().split('T')[0]

function generarReferencia() {
    const d    = new Date()
    const fecha = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    return `TR-${fecha}-${Math.floor(Math.random() * 900 + 100)}`
}

function lineaVacia(): LineaTransferencia {
    return {
        id:              crypto.randomUUID(),
        producto_id:     '',
        producto_nombre: '',
        producto_codigo: '',
        cantidad:        '',
        stock_origen:    null,
        costo_promedio:  0,
        observacion:     '',
    }
}

// ─────────────────────────────────────────────────────────────────────────────

export function TransferenciaBodegaPage() {
    const { empresa } = useAuth()
    const navigate    = useNavigate()

    // Catálogos
    const [bodegas,   setBodegas]   = useState<Bodega[]>([])
    const [productos, _setProductos] = useState<any[]>([])

    // Cabecera
    const [referencia,  setReferencia]  = useState(generarReferencia)
    const [fecha,       setFecha]       = useState(hoy)
    const [bodegaOrigen, setBodegaOrigen] = useState('')
    const [bodegaDestino, setBodegaDestino] = useState('')
    const [observacion,  setObservacion]  = useState('')

    // Detalle
    const [lineas, setLineas] = useState<LineaTransferencia[]>([lineaVacia()])

    // Mapa de stock en bodega origen: producto_id → { cantidad, costo_promedio }
    const [stockOrigenMap, setStockOrigenMap] = useState<Record<string, { cantidad: number; costo: number }>>({})

    const [saving,  setSaving]  = useState(false)
    const [errores, setErrores] = useState<string[]>([])

    // ── Historial
    const [activeTab,   setActiveTab]   = useState<'nuevo' | 'consulta'>('nuevo')
    const [histDesde,   setHistDesde]   = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
    const [histHasta,   setHistHasta]   = useState(hoy)
    const [histMovs,    setHistMovs]    = useState<any[]>([])
    const [histLoading, setHistLoading] = useState(false)

    // ── Helper de línea (definido aquí para ser accesible antes del return) ──
    function actualizarLinea<K extends keyof LineaTransferencia>(idx: number, campo: K, valor: LineaTransferencia[K]) {
        setLineas(prev => {
            const copia = [...prev]
            copia[idx] = { ...copia[idx], [campo]: valor }
            if (campo === 'producto_id') {
                const prod = productos.find(p => p.id === valor)
                const info = valor ? (stockOrigenMap[valor as string] ?? null) : null
                copia[idx].producto_nombre = prod?.nombre ?? ''
                copia[idx].producto_codigo = prod?.codigo ?? ''
                copia[idx].stock_origen    = info ? info.cantidad : (prod ? 0 : null)
                copia[idx].costo_promedio  = info ? info.costo : Number(prod?.costo_promedio ?? 0)
            }
            return copia
        })
    }

    // Draft
    const clearDraft = useFormDraft(
        'draft_transferencia_bodega',
        () => ({ referencia, fecha, bodegaOrigen, bodegaDestino, observacion, lineas }),
        (d) => {
            if (d.referencia)    setReferencia(d.referencia)
            if (d.fecha)         setFecha(d.fecha)
            if (d.bodegaOrigen)  setBodegaOrigen(d.bodegaOrigen)
            if (d.bodegaDestino) setBodegaDestino(d.bodegaDestino)
            if (d.observacion)   setObservacion(d.observacion)
            if (d.lineas?.length) setLineas(d.lineas)
        },
        [referencia, fecha, bodegaOrigen, bodegaDestino, observacion, lineas],
    )

    useEffect(() => { if (empresa?.id) cargarCatalogos() }, [empresa?.id])
    useEffect(() => { if (empresa?.id) cargarStockOrigen() }, [bodegaOrigen, empresa?.id, productos.length])

    async function cargarCatalogos() {
        try {
            const bods = await bodegaService.listar(empresa!.id)
            setBodegas(bods)

            const principal = bods.find(b => b.es_principal)
            if (principal && !bodegaOrigen) setBodegaOrigen(principal.id)
        } catch (e) {
            console.error('Error cargando catálogos:', e)
        }
    }

    async function cargarStockOrigen() {
        if (!empresa?.id || !bodegaOrigen) {
            setStockOrigenMap({})
            return
        }
        try {
            const { data } = await supabase
                .from('stock_bodega')
                .select('producto_id, cantidad, costo_promedio')
                .eq('empresa_id', empresa.id)
                .eq('bodega_id', bodegaOrigen)
                .gt('cantidad', 0)

            const map: Record<string, { cantidad: number; costo: number }> = {}
            for (const r of (data ?? [])) {
                map[r.producto_id] = { cantidad: Number(r.cantidad), costo: Number(r.costo_promedio) }
            }
            setStockOrigenMap(map)

            // Actualizar stock y costo en líneas ya ingresadas
            setLineas(prev => prev.map(l => {
                if (!l.producto_id) return l
                const info = map[l.producto_id]
                return { ...l, stock_origen: info?.cantidad ?? 0, costo_promedio: info?.costo ?? 0 }
            }))
        } catch (e) {
            console.error('Error cargando stock origen:', e)
        }
    }

    async function consultarHistorial() {
        if (!empresa?.id) return
        setHistLoading(true)
        try {
            const { data, error } = await supabase
                .from('kardex')
                .select('id, fecha, created_at, tipo_movimiento, motivo, documento_referencia, cantidad, costo_unitario, producto:productos(nombre, codigo), bodega:bodegas(nombre)')
                .eq('empresa_id', empresa.id)
                .like('documento_referencia', 'TR-%')
                .gte('fecha', histDesde)
                .lte('fecha', histHasta)
                .order('fecha', { ascending: false })
                .order('created_at', { ascending: false })
            if (error) throw error
            setHistMovs(data ?? [])
        } catch (e: any) {
            alert('Error al consultar historial: ' + e.message)
        } finally {
            setHistLoading(false)
        }
    }

    // ── Helpers de línea ──────────────────────────────────────────────────────

    // ── Validación ────────────────────────────────────────────────────────────

    function validar(): string[] {
        const errs: string[] = []
        if (!observacion.trim())  errs.push('La observación de la transferencia es obligatoria.')
        if (!bodegaOrigen)        errs.push('Debe seleccionar la bodega de origen.')
        if (!bodegaDestino)       errs.push('Debe seleccionar la bodega de destino.')
        if (bodegaOrigen && bodegaDestino && bodegaOrigen === bodegaDestino)
            errs.push('La bodega de origen y destino no pueden ser la misma.')
        if (!fecha)               errs.push('La fecha es obligatoria.')

        const validas = lineas.filter(l => l.producto_id && Number(l.cantidad) > 0)
        if (validas.length === 0) errs.push('Ingrese al menos un producto con cantidad mayor a 0.')

        for (const l of validas) {
            const disp = stockOrigenMap[l.producto_id]?.cantidad ?? 0
            if (Number(l.cantidad) > disp) {
                errs.push(`"${l.producto_nombre}": stock insuficiente en origen (disponible: ${disp}, solicitado: ${l.cantidad}).`)
            }
        }

        // Productos duplicados
        const ids = validas.map(l => l.producto_id)
        const duplicados = ids.filter((id, i) => ids.indexOf(id) !== i)
        if (duplicados.length > 0) {
            const nombres = [...new Set(duplicados)].map(id => productos.find(p => p.id === id)?.nombre ?? id)
            errs.push(`Producto duplicado en el detalle: ${nombres.join(', ')}. Combine en una sola línea.`)
        }

        return errs
    }

    // ── Guardar ───────────────────────────────────────────────────────────────

    async function handleGuardar() {
        const errs = validar()
        setErrores(errs)
        if (errs.length > 0) return

        const bodOrigen  = bodegas.find(b => b.id === bodegaOrigen)!
        const bodDestino = bodegas.find(b => b.id === bodegaDestino)!
        const motivoBase = `Transferencia ${bodOrigen.nombre} → ${bodDestino.nombre} — ${observacion.trim()}`

        try {
            setSaving(true)
            const validas = lineas.filter(l => l.producto_id && Number(l.cantidad) > 0)

            for (const l of validas) {
                // Leer costo promedio actual en origen (fresco desde BD por si cambió)
                const { data: sbOrigen } = await supabase
                    .from('stock_bodega')
                    .select('costo_promedio')
                    .eq('bodega_id', bodegaOrigen)
                    .eq('producto_id', l.producto_id)
                    .maybeSingle()
                const costoTransfer = Number(sbOrigen?.costo_promedio ?? l.costo_promedio ?? 0)

                const motivo = l.observacion.trim()
                    ? `${motivoBase} | ${l.observacion.trim()}`
                    : motivoBase

                // 1. Salida de bodega origen
                await kardexService.registrarMovimiento({
                    empresa_id:           empresa!.id,
                    producto_id:          l.producto_id,
                    bodega_id:            bodegaOrigen,
                    fecha:                `${fecha}T12:00:00`,
                    tipo_movimiento:      'SALIDA',
                    motivo,
                    documento_referencia: referencia,
                    cantidad:             Number(l.cantidad),
                })

                // 2. Entrada a bodega destino (mismo costo para conservar valor)
                await kardexService.registrarMovimiento({
                    empresa_id:           empresa!.id,
                    producto_id:          l.producto_id,
                    bodega_id:            bodegaDestino,
                    fecha:                `${fecha}T12:00:00`,
                    tipo_movimiento:      'ENTRADA',
                    motivo,
                    documento_referencia: referencia,
                    cantidad:             Number(l.cantidad),
                    costo_unitario:       costoTransfer,
                })
            }

            clearDraft()
            alert(`Transferencia ${referencia} registrada correctamente.\n${validas.length} producto${validas.length !== 1 ? 's' : ''} transferido${validas.length !== 1 ? 's' : ''} de ${bodOrigen.nombre} → ${bodDestino.nombre}.`)
            navigate('/kardex')
        } catch (e: any) {
            alert(`Error al registrar transferencia: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    // ── UI ────────────────────────────────────────────────────────────────────

    const inp = 'w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-400 text-sm bg-white'

    const bodOrigen  = bodegas.find(b => b.id === bodegaOrigen)
    const bodDestino = bodegas.find(b => b.id === bodegaDestino)
    const totalUnidades = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)

    // productosOrigen ya no se usa (reemplazado por BuscadorProducto)
    const _productosOrigen = [] as any[]
    void _productosOrigen

    return (
        <div className="space-y-6 max-w-6xl">

            {/* Encabezado */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Transferencia entre Bodegas</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Mueve stock de una bodega a otra sin afectar el inventario total</p>
                </div>
                <HelpButton pageKey="transferencia-bodega" />
                <div className="flex items-center gap-3">
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                        <button onClick={() => setActiveTab('nuevo')}
                            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all', activeTab === 'nuevo' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>
                            <Plus className="w-4 h-4" /> Nueva Transferencia
                        </button>
                        <button onClick={() => setActiveTab('consulta')}
                            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all', activeTab === 'consulta' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500')}>
                            <History className="w-4 h-4" /> Consulta
                        </button>
                    </div>
                    {activeTab === 'nuevo' && (
                        <button onClick={handleGuardar} disabled={saving} className="btn btn-primary gap-2 shrink-0 bg-blue-600 hover:bg-blue-700">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Registrando...' : 'Confirmar Transferencia'}
                        </button>
                    )}
                </div>
            </div>

            {activeTab === 'nuevo' && (<>
            {/* Errores */}
            {errores.length > 0 && (
                <div className="rounded-2xl bg-red-50 border border-red-200 p-4 space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                        <p className="text-sm font-bold text-red-700">Corrija los siguientes errores:</p>
                    </div>
                    {errores.map((e, i) => (
                        <p key={i} className="text-sm text-red-600 ml-6">• {e}</p>
                    ))}
                </div>
            )}

            {/* ── Cabecera ──────────────────────────────────────────────────── */}
            <div className="card p-6 space-y-5">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                        <MoveRight className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">Datos de la Transferencia</h2>
                        <p className="text-xs text-slate-400">Referencia, fecha, bodegas y motivo</p>
                    </div>
                </div>

                {/* Referencia + Fecha */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">N.º de Referencia</label>
                        <input type="text" className={inp} value={referencia}
                            onChange={e => setReferencia(e.target.value)} placeholder="TR-YYYYMMDD-XXX" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            Fecha <span className="text-red-500">*</span>
                        </label>
                        <input type="date" className={inp} value={fecha} onChange={e => setFecha(e.target.value)} />
                    </div>
                </div>

                {/* Bodegas — selector visual con flecha */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                    {/* Origen */}
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Warehouse className="w-3.5 h-3.5 text-orange-400" />
                            Bodega Origen <span className="text-red-500">*</span>
                        </label>
                        <select
                            className={cn(inp, 'focus:ring-orange-400 border-orange-200 bg-orange-50/40')}
                            value={bodegaOrigen}
                            onChange={e => setBodegaOrigen(e.target.value)}
                        >
                            <option value="">Seleccionar origen...</option>
                            {bodegas.map(b => (
                                <option key={b.id} value={b.id} disabled={b.id === bodegaDestino}>
                                    {b.codigo ? `[${b.codigo}] ` : ''}{b.nombre}{b.es_principal ? ' ★' : ''}
                                </option>
                            ))}
                        </select>
                        {bodOrigen && (
                            <p className="text-[11px] text-slate-400">
                                {bodOrigen.direccion ? bodOrigen.direccion : 'Sin dirección registrada'}
                            </p>
                        )}
                    </div>

                    {/* Flecha */}
                    <div className="flex items-center justify-center pb-1">
                        <div className="flex flex-col items-center gap-1">
                            <ArrowRight className="w-6 h-6 text-blue-400" />
                            {totalUnidades > 0 && (
                                <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                                    {totalUnidades} u.
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Destino */}
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Warehouse className="w-3.5 h-3.5 text-blue-500" />
                            Bodega Destino <span className="text-red-500">*</span>
                        </label>
                        <select
                            className={cn(inp, 'focus:ring-blue-500 border-blue-200 bg-blue-50/40')}
                            value={bodegaDestino}
                            onChange={e => setBodegaDestino(e.target.value)}
                        >
                            <option value="">Seleccionar destino...</option>
                            {bodegas.map(b => (
                                <option key={b.id} value={b.id} disabled={b.id === bodegaOrigen}>
                                    {b.codigo ? `[${b.codigo}] ` : ''}{b.nombre}{b.es_principal ? ' ★' : ''}
                                </option>
                            ))}
                        </select>
                        {bodDestino && (
                            <p className="text-[11px] text-slate-400">
                                {bodDestino.direccion ? bodDestino.direccion : 'Sin dirección registrada'}
                            </p>
                        )}
                    </div>
                </div>

                {/* Observación — campo prominente */}
                <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        Observación / Motivo <span className="text-red-500">*</span>
                        <span className="normal-case font-normal text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">
                            Requerida
                        </span>
                    </label>
                    <textarea
                        rows={3}
                        className={cn(
                            inp,
                            'resize-none',
                            !observacion.trim() && errores.length > 0 && 'border-red-300 ring-2 ring-red-100',
                        )}
                        placeholder="Describe el motivo de la transferencia: reubicación de mercancía, abastecimiento de punto de venta, ajuste entre almacenes, etc."
                        value={observacion}
                        onChange={e => setObservacion(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Info className="w-3 h-3 shrink-0" />
                        Queda registrado en el kardex de cada movimiento (salida de origen + entrada a destino).
                    </p>
                </div>
            </div>

            {/* ── Detalle de productos ──────────────────────────────────────── */}
            <div className="card overflow-visible">
                <div className="bg-slate-700 text-white px-4 py-3 flex items-center justify-between">
                    <span className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Productos a Transferir
                    </span>
                    <button
                        onClick={() => setLineas(prev => [...prev, lineaVacia()])}
                        className="flex items-center gap-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" /> Agregar línea
                    </button>
                </div>

                {/* Cabecera de columnas */}
                <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <span>Producto</span>
                    <span>Stock en Origen</span>
                    <span>Cantidad</span>
                    <span>Observación de línea</span>
                    <span></span>
                </div>

                {/* Aviso sin bodega origen */}
                {!bodegaOrigen && (
                    <div className="px-6 py-5 text-sm text-slate-400 flex items-center gap-2">
                        <Info className="w-4 h-4 shrink-0 text-orange-400" />
                        Selecciona primero la bodega de origen para ver los productos disponibles.
                    </div>
                )}

                {/* Filas */}
                {bodegaOrigen && (
                    <div className="divide-y divide-slate-100">
                        {lineas.map((linea, idx) => {
                            const info      = linea.producto_id ? (stockOrigenMap[linea.producto_id] ?? null) : null
                            const stockDisp = info?.cantidad ?? (linea.producto_id ? 0 : null)
                            const excede    = stockDisp !== null && Number(linea.cantidad) > 0 && Number(linea.cantidad) > stockDisp

                            return (
                                <div key={linea.id} className={cn(
                                    'px-4 py-3 space-y-2',
                                    excede ? 'bg-red-50' : idx % 2 !== 0 ? 'bg-slate-50/40' : '',
                                )}>
                                    {/* FILA 1: Producto (ancho completo) */}
                                    <div className="relative">
                                        {linea.producto_id ? (
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800">
                                                        {linea.producto_codigo && <span className="font-mono text-xs text-slate-400 mr-2">[{linea.producto_codigo}]</span>}
                                                        {linea.producto_nombre}
                                                    </p>
                                                    {linea.costo_promedio > 0 && (
                                                        <p className="text-[11px] text-slate-400">Costo promedio: <span className="font-bold">${linea.costo_promedio.toFixed(4)}</span></p>
                                                    )}
                                                </div>
                                                <button type="button" onClick={() => actualizarLinea(idx, 'producto_id', '')}
                                                    className="shrink-0 text-xs text-slate-400 hover:text-red-500 px-2 py-1 border border-slate-200 rounded-lg hover:border-red-200">
                                                    Cambiar
                                                </button>
                                            </div>
                                        ) : (
                                            <BuscadorProducto
                                                empresaId={empresa!.id}
                                                placeholder="Buscar producto (Enter o Buscar)…"
                                                onSelect={(p: ProductoResultado) => {
                                                    setLineas(prev => prev.map((l, i) => i === idx
                                                        ? { ...l, producto_id: p.id, producto_nombre: p.nombre, producto_codigo: p.codigo ?? '' }
                                                        : l))
                                                }}
                                            />
                                        )}
                                    </div>

                                    {/* FILA 2: Stock origen | Cantidad | Observación | Eliminar */}
                                    <div className="grid grid-cols-[auto_1fr_2fr_auto] gap-2 items-center">
                                        {/* Stock en origen */}
                                        <div className={cn(
                                            'flex items-center gap-1 px-3 py-2 rounded-lg border text-sm font-bold whitespace-nowrap',
                                            stockDisp === null ? 'bg-slate-50 border-slate-200 text-slate-300'
                                                : stockDisp === 0 ? 'bg-red-50 border-red-200 text-red-500'
                                                : excede ? 'bg-red-50 border-red-300 text-red-600'
                                                : 'bg-emerald-50 border-emerald-200 text-emerald-700',
                                        )}>
                                            <Package className="w-3.5 h-3.5" />
                                            <span>Stock: {stockDisp ?? '—'}</span>
                                            {excede && <span className="text-xs ml-1">⚠ insuficiente</span>}
                                        </div>
                                        {/* Cantidad */}
                                        <div>
                                            <input type="number" min="0.001" step="0.001" placeholder="Cantidad"
                                                className={cn(inp, 'text-right font-bold text-sm', excede && 'border-red-300 bg-red-50')}
                                                value={linea.cantidad}
                                                onChange={e => actualizarLinea(idx, 'cantidad', e.target.value === '' ? '' : Number(e.target.value))} />
                                            {stockDisp !== null && Number(linea.cantidad) > 0 && !excede && (
                                                <p className="text-[10px] text-emerald-600 mt-0.5">Quedará: {(stockDisp - Number(linea.cantidad)).toFixed(3)} en origen</p>
                                            )}
                                        </div>
                                        {/* Observación */}
                                        <input type="text" placeholder="Nota (opcional)"
                                            className={cn(inp, 'text-sm')}
                                            value={linea.observacion}
                                            onChange={e => actualizarLinea(idx, 'observacion', e.target.value)} />
                                        {/* Eliminar */}
                                        <button type="button" onClick={() => setLineas(prev => prev.filter((_, i) => i !== idx))}
                                            disabled={lineas.length === 1}
                                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
                    <button
                        onClick={() => setLineas(prev => [...prev, lineaVacia()])}
                        disabled={!bodegaOrigen}
                        className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-4 h-4" /> Agregar otro producto
                    </button>
                </div>
            </div>

            {/* Nota informativa */}
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex gap-3">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="text-xs text-slate-500 space-y-1">
                    <p>Por cada producto se registran <span className="font-bold text-slate-700">dos movimientos en el Kardex</span>: una <span className="text-red-600 font-bold">salida</span> de la bodega origen y una <span className="text-green-600 font-bold">entrada</span> en la bodega destino.</p>
                    <p>El costo promedio se conserva al traspasar, sin afectar el inventario total de la empresa.</p>
                    <p>El stock global del producto no cambia — solo se redistribuye entre bodegas.</p>
                </div>
            </div>

            {/* Botón pie */}
            <div className="flex justify-end pt-2">
                <button
                    onClick={handleGuardar}
                    disabled={saving}
                    className="btn btn-primary gap-2 bg-blue-600 hover:bg-blue-700"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Registrando...' : 'Confirmar Transferencia'}
                </button>
            </div>
            </>)}

            {activeTab === 'consulta' && (
                <div className="space-y-4">
                    {/* Filtros */}
                    <div className="card p-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Desde</label>
                                <input type="date" value={histDesde} onChange={e => setHistDesde(e.target.value)}
                                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Hasta</label>
                                <input type="date" value={histHasta} onChange={e => setHistHasta(e.target.value)}
                                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <button onClick={consultarHistorial} disabled={histLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60">
                                {histLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
                                Consultar
                            </button>
                        </div>
                    </div>

                    {histMovs.length === 0 && !histLoading && (
                        <div className="card p-10 flex flex-col items-center gap-3 text-slate-400">
                            <History className="w-10 h-10 opacity-30" />
                            <p className="text-sm">No hay transferencias en el período seleccionado. Presiona <strong>Consultar</strong> para buscar.</p>
                        </div>
                    )}

                    {histMovs.length > 0 && (
                        <div className="card overflow-hidden">
                            <div className="bg-slate-700 text-white px-4 py-3 flex items-center justify-between">
                                <span className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                                    <History className="w-4 h-4" /> Historial de Transferencias
                                </span>
                                <span className="text-xs bg-white/10 px-2 py-1 rounded-lg">{histMovs.length} movimiento{histMovs.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Fecha</th>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Referencia</th>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Producto</th>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Bodega</th>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Tipo</th>
                                            <th className="text-right px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Cantidad</th>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {histMovs.map((m, i) => (
                                            <tr key={m.id} className={cn('hover:bg-slate-50 transition-colors', i % 2 === 1 && 'bg-slate-50/40')}>
                                                <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{m.fecha}</td>
                                                <td className="px-4 py-2 font-mono text-xs text-blue-700">{m.documento_referencia}</td>
                                                <td className="px-4 py-2">
                                                    <p className="font-semibold text-slate-800">{(m.producto as any)?.nombre ?? '—'}</p>
                                                    <p className="text-[10px] text-slate-400">{(m.producto as any)?.codigo}</p>
                                                </td>
                                                <td className="px-4 py-2 text-slate-500 text-xs">{(m.bodega as any)?.nombre ?? '—'}</td>
                                                <td className="px-4 py-2">
                                                    <span className={cn('inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full',
                                                        m.tipo_movimiento === 'ENTRADA' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700')}>
                                                        {m.tipo_movimiento === 'ENTRADA'
                                                            ? <TrendingUp className="w-3 h-3" />
                                                            : <TrendingDown className="w-3 h-3" />}
                                                        {m.tipo_movimiento === 'ENTRADA' ? 'Llegada' : 'Salida'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold text-slate-800">{Number(m.cantidad).toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
                                                <td className="px-4 py-2 text-xs text-slate-500 max-w-xs truncate" title={m.motivo}>{m.motivo ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
