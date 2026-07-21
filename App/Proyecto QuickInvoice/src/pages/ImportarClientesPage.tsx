import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
    Upload, Download, CheckCircle, AlertCircle, Loader2,
    FileText, X, AlertTriangle, Users,
} from 'lucide-react'
import { cn } from '../lib/utils'

/* ── Tipos ──────────────────────────────────────────────────────────────── */

interface CsvRow {
    identificacion: string
    nombre: string
    email: string
    telefono: string
    direccion: string
}

interface ImportSummary {
    inserted: number
    skipped: number
    errors: number
    errorMessages: string[]
}

/* ── Utilidades ─────────────────────────────────────────────────────────── */

const BATCH_SIZE = 100

// Separa una línea de CSV respetando comillas (RFC 4180): un campo que
// empieza con " puede contener el delimitador o comillas escapadas como ""
// sin que se corten las columnas. Sin esto, una dirección/nombre con
// comillas quedaba guardado con las comillas incluidas.
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

function parseCsvClientes(text: string): CsvRow[] {
    const lines = text.split(/\r?\n/)
    const rows: CsvRow[] = []
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const p = splitCsvLine(line, ';')
        const identificacion = (p[0] ?? '').trim()
        const nombre         = (p[1] ?? '').trim()
        if (!identificacion || !nombre) continue
        rows.push({
            identificacion,
            nombre,
            email:    (p[2] ?? '').trim(),
            telefono: (p[3] ?? '').trim(),
            direccion:(p[4] ?? '').trim(),
        })
    }
    return rows
}

/* ── Componente ─────────────────────────────────────────────────────────── */

