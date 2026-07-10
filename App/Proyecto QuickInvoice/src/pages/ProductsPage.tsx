import { useState, useEffect } from 'react'
import { productoService } from '../services/productoService'
import type { Producto, Categoria } from '../services/productoService'
import { subproductoService, type Subproducto } from '../services/subproductoService'
import { contableConfigService, type CuentaLP } from '../services/contableConfigService'
import { lineaService, type Linea } from '../services/lineaService'
import { subcategoriaService, type Subcategoria } from '../services/subcategoriaService'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { PrecioVolumenModal } from '../components/PrecioVolumenModal'
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    Package,
    X,
    Save,
    Layers,
    ToggleLeft,
    ToggleRight,
    TrendingUp,
    BookOpen,
    Loader2,
    RotateCcw,
    EyeOff,
} from 'lucide-react'

// ─── Modal de Subproductos ────────────────────────────────────────────────────

function SubproductosPanel({
    producto,
    empresaId,
    onClose,
}: {
    producto: Producto & { id: string }
    empresaId: string
    onClose: () => void
}) {
    const [subs, setSubs] = useState<Subproducto[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [editingSub, setEditingSub] = useState<Partial<Subproducto> | null>(null)
    // String separado para el input del factor (evita que "0." colapse a 0 o 1)
    const [factorStr, setFactorStr] = useState<string>('1')

    useEffect(() => {
        loadSubs()
    }, [producto.id])

    async function loadSubs() {
        setLoading(true)
        try {
            setSubs(await subproductoService.getByProducto(producto.id))
        } finally {
            setLoading(false)
        }
    }

    function nuevoSub() {
        setFactorStr('1')
        setEditingSub({
            producto_id: producto.id,
            empresa_id: empresaId,
            nombre: '',
            precio_sin_iva: 0,
            factor_conversion: 1,
            estado: true,
        })
    }

    async function handleSave() {
        if (!editingSub) return
        if (!editingSub.nombre?.trim()) return alert('Ingrese un nombre para la presentación')
        if (!editingSub.factor_conversion || Number(editingSub.factor_conversion) <= 0)
            return alert('El factor de conversión debe ser mayor a 0')

        setSaving(true)
        try {
            if (editingSub.id) {
                await subproductoService.update(editingSub.id, editingSub)
            } else {
                await subproductoService.create({
                    producto_id: producto.id,
                    empresa_id: empresaId,
                    nombre: editingSub.nombre!,
                    precio_sin_iva: Number(editingSub.precio_sin_iva || 0),
                    factor_conversion: Number(editingSub.factor_conversion!),
                    estado: true,
                })
            }
            setEditingSub(null)
            await loadSubs()
        } catch (e: any) {
            alert('Error al guardar: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleToggle(sub: Subproducto) {
        try {
            await subproductoService.toggleEstado(sub.id, !sub.estado)
            await loadSubs()
        } catch {
            alert('Error al cambiar estado')
        }
    }

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-orange-50">
                    <div className="flex items-center gap-3">
                        <Layers className="w-5 h-5 text-orange-500" />
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Presentaciones / Subproductos</h2>
                            <p className="text-xs text-slate-500 font-medium">
                                Producto maestro: <span className="text-orange-600 font-bold">{producto.nombre}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabla de subproductos */}
                <div className="p-6 space-y-4">
                    {loading ? (
                        <p className="text-center text-slate-400 py-6">Cargando...</p>
                    ) : (
                        <div className="rounded-xl border border-slate-100 overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="px-4 py-3 font-medium">Nombre presentación</th>
                                        <th className="px-4 py-3 font-medium text-right">Precio s/IVA</th>
                                        <th className="px-4 py-3 font-medium text-right">Factor</th>
                                        <th className="px-4 py-3 font-medium text-center">Estado</th>
                                        <th className="px-4 py-3 font-medium text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {subs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                                                Sin presentaciones. Agrega la primera.
                                            </td>
                                        </tr>
                                    ) : subs.map(sub => (
                                        <tr key={sub.id} className={`${!sub.estado ? 'opacity-40' : ''} hover:bg-slate-50`}>
                                            <td className="px-4 py-3 font-medium text-slate-900">{sub.nombre}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(sub.precio_sin_iva)}</td>
                                            <td className="px-4 py-3 text-right font-mono text-slate-600">{Number(sub.factor_conversion).toFixed(6).replace(/\.?0+$/, '')}</td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => handleToggle(sub)} title={sub.estado ? 'Desactivar' : 'Activar'}>
                                                    {sub.estado
                                                        ? <ToggleRight className="w-5 h-5 text-emerald-500 mx-auto" />
                                                        : <ToggleLeft className="w-5 h-5 text-slate-300 mx-auto" />
                                                    }
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => { setFactorStr(String(sub.factor_conversion)); setEditingSub(sub) }}
                                                    className="p-1.5 hover:bg-orange-50 rounded-lg text-slate-400 hover:text-orange-600 transition-all"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Formulario inline de edición */}
                    {editingSub && (
                        <div className="border border-orange-200 rounded-xl p-4 bg-orange-50 space-y-3">
                            <h3 className="text-sm font-bold text-orange-700">
                                {editingSub.id ? 'Editar presentación' : 'Nueva presentación'}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Galón, 1/2 Litro..."
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm"
                                        value={editingSub.nombre || ''}
                                        onChange={e => setEditingSub(p => ({ ...p!, nombre: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Precio sin IVA</label>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        min="0"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm"
                                        value={editingSub.precio_sin_iva ?? 0}
                                        onChange={e => setEditingSub(p => ({ ...p!, precio_sin_iva: parseFloat(e.target.value) || 0 }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                        Factor conversión
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm font-mono"
                                        value={factorStr}
                                        onChange={e => {
                                            const v = e.target.value
                                            setFactorStr(v)
                                            const n = parseFloat(v)
                                            if (!isNaN(n) && n > 0) {
                                                setEditingSub(p => ({ ...p!, factor_conversion: n }))
                                            }
                                        }}
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Fracción del producto maestro (ej: 1 galón = 0.02 si 1 tanque = 50 gal)
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button
                                    onClick={() => setEditingSub(null)}
                                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Save className="w-4 h-4" />
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    )}

                    {!editingSub && (
                        <button
                            onClick={nuevoSub}
                            className="w-full py-2 rounded-xl border-2 border-dashed border-orange-200 text-orange-500 font-bold text-sm hover:bg-orange-50 transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar presentación
                        </button>
                    )}
                </div>

                <div className="px-6 pb-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── ProductsPage ────────────────────────────────────────────────────────────

export function ProductsPage() {
    const { empresa } = useAuth()
    const [productos, setProductos] = useState<any[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [lineas, setLineas] = useState<Linea[]>([])
    const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
    const [loading, setLoading] = useState(false)  // sin carga inicial
    const [search, setSearch] = useState('')
    const [selectedCategoria, setSelectedCategoria] = useState<string>('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Partial<Producto> | null>(null)
    const [subproductosProducto, setSubproductosProducto] = useState<(Producto & { id: string }) | null>(null)
    const [precioVolumenProducto, setPrecioVolumenProducto] = useState<any>(null)
    const [cuentasLP, setCuentasLP] = useState<CuentaLP[]>([])
    const [showBaja, setShowBaja] = useState(false)
    const [productosBaja, setProductosBaja] = useState<any[]>([])
    const [loadingBaja, setLoadingBaja] = useState(false)
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const [showConIva, setShowConIva] = useState(false)

    const applyIva = (base: number | null | undefined, ivaPct: number) => {
        if (!base || base === 0) return '—'
        const val = showConIva ? Math.round(base * (1 + ivaPct / 100) * 100) / 100 : base
        return formatCurrency(val)
    }

    // Cargar categorías, líneas, subcategorías y cuentas al montar
    useEffect(() => {
        if (!empresa?.id) return
        Promise.all([
            productoService.getCategorias(empresa.id),
            contableConfigService.getCuentas((empresa as any)?.ruc),
            lineaService.getLineas(empresa.id).catch(() => [] as Linea[]),
            subcategoriaService.getSubcategorias(empresa.id).catch(() => [] as Subcategoria[]),
        ]).then(([catData, cuentas, lineasData, subcatsData]) => {
            setCategorias(catData)
            setCuentasLP(cuentas)
            setLineas(lineasData)
            setSubcategorias(subcatsData)
        }).catch(console.error)
    }, [empresa?.id])

    // Búsqueda server-side: se ejecuta solo al presionar Buscar o Enter
    async function ejecutarBusqueda() {
        if (!empresa?.id) return
        if (!search.trim() && !selectedCategoria) { setProductos([]); return }
        setLoading(true)
        try {
            let q = supabase
                .from('productos').select('*, categorias(nombre)')
                .eq('empresa_id', empresa.id).eq('activo', true).order('nombre')
            if (search.trim()) {
                const sq = '%' + search.trim().replace(/\*/g, '%') + '%'
                q = q.or(`nombre.ilike.${sq},codigo.ilike.${sq}`)
            }
            if (selectedCategoria) q = q.eq('categoria_id', selectedCategoria)
            const { data } = await q
            const catMap: Record<string, string> = {}
            for (const c of categorias) catMap[c.id] = c.nombre
            setProductos((data || []).map((p: any) => ({
                ...p,
                categorias: p.categorias || (p.categoria_id ? { nombre: catMap[p.categoria_id] || '' } : null)
            })))
        } catch (e) { console.error(e) } finally { setLoading(false) }
    }

    // Recarga la lista con el criterio actual (después de guardar/eliminar)
    async function loadData() { await ejecutarBusqueda() }

    async function cargarProductosBaja() {
        if (!empresa?.id) return
        setLoadingBaja(true)
        try {
            const { data } = await supabase
                .from('productos').select('*, categorias(nombre)')
                .eq('empresa_id', empresa.id).eq('activo', false).order('nombre')
            const catMap: Record<string, string> = {}
            for (const c of categorias) catMap[c.id] = c.nombre
            setProductosBaja((data || []).map((p: any) => ({
                ...p,
                categorias: p.categorias || (p.categoria_id ? { nombre: catMap[p.categoria_id] || '' } : null)
            })))
        } catch (e) { console.error(e) } finally { setLoadingBaja(false) }
    }

    async function restaurarProducto(id: string) {
        setRestoringId(id)
        try {
            await productoService.updateProducto(id, { activo: true } as any)
            setProductosBaja(prev => prev.filter(p => p.id !== id))
        } catch (e: any) {
            alert('Error al restaurar: ' + e.message)
        } finally {
            setRestoringId(null)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!empresa?.id || !editingProduct) return

        // Campos explícitos — excluye joins y campos calculados que Supabase rechaza
        const campos = {
            codigo:                    editingProduct.codigo                    ?? null,
            nombre:                    editingProduct.nombre                    ?? '',
            descripcion:               editingProduct.descripcion               ?? null,
            precio_venta:              editingProduct.precio_venta              ?? 0,
            precio2:                   editingProduct.precio2                   ?? null,
            precio3:                   editingProduct.precio3                   ?? null,
            precio4:                   editingProduct.precio4                   ?? null,
            categoria_id:              editingProduct.categoria_id              ?? undefined,
            linea_id:                  editingProduct.linea_id                  ?? null,
            subcategoria_id:           editingProduct.subcategoria_id           ?? null,
            iva_porcentaje:            editingProduct.iva_porcentaje            ?? 15,
            maneja_stock:              editingProduct.maneja_stock              ?? true,
            imagen_url:                editingProduct.imagen_url                ?? null,
            cod_proveedor:             editingProduct.cod_proveedor             ?? null,
            unidades_x_presentacion:   editingProduct.unidades_x_presentacion  ?? null,
            minimo:                    editingProduct.minimo                    ?? null,
            ubicacion:                 editingProduct.ubicacion                 ?? null,
            cuenta_ingreso_id:         editingProduct.cuenta_ingreso_id         ?? null,
            cuenta_ingreso_codigo:     editingProduct.cuenta_ingreso_codigo     ?? null,
            cuenta_ingreso_nombre:     editingProduct.cuenta_ingreso_nombre     ?? null,
            cuenta_costo_id:           editingProduct.cuenta_costo_id           ?? null,
            cuenta_costo_codigo:       editingProduct.cuenta_costo_codigo       ?? null,
            cuenta_costo_nombre:       editingProduct.cuenta_costo_nombre       ?? null,
        }

        try {
            if (editingProduct.id) {
                await productoService.updateProducto(editingProduct.id, campos)
            } else {
                await productoService.createProducto({
                    ...campos,
                    empresa_id: empresa.id,
                    activo: true
                } as any)
            }
            setIsModalOpen(false)
            setEditingProduct(null)
            loadData()
        } catch (error: any) {
            console.error('Error saving product:', error)
            alert('Error al guardar el producto: ' + (error?.message ?? error))
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Estás seguro de eliminar este producto?')) return
        try {
            await productoService.deleteProducto(id)
            loadData()
        } catch (error) {
            console.error('Error deleting product:', error)
            alert('Error al eliminar el producto')
        }
    }

    // Ya viene filtrado del servidor
    const filtered = productos

    // No bloquear la pantalla — el spinner va dentro del botón Buscar

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Maestro de Productos</h1>
                    <p className="text-slate-500">Gestiona el catálogo de productos y sus presentaciones</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            const next = !showBaja
                            setShowBaja(next)
                            if (next && productosBaja.length === 0) cargarProductosBaja()
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium"
                    >
                        <EyeOff className="w-4 h-4" />
                        {showBaja ? 'Ocultar Baja' : 'Ver Dados de Baja'}
                    </button>
                    <button
                        onClick={() => {
                            setEditingProduct({
                                codigo: '',
                                nombre: '',
                                precio_venta: 0,
                                iva_porcentaje: 15,
                                categoria_id: categorias[0]?.id,
                                maneja_stock: true,
                                cuenta_ingreso_id: cuentasLP[0]?.id || null,
                                cuenta_ingreso_codigo: cuentasLP[0]?.codigo || null,
                                cuenta_ingreso_nombre: cuentasLP[0]?.nombre || null,
                                cuenta_costo_id: cuentasLP[0]?.id || null,
                                cuenta_costo_codigo: cuentasLP[0]?.codigo || null,
                                cuenta_costo_nombre: cuentasLP[0]?.nombre || null,
                            })
                            setIsModalOpen(true)
                        }}
                        data-sentinel="btn-nuevo-producto"
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Producto
                    </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Nombre o código — presiona Enter o Buscar (use * como comodín)"
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') ejecutarBusqueda() }}
                    />
                </div>
                <select
                    className="px-4 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                    value={selectedCategoria}
                    onChange={(e) => setSelectedCategoria(e.target.value)}
                >
                    <option value="">Todas las categorías</option>
                    {categorias.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                    ))}
                </select>
                <button onClick={ejecutarBusqueda} disabled={loading}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar
                </button>
                <button
                    onClick={() => setShowConIva(v => !v)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg border transition-colors ${showConIva ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                    {showConIva ? '💰 Con IVA' : '🏷️ Sin IVA'}
                </button>
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <th className="px-4 py-4 font-medium w-20">Código</th>
                                <th className="px-4 py-4 font-medium">Producto</th>
                                <th className="px-4 py-4 font-medium">Categoría</th>
                                <th className="px-3 py-4 font-medium text-right">
                                    P1{showConIva ? <span className="ml-1 normal-case font-normal text-amber-500">+IVA</span> : ''}
                                </th>
                                <th className="px-3 py-4 font-medium text-right text-slate-400">P2</th>
                                <th className="px-3 py-4 font-medium text-right text-slate-400">P3</th>
                                <th className="px-3 py-4 font-medium text-right text-slate-400">P4</th>
                                <th className="px-3 py-4 font-medium text-center">IVA</th>
                                <th className="px-4 py-4 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map(producto => (
                                <tr key={producto.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-4">
                                        <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                            {producto.codigo || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                                                {producto.imagen_url ? (
                                                    <img src={producto.imagen_url} alt={producto.nombre} className="w-full h-full object-cover rounded-lg" />
                                                ) : (
                                                    <Package className="w-5 h-5" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <p className="font-bold text-slate-900">{producto.nombre}</p>
                                                    {producto.cuenta_ingreso_id && (
                                                        <span title={`Cuenta ingreso: ${producto.cuenta_ingreso_codigo}`}><BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" /></span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 line-clamp-1">{producto.descripcion || 'Sin descripción'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded text-xs font-bold">
                                            {producto.categorias?.nombre || '—'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-4 text-right font-bold text-slate-900 text-sm">
                                        {applyIva(producto.precio_venta, producto.iva_porcentaje ?? 15)}
                                    </td>
                                    <td className="px-3 py-4 text-right text-slate-500 text-sm">
                                        {applyIva(producto.precio2, producto.iva_porcentaje ?? 15)}
                                    </td>
                                    <td className="px-3 py-4 text-right text-slate-500 text-sm">
                                        {applyIva(producto.precio3, producto.iva_porcentaje ?? 15)}
                                    </td>
                                    <td className="px-3 py-4 text-right text-slate-500 text-sm">
                                        {applyIva(producto.precio4, producto.iva_porcentaje ?? 15)}
                                    </td>
                                    <td className="px-3 py-4 text-center text-sm text-slate-500">
                                        {producto.iva_porcentaje}%
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => setSubproductosProducto(producto)}
                                                className="p-2 hover:bg-orange-50 border border-transparent hover:border-orange-200 rounded-lg text-slate-400 hover:text-orange-600 transition-all"
                                                title="Gestionar presentaciones / subproductos"
                                            >
                                                <Layers className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setPrecioVolumenProducto(producto)}
                                                className="p-2 hover:bg-violet-50 border border-transparent hover:border-violet-200 rounded-lg text-slate-400 hover:text-violet-600 transition-all"
                                                title="Precios por volumen"
                                            >
                                                <TrendingUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingProduct(producto)
                                                    setIsModalOpen(true)
                                                }}
                                                className="p-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg text-slate-400 hover:text-primary-600 transition-all"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(producto.id)}
                                                className="p-2 hover:bg-white border border-transparent hover:border-red-100 rounded-lg text-slate-400 hover:text-red-600 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                                        {!search.trim() && !selectedCategoria
                                            ? 'Escribe un nombre o código para buscar productos.'
                                            : 'No se encontraron productos con ese criterio.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sección Productos Dados de Baja */}
            {showBaja && (
                <div className="card overflow-hidden border-amber-200">
                    <div className="bg-amber-50 border-b border-amber-100 px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <EyeOff className="w-4 h-4 text-amber-600" />
                            <span className="font-bold text-amber-800">Productos Dados de Baja</span>
                            <span className="text-xs text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">{productosBaja.length}</span>
                        </div>
                        <button onClick={cargarProductosBaja} disabled={loadingBaja}
                            className="text-xs text-amber-600 hover:underline disabled:opacity-50">
                            {loadingBaja ? 'Cargando...' : 'Actualizar'}
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-amber-50 text-amber-700 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-3 font-medium">Código</th>
                                    <th className="px-6 py-3 font-medium">Producto</th>
                                    <th className="px-6 py-3 font-medium">Categoría</th>
                                    <th className="px-6 py-3 font-medium text-right">Precio</th>
                                    <th className="px-6 py-3 font-medium text-right">Restaurar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-50">
                                {productosBaja.map(p => (
                                    <tr key={p.id} className="hover:bg-amber-50/50 opacity-70">
                                        <td className="px-6 py-3">
                                            <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{p.codigo || '—'}</span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <p className="font-medium text-slate-700 line-through">{p.nombre}</p>
                                            <p className="text-xs text-slate-400">{p.descripcion || ''}</p>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-slate-500">{p.categorias?.nombre || '—'}</td>
                                        <td className="px-6 py-3 text-right font-bold text-slate-600">{formatCurrency(p.precio_venta)}</td>
                                        <td className="px-6 py-3 text-right">
                                            <button
                                                onClick={() => restaurarProducto(p.id)}
                                                disabled={restoringId === p.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
                                            >
                                                {restoringId === p.id
                                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                                    : <RotateCcw className="w-3 h-3" />}
                                                Restaurar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {productosBaja.length === 0 && !loadingBaja && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-sm">
                                            No hay productos dados de baja.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal editar/crear producto */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div data-sentinel="modal-nuevo-producto" className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                            <h2 className="text-lg font-bold text-slate-900">
                                {editingProduct?.id ? 'Editar Producto' : 'Nuevo Producto'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                                        Código <span className="text-slate-300 normal-case font-normal">máx 25</span>
                                    </label>
                                    <input
                                        type="text"
                                        maxLength={25}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm uppercase"
                                        value={editingProduct?.codigo || ''}
                                        onChange={(e) => setEditingProduct({ ...editingProduct, codigo: e.target.value.toUpperCase() })}
                                        placeholder="P-001"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre</label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                        value={editingProduct?.nombre || ''}
                                        onChange={(e) => setEditingProduct({ ...editingProduct, nombre: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Precio Venta</label>
                                    <input
                                        required
                                        type="number"
                                        step="0.0001"
                                        min="0"
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                        value={editingProduct?.precio_venta || 0}
                                        onChange={(e) => setEditingProduct({ ...editingProduct, precio_venta: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">IVA (%)</label>
                                    <select
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                        value={editingProduct?.iva_porcentaje || 15}
                                        onChange={(e) => setEditingProduct({ ...editingProduct, iva_porcentaje: parseInt(e.target.value) })}
                                    >
                                        <option value={0}>0%</option>
                                        <option value={5}>5%</option>
                                        <option value={8}>8%</option>
                                        <option value={15}>15% (Actual)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Precios adicionales */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Precio 2</label>
                                    <input type="number" step="0.0001" min="0" placeholder="0.0000"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={editingProduct?.precio2 ?? ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, precio2: e.target.value ? parseFloat(e.target.value) : null })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Precio 3</label>
                                    <input type="number" step="0.0001" min="0" placeholder="0.0000"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={editingProduct?.precio3 ?? ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, precio3: e.target.value ? parseFloat(e.target.value) : null })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Precio 4</label>
                                    <input type="number" step="0.0001" min="0" placeholder="0.0000"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={editingProduct?.precio4 ?? ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, precio4: e.target.value ? parseFloat(e.target.value) : null })} />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="maneja_stock"
                                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                    checked={editingProduct?.maneja_stock ?? true}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, maneja_stock: e.target.checked })}
                                />
                                <label htmlFor="maneja_stock" className="text-sm font-medium text-slate-700 select-none">
                                    Controlar Stock (Kardex)
                                </label>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Categoría</label>
                                <select
                                    required
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                    value={editingProduct?.categoria_id || ''}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, categoria_id: e.target.value })}
                                >
                                    <option value="" disabled>Seleccionar...</option>
                                    {categorias.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Línea y SubCategoría */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Línea</label>
                                    <select className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                        value={editingProduct?.linea_id || ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, linea_id: e.target.value || null })}>
                                        <option value="">— Sin línea —</option>
                                        {lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">SubCategoría</label>
                                    <select className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                        value={editingProduct?.subcategoria_id || ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, subcategoria_id: e.target.value || null })}>
                                        <option value="">— Sin subcategoría —</option>
                                        {subcategorias.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Campos adicionales */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cód. Proveedor</label>
                                    <input type="text" maxLength={50} placeholder="Código del proveedor"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm font-mono"
                                        value={editingProduct?.cod_proveedor || ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, cod_proveedor: e.target.value || null })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Unidades x Presentación</label>
                                    <input type="number" step="0.01" min="1" placeholder="1"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={editingProduct?.unidades_x_presentacion ?? ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, unidades_x_presentacion: e.target.value ? parseFloat(e.target.value) : null })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Stock Mínimo</label>
                                    <input type="number" step="0.01" min="0" placeholder="0"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={editingProduct?.minimo ?? ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, minimo: e.target.value ? parseFloat(e.target.value) : null })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ubicación</label>
                                    <input type="text" maxLength={100} placeholder="Pasillo, estante..."
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={editingProduct?.ubicacion || ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, ubicacion: e.target.value || null })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción</label>
                                <textarea
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none resize-none h-20"
                                    value={editingProduct?.descripcion || ''}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, descripcion: e.target.value })}
                                />
                            </div>

                            {/* Cuentas contables */}
                            <div className="border-t border-slate-100 pt-4 space-y-3">
                                <p className="flex items-center gap-1.5 text-xs font-black text-slate-400 uppercase tracking-widest">
                                    <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                                    Cuentas Contables
                                    {cuentasLP.length === 0 && (
                                        <span className="normal-case font-normal text-amber-500 ml-1">(LedgerPro no disponible)</span>
                                    )}
                                </p>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cuenta de Ingreso (Ventas)</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-purple-400 text-sm disabled:opacity-50"
                                        disabled={cuentasLP.length === 0}
                                        value={editingProduct?.cuenta_ingreso_id || ''}
                                        onChange={e => {
                                            const cuenta = cuentasLP.find(c => c.id === e.target.value)
                                            setEditingProduct({
                                                ...editingProduct,
                                                cuenta_ingreso_id: e.target.value || null,
                                                cuenta_ingreso_codigo: cuenta?.codigo || null,
                                                cuenta_ingreso_nombre: cuenta?.nombre || null,
                                            })
                                        }}
                                    >
                                        <option value="">— Sin mapear —</option>
                                        {cuentasLP.map(c => (
                                            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cuenta de Costo (Inventario)</label>
                                    <select
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-purple-400 text-sm disabled:opacity-50"
                                        disabled={cuentasLP.length === 0}
                                        value={editingProduct?.cuenta_costo_id || ''}
                                        onChange={e => {
                                            const cuenta = cuentasLP.find(c => c.id === e.target.value)
                                            setEditingProduct({
                                                ...editingProduct,
                                                cuenta_costo_id: e.target.value || null,
                                                cuenta_costo_codigo: cuenta?.codigo || null,
                                                cuenta_costo_nombre: cuenta?.nombre || null,
                                            })
                                        }}
                                    >
                                        <option value="">— Sin mapear —</option>
                                        {cuentasLP.map(c => (
                                            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    data-sentinel="btn-guardar-producto"
                                    type="submit"
                                    className="flex-1 bg-primary-600 text-white rounded-lg px-4 py-2 font-bold hover:bg-primary-700 shadow-lg shadow-primary-200 flex items-center justify-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Panel de Subproductos */}
            {subproductosProducto && empresa?.id && (
                <SubproductosPanel
                    producto={subproductosProducto}
                    empresaId={empresa.id}
                    onClose={() => setSubproductosProducto(null)}
                />
            )}

            {/* Modal Precios por Volumen */}
            {precioVolumenProducto && empresa?.id && (
                <PrecioVolumenModal
                    producto={precioVolumenProducto}
                    empresaId={empresa.id}
                    onClose={() => setPrecioVolumenProducto(null)}
                />
            )}
        </div>
    )
}
