import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { bodegaService } from '../services/bodegaService'
import { ACCEPT_CSV_EXCEL, esArchivoExcel, leerFilasExcel } from '../lib/excelRows'
import {
    Upload, CheckCircle, AlertCircle, Loader2, FileText, X, AlertTriangle, Wrench,
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
    iva_porcentaje: number
    precio2: number
    precio3: number
    precio4: number
    // true si la celda de origen traía punto Y coma a la vez — el parseo
    // asume cuál es el decimal, pero es un caso ambiguo que vale la pena
    // que el usuario confirme visualmente antes de importar.
    costoAmbiguo: boolean
    stockAmbiguo: boolean
}

interface ImportSummary {
    inserted: number
    skippedDuplicates: number
    errors: number
    duplicateCodes: string[]
    errorMessages: string[]
}

interface CorrectionSummary {
    corrected: number
    notFound: string[]
    alreadyCorrected: string[]
    errorMessages: string[]
}

const MOTIVO_SALDO_INICIAL = ['Importación masiva inicial', 'Corrección saldo inicial (import)']

// Tarifas de IVA válidas en Ecuador para este import (0%, 5%, 15%).
const IVA_RATES_VALIDAS = [0, 5, 15]

type FieldDelimiter = ';' | ','

/* ── Utilidades ─────────────────────────────────────────────────────────── */

const BATCH_SIZE = 50

// Acepta "4,00" y "4.00" indistintamente. Si trae ambos separadores
// (ej. "1.234,56" o "1,234.56"), asume que el último es el decimal.
function parseNumber(val: string): number {
    let s = (val ?? '').trim()
    if (!s) return 0
    const hasComma = s.includes(',')
    const hasDot = s.includes('.')
    if (hasComma && hasDot) {
        s = s.lastIndexOf(',') > s.lastIndexOf('.')
            ? s.replace(/\./g, '').replace(',', '.')
            : s.replace(/,/g, '')
    } else if (hasComma) {
        s = s.replace(',', '.')
    }
    const n = Number(s)
    return isNaN(n) ? 0 : n
}

// Trae punto Y coma a la vez → el parseo tiene que adivinar cuál es el
// separador decimal (ver parseNumber). No es necesariamente un error, pero
// vale la pena que el usuario lo confirme visualmente antes de importar.
function isAmbiguousNumber(val: string): boolean {
    const s = (val ?? '').trim()
    return s.includes(',') && s.includes('.')
}

// Columna de IVA opcional: si no viene o el valor no es 0/5/15, se usa 15%
// (mismo valor por defecto que ya usaba el import antes de soportar esta columna).
function parseIvaPorcentaje(val: string): number {
    const raw = (val ?? '').trim()
    if (!raw) return 15
    const n = parseNumber(raw)
    return IVA_RATES_VALIDAS.includes(n) ? n : 15
}

// Separa una línea de CSV respetando comillas (RFC 4180): un campo que
// empieza con " puede contener el delimitador o comillas escapadas como ""
// sin que se corten las columnas. Sin esto, una descripción con comillas
// (ej. 1" de pulgada) quedaba guardada con las comillas incluidas.
// Decodifica el archivo probando UTF-8 estricto primero. Si el buffer tiene
// algún byte que no forma una secuencia UTF-8 válida, TextDecoder con
// fatal:true lanza — típico de CSV exportado en Windows con codificación
// ANSI/Windows-1252 o de sistemas DOS/CP437 viejos, donde tildes y ñ quedan
// como bytes sueltos inválidos en UTF-8. En ese caso se reintenta como
// Windows-1252, que sí asigna un carácter a cada byte 0x00-0xFF — evita el
// bug encontrado el 2026-08-18: leer siempre como UTF-8 (readAsText(file,
// 'UTF-8')) reemplazaba esos bytes por "�" de forma irrecuperable. Mismo
// mecanismo que ya usa ImportarClientesPage.tsx.
function decodeCsvBuffer(buffer: ArrayBuffer): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
        return new TextDecoder('windows-1252').decode(buffer)
    }
}

