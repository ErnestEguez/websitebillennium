import { useState, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
    Upload,
    CheckCircle,
    AlertCircle,
    Loader2,
    FileText,
    X,
    AlertTriangle,
} from 'lucide-react'
import { cn } from '../lib/utils'

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

interface CsvRow {
    codigo: string
    nombre: string
    precio_venta: number
    categoria: string
    costo_promedio: number
    stock: number
}

interface ImportSummary {
    inserted: number
    skippedDuplicates: number
    errors: number
    duplicateCodes: string[]
    errorMessages: string[]
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const EMPRESA_ID = '9b081e8d-4bc1-4e23-a087-7d939cdc1803'
const BODEGA_ID  = '33e0e6ec-8a39-4204-b574-177130237d8e'
const BATCH_SIZE = 50

/* ------------------------------------------------------------------ */
/*  Utilidades de parseo                                               */
/* ------------------------------------------------------------------ */

function parseNumber(val: string): number {
    const trimmed = val.trim()
    if (!trimmed) return 0
    const n = Number(trimmed)
    return isNaN(n) ? 0 : n
}

function parseCsvRows(text: string): CsvRow[] {
    const lines = text.split(/\r?\n/)
    // Saltamos la primera linea (encabezados)
    const rows: CsvRow[] = []
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const parts = line.split(';')
        if (parts.length < 6) continue

        const codigo       = (parts[0] ?? '').trim()
        const nombre       = (parts[1] ?? '').trim()
        const precioVenta  = parseNumber(parts[2] ?? '')
        const categoria    = (parts[3] ?? '').trim()
        const costoPromedio = parseNumber(parts[4] ?? '')
        let stock          = parseNumber(parts[5] ?? '')

        // Fila vacia (todos los campos en blanco)
        if (!codigo && !nombre && !categoria) continue

        // Stock negativo → 0
        if (stock < 0) stock = 0

        rows.push({
            codigo,
            nombre,
            precio_venta: precioVenta,
            categoria,
            costo_promedio: costoPromedio,
            stock,
        })
    }
    return rows
}

