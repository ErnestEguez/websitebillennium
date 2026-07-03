import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
    Upload, CheckCircle, AlertCircle, Loader2, FileText, X, AlertTriangle,
} from 'lucide-react'
import { cn } from '../lib/utils'

/* ── Tipos ──────────────────────────────────────────────────────────────── */

interface CsvRow {
    codigo: string
    nombre: string
    precio_venta: number
    categoria: string
    costo: number
    stock: number
}

interface ImportSummary {
    inserted: number
    skippedDuplicates: number
    errors: number
    duplicateCodes: string[]
    errorMessages: string[]
}

/* ── Utilidades ─────────────────────────────────────────────────────────── */

const BATCH_SIZE = 50

function parseNumber(val: string): number {
    const n = Number(val.trim())
    return isNaN(n) ? 0 : n
}

function parseCsvRows(text: string): CsvRow[] {
    const lines = text.split(/\r?\n/)
    const rows: CsvRow[] = []
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const parts = line.split(';')
        if (parts.length < 4) continue

        const codigo   = (parts[0] ?? '').trim()
        const nombre   = (parts[1] ?? '').trim()
        const precio   = parseNumber(parts[2] ?? '')
        const categoria = (parts[3] ?? '').trim()
        const costo    = parseNumber(parts[4] ?? '')   // col 5 (opcional)
        let   stock    = parseNumber(parts[5] ?? '')   // col 6 (opcional)

        if (!codigo && !nombre && !categoria) continue
        if (stock < 0) stock = 0

        rows.push({ codigo, nombre, precio_venta: precio, categoria, costo, stock })
    }
    return rows
}

function deduplicateRows(rows: CsvRow[]): { unique: CsvRow[]; duplicateCodes: string[] } {
    const seen = new Set<string>()
    const unique: CsvRow[] = []
    const duplicateCodes: string[] = []
    for (const row of rows) {
        const key = row.codigo.toUpperCase()
        if (seen.has(key)) { duplicateCodes.push(row.codigo); continue }
        seen.add(key)
        unique.push(row)
    }
    return { unique, duplicateCodes }
}

/* ── Componente ─────────────────────────────────────────────────────────── */