function splitCsvLine(line: string, delimiter: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (inQuotes) {
            if (char === '"') {
                if (line[i + 1] === '"') { current += '"'; i++ }
                else { inQuotes = false }
            } else {
                current += char
            }
        } else if (char === '"' && current === '') {
            inQuotes = true
        } else if (char === delimiter) {
            fields.push(current); current = ''
        } else {
            current += char
        }
    }
    fields.push(current)
    return fields
}

// Mapea una fila ya partida en celdas (venga de CSV o de una hoja de Excel)
// a un CsvRow — el punto de convergencia de ambos orígenes.
function mapRowToCsvRow(parts: string[]): CsvRow | null {
    if (parts.length < 4) return null

    const codigo   = (parts[0] ?? '').trim()
    const nombre   = (parts[1] ?? '').trim()
    const precio   = parseNumber(parts[2] ?? '')
    const categoria = (parts[3] ?? '').trim()
    const costoRaw = parts[4] ?? ''
    const stockRaw = parts[5] ?? ''
    const costo    = parseNumber(costoRaw)   // col 5 (opcional)
    let   stock    = parseNumber(stockRaw)   // col 6 (opcional)
    const iva_porcentaje = parseIvaPorcentaje(parts[6] ?? '')   // col 7 (opcional, 0/5/15)
    const precio2 = parseNumber(parts[7] ?? '')   // col 8 (opcional, vacío = 0)
    const precio3 = parseNumber(parts[8] ?? '')   // col 9 (opcional, vacío = 0)
    const precio4 = parseNumber(parts[9] ?? '')   // col 10 (opcional, vacío = 0)

    if (!codigo && !nombre && !categoria) return null
    if (stock < 0) stock = 0

    return {
        codigo, nombre, precio_venta: precio, categoria, costo, stock, iva_porcentaje,
        precio2, precio3, precio4,
        costoAmbiguo: isAmbiguousNumber(costoRaw),
        stockAmbiguo: isAmbiguousNumber(stockRaw),
    }
}

function parseCsvRows(text: string, delimiter: FieldDelimiter): CsvRow[] {
    const lines = text.split(/\r?\n/)
    const rows: CsvRow[] = []
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const row = mapRowToCsvRow(splitCsvLine(line, delimiter))
        if (row) rows.push(row)
    }
    return rows
}

// Mismo mapeo que parseCsvRows, pero para filas que ya vienen partidas en
// celdas (hoja de Excel leída con XLSX) — sin pasar por texto ni delimiter.
function mapExcelRows(rows: string[][]): CsvRow[] {
    const out: CsvRow[] = []
    for (let i = 1; i < rows.length; i++) {
        const row = mapRowToCsvRow(rows[i] ?? [])
        if (row) out.push(row)
    }
    return out
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

// Divide listas largas para consultas .in(...) — con miles de códigos/ids en
// una sola petición la URL supera el límite de PostgREST y responde Bad Request.
const CHUNK_SIZE = 150
function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
    return chunks
}

// Compartido entre la importación real y el botón de "Validar": mapa de
// categorías de la empresa (nombre → id) y set de códigos que ya existen en
// productos, para poder detectar de antemano qué filas van a fallar.
async function cargarCategoriasYExistentes(empresaId: string, codigos: string[]) {
    const { data: categorias, error: catErr } = await supabase
        .from('categorias').select('id, nombre').eq('empresa_id', empresaId)
    if (catErr) throw new Error(`Error cargando categorías: ${catErr.message}`)
    const catMap = new Map<string, string>()
    for (const cat of categorias ?? []) catMap.set((cat.nombre ?? '').trim().toUpperCase(), cat.id)

    const codsExistentes = new Set<string>()
    for (const chunk of chunkArray(codigos, CHUNK_SIZE)) {
        const { data: existentes, error: existErr } = await supabase
            .from('productos').select('codigo').eq('empresa_id', empresaId).in('codigo', chunk)
        if (existErr) throw new Error(`Error verificando duplicados: ${existErr.message}`)
        for (const p of existentes ?? []) codsExistentes.add((p.codigo ?? '').toUpperCase())
    }
    return { catMap, codsExistentes }
}

/* ── Componente ─────────────────────────────────────────────────────────── */