/** Deduplica por codigo: conserva la primera aparicion */
function deduplicateRows(rows: CsvRow[]): { unique: CsvRow[]; duplicateCodes: string[] } {
    const seen = new Set<string>()
    const unique: CsvRow[] = []
    const duplicateCodes: string[] = []

    for (const row of rows) {
        const key = row.codigo.toUpperCase()
        if (seen.has(key)) {
            duplicateCodes.push(row.codigo)
            continue
        }
        seen.add(key)
        unique.push(row)
    }
    return { unique, duplicateCodes }
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

export function ImportarArticulosPage() {
    const { empresa } = useAuth()
    const fileRef = useRef<HTMLInputElement>(null)

    // Estado CSV
    const [fileName, setFileName]       = useState('')
    const [allRows, setAllRows]         = useState<CsvRow[]>([])
    const [duplicates, setDuplicates]   = useState<string[]>([])
    const [parseError, setParseError]   = useState('')

    // Estado importacion
    const [importing, setImporting]     = useState(false)
    const [progress, setProgress]       = useState({ current: 0, total: 0 })
    const [summary, setSummary]         = useState<ImportSummary | null>(null)

    /* ── Cargar archivo ─────────────────────────────────────────── */
    const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setParseError('')
        setSummary(null)
        setFileName(file.name)

        const reader = new FileReader()
        reader.onload = (ev) => {
            try {
                const text = ev.target?.result as string
                const parsed = parseCsvRows(text)
                if (parsed.length === 0) {
                    setParseError('No se encontraron filas validas en el archivo.')
                    setAllRows([])
                    setDuplicates([])
                    return
                }
                const { unique, duplicateCodes } = deduplicateRows(parsed)
                setAllRows(unique)
                setDuplicates(duplicateCodes)
            } catch {
                setParseError('Error al leer el archivo CSV.')
                setAllRows([])
                setDuplicates([])
            }
        }
        reader.readAsText(file, 'UTF-8')
    }, [])

    /* ── Limpiar ────────────────────────────────────────────────── */
    const handleClear = useCallback(() => {
        setFileName('')
        setAllRows([])
        setDuplicates([])
        setParseError('')
        setSummary(null)
        setProgress({ current: 0, total: 0 })
        if (fileRef.current) fileRef.current.value = ''
    }, [])

    /* ── Importar ───────────────────────────────────────────────── */
    const handleImport = useCallback(async () => {
        if (allRows.length === 0) return
        setImporting(true)
        setSummary(null)

        const result: ImportSummary = {
            inserted: 0,
            skippedDuplicates: duplicates.length,
            errors: 0,
            duplicateCodes: [...duplicates],
            errorMessages: [],
        }

        try {
            // 1. Obtener categorias existentes
            const { data: categorias, error: catErr } = await supabase
                .from('categorias')
                .select('id, nombre')
                .eq('empresa_id', EMPRESA_ID)

            if (catErr) throw new Error(`Error cargando categorias: ${catErr.message}`)

            const catMap = new Map<string, string>()
            for (const cat of categorias ?? []) {
                catMap.set((cat.nombre ?? '').trim().toUpperCase(), cat.id)
            }

            // 2. Procesar en lotes
            const total = allRows.length
            setProgress({ current: 0, total })

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batch = allRows.slice(i, i + BATCH_SIZE)
                const productosToInsert: any[] = []
                const rowsWithIds: { row: CsvRow; id: string }[] = []

                for (const row of batch) {
                    const catKey = row.categoria.trim().toUpperCase()
                    const categoriaId = catMap.get(catKey)

                    if (!categoriaId) {
                        result.errors++
                        result.errorMessages.push(`Categoria no encontrada: "${row.categoria}" (codigo: ${row.codigo})`)
                        continue
                    }

                    const id = crypto.randomUUID()
                    productosToInsert.push({
                        id,
                        empresa_id: EMPRESA_ID,
                        categoria_id: categoriaId,
                        nombre: row.nombre,
                        descripcion: row.nombre,
                        precio_venta: row.precio_venta,
                        costo_promedio: row.costo_promedio,
                        iva_porcentaje: 15,
                        activo: true,
                        maneja_stock: true,
                        codigo: row.codigo,
                        stock: 0,
                    })
                    rowsWithIds.push({ row, id })
                }

                // Insertar productos
                if (productosToInsert.length > 0) {
                    const { error: prodErr } = await supabase
                        .from('productos')
                        .insert(productosToInsert)

                    if (prodErr) {
                        result.errors += productosToInsert.length
                        result.errorMessages.push(`Error lote ${Math.floor(i / BATCH_SIZE) + 1}: ${prodErr.message}`)
                        setProgress({ current: Math.min(i + BATCH_SIZE, total), total })
                        continue
                    }

                    // Insertar stock_bodega
                    const stockRows = rowsWithIds.map(({ row, id }) => ({
                        producto_id: id,
                        bodega_id: BODEGA_ID,
                        cantidad: row.stock < 0 ? 0 : row.stock,
                    }))

                    const { error: stockErr } = await supabase
                        .from('stock_bodega')
                        .insert(stockRows)

                    if (stockErr) {
                        result.errorMessages.push(`Error stock lote ${Math.floor(i / BATCH_SIZE) + 1}: ${stockErr.message}`)
                    }

                    // Insertar kardex
                    const kardexRows = rowsWithIds.map(({ row, id }) => {
                        const cantidad = row.stock < 0 ? 0 : row.stock
                        return {
                            producto_id: id,
                            bodega_id: BODEGA_ID,
                            tipo: 'ENTRADA',
                            cantidad,
                            fecha: new Date().toISOString(),
                            referencia: 'Importacion masiva inicial',
                            stock_anterior: 0,
                            stock_nuevo: cantidad,
                        }
                    })

                    const { error: kardexErr } = await supabase
                        .from('kardex')
                        .insert(kardexRows)

                    if (kardexErr) {
                        result.errorMessages.push(`Error kardex lote ${Math.floor(i / BATCH_SIZE) + 1}: ${kardexErr.message}`)
                    }

                    result.inserted += productosToInsert.length
                }

                setProgress({ current: Math.min(i + BATCH_SIZE, total), total })
            }
        } catch (err: any) {
            result.errorMessages.push(err.message || 'Error desconocido')
        } finally {
            setSummary(result)
            setImporting(false)
        }
    }, [allRows, duplicates])

    /* ── Preview (primeras 20 filas) ────────────────────────────── */
    const preview = allRows.slice(0, 20)

    return (
        <div className="space-y-6">
            {/* Titulo */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Importar Articulos</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Carga un archivo CSV separado por punto y coma (;) con los articulos a importar.
                    Empresa: <span className="font-medium">{empresa?.nombre || 'N/A'}</span>
                </p>
            </div>

            {/* Zona de carga */}
            <div className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors",
                fileName ? "border-primary-300 bg-primary-50/50" : "border-slate-300 bg-white hover:border-primary-400"
            )}>
                {!fileName ? (
                    <div className="flex flex-col items-center gap-3">
                        <Upload className="w-12 h-12 text-slate-400" />
                        <p className="text-slate-600 font-medium">Arrastra o selecciona un archivo CSV</p>
                        <p className="text-xs text-slate-400">Formato: codigo;nombre;precio_venta;categoria;costo_promedio;stock</p>
                        <label className="mt-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg font-semibold cursor-pointer hover:bg-primary-700 transition-colors text-sm">
                            Seleccionar archivo
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv,.txt"
                                className="hidden"
                                onChange={handleFile}
                            />
                        </label>
                    </div>
                ) : (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <FileText className="w-8 h-8 text-primary-600" />
                            <div className="text-left">
                                <p className="font-semibold text-slate-800">{fileName}</p>
                                <p className="text-sm text-slate-500">
                                    {allRows.length.toLocaleString()} articulos validos
                                    {duplicates.length > 0 && (
                                        <span className="text-amber-600 ml-2">
                                            ({duplicates.length} codigos duplicados ignorados)
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleClear}
                            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                            disabled={importing}
                        >
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>
                )}
            </div>

            {/* Error de parseo */}
            {parseError && (
                <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {parseError}
                </div>
            )}

            {/* Preview */}
            {allRows.length > 0 && !summary && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="font-semibold text-slate-800">
                            Vista previa
                            <span className="text-sm font-normal text-slate-500 ml-2">
                                (primeras {Math.min(20, allRows.length)} de {allRows.length.toLocaleString()} filas)
                            </span>
                        </h2>
                        <button
                            onClick={handleImport}
                            disabled={importing}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors",
                                importing
                                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                    : "bg-primary-600 text-white hover:bg-primary-700"
                            )}
                        >
                            {importing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Importando {progress.current} de {progress.total}...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Importar {allRows.length.toLocaleString()} articulos
                                </>
                            )}
                        </button>
                    </div>

                    {/* Barra de progreso */}
                    {importing && progress.total > 0 && (
                        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                            <div className="w-full bg-slate-200 rounded-full h-2">
                                <div
                                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1 text-right">
                                {progress.current} / {progress.total}
                            </p>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-600 text-left">
                                    <th className="px-4 py-2.5 font-semibold">#</th>
                                    <th className="px-4 py-2.5 font-semibold">Codigo</th>
                                    <th className="px-4 py-2.5 font-semibold">Nombre</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Precio Venta</th>
                                    <th className="px-4 py-2.5 font-semibold">Categoria</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Costo Prom.</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Stock</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {preview.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                                        <td className="px-4 py-2 font-mono text-xs">{row.codigo}</td>
                                        <td className="px-4 py-2">{row.nombre}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{row.precio_venta.toFixed(2)}</td>
                                        <td className="px-4 py-2">
                                            <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-medium">
                                                {row.categoria.trim()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums">{row.costo_promedio.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{row.stock}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {allRows.length > 20 && (
                        <div className="px-5 py-2 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500">
                            ...y {(allRows.length - 20).toLocaleString()} filas mas
                        </div>
                    )}
                </div>
            )}

            {/* Resumen final */}
            {summary && (
                <div className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                            Importacion completada
                        </h2>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                <p className="text-2xl font-bold text-green-700">{summary.inserted.toLocaleString()}</p>
                                <p className="text-sm text-green-600">Insertados</p>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                                <p className="text-2xl font-bold text-amber-700">{summary.skippedDuplicates.toLocaleString()}</p>
                                <p className="text-sm text-amber-600">Duplicados omitidos</p>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                                <p className="text-2xl font-bold text-red-700">{summary.errors.toLocaleString()}</p>
                                <p className="text-sm text-red-600">Errores</p>
                            </div>
                        </div>

                        {/* Codigos duplicados */}
                        {summary.duplicateCodes.length > 0 && (
                            <div className="mt-4">
                                <button
                                    onClick={() => {
                                        const el = document.getElementById('dup-list')
                                        if (el) el.classList.toggle('hidden')
                                    }}
                                    className="flex items-center gap-2 text-sm font-medium text-amber-700 hover:text-amber-800"
                                >
                                    <AlertTriangle className="w-4 h-4" />
                                    Ver {summary.duplicateCodes.length} codigos duplicados omitidos
                                </button>
                                <div id="dup-list" className="hidden mt-2 max-h-48 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {summary.duplicateCodes.map((code, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-mono">
                                                {code}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Errores */}
                        {summary.errorMessages.length > 0 && (
                            <div className="mt-4">
                                <p className="flex items-center gap-2 text-sm font-medium text-red-700 mb-2">
                                    <AlertCircle className="w-4 h-4" />
                                    Errores durante la importacion:
                                </p>
                                <div className="max-h-48 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                                    {summary.errorMessages.map((msg, i) => (
                                        <p key={i} className="text-xs text-red-700">{msg}</p>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Boton para nueva importacion */}
                    <div className="text-center">
                        <button
                            onClick={handleClear}
                            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition-colors"
                        >
                            Nueva importacion
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
