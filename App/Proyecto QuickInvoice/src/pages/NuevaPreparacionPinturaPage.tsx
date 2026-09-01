import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { HelpButton } from '../components/help/HelpButton'
import { useFormDraft } from '../hooks/useFormDraft'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
    preparacionPinturaService,
    type PreparacionInput,
    type PreparacionInsumo,
    type TipoInsumo,
    type PreparacionPintura,
} from '../services/preparacionPinturaService'
import { formatCurrency } from '../lib/utils'
import {
    Plus, Trash2, Search, AlertTriangle, CheckCircle2,
    Loader2, ArrowLeft, FlaskConical, Calculator,
} from 'lucide-react'

const UNIDADES_PRODUCTO = ['1L', '1/2L', '1/4L', '1/8L', '1G', '1/2G'] as const
const UNIDADES_INSUMO_SUGERIDAS = ['L', 'G', 'mL', 'kg', 'g', 'oz'] as const

interface InsumoRow {
    tipo: TipoInsumo
    producto_id: string
    nombre: string
    codigo: string
    cantidad: number
    unidad: string
    costo_unitario: number
    costo_total: number
    // Precio de venta del producto elegido (solo referencia visual para
    // insumos tipo BASE — no participa en el costeo ni en Kardex).
    precio_venta: number
    // búsqueda
    search: string
    results: any[]
    searching: boolean
    dropdownOpen: boolean
}

const INSUMO_VACIO = (tipo: TipoInsumo = 'BASE'): InsumoRow => ({
    tipo,
    producto_id: '',
    nombre: '',
    codigo: '',
    cantidad: 1,
    unidad: 'L',
    costo_unitario: 0,
    costo_total: 0,
    precio_venta: 0,
    search: '',
    results: [],
    searching: false,
    dropdownOpen: false,
})

