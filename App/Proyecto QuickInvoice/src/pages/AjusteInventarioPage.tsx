import { useState, useEffect } from 'react'
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
    TrendingUp,
    TrendingDown,
    AlertCircle,
    Package,
    Loader2,
    FileText,
    Info,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { BuscadorProducto, type ProductoResultado } from '../components/BuscadorProducto'

interface LineaAjuste {
    id: string                      // uuid local para key de React
    producto_id: string
    producto_nombre: string
    producto_codigo: string
    tipo: 'INGRESO' | 'EGRESO'
    cantidad: number | ''
    costo_unitario: number | ''     // opcional; relevante en INGRESO
    observacion: string             // descripción específica de esta línea
    stock_disponible: number | null // stock actual en la bodega seleccionada
}

const hoy = () => new Date().toISOString().split('T')[0]

function generarReferencia() {
    const d = new Date()
    const fecha = d.getFullYear().toString() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0')
    const rand = Math.floor(Math.random() * 900 + 100)
    return `AJ-${fecha}-${rand}`
}

function lineaVacia(): LineaAjuste {
    return {
        id:               crypto.randomUUID(),
        producto_id:      '',
        producto_nombre:  '',
        producto_codigo:  '',
        tipo:             'INGRESO',
        cantidad:         '',
        costo_unitario:   '',
        observacion:      '',
        stock_disponible: null,
    }
}