export function ImportarArticulosPage() {
    const { empresa } = useAuth()

    const fileRef = useRef<HTMLInputElement>(null)
    const [fileName, setFileName]     = useState('')
    const [allRows, setAllRows]       = useState<CsvRow[]>([])
    const [duplicates, setDuplicates] = useState<string[]>([])
    const [parseError, setParseError] = useState('')
    const [importing, setImporting]   = useState(false)
    const [progress, setProgress]     = useState({ current: 0, total: 0 })
    const [summary, setSummary]       = useState<ImportSummary | null>(null)

    // Bodegas de la empresa
    const [bodegas, setBodegas]   = useState<{ id: string; nombre: string; es_principal: boolean }[]>([])
    const [bodegaId, setBodegaId] = useState<string | null>(null)

    useEffect(() => {
        if (!empresa?.id) return
        supabase
            .from('bodegas')
            .select('id, nombre, es_principal')
            .eq('empresa_id', empresa.id)
            .eq('activo', true)
            .order('es_principal', { ascending: false })
            .then(({ data }) => {
                const lista = data ?? []
                setBodegas(lista)
                const principal = lista.find(b => b.es_principal) ?? lista[0]
                if (principal) setBodegaId(principal.id)
            })
    }, [empresa?.id])

    const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setParseError(''); setSummary(null); setFileName(file.name)
        const reader = new FileReader()
        reader.onload = (ev) => {
            try {
                const text = ev.target?.result as string
                const parsed = parseCsvRows(text)
                if (parsed.length === 0) { setParseError('No se encontraron filas válidas.'); setAllRows([]); setDuplicates([]); return }
                const { unique, duplicateCodes } = deduplicateRows(parsed)
                setAllRows(unique); setDuplicates(duplicateCodes)
            } catch { setParseError('Error al leer el archivo CSV.'); setAllRows([]); setDuplicates([]) }
        }
        reader.readAsText(file, 'UTF-8')
    }, [])

    const handleClear = useCallback(() => {
        setFileName(''); setAllRows([]); setDuplicates([]); setParseError('')
        setSummary(null); setProgress({ current: 0, total: 0 })
        if (fileRef.current) fileRef.current.value = ''
    }, [])

    const handleImport = useCallback(async () => {
        if (!allRows.length || !empresa?.id || !bodegaId) return
        setImporting(true); setSummary(null)

        const result: ImportSummary = {
            inserted: 0, skippedDuplicates: duplicates.length, errors: 0,
            duplicateCodes: [...duplicates], errorMessages: [],
        }

        try {
            // Categorías de la empresa
            const { data: categorias, error: catErr } = await supabase
                .from('categorias').select('id, nombre').eq('empresa_id', empresa.id)
            if (catErr) throw new Error(`Error cargando categorías: ${catErr.message}`)
            const catMap = new Map<string, string>()
            for (const cat of categorias ?? []) catMap.set((cat.nombre ?? '').trim().toUpperCase(), cat.id)

            // Códigos ya existentes (para saltar duplicados en BD)
            const codigos = allRows.map(r => r.codigo)
            const { data: existentes } = await supabase
                .from('productos').select('codigo').eq('empresa_id', empresa.id).in('codigo', codigos)
            const codsExistentes = new Set((existentes ?? []).map((p: any) => (p.codigo ?? '').toUpperCase()))

            const total = allRows.length
            setProgress({ current: 0, total })

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batch = allRows.slice(i, i + BATCH_SIZE)
                const productosToInsert: any[] = []
                const rowsWithIds: { row: CsvRow; id: string }[] = []

                for (const row of batch) {
                    // Saltar si ya existe en BD
                    if (codsExistentes.has(row.codigo.toUpperCase())) {
                        result.skippedDuplicates++
                        result.duplicateCodes.push(row.codigo)
                        continue
                    }

                    const catId = catMap.get(row.categoria.trim().toUpperCase())
                    if (!catId) {
                        result.errors++
                        result.errorMessages.push(`Categoría no encontrada: "${row.categoria}" (código: ${row.codigo})`)
                        continue
                    }

                    const id = crypto.randomUUID()
                    productosToInsert.push({
                        id,
                        empresa_id:     empresa.id,
                        categoria_id:   catId,
                        nombre:         row.nombre,
                        descripcion:    row.nombre,
                        precio_venta:   row.precio_venta,
                        costo_promedio: row.costo,
                        iva_porcentaje: 15,
                        activo:         true,
                        maneja_stock:   true,
                        codigo:         row.codigo,
                        stock:          0,
                    })
                    rowsWithIds.push({ row, id })
                }

                if (productosToInsert.length > 0) {
                    const { error: prodErr } = await supabase.from('productos').insert(productosToInsert)
                    if (prodErr) {
                        result.errors += productosToInsert.length
                        result.errorMessages.push(`Error lote ${Math.floor(i / BATCH_SIZE) + 1}: ${prodErr.message}`)
                        setProgress({ current: Math.min(i + BATCH_SIZE, total), total }); continue
                    }

                    // Stock en bodega
                    const stockRows = rowsWithIds.map(({ row, id }) => ({
                        producto_id: id,
                        bodega_id:   bodegaId,
                        empresa_id:  empresa.id,
                        cantidad:    row.stock,
                    }))
                    const { error: stockErr } = await supabase.from('stock_bodega').insert(stockRows)
                    if (stockErr) result.errorMessages.push(`Error stock lote ${Math.floor(i / BATCH_SIZE) + 1}: ${stockErr.message}`)

                    // Kardex — campos correctos del schema
                    const hoy = new Date().toISOString().split('T')[0]
                    const kardexRows = rowsWithIds
                        .filter(({ row }) => row.stock > 0)
                        .map(({ row, id }) => ({
                            empresa_id:          empresa.id,
                            producto_id:         id,
                            bodega_id:           bodegaId,
                            fecha:               hoy,
                            tipo_movimiento:     'ENTRADA',
                            motivo:              'Importación masiva inicial',
                            cantidad:            row.stock,
                            costo_unitario:      row.costo,
                            saldo_cantidad:      row.stock,
                            saldo_costo_promedio: row.costo,
                        }))
                    if (kardexRows.length > 0) {
                        const { error: kardexErr } = await supabase.from('kardex').insert(kardexRows)
                        if (kardexErr) result.errorMessages.push(`Error kardex lote ${Math.floor(i / BATCH_SIZE) + 1}: ${kardexErr.message}`)
                    }

                    result.inserted += productosToInsert.length
                }

                setProgress({ current: Math.min(i + BATCH_SIZE, total), total })
            }
        } catch (err: any) {
            result.errorMessages.push(err.message || 'Error desconocido')
        } finally {
            setSummary(result); setImporting(false)
        }
    }, [allRows, duplicates, empresa?.id, bodegaId])

    const preview = allRows.slice(0, 20)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Importar Artículos</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Empresa: <span className="font-medium">{empresa?.nombre || 'N/A'}</span>
                </p>
            </div>

            {/* Selector de bodega */}
            {bodegas.length > 0 && (
                <div className="flex items-center gap-3">
                    <label className="text-sm font-semibold text-slate-600 whitespace-nowrap">Bodega destino:</label>
                    <select
                        value={bodegaId ?? ''}
                        onChange={e => setBodegaId(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                    >
                        {bodegas.map(b => (
                            <option key={b.id} value={b.id}>
                                {b.nombre}{b.es_principal ? ' (Principal)' : ''}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Instrucciones del formato */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">Formato del archivo CSV (separador: punto y coma)</p>
                <p className="font-mono text-xs bg-white border border-blue-100 rounded px-3 py-2 mt-1">
                    codigo;nombre;precio_venta;categoria;costo;stock
                </p>
                <p className="text-xs text-blue-600 mt-1.5">
                    Las columnas <strong>costo</strong> y <strong>stock</strong> son opcionales (dejar en 0 si no aplica).
                    La primera fila se omite (encabezados).
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
                        <label className="mt-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg font-semibold cursor-pointer hover:bg-primary-700 transition-colors text-sm">
                            Seleccionar archivo
                            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
                        </label>
                    </div>
                ) : (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <FileText className="w-8 h-8 text-primary-600" />
                            <div className="text-left">
                                <p className="font-semibold text-slate-800">{fileName}</p>
                                <p className="text-sm text-slate-500">
                                    {allRows.length.toLocaleString()} artículos válidos
                                    {duplicates.length > 0 && (
                                        <span className="text-amber-600 ml-2">({duplicates.length} códigos duplicados ignorados)</span>
                                    )}
                                </p>
                            </div>
                        </div>
                        <button onClick={handleClear} className="p-2 hover:bg-slate-200 rounded-lg" disabled={importing}>
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>
                )}
            </div>

            {parseError && (
                <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />{parseError}
                </div>
            )}

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
                            disabled={importing || !bodegaId}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors",
                                importing || !bodegaId
                                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                    : "bg-primary-600 text-white hover:bg-primary-700"
                            )}
                        >
                            {importing ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Importando {progress.current}/{progress.total}...</>
                            ) : (
                                <><Upload className="w-4 h-4" /> Importar {allRows.length.toLocaleString()} artículos</>
                            )}
                        </button>
                    </div>

                    {importing && progress.total > 0 && (
                        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                            <div className="w-full bg-slate-200 rounded-full h-2">
                                <div className="bg-primary-600 h-2 rounded-full transition-all"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                            </div>
                            <p className="text-xs text-slate-500 mt-1 text-right">{progress.current} / {progress.total}</p>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-600 text-left">
                                    <th className="px-4 py-2.5 font-semibold">#</th>
                                    <th className="px-4 py-2.5 font-semibold">Código</th>
                                    <th className="px-4 py-2.5 font-semibold">Nombre</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Precio</th>
                                    <th className="px-4 py-2.5 font-semibold">Categoría</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Costo</th>
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
                                            <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-medium">{row.categoria.trim()}</span>
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums text-emerald-700 font-medium">{row.costo.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{row.stock}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {allRows.length > 20 && (
                        <div className="px-5 py-2 bg-slate-50 border-t text-center text-xs text-slate-500">
                            ...y {(allRows.length - 20).toLocaleString()} filas más
                        </div>
                    )}
                </div>
            )}

            {summary && (
                <div className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <CheckCircle className="w-6 h-6 text-green-600" /> Importación completada
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
                        {summary.duplicateCodes.length > 0 && (
                            <div>
                                <button onClick={() => { const el = document.getElementById('dup-list'); if (el) el.classList.toggle('hidden') }}
                                    className="flex items-center gap-2 text-sm font-medium text-amber-700">
                                    <AlertTriangle className="w-4 h-4" /> Ver {summary.duplicateCodes.length} códigos duplicados omitidos
                                </button>
                                <div id="dup-list" className="hidden mt-2 max-h-48 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {summary.duplicateCodes.map((code, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-mono">{code}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {summary.errorMessages.length > 0 && (
                            <div>
                                <p className="flex items-center gap-2 text-sm font-medium text-red-700 mb-2">
                                    <AlertCircle className="w-4 h-4" /> Errores durante la importación:
                                </p>
                                <div className="max-h-48 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                                    {summary.errorMessages.map((msg, i) => <p key={i} className="text-xs text-red-700">{msg}</p>)}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="text-center">
                        <button onClick={handleClear} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm">
                            Nueva importación
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