export function NuevaPreparacionPinturaPage() {
    const { empresa, profile } = useAuth() as any
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()

    // Si se entra desde Nueva Factura o desde Proforma (botón "Preparar Pintura"),
    // Cancelar y el flujo de guardado deben regresar ahí — no al listado general.
    const origen = searchParams.get('origen') as 'factura' | 'proforma' | null
    const urlOrigen = origen === 'factura' ? '/nueva-factura' : origen === 'proforma' ? '/proformas' : '/preparaciones-pintura'

    // Estado de la preparación
    const [insumos, setInsumos] = useState<InsumoRow[]>([INSUMO_VACIO('BASE'), INSUMO_VACIO('MEZCLA')])
    const [descripcion, setDescripcion] = useState('')
    const [unidad, setUnidad] = useState<string>('1L')
    const [cantidadProducida, setCantidadProducida] = useState(1)
    const [precioConIva, setPrecioConIva] = useState('')

    // Producto de referencia (para IVA)
    const [productoRef, setProductoRef] = useState<{ id: string; nombre: string; iva_porcentaje: number } | null>(null)
    const [cargandoRef, setCargandoRef] = useState(false)
    const [codigoPrep, setCodigoPrep] = useState<string>('')

    // Estado del proceso
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState<PreparacionPintura | null>(null)

    // Borrador persistente en sessionStorage
    const clearDraft = useFormDraft(
        'draft_prep_pintura',
        () => ({
            insumos: insumos.map(r => ({
                tipo: r.tipo,
                producto_id: r.producto_id,
                nombre: r.nombre,
                codigo: r.codigo,
                cantidad: r.cantidad,
                costo_unitario: r.costo_unitario,
                costo_total: r.costo_total,
                precio_venta: r.precio_venta,
            })),
            descripcion,
            unidad,
            cantidadProducida,
            precioConIva,
        }),
        (draft: any) => {
            if (draft.insumos?.length) {
                setInsumos(draft.insumos.map((r: any) => ({
                    ...INSUMO_VACIO(r.tipo),
                    ...r,
                    search: r.nombre || '',
                })))
            }
            if (draft.descripcion) setDescripcion(draft.descripcion)
            if (draft.unidad) setUnidad(draft.unidad)
            if (draft.cantidadProducida) setCantidadProducida(draft.cantidadProducida)
            if (draft.precioConIva) setPrecioConIva(draft.precioConIva)
        },
        [insumos, descripcion, unidad, cantidadProducida, precioConIva],
    )

    // Cargar producto de referencia según codigo_prep_pintura de la empresa
    useEffect(() => {
        if (!empresa?.id) return
        const codigo = empresa.codigo_prep_pintura as string | null
        if (!codigo) return
        setCodigoPrep(codigo)
        setCargandoRef(true)
        supabase
            .from('productos')
            .select('id, nombre, iva_porcentaje')
            .eq('empresa_id', empresa.id)
            .ilike('codigo', codigo)
            .eq('activo', true)
            .maybeSingle()
            .then(({ data }) => {
                setProductoRef(data ?? null)
                setCargandoRef(false)
            })
    }, [empresa?.id])

    // Cálculos derivados
    const costoTotal  = insumos.reduce((s, i) => s + i.costo_total, 0)
    const ivaPct      = productoRef?.iva_porcentaje ?? 15
    const pConIva     = parseFloat(precioConIva) || 0
    const pSinIva     = pConIva > 0 ? parseFloat((pConIva / (1 + ivaPct / 100)).toFixed(2)) : 0
    const ivaValor    = parseFloat((pConIva - pSinIva).toFixed(2))

    // ── Búsqueda de productos para insumos ───────────────────────────────────
    const searchInsumo = useCallback(
        async (idx: number, texto: string) => {
            if (!empresa?.id) return
            setInsumos(prev => prev.map((r, i) => i === idx ? { ...r, search: texto, searching: true, dropdownOpen: true } : r))
            const pattern = '%' + texto + '%'
            const { data } = await supabase
                .from('productos')
                .select('id, nombre, codigo, costo_promedio, precio_venta, maneja_stock, stock')
                .eq('empresa_id', empresa.id)
                .eq('activo', true)
                .eq('maneja_stock', true)
                .or(`nombre.ilike.${pattern},codigo.ilike.${pattern}`)
                .order('nombre')
                .limit(30)
            setInsumos(prev => prev.map((r, i) =>
                i === idx ? { ...r, results: data ?? [], searching: false } : r
            ))
        },
        [empresa?.id]
    )

    useEffect(() => {
        const timers: ReturnType<typeof setTimeout>[] = []
        insumos.forEach((row, idx) => {
            if (!row.searching && row.search.length >= 2) {
                timers[idx] = setTimeout(() => searchInsumo(idx, row.search), 300)
            }
        })
        return () => timers.forEach(t => clearTimeout(t))
    }, [insumos.map(r => r.search).join('|')])

    function selectProductoInsumo(idx: number, prod: any) {
        setInsumos(prev => prev.map((r, i) => {
            if (i !== idx) return r
            const ct = parseFloat(((r.cantidad || 1) * (prod.costo_promedio || 0)).toFixed(2))
            return {
                ...r,
                producto_id:   prod.id,
                nombre:        prod.nombre,
                codigo:        prod.codigo,
                costo_unitario: prod.costo_promedio || 0,
                costo_total:   ct,
                precio_venta:  prod.precio_venta || 0,
                search:        prod.nombre,
                results:       [],
                dropdownOpen:  false,
            }
        }))
    }

    function updateCantidad(idx: number, cant: number) {
        setInsumos(prev => prev.map((r, i) => {
            if (i !== idx) return r
            const ct = parseFloat((cant * r.costo_unitario).toFixed(2))
            return { ...r, cantidad: cant, costo_total: ct }
        }))
    }

    function updateUnidad(idx: number, u: string) {
        setInsumos(prev => prev.map((r, i) => i === idx ? { ...r, unidad: u } : r))
    }

    function updateTipo(idx: number, tipo: TipoInsumo) {
        setInsumos(prev => prev.map((r, i) => i === idx ? { ...r, tipo } : r))
    }

    function addInsumo() {
        setInsumos(prev => [...prev, INSUMO_VACIO('MEZCLA')])
    }

    function removeInsumo(idx: number) {
        if (insumos.length <= 1) return
        setInsumos(prev => prev.filter((_, i) => i !== idx))
    }

    // ── Validación ───────────────────────────────────────────────────────────
    function validate(): string | null {
        if (!codigoPrep) return 'Configure el Código de Artículo en Ajustes > Configuración > Empresa antes de usar esta función.'
        if (!productoRef) return `No se encontró el artículo con código "${codigoPrep}" en el catálogo. Créelo primero.`
        if (insumos.some(r => !r.producto_id)) return 'Seleccione un artículo para cada insumo.'
        if (insumos.some(r => r.cantidad <= 0)) return 'Las cantidades deben ser mayores a cero.'
        if (!descripcion.trim()) return 'Ingrese la descripción del producto final.'
        if (pConIva <= 0) return 'Ingrese el precio de venta con IVA.'
        if (pSinIva <= 0) return 'El precio calculado sin IVA no es válido.'
        return null
    }

    // ── Guardar ──────────────────────────────────────────────────────────────
    async function guardar(accion: 'facturar' | 'proformar' | 'guardar') {
        const err = validate()
        if (err) { alert(err); return }

        const input: PreparacionInput = {
            empresa_id:        empresa!.id,
            descripcion:       descripcion.trim(),
            cantidad_producida: cantidadProducida,
            unidad,
            costo_total:       costoTotal,
            iva_porcentaje:    ivaPct,
            precio_con_iva:    pConIva,
            precio_sin_iva:    pSinIva,
            iva_valor:         ivaValor,
            codigo_producto:   codigoPrep,
            created_by:        profile?.id ?? null,
            insumos: insumos.map(r => ({
                tipo:          r.tipo,
                producto_id:   r.producto_id,
                descripcion:   r.nombre,
                cantidad:      r.cantidad,
                unidad:        r.unidad,
                costo_unitario: r.costo_unitario,
                costo_total:   r.costo_total,
            })) as Omit<PreparacionInsumo, 'id' | 'preparacion_id' | 'producto'>[],
        }

        try {
            setSaving(true)
            const prep = await preparacionPinturaService.crear(input)
            clearDraft()
            setSaved(prep)

            if (accion === 'facturar') {
                navigate(`/nueva-factura?prep_id=${prep.id}`)
            } else if (accion === 'proformar') {
                navigate(`/proformas?prep_id=${prep.id}`)
            }
        } catch (e: any) {
            alert('Error al guardar: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    // ── Pantalla de éxito (solo guardar) ─────────────────────────────────────
    if (saved) {
        return (
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center space-y-4">
                    <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
                    <h2 className="text-xl font-bold text-emerald-800">Preparación guardada</h2>
                    <p className="text-sm text-emerald-700">{saved.descripcion}</p>
                    <p className="text-xs text-emerald-600">
                        Costo: {formatCurrency(saved.costo_total)} · Precio c/IVA: {formatCurrency(saved.precio_con_iva ?? 0)}
                    </p>
                    <div className="flex flex-wrap justify-center gap-3 pt-2">
                        <button
                            onClick={() => navigate(`/nueva-factura?prep_id=${saved.id}`)}
                            className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 transition-colors"
                        >
                            {origen === 'factura' ? 'Volver a la Factura' : 'Facturar ahora'}
                        </button>
                        <button
                            onClick={() => navigate(`/proformas?prep_id=${saved.id}`)}
                            className="px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-colors"
                        >
                            {origen === 'proforma' ? 'Volver a la Proforma' : 'Proformar'}
                        </button>
                        {!origen && (
                            <button
                                onClick={() => navigate('/preparaciones-pintura')}
                                className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors"
                            >
                                Ver preparaciones
                            </button>
                        )}
                        <button
                            onClick={() => {
                                clearDraft()
                                setSaved(null)
                                setInsumos([INSUMO_VACIO('BASE'), INSUMO_VACIO('MEZCLA')])
                                setDescripcion('')
                                setPrecioConIva('')
                                setUnidad('1L')
                                setCantidadProducida(1)
                            }}
                            className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors"
                        >
                            Nueva preparación
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Encabezado */}
            <div className="flex items-center gap-4">
                <button onClick={() => navigate(urlOrigen)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5 text-slate-500" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FlaskConical className="w-6 h-6 text-primary-600" />
                        Nueva Preparación de Pintura
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Mezcla de colores — mini-producción
                        {origen === 'factura' && ' · agregando a la factura en curso'}
                        {origen === 'proforma' && ' · agregando a la proforma en curso'}
                    </p>
                </div>
                <HelpButton pageKey="preparaciones-pintura" />
            </div>

            {/* Alerta si no hay código configurado */}
            {!codigoPrep && !cargandoRef && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-amber-800">Código de artículo no configurado</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                            Vaya a <strong>Ajustes › Configuración › Empresa</strong> y configure el campo
                            "Código Artículo — Preparación de Pinturas" antes de continuar.
                        </p>
                    </div>
                </div>
            )}

            {cargandoRef && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando configuración…
                </div>
            )}

            {!cargandoRef && codigoPrep && !productoRef && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">
                        No se encontró el artículo <strong>"{codigoPrep}"</strong> en el catálogo.
                        Créelo primero en Artículos antes de continuar.
                    </p>
                </div>
            )}

            {/* ── Insumos ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Insumos de la Preparación</h2>
                </div>
                <div className="p-6 space-y-4">
                    {insumos.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-3 items-start">
                            {/* Tipo */}
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tipo</label>
                                <select
                                    value={row.tipo}
                                    onChange={e => updateTipo(idx, e.target.value as TipoInsumo)}
                                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="BASE">Base</option>
                                    <option value="MEZCLA">Mezcla</option>
                                </select>
                            </div>

                            {/* Artículo */}
                            <div className="col-span-4 relative">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Artículo</label>
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o código…"
                                        value={row.search}
                                        onChange={e => {
                                            const v = e.target.value
                                            setInsumos(prev => prev.map((r, i) =>
                                                i === idx ? { ...r, search: v, producto_id: '', nombre: '', dropdownOpen: v.length >= 2 } : r
                                            ))
                                        }}
                                        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                    {row.searching && (
                                        <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    )}
                                </div>
                                {row.dropdownOpen && row.results.length > 0 && (
                                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                        {row.results.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => selectProductoInsumo(idx, p)}
                                                className="w-full text-left px-4 py-2.5 hover:bg-primary-50 transition-colors"
                                            >
                                                <span className="text-sm font-semibold text-slate-800">{p.nombre}</span>
                                                <span className="text-xs text-slate-400 ml-2">{p.codigo}</span>
                                                <span className="text-xs text-slate-500 ml-2">
                                                    Stock: {p.stock} · {row.tipo === 'BASE'
                                                        ? `Precio venta: ${formatCurrency(p.precio_venta || 0)}`
                                                        : `Costo: ${formatCurrency(p.costo_promedio || 0)}`}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {row.producto_id && (
                                    <p className="text-[10px] text-emerald-600 mt-0.5">
                                        ✓ {row.nombre}
                                        {row.tipo === 'BASE' && ` · Precio venta: ${formatCurrency(row.precio_venta || 0)}`}
                                    </p>
                                )}
                            </div>

                            {/* Cantidad */}
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Cantidad</label>
                                <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={row.cantidad}
                                    onChange={e => updateCantidad(idx, parseFloat(e.target.value) || 0)}
                                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-500 text-right"
                                />
                            </div>

                            {/* Unidad — texto libre, referencial */}
                            <div className="col-span-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unid.</label>
                                <input
                                    type="text"
                                    list={`unid-list-${idx}`}
                                    placeholder="L"
                                    value={row.unidad === 'L' && !row.producto_id ? '' : row.unidad}
                                    onChange={e => updateUnidad(idx, e.target.value || 'L')}
                                    className="w-full px-2 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-500 text-center"
                                />
                                <datalist id={`unid-list-${idx}`}>
                                    {UNIDADES_INSUMO_SUGERIDAS.map(u => <option key={u} value={u} />)}
                                </datalist>
                            </div>

                            {/* Costo unitario */}
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">C. Unit.</label>
                                <div className="px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 text-sm text-right text-slate-600 font-mono">
                                    {formatCurrency(row.costo_unitario)}
                                </div>
                            </div>

                            {/* Costo total + eliminar */}
                            <div className="col-span-1 flex items-end gap-1">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">C. Total</label>
                                    <div className="px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 text-sm text-right text-slate-800 font-mono font-semibold">
                                        {formatCurrency(row.costo_total)}
                                    </div>
                                </div>
                                {insumos.length > 1 && (
                                    <button
                                        onClick={() => removeInsumo(idx)}
                                        className="p-2.5 mb-0 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={addInsumo}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Agregar insumo
                    </button>

                    {/* Total costo */}
                    <div className="flex justify-end pt-2 border-t border-slate-100">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                            <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">Costo Total de Producción</span>
                            <p className="text-2xl font-black text-amber-800 mt-0.5">{formatCurrency(costoTotal)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Producto final ──────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Producto Final</h2>
                </div>
                <div className="p-6 space-y-5">
                    {/* Descripción */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                            Descripción del producto <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            maxLength={200}
                            placeholder="Ej: 1 Litro de pintura acrílica para vehículos color Verde"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                            value={descripcion}
                            onChange={e => setDescripcion(e.target.value)}
                        />
                        <p className="text-xs text-slate-400 mt-1">Este texto aparecerá en la factura/proforma tal como lo ingrese.</p>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        {/* Unidad de producción */}
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Presentación</label>
                            <select
                                value={unidad}
                                onChange={e => setUnidad(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                            >
                                {UNIDADES_PRODUCTO.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>

                        {/* Cantidad producida */}
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Cant. producida</label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={cantidadProducida}
                                onChange={e => setCantidadProducida(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-right"
                            />
                        </div>

                        {/* Artículo de referencia */}
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Artículo en factura</label>
                            <div className="px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-600">
                                {productoRef
                                    ? <><span className="font-semibold text-slate-800">{codigoPrep}</span> · {productoRef.nombre}</>
                                    : <span className="text-slate-400 italic">No configurado</span>
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Precio ──────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-primary-600" />
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Precio de Venta</h2>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-2 gap-6 items-start">
                        {/* Entrada: precio con IVA */}
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Precio de Venta CON IVA <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={precioConIva}
                                    onChange={e => setPrecioConIva(e.target.value)}
                                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-right text-lg font-semibold"
                                />
                            </div>
                            <p className="text-xs text-slate-400 mt-1">IVA incluido — ingrese el precio que cobrará al cliente.</p>
                        </div>

                        {/* Desglose calculado */}
                        <div className="space-y-3 pt-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Costo de Producción:</span>
                                <span className="font-semibold text-amber-700">{formatCurrency(costoTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm border-t pt-2">
                                <span className="text-slate-500">Precio sin IVA:</span>
                                <span className="font-semibold">{pSinIva > 0 ? formatCurrency(pSinIva) : '–'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">IVA {ivaPct}%:</span>
                                <span className="font-semibold">{ivaValor > 0 ? formatCurrency(ivaValor) : '–'}</span>
                            </div>
                            <div className="flex justify-between text-base font-black border-t pt-2">
                                <span>Precio con IVA:</span>
                                <span className="text-primary-700">{pConIva > 0 ? formatCurrency(pConIva) : '–'}</span>
                            </div>
                            {pSinIva > 0 && costoTotal > 0 && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-400">Margen bruto:</span>
                                    <span className={pSinIva >= costoTotal ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                                        {formatCurrency(pSinIva - costoTotal)} ({costoTotal > 0 ? ((pSinIva - costoTotal) / costoTotal * 100).toFixed(1) : '0'}%)
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Acciones ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 justify-end pb-8">
                <button
                    onClick={() => navigate(urlOrigen)}
                    className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
                >
                    Cancelar
                </button>
                <button
                    onClick={() => guardar('guardar')}
                    disabled={saving || !productoRef}
                    className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Solo Guardar'}
                </button>
                {origen !== 'factura' && (
                    <button
                        onClick={() => guardar('proformar')}
                        disabled={saving || !productoRef}
                        className="px-5 py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : origen === 'proforma' ? 'Guardar y Volver a la Proforma' : 'Guardar y Proformar'}
                    </button>
                )}
                {origen !== 'proforma' && (
                    <button
                        onClick={() => guardar('facturar')}
                        disabled={saving || !productoRef}
                        className="px-5 py-3 rounded-xl bg-primary-600 text-white font-semibold text-sm hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : origen === 'factura' ? 'Guardar y Volver a la Factura' : 'Guardar y Facturar'}
                    </button>
                )}
            </div>
        </div>
    )
}