export function ImportarArticulosPage() {
    const { empresa } = useAuth()

    const fileRef = useRef<HTMLInputElement>(null)
    const [fileName, setFileName]     = useState('')
    const [rawText, setRawText]       = useState('')
    const [excelRows, setExcelRows]   = useState<string[][] | null>(null)
    const [delimiter, setDelimiter]   = useState<FieldDelimiter>(';')
    const [mode, setMode]             = useState<'importar' | 'corregir'>('importar')
    const [allRows, setAllRows]       = useState<CsvRow[]>([])
    const [duplicates, setDuplicates] = useState<string[]>([])
    const [parseError, setParseError] = useState('')
    const [importing, setImporting]   = useState(false)
    const [progress, setProgress]     = useState({ current: 0, total: 0 })
    const [summary, setSummary]       = useState<ImportSummary | null>(null)
    const [correctionSummary, setCorrectionSummary] = useState<CorrectionSummary | null>(null)
    const [validating, setValidating] = useState(false)
    const [validationErrors, setValidationErrors] = useState<{ codigo: string; motivo: string }[] | null>(null)

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

    const [fechaMovimiento, setFechaMovimiento] = useState(() => new Date().toISOString().split('T')[0])

    const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setParseError(''); setSummary(null); setCorrectionSummary(null); setValidationErrors(null); setFileName(file.name)

        if (esArchivoExcel(file)) {
            setRawText(''); setExcelRows(null)
            leerFilasExcel(file)
                .then(rows => setExcelRows(rows))
                .catch(() => setParseError('Error al leer el archivo Excel.'))
            return
        }

        setExcelRows(null)
        const reader = new FileReader()
        reader.onload = (ev) => {
            try {
                const buffer = ev.target?.result as ArrayBuffer
                setRawText(decodeCsvBuffer(buffer))
            } catch { setParseError('Error al leer el archivo CSV.') }
        }
        reader.onerror = () => setParseError('Error al leer el archivo CSV.')
        reader.readAsArrayBuffer(file)
    }, [])

    // Reparsea si cambia el archivo (CSV o Excel) o el separador de campo elegido
    useEffect(() => {
        if (excelRows) {
            try {
                const parsed = mapExcelRows(excelRows)
                if (parsed.length === 0) { setParseError('No se encontraron filas válidas en el Excel.'); setAllRows([]); setDuplicates([]); return }
                setParseError('')
                const { unique, duplicateCodes } = deduplicateRows(parsed)
                setAllRows(unique); setDuplicates(duplicateCodes)
            } catch { setParseError('Error al leer el archivo Excel.'); setAllRows([]); setDuplicates([]) }
            return
        }
        if (!rawText) return
        try {
            const parsed = parseCsvRows(rawText, delimiter)
            if (parsed.length === 0) { setParseError('No se encontraron filas válidas con este separador.'); setAllRows([]); setDuplicates([]); return }
            setParseError('')
            const { unique, duplicateCodes } = deduplicateRows(parsed)
            setAllRows(unique); setDuplicates(duplicateCodes)
        } catch { setParseError('Error al leer el archivo CSV.'); setAllRows([]); setDuplicates([]) }
    }, [rawText, delimiter, excelRows])

    const handleClear = useCallback(() => {
        setFileName(''); setRawText(''); setExcelRows(null); setAllRows([]); setDuplicates([]); setParseError('')
        setSummary(null); setCorrectionSummary(null); setValidationErrors(null); setProgress({ current: 0, total: 0 })
        if (fileRef.current) fileRef.current.value = ''
    }, [])

    // Solo lectura: revisa fila por fila qué código tiene una categoría que no
    // existe en el catálogo de la empresa o ya está registrado en productos,
    // sin insertar nada — para corregir el archivo de origen antes de importar.
    const handleValidar = useCallback(async () => {
        if (!allRows.length || !empresa?.id) return
        setValidating(true); setValidationErrors(null)
        try {
            const codigos = allRows.map(r => r.codigo)
            const { catMap, codsExistentes } = await cargarCategoriasYExistentes(empresa.id, codigos)

            const errores: { codigo: string; motivo: string }[] = []
            for (const row of allRows) {
                if (codsExistentes.has(row.codigo.toUpperCase())) {
                    errores.push({ codigo: row.codigo, motivo: 'El código ya existe en el sistema (se omitirá al importar)' })
                    continue
                }
                if (!catMap.has(row.categoria.trim().toUpperCase())) {
                    errores.push({ codigo: row.codigo, motivo: `Categoría no encontrada: "${row.categoria}"` })
                }
            }
            setValidationErrors(errores)
        } catch (err: any) {
            setValidationErrors([{ codigo: '—', motivo: err.message || 'Error desconocido al validar' }])
        } finally {
            setValidating(false)
        }
    }, [allRows, empresa?.id])

    const handleImport = useCallback(async () => {
        if (!allRows.length || !empresa?.id || !bodegaId) return
        setImporting(true); setSummary(null)

        const result: ImportSummary = {
            inserted: 0, skippedDuplicates: duplicates.length, errors: 0,
            duplicateCodes: [...duplicates], errorMessages: [],
        }

        try {
            const codigos = allRows.map(r => r.codigo)
            const { catMap, codsExistentes } = await cargarCategoriasYExistentes(empresa.id, codigos)

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
                        precio2:        row.precio2,
                        precio3:        row.precio3,
                        precio4:        row.precio4,
                        costo_promedio: row.costo,
                        iva_porcentaje: row.iva_porcentaje,
                        activo:         true,
                        maneja_stock:   true,
                        codigo:         row.codigo,
                        stock:          row.stock,   // stock inicial visible en inventario valorado
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
                        costo_promedio: row.costo,
                    }))
                    const { error: stockErr } = await supabase.from('stock_bodega').insert(stockRows)
                    if (stockErr) result.errorMessages.push(`Error stock lote ${Math.floor(i / BATCH_SIZE) + 1}: ${stockErr.message}`)

                    // Kardex — campos correctos del schema
                    const kardexRows = rowsWithIds
                        .filter(({ row }) => row.stock > 0)
                        .map(({ row, id }) => ({
                            empresa_id:          empresa.id,
                            producto_id:         id,
                            bodega_id:           bodegaId,
                            fecha:               fechaMovimiento,
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
    }, [allRows, duplicates, empresa?.id, bodegaId, fechaMovimiento])

    // Corrige el saldo inicial de productos YA existentes cuyo stock/costo se
    // leyó mal en el import original (separador decimal incorrecto). Como la
    // empresa ya está en producción, muchos de estos productos ya tienen
    // ventas registradas partiendo de un stock inicial de 0 (algunas incluso
    // en negativo). Por eso esto no sobrescribe el stock: inserta el
    // movimiento de saldo inicial con fecha anterior a esas ventas y
    // RECALCULA el saldo corrido de todo el Kardex posterior del producto,
    // para que el histórico quede cronológicamente correcto.
    const handleCorregirSaldo = useCallback(async () => {
        if (!allRows.length || !empresa?.id || !bodegaId) return
        setImporting(true); setCorrectionSummary(null)

        const result: CorrectionSummary = {
            corrected: 0, notFound: [], alreadyCorrected: [], errorMessages: [],
        }

        try {
            const codigos = allRows.map(r => r.codigo)
            const prodMap = new Map<string, string>() // codigo -> producto_id
            for (const chunk of chunkArray(codigos, CHUNK_SIZE)) {
                const { data: productosExistentes, error: prodErr } = await supabase
                    .from('productos').select('id, codigo')
                    .eq('empresa_id', empresa.id).in('codigo', chunk)
                if (prodErr) throw new Error(`Error cargando productos: ${prodErr.message}`)
                for (const p of productosExistentes ?? []) prodMap.set((p.codigo ?? '').toUpperCase(), p.id)
            }

            const idsExistentes = [...prodMap.values()]
            const kardexPorProducto = new Map<string, any[]>()
            for (const chunk of chunkArray(idsExistentes, CHUNK_SIZE)) {
                const { data: movimientos, error: movErr } = await supabase
                    .from('kardex')
                    .select('id, producto_id, fecha, created_at, tipo_movimiento, cantidad, costo_unitario, saldo_cantidad, saldo_costo_promedio, motivo')
                    .eq('empresa_id', empresa.id).eq('bodega_id', bodegaId)
                    .in('producto_id', chunk)
                    .order('fecha', { ascending: true }).order('created_at', { ascending: true })
                if (movErr) throw new Error(`Error cargando kardex: ${movErr.message}`)
                for (const m of movimientos ?? []) {
                    if (!kardexPorProducto.has(m.producto_id)) kardexPorProducto.set(m.producto_id, [])
                    kardexPorProducto.get(m.producto_id)!.push(m)
                }
            }

            const total = allRows.length
            setProgress({ current: 0, total })

            for (let i = 0; i < total; i++) {
                const row = allRows[i]
                const productoId = prodMap.get(row.codigo.toUpperCase())

                if (!productoId) { result.notFound.push(row.codigo); continue }

                const historial = kardexPorProducto.get(productoId) ?? []
                if (historial.some(h => MOTIVO_SALDO_INICIAL.includes(h.motivo))) {
                    result.alreadyCorrected.push(row.codigo); continue
                }

                try {
                    // Línea de tiempo: corrección (fecha elegida) + historial real,
                    // ordenada cronológicamente. En empate de fecha, la corrección
                    // va primero (es el saldo con el que arrancó el inventario).
                    type TimelineItem =
                        | { isNew: true; fecha: string; tipo_movimiento: 'ENTRADA'; cantidad: number; costo_unitario: number }
                        | { isNew: false; id: string; fecha: string; tipo_movimiento: string; cantidad: number; costo_unitario: number; saldoPrevio: number; costoPrevio: number }

                    const nuevoItem: TimelineItem = { isNew: true, fecha: fechaMovimiento, tipo_movimiento: 'ENTRADA', cantidad: row.stock, costo_unitario: row.costo }
                    const historialItems: TimelineItem[] = historial.map((h): TimelineItem => ({ isNew: false, id: h.id, fecha: h.fecha, tipo_movimiento: h.tipo_movimiento, cantidad: Number(h.cantidad), costo_unitario: Number(h.costo_unitario || 0), saldoPrevio: Number(h.saldo_cantidad), costoPrevio: Number(h.saldo_costo_promedio || 0) }))

                    const timeline: TimelineItem[] = [nuevoItem, ...historialItems].sort((a, b) => {
                        const fa = String(a.fecha), fb = String(b.fecha)
                        if (fa !== fb) return fa < fb ? -1 : 1
                        return a.isNew ? -1 : b.isNew ? 1 : 0
                    })

                    let qty = 0, cost = 0
                    let nuevoSaldoInicial = { cantidad: 0, costo: 0 }
                    const actualizaciones: { id: string; saldo_cantidad: number; saldo_costo_promedio: number }[] = []

                    for (const item of timeline) {
                        if (item.tipo_movimiento === 'ENTRADA') {
                            const costoUnit = item.costo_unitario > 0 ? item.costo_unitario : cost
                            const nuevaQty = qty + item.cantidad
                            cost = nuevaQty > 0 ? ((qty * cost) + (item.cantidad * costoUnit)) / nuevaQty : costoUnit
                            qty = nuevaQty
                        } else {
                            qty -= item.cantidad
                        }

                        if (item.isNew) {
                            nuevoSaldoInicial = { cantidad: qty, costo: cost }
                        } else if (item.saldoPrevio !== qty || item.costoPrevio !== cost) {
                            actualizaciones.push({ id: item.id, saldo_cantidad: qty, saldo_costo_promedio: cost })
                        }
                    }

                    const { error: kardexErr } = await supabase.from('kardex').insert({
                        empresa_id:          empresa.id,
                        producto_id:         productoId,
                        bodega_id:           bodegaId,
                        fecha:               fechaMovimiento,
                        tipo_movimiento:     'ENTRADA',
                        motivo:              'Corrección saldo inicial (import)',
                        cantidad:            row.stock,
                        costo_unitario:      row.costo,
                        saldo_cantidad:      nuevoSaldoInicial.cantidad,
                        saldo_costo_promedio: nuevoSaldoInicial.costo,
                    })
                    if (kardexErr) throw kardexErr

                    for (const u of actualizaciones) {
                        const { error: updKardexErr } = await supabase.from('kardex')
                            .update({ saldo_cantidad: u.saldo_cantidad, saldo_costo_promedio: u.saldo_costo_promedio })
                            .eq('id', u.id)
                        if (updKardexErr) throw updKardexErr
                    }

                    await bodegaService.upsertStock(empresa.id, bodegaId, productoId, qty, cost)

                    const { error: updErr } = await supabase.from('productos')
                        .update({ stock: qty, costo_promedio: cost })
                        .eq('id', productoId)
                    if (updErr) throw updErr

                    result.corrected++
                } catch (e: any) {
                    result.errorMessages.push(`${row.codigo}: ${e.message || 'error desconocido'}`)
                }

                if ((i + 1) % BATCH_SIZE === 0 || i === total - 1) setProgress({ current: i + 1, total })
            }
        } catch (err: any) {
            result.errorMessages.push(err.message || 'Error desconocido')
        } finally {
            setCorrectionSummary(result); setImporting(false)
        }
    }, [allRows, empresa?.id, bodegaId, fechaMovimiento])

    const preview = allRows.slice(0, 20)

    // Sumas de control — para comparar contra la misma SUMA() en Excel antes
    // de importar. Sobre TODAS las filas válidas, no solo la vista previa.
    const sumaCantidad = allRows.reduce((s, r) => s + r.stock, 0)
    const sumaCosto    = allRows.reduce((s, r) => s + r.costo, 0)
    const filasAmbiguas = allRows.filter(r => r.costoAmbiguo || r.stockAmbiguo)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Importar Artículos</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Empresa: <span className="font-medium">{empresa?.nombre || 'N/A'}</span>
                </p>
            </div>

            {/* Modo: importar nuevos vs corregir saldo inicial de existentes */}
            <div className="flex gap-2 border-b border-slate-200">
                <button
                    onClick={() => { setMode('importar'); setSummary(null); setCorrectionSummary(null); setValidationErrors(null) }}
                    className={cn(
                        "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
                        mode === 'importar' ? "border-primary-600 text-primary-700" : "border-transparent text-slate-500 hover:text-slate-700"
                    )}
                >
                    Importar artículos nuevos
                </button>
                <button
                    onClick={() => { setMode('corregir'); setSummary(null); setCorrectionSummary(null); setValidationErrors(null) }}
                    className={cn(
                        "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5",
                        mode === 'corregir' ? "border-amber-600 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-700"
                    )}
                >
                    <Wrench className="w-3.5 h-3.5" /> Corregir saldo inicial
                </button>
            </div>

            {/* Selector de bodega, separador y fecha del movimiento */}
            <div className="flex flex-wrap items-center gap-4">
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

                <div className="flex items-center gap-3">
                    <label className="text-sm font-semibold text-slate-600 whitespace-nowrap">Separador de campo:</label>
                    <select
                        value={delimiter}
                        onChange={e => setDelimiter(e.target.value as FieldDelimiter)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                    >
                        <option value=";">Punto y coma ( ; )</option>
                        <option value=",">Coma ( , )</option>
                    </select>
                </div>

                <div className="flex items-center gap-3">
                    <label className="text-sm font-semibold text-slate-600 whitespace-nowrap">Fecha del movimiento:</label>
                    <input
                        type="date"
                        value={fechaMovimiento}
                        onChange={e => setFechaMovimiento(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                </div>
            </div>

            {/* Instrucciones del formato */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">Formato del archivo CSV (separador de campo seleccionado arriba)</p>
                <p className="font-mono text-xs bg-white border border-blue-100 rounded px-3 py-2 mt-1">
                    {['codigo', 'nombre', 'precio_venta', 'categoria', 'costo', 'stock', 'iva'].join(delimiter)}
                </p>
                <p className="text-xs text-blue-600 mt-1.5">
                    Las columnas <strong>costo</strong>, <strong>stock</strong> e <strong>iva</strong> son opcionales.
                    <strong> iva</strong> acepta 0, 5 o 15 (si se deja vacío o trae un valor distinto, se usa 15%).
                    Los decimales pueden ir con coma o con punto (ej. 4,00 o 4.00). La primera fila se omite (encabezados).
                    {mode === 'corregir' && (
                        <> <strong>Modo corrección:</strong> no crea productos nuevos. Inserta el saldo inicial con la fecha indicada y recalcula el saldo corrido de las ventas ya registradas para ese producto; no sobrescribe el stock actual, lo ajusta. Productos que ya tengan un saldo inicial cargado se omiten.</>
                    )}
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
                        <p className="text-slate-600 font-medium">Selecciona un archivo CSV o Excel (.xlsx)</p>
                        <label className="mt-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg font-semibold cursor-pointer hover:bg-primary-700 transition-colors text-sm">
                            Seleccionar archivo
                            <input ref={fileRef} type="file" accept={ACCEPT_CSV_EXCEL} className="hidden" onChange={handleFile} />
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

            {allRows.length > 0 && !summary && !correctionSummary && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-2">
                        Sumas de control — compara contra SUMA() en tu Excel antes de importar
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-lg border border-emerald-100 p-3">
                            <p className="text-2xl font-bold text-slate-800 tabular-nums">{sumaCantidad.toLocaleString('es-EC', { maximumFractionDigits: 4 })}</p>
                            <p className="text-xs text-slate-500">Suma columna "stock" (cantidad)</p>
                        </div>
                        <div className="bg-white rounded-lg border border-emerald-100 p-3">
                            <p className="text-2xl font-bold text-slate-800 tabular-nums">{sumaCosto.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</p>
                            <p className="text-xs text-slate-500">Suma columna "costo"</p>
                        </div>
                    </div>
                    {filasAmbiguas.length > 0 && (
                        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800">
                                <strong>{filasAmbiguas.length} fila{filasAmbiguas.length !== 1 ? 's' : ''}</strong> tienen costo o stock con punto Y coma a la vez
                                (ej. "44.296,00") — están marcadas en amarillo en la vista previa de abajo. Revísalas: el sistema asume
                                cuál es el separador decimal, y en un valor así puede adivinar mal.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {allRows.length > 0 && !summary && !correctionSummary && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="font-semibold text-slate-800">
                            Vista previa
                            <span className="text-sm font-normal text-slate-500 ml-2">
                                (primeras {Math.min(20, allRows.length)} de {allRows.length.toLocaleString()} filas)
                            </span>
                        </h2>
                        <div className="flex items-center gap-2">
                            {mode === 'importar' && (
                                <button
                                    onClick={handleValidar}
                                    disabled={importing || validating}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm border transition-colors",
                                        importing || validating
                                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                                    )}
                                >
                                    {validating ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Validando...</>
                                    ) : (
                                        <><CheckCircle className="w-4 h-4" /> Validar antes de importar</>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={mode === 'corregir' ? handleCorregirSaldo : handleImport}
                                disabled={importing || validating || !bodegaId}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors",
                                    importing || validating || !bodegaId
                                        ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                        : mode === 'corregir' ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-primary-600 text-white hover:bg-primary-700"
                                )}
                            >
                                {importing ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Procesando {progress.current}/{progress.total}...</>
                                ) : mode === 'corregir' ? (
                                    <><Wrench className="w-4 h-4" /> Corregir saldo de {allRows.length.toLocaleString()} artículos</>
                                ) : (
                                    <><Upload className="w-4 h-4" /> Importar {allRows.length.toLocaleString()} artículos</>
                                )}
                            </button>
                        </div>
                    </div>

                    {mode === 'importar' && validationErrors !== null && (
                        <div className={cn(
                            "mx-5 mt-4 rounded-lg border p-3",
                            validationErrors.length === 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                        )}>
                            {validationErrors.length === 0 ? (
                                <p className="text-sm text-emerald-700 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 shrink-0" /> No se encontraron errores de categoría ni códigos duplicados. Puedes importar.
                                </p>
                            ) : (
                                <>
                                    <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        {validationErrors.length} fila{validationErrors.length !== 1 ? 's' : ''} con error — corrígelas en el archivo de origen antes de importar:
                                    </p>
                                    <div className="max-h-64 overflow-y-auto space-y-1">
                                        {validationErrors.map((e, i) => (
                                            <p key={i} className="text-xs text-red-700">
                                                <span className="font-mono font-semibold">{e.codigo}</span>: {e.motivo}
                                            </p>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

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
                                    <th className="px-4 py-2.5 font-semibold text-right">IVA</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Precio2</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Precio3</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">Precio4</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {preview.map((row, idx) => (
                                    <tr key={idx} className={cn('hover:bg-slate-50', (row.costoAmbiguo || row.stockAmbiguo) && 'bg-amber-50')}>
                                        <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                                        <td className="px-4 py-2 font-mono text-xs">{row.codigo}</td>
                                        <td className="px-4 py-2">{row.nombre}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{row.precio_venta.toFixed(2)}</td>
                                        <td className="px-4 py-2">
                                            <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-medium">{row.categoria.trim()}</span>
                                        </td>
                                        <td className={cn('px-4 py-2 text-right tabular-nums font-medium', row.costoAmbiguo ? 'text-amber-700' : 'text-emerald-700')} title={row.costoAmbiguo ? 'Valor de origen con punto y coma a la vez — verificar' : undefined}>
                                            {row.costo.toFixed(2)}{row.costoAmbiguo && ' ⚠️'}
                                        </td>
                                        <td className={cn('px-4 py-2 text-right tabular-nums', row.stockAmbiguo && 'text-amber-700 font-medium')} title={row.stockAmbiguo ? 'Valor de origen con punto y coma a la vez — verificar' : undefined}>
                                            {row.stock}{row.stockAmbiguo && ' ⚠️'}
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums">{row.iva_porcentaje}%</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{row.precio2.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{row.precio3.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{row.precio4.toFixed(2)}</td>
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

            {correctionSummary && (
                <div className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <CheckCircle className="w-6 h-6 text-green-600" /> Corrección de saldo completada
                        </h2>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                <p className="text-2xl font-bold text-green-700">{correctionSummary.corrected.toLocaleString()}</p>
                                <p className="text-sm text-green-600">Corregidos</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                                <p className="text-2xl font-bold text-slate-700">{correctionSummary.notFound.length.toLocaleString()}</p>
                                <p className="text-sm text-slate-600">No encontrados</p>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                                <p className="text-2xl font-bold text-amber-700">{correctionSummary.alreadyCorrected.length.toLocaleString()}</p>
                                <p className="text-sm text-amber-600">Ya corregidos antes</p>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                                <p className="text-2xl font-bold text-red-700">{correctionSummary.errorMessages.length.toLocaleString()}</p>
                                <p className="text-sm text-red-600">Errores</p>
                            </div>
                        </div>

                        {correctionSummary.alreadyCorrected.length > 0 && (
                            <div>
                                <button onClick={() => { const el = document.getElementById('mov-list'); if (el) el.classList.toggle('hidden') }}
                                    className="flex items-center gap-2 text-sm font-medium text-amber-700">
                                    <AlertTriangle className="w-4 h-4" /> Ver {correctionSummary.alreadyCorrected.length} omitidos por ya tener un saldo inicial registrado
                                </button>
                                <div id="mov-list" className="hidden mt-2 max-h-48 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {correctionSummary.alreadyCorrected.map((code, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-mono">{code}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {correctionSummary.notFound.length > 0 && (
                            <div>
                                <button onClick={() => { const el = document.getElementById('nf-list'); if (el) el.classList.toggle('hidden') }}
                                    className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                    <AlertTriangle className="w-4 h-4" /> Ver {correctionSummary.notFound.length} códigos no encontrados
                                </button>
                                <div id="nf-list" className="hidden mt-2 max-h-48 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {correctionSummary.notFound.map((code, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-mono">{code}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {correctionSummary.errorMessages.length > 0 && (
                            <div>
                                <p className="flex items-center gap-2 text-sm font-medium text-red-700 mb-2">
                                    <AlertCircle className="w-4 h-4" /> Errores durante la corrección:
                                </p>
                                <div className="max-h-48 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                                    {correctionSummary.errorMessages.map((msg, i) => <p key={i} className="text-xs text-red-700">{msg}</p>)}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="text-center">
                        <button onClick={handleClear} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm">
                            Nueva corrección
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