export function ImportarClientesPage() {
    const { empresa } = useAuth()

    // Export
    const [exporting, setExporting] = useState(false)

    // Import
    const fileRef = useRef<HTMLInputElement>(null)
    const [fileName, setFileName]     = useState('')
    const [allRows, setAllRows]       = useState<CsvRow[]>([])
    const [parseError, setParseError] = useState('')
    const [importing, setImporting]   = useState(false)
    const [progress, setProgress]     = useState({ current: 0, total: 0 })
    const [summary, setSummary]       = useState<ImportSummary | null>(null)

    /* ── Exportar ────────────────────────────────────────────────────── */
    async function handleExport() {
        if (!empresa?.id) return
        setExporting(true)
        try {
            const { data, error } = await supabase
                .from('clientes')
                .select('identificacion, nombre, email, telefono, direccion')
                .eq('empresa_id', empresa.id)
                .neq('identificacion', '9999999999999')   // excluir Consumidor Final
                .order('nombre')
            if (error) throw error

            const header = [['identificacion', 'nombre', 'email', 'telefono', 'direccion']]
            const rows = (data ?? []).map((c: any) => [
                c.identificacion ?? '',
                c.nombre ?? '',
                c.email ?? '',
                c.telefono ?? '',
                c.direccion ?? '',
            ])
            const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
            ws['!cols'] = [16, 35, 28, 14, 40].map(w => ({ wch: w }))
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
            XLSX.writeFile(wb, `Clientes_${empresa.nombre ?? 'empresa'}_${new Date().toISOString().split('T')[0]}.xlsx`)
        } catch (e: any) {
            alert('Error al exportar: ' + e.message)
        } finally {
            setExporting(false)
        }
    }

    /* ── Cargar archivo ──────────────────────────────────────────────── */
    const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setParseError(''); setSummary(null); setFileName(file.name)
        const reader = new FileReader()
        reader.onload = (ev) => {
            try {
                const text = ev.target?.result as string
                const parsed = parseCsvClientes(text)
                if (!parsed.length) { setParseError('No se encontraron filas válidas.'); setAllRows([]); return }
                setAllRows(parsed)
            } catch { setParseError('Error al leer el archivo.'); setAllRows([]) }
        }
        reader.readAsText(file, 'UTF-8')
    }, [])

    const handleClear = useCallback(() => {
        setFileName(''); setAllRows([]); setParseError(''); setSummary(null)
        setProgress({ current: 0, total: 0 })
        if (fileRef.current) fileRef.current.value = ''
    }, [])

    /* ── Importar ────────────────────────────────────────────────────── */
    const handleImport = useCallback(async () => {
        if (!allRows.length || !empresa?.id) return
        setImporting(true); setSummary(null)

        const result: ImportSummary = { inserted: 0, skipped: 0, errors: 0, errorMessages: [] }

        try {
            // Identificaciones ya existentes
            const ids = allRows.map(r => r.identificacion)
            const { data: existentes } = await supabase
                .from('clientes').select('identificacion').eq('empresa_id', empresa.id).in('identificacion', ids)
            const setExist = new Set((existentes ?? []).map((c: any) => c.identificacion))

            const total = allRows.length
            setProgress({ current: 0, total })

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batch = allRows.slice(i, i + BATCH_SIZE)
                const toInsert = batch
                    .filter(r => !setExist.has(r.identificacion))
                    .map(r => ({
                        empresa_id:    empresa.id,
                        identificacion: r.identificacion,
                        nombre:         r.nombre,
                        email:          r.email || null,
                        telefono:       r.telefono || null,
                        direccion:      r.direccion || null,
                    }))

                result.skipped += batch.length - toInsert.length

                if (toInsert.length > 0) {
                    const { error } = await supabase.from('clientes').insert(toInsert)
                    if (error) {
                        result.errors += toInsert.length
                        result.errorMessages.push(`Error lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
                    } else {
                        result.inserted += toInsert.length
                    }
                }
                setProgress({ current: Math.min(i + BATCH_SIZE, total), total })
            }
        } catch (e: any) {
            result.errorMessages.push(e.message)
        } finally {
            setSummary(result); setImporting(false)
        }
    }, [allRows, empresa?.id])

    const preview = allRows.slice(0, 20)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-6 h-6 text-primary-600" /> Clientes
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Exporta tu lista de clientes a Excel o importa clientes desde un archivo CSV.
                    Empresa: <span className="font-medium">{empresa?.nombre || 'N/A'}</span>
                </p>
            </div>

            {/* Exportar */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="font-semibold text-slate-800 mb-1">Exportar clientes</h2>
                <p className="text-sm text-slate-500 mb-4">
                    Descarga todos los clientes registrados en un archivo Excel (.xlsx).
                </p>
                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Descargar clientes (.xlsx)
                </button>
            </div>

            {/* Separador */}
            <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                <div className="relative flex justify-center"><span className="bg-slate-50 px-4 text-sm text-slate-400">Importar clientes</span></div>
            </div>

            {/* Formato CSV */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">Formato del archivo CSV (separador: punto y coma)</p>
                <p className="font-mono text-xs bg-white border border-blue-100 rounded px-3 py-2 mt-1">
                    identificacion;nombre;email;telefono;direccion
                </p>
                <ul className="text-xs text-blue-600 mt-2 space-y-0.5">
                    <li><strong>identificacion</strong> — RUC (13 dígitos), Cédula (10 dígitos) o Pasaporte <span className="text-red-500">*obligatorio*</span></li>
                    <li><strong>nombre</strong> — Razón social o nombre completo <span className="text-red-500">*obligatorio*</span></li>
                    <li><strong>email</strong> — Correo electrónico (opcional)</li>
                    <li><strong>telefono</strong> — Teléfono o celular (opcional)</li>
                    <li><strong>direccion</strong> — Dirección (opcional)</li>
                </ul>
                <p className="text-xs text-blue-500 mt-2">
                    La primera fila se omite (encabezados). Los clientes con identificación ya existente se saltan automáticamente.
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
                        <label className="mt-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg font-semibold cursor-pointer hover:bg-primary-700 text-sm">
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
                                <p className="text-sm text-slate-500">{allRows.length.toLocaleString()} clientes válidos</p>
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

            {/* Vista previa */}
            {allRows.length > 0 && !summary && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b flex items-center justify-between">
                        <h2 className="font-semibold text-slate-800">
                            Vista previa
                            <span className="text-sm font-normal text-slate-500 ml-2">
                                (primeras {Math.min(20, allRows.length)} de {allRows.length.toLocaleString()})
                            </span>
                        </h2>
                        <button
                            onClick={handleImport}
                            disabled={importing}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm",
                                importing ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-primary-600 text-white hover:bg-primary-700"
                            )}
                        >
                            {importing
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando {progress.current}/{progress.total}...</>
                                : <><Upload className="w-4 h-4" /> Importar {allRows.length.toLocaleString()} clientes</>
                            }
                        </button>
                    </div>

                    {importing && progress.total > 0 && (
                        <div className="px-5 py-2 bg-slate-50 border-b">
                            <div className="w-full bg-slate-200 rounded-full h-2">
                                <div className="bg-primary-600 h-2 rounded-full transition-all"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-600 text-left">
                                    <th className="px-4 py-2.5 font-semibold">#</th>
                                    <th className="px-4 py-2.5 font-semibold">Identificación</th>
                                    <th className="px-4 py-2.5 font-semibold">Nombre</th>
                                    <th className="px-4 py-2.5 font-semibold">Email</th>
                                    <th className="px-4 py-2.5 font-semibold">Teléfono</th>
                                    <th className="px-4 py-2.5 font-semibold">Dirección</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {preview.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                                        <td className="px-4 py-2 font-mono text-xs">{row.identificacion}</td>
                                        <td className="px-4 py-2 font-medium">{row.nombre}</td>
                                        <td className="px-4 py-2 text-slate-500 text-xs">{row.email || '—'}</td>
                                        <td className="px-4 py-2 text-slate-500">{row.telefono || '—'}</td>
                                        <td className="px-4 py-2 text-slate-500 text-xs">{row.direccion || '—'}</td>
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

            {/* Resumen */}
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
                                <p className="text-2xl font-bold text-amber-700">{summary.skipped.toLocaleString()}</p>
                                <p className="text-sm text-amber-600">Ya existían</p>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                                <p className="text-2xl font-bold text-red-700">{summary.errors.toLocaleString()}</p>
                                <p className="text-sm text-red-600">Errores</p>
                            </div>
                        </div>
                        {summary.errorMessages.length > 0 && (
                            <div>
                                <p className="flex items-center gap-2 text-sm font-medium text-red-700 mb-2">
                                    <AlertTriangle className="w-4 h-4" /> Errores:
                                </p>
                                <div className="max-h-40 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                                    {summary.errorMessages.map((m, i) => <p key={i} className="text-xs text-red-700">{m}</p>)}
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