export function AjusteInventarioPage() {
    const { empresa }  = useAuth()
    const navigate     = useNavigate()

    // ── Catálogos
    const [bodegas,   setBodegas]   = useState<Bodega[]>([])
    const [productos, _setProductos] = useState<any[]>([])

    // ── Cabecera
    const [referencia,   setReferencia]   = useState(generarReferencia)
    const [fecha,        setFecha]        = useState(hoy)
    const [bodegaId,     setBodegaId]     = useState('')
    const [descripcion,  setDescripcion]  = useState('')

    // ── Detalle
    const [lineas, setLineas] = useState<LineaAjuste[]>([lineaVacia()])

    // ── Mapa stock por producto en la bodega activa (producto_id → cantidad)
    const [stockMap, setStockMap] = useState<Record<string, number>>({})

    const [saving,    setSaving]    = useState(false)
    const [errores,   setErrores]   = useState<string[]>([])

    // ── Draft
    const clearDraft = useFormDraft(
        'draft_ajuste_inventario',
        () => ({ referencia, fecha, bodegaId, descripcion, lineas }),
        (d) => {
            if (d.referencia)   setReferencia(d.referencia)
            if (d.fecha)        setFecha(d.fecha)
            if (d.bodegaId)     setBodegaId(d.bodegaId)
            if (d.descripcion)  setDescripcion(d.descripcion)
            if (d.lineas?.length) setLineas(d.lineas)
        },
        [referencia, fecha, bodegaId, descripcion, lineas],
    )

    useEffect(() => {
        if (empresa?.id) cargarCatalogos()
    }, [empresa?.id])

    // Recargar stock cuando cambia la bodega
    useEffect(() => {
        if (empresa?.id) cargarStockBodega()
    }, [bodegaId, empresa?.id])

    async function cargarCatalogos() {
        try {
            const bods = await bodegaService.listar(empresa!.id)
            setBodegas(bods)

            // Auto-seleccionar bodega principal
            const principal = bods.find(b => b.es_principal)
            if (principal && !bodegaId) setBodegaId(principal.id)
        } catch (e) {
            console.error('Error cargando catálogos:', e)
        }
    }

    async function cargarStockBodega() {
        if (!empresa?.id) return
        try {
            if (bodegaId) {
                const { data } = await supabase
                    .from('stock_bodega')
                    .select('producto_id, cantidad')
                    .eq('empresa_id', empresa.id)
                    .eq('bodega_id', bodegaId)
                const map: Record<string, number> = {}
                for (const r of (data ?? [])) map[r.producto_id] = Number(r.cantidad)
                setStockMap(map)
            } else {
                // Sin bodega: usar productos.stock
                const map: Record<string, number> = {}
                for (const p of productos) map[p.id] = Number(p.stock ?? 0)
                setStockMap(map)
            }
        } catch (e) {
            console.error('Error cargando stock:', e)
        }
    }

    // ── Helpers de línea ──────────────────────────────────────────────────────

    function actualizarLinea<K extends keyof LineaAjuste>(idx: number, campo: K, valor: LineaAjuste[K]) {
        setLineas(prev => {
            const copia = [...prev]
            copia[idx] = { ...copia[idx], [campo]: valor }
            // Al cambiar producto, rellenar nombre/código y stock
            if (campo === 'producto_id') {
                const prod = productos.find(p => p.id === valor)
                copia[idx].producto_nombre  = prod?.nombre  ?? ''
                copia[idx].producto_codigo  = prod?.codigo  ?? ''
                copia[idx].costo_unitario   = prod?.costo_promedio ?? ''
                copia[idx].stock_disponible = prod ? (stockMap[prod.id] ?? 0) : null
            }
            return copia
        })
    }

    function agregarLinea() {
        setLineas(prev => [...prev, lineaVacia()])
    }

    function eliminarLinea(idx: number) {
        setLineas(prev => prev.filter((_, i) => i !== idx))
    }

    // ── Validación y guardado ─────────────────────────────────────────────────

    function validar(): string[] {
        const errs: string[] = []
        if (!descripcion.trim())  errs.push('La descripción del ajuste es obligatoria.')
        if (!bodegaId)            errs.push('Debe seleccionar una bodega.')
        if (!fecha)               errs.push('La fecha es obligatoria.')

        const lineasValidas = lineas.filter(l => l.producto_id && Number(l.cantidad) > 0)
        if (lineasValidas.length === 0) errs.push('Debe ingresar al menos un producto con cantidad mayor a 0.')

        for (const l of lineasValidas) {
            if (l.tipo === 'EGRESO') {
                const disp = stockMap[l.producto_id] ?? 0
                if (Number(l.cantidad) > disp) {
                    errs.push(`"${l.producto_nombre}": stock insuficiente para egreso (disponible: ${disp}).`)
                }
            }
        }
        return errs
    }

    async function handleGuardar() {
        const errs = validar()
        setErrores(errs)
        if (errs.length > 0) return

        try {
            setSaving(true)
            const lineasValidas = lineas.filter(l => l.producto_id && Number(l.cantidad) > 0)

            for (const l of lineasValidas) {
                const motivoBase = `${l.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'} por ajuste — ${descripcion.trim()}`
                const motivo = l.observacion.trim()
                    ? `${motivoBase} | ${l.observacion.trim()}`
                    : motivoBase

                await kardexService.registrarMovimiento({
                    empresa_id:           empresa!.id,
                    producto_id:          l.producto_id,
                    bodega_id:            bodegaId || undefined,
                    fecha:                `${fecha}T12:00:00`,
                    tipo_movimiento:      l.tipo === 'INGRESO' ? 'ENTRADA' : 'SALIDA',
                    motivo,
                    documento_referencia: referencia,
                    cantidad:             Number(l.cantidad),
                    costo_unitario:       l.costo_unitario !== '' ? Number(l.costo_unitario) : undefined,
                })
            }

            clearDraft()
            alert(`Ajuste ${referencia} registrado correctamente (${lineasValidas.length} movimiento${lineasValidas.length !== 1 ? 's' : ''}).`)
            navigate('/kardex')
        } catch (e: any) {
            alert(`Error al guardar ajuste: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    // ── UI ────────────────────────────────────────────────────────────────────

    const inp = 'w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white'
    const bodegaActual = bodegas.find(b => b.id === bodegaId)
    const totalIngresos = lineas.filter(l => l.tipo === 'INGRESO' && Number(l.cantidad) > 0).reduce((s, l) => s + Number(l.cantidad), 0)
    const totalEgresos  = lineas.filter(l => l.tipo === 'EGRESO'  && Number(l.cantidad) > 0).reduce((s, l) => s + Number(l.cantidad), 0)

    return (
        <div className="space-y-6 max-w-6xl">

            {/* Encabezado */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Ajuste de Inventario</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Registra ingresos y egresos manuales de stock</p>
                </div>
                <button
                    onClick={handleGuardar}
                    disabled={saving}
                    className="btn btn-primary gap-2 shrink-0"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Guardando...' : 'Guardar Ajuste'}
                </button>
            </div>

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

            {/* ── Cabecera del ajuste ─────────────────────────────────────────── */}
            <div className="card p-6 space-y-5">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="p-2 bg-primary-50 text-primary-600 rounded-xl">
                        <FileText className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">Datos del Ajuste</h2>
                        <p className="text-xs text-slate-400">Completa la referencia, bodega y descripción</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Referencia */}
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            N.º de Referencia
                        </label>
                        <input
                            type="text"
                            className={inp}
                            value={referencia}
                            onChange={e => setReferencia(e.target.value)}
                            placeholder="AJ-YYYYMMDD-XXX"
                        />
                    </div>

                    {/* Fecha */}
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            Fecha <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="date"
                            className={inp}
                            value={fecha}
                            onChange={e => setFecha(e.target.value)}
                        />
                    </div>

                    {/* Bodega */}
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Warehouse className="w-3.5 h-3.5" />
                            Bodega <span className="text-red-500">*</span>
                        </label>
                        <select className={inp} value={bodegaId} onChange={e => setBodegaId(e.target.value)}>
                            <option value="">Seleccionar bodega...</option>
                            {bodegas.map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.codigo ? `[${b.codigo}] ` : ''}{b.nombre}{b.es_principal ? ' ★' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Descripción — campo importante */}
                <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        Descripción / Motivo del Ajuste <span className="text-red-500">*</span>
                        <span className="normal-case font-normal text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">
                            Requerida
                        </span>
                    </label>
                    <textarea
                        rows={3}
                        className={cn(inp, 'resize-none', !descripcion.trim() && errores.length > 0 && 'border-red-300 ring-2 ring-red-100')}
                        placeholder="Describe el motivo del ajuste: conteo físico, merma, deterioro, ajuste de apertura, corrección de stock, etc."
                        value={descripcion}
                        onChange={e => setDescripcion(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Info className="w-3 h-3" />
                        Este texto queda registrado en cada movimiento de kardex del ajuste.
                    </p>
                </div>

                {/* Info bodega + resumen rápido */}
                {bodegaActual && (
                    <div className="flex flex-wrap gap-4 pt-1">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Warehouse className="w-4 h-4 text-slate-400" />
                            <span className="font-medium">{bodegaActual.nombre}</span>
                            {bodegaActual.direccion && (
                                <span className="text-xs text-slate-300">— {bodegaActual.direccion}</span>
                            )}
                        </div>
                        {(totalIngresos > 0 || totalEgresos > 0) && (
                            <div className="flex gap-3 ml-auto text-sm">
                                {totalIngresos > 0 && (
                                    <span className="flex items-center gap-1 text-green-700 font-bold">
                                        <TrendingUp className="w-4 h-4" /> +{totalIngresos} u. ingreso
                                    </span>
                                )}
                                {totalEgresos > 0 && (
                                    <span className="flex items-center gap-1 text-red-600 font-bold">
                                        <TrendingDown className="w-4 h-4" /> -{totalEgresos} u. egreso
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Detalle de líneas ──────────────────────────────────────────── */}
            <div className="card overflow-visible">
                {/* Header tabla */}
                <div className="bg-slate-700 text-white px-4 py-3 flex items-center justify-between">
                    <span className="text-sm font-bold uppercase tracking-wider">Detalle de Productos</span>
                    <button
                        onClick={agregarLinea}
                        className="flex items-center gap-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" /> Agregar línea
                    </button>
                </div>

                {/* Cabeceras de columnas */}
                <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <span>Producto</span>
                    <span>Tipo</span>
                    <span>Cantidad</span>
                    <span>Costo Unit.</span>
                    <span>Observación</span>
                    <span></span>
                </div>

                {/* Filas */}
                <div className="divide-y divide-slate-100">
                    {lineas.map((linea, idx) => {
                        const stockDisp = linea.producto_id ? (stockMap[linea.producto_id] ?? 0) : null
                        const excede    = linea.tipo === 'EGRESO'
                            && Number(linea.cantidad) > 0
                            && stockDisp !== null
                            && Number(linea.cantidad) > stockDisp

                        return (
                            <div key={linea.id} className={cn(
                                'px-4 py-3 space-y-2',
                                excede && 'bg-red-50',
                                idx % 2 === 0 ? '' : 'bg-slate-50/40',
                            )}>
                                {/* FILA 1: Descripción del producto (ancho completo) */}
                                <div className="relative">
                                    {linea.producto_id ? (
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 leading-tight">
                                                    {linea.producto_codigo && <span className="font-mono text-xs text-slate-400 mr-2">[{linea.producto_codigo}]</span>}
                                                    {linea.producto_nombre}
                                                </p>
                                                {linea.producto_id && stockDisp !== null && (
                                                    <p className={cn('text-[11px] flex items-center gap-1 mt-0.5', excede ? 'text-red-600 font-bold' : 'text-slate-400')}>
                                                        <Package className="w-3 h-3" />
                                                        Stock actual: <span className="font-bold">{stockDisp}</span>
                                                        {excede && ' — insuficiente'}
                                                    </p>
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
                                                    ? { ...l, producto_id: p.id, producto_nombre: p.nombre, producto_codigo: p.codigo ?? '', costo_unitario: (p.costo_promedio || 0) }
                                                    : l))
                                            }}
                                        />
                                    )}
                                </div>

                                {/* FILA 2: Tipo | Cantidad | Costo | Observación | Eliminar */}
                                <div className="grid grid-cols-[auto_1fr_1fr_2fr_auto] gap-2 items-center">
                                    {/* Tipo */}
                                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-bold">
                                        <button type="button" onClick={() => actualizarLinea(idx, 'tipo', 'INGRESO')}
                                            className={cn('px-3 py-1.5 flex items-center gap-1 transition-colors',
                                                linea.tipo === 'INGRESO' ? 'bg-green-500 text-white' : 'bg-white text-slate-500 hover:bg-green-50')}>
                                            <TrendingUp className="w-3.5 h-3.5" /> Ingreso
                                        </button>
                                        <button type="button" onClick={() => actualizarLinea(idx, 'tipo', 'EGRESO')}
                                            className={cn('px-3 py-1.5 flex items-center gap-1 transition-colors',
                                                linea.tipo === 'EGRESO' ? 'bg-red-500 text-white' : 'bg-white text-slate-500 hover:bg-red-50')}>
                                            <TrendingDown className="w-3.5 h-3.5" /> Egreso
                                        </button>
                                    </div>
                                    {/* Cantidad */}
                                    <input type="number" min="0.001" step="0.001" placeholder="Cant."
                                        className={cn(inp, 'text-right text-sm', excede && 'border-red-300 bg-red-50')}
                                        value={linea.cantidad}
                                        onChange={e => actualizarLinea(idx, 'cantidad', e.target.value === '' ? '' : Number(e.target.value))} />
                                    {/* Costo */}
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                        <input type="number" min="0" step="0.0001" placeholder="Costo"
                                            className={cn(inp, 'pl-7 text-right text-sm', linea.tipo === 'EGRESO' && 'opacity-40 pointer-events-none')}
                                            value={linea.costo_unitario} disabled={linea.tipo === 'EGRESO'}
                                            onChange={e => actualizarLinea(idx, 'costo_unitario', e.target.value === '' ? '' : Number(e.target.value))} />
                                    </div>
                                    {/* Observación */}
                                    <input type="text" placeholder="Observación (opcional)"
                                        className={cn(inp, 'text-sm')}
                                        value={linea.observacion}
                                        onChange={e => actualizarLinea(idx, 'observacion', e.target.value)} />
                                    {/* Eliminar */}
                                    <button type="button" onClick={() => eliminarLinea(idx)}
                                        disabled={lineas.length === 1}
                                        title="Eliminar línea"
                                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Footer agregar */}
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
                    <button
                        onClick={agregarLinea}
                        className="flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Agregar otro producto
                    </button>
                </div>
            </div>

            {/* ── Nota informativa ──────────────────────────────────────────── */}
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex gap-3">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="text-xs text-slate-500 space-y-1">
                    <p><span className="font-bold text-green-600">Ingreso:</span> aumenta el stock en la bodega. El costo unitario ingresado actualiza el costo promedio ponderado del producto.</p>
                    <p><span className="font-bold text-red-600">Egreso:</span> disminuye el stock en la bodega. Se valora al costo promedio actual.</p>
                    <p>Todos los movimientos quedan registrados en el <span className="font-bold text-slate-700">Kardex</span> con la descripción y referencia del ajuste.</p>
                </div>
            </div>

            {/* Botón guardar duplicado al pie */}
            <div className="flex justify-end pt-2">
                <button
                    onClick={handleGuardar}
                    disabled={saving}
                    className="btn btn-primary gap-2"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Guardando...' : 'Guardar Ajuste'}
                </button>
            </div>
        </div>
    )
}
