import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
    Upload, CheckCircle, AlertCircle, Loader2,
    FileText, AlertTriangle, Wallet, Download, ShieldAlert,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { formatCurrency } from '../lib/utils'

/* ── Tipos ──────────────────────────────────────────────────────────────── */

interface CsvRow {
    identificacion: string
    numero_documento: string
    fecha_emision: string       // DD/MM/YYYY
    fecha_vencimiento: string   // DD/MM/YYYY | ''
    valor_original: number
    saldo: number
    observaciones: string
}

interface RowResult {
    row: number
    identificacion: string
    numero_documento: string
    status: 'ok' | 'error' | 'skip'
    message: string
}

interface ImportSummary {
    inserted: number
    skipped: number
    errors: number
    results: RowResult[]
}

/* ── Utilidades ─────────────────────────────────────────────────────────── */

/** Convierte DD/MM/YYYY → YYYY-MM-DD. Devuelve null si inválido o vacío. */
function parseFecha(raw: string): string | null {
    const t = raw.trim()
    if (!t) return null
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!m) return null
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseNumero(raw: string): number | null {
    const n = parseFloat(raw.replace(',', '.').trim())
    return isNaN(n) ? null : n
}

function parseCsv(text: string): CsvRow[] {
    const lines = text.split(/\r?\n/)
    const rows: CsvRow[] = []
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const p = line.split(';')
        const identificacion   = (p[0] ?? '').trim()
        const numero_documento = (p[1] ?? '').trim()
        const fecha_emision    = (p[2] ?? '').trim()
        const fecha_vencimiento = (p[3] ?? '').trim()
        const valor_original   = parseNumero(p[4] ?? '') ?? 0
        const saldo            = parseNumero(p[5] ?? '') ?? 0
        const observaciones    = (p[6] ?? '').trim()

        if (!identificacion || !numero_documento) continue
        rows.push({ identificacion, numero_documento, fecha_emision, fecha_vencimiento, valor_original, saldo, observaciones })
    }
    return rows
}

/* ── Componente ─────────────────────────────────────────────────────────── */

export function MigrarCarteraPage() {
    const { empresa } = useAuth()
    const fileRef = useRef<HTMLInputElement>(null)

    const [file, setFile] = useState<File | null>(null)
    const [rows, setRows] = useState<CsvRow[]>([])
    const [importing, setImporting] = useState(false)
    const [summary, setSummary] = useState<ImportSummary | null>(null)
    const [migrationReady, setMigrationReady] = useState<boolean | null>(null)  // null=checking

    /* Verificar si la migración SQL fue ejecutada en Supabase */
    useEffect(() => {
        if (!empresa?.id) return
        supabase
            .from('cartera_cxc')
            .select('origen')
            .eq('empresa_id', empresa.id)
            .limit(1)
            .then(({ error }) => {
                if (error?.message?.toLowerCase().includes('origen') ||
                    error?.message?.toLowerCase().includes('does not exist') ||
                    error?.message?.toLowerCase().includes('no existe')) {
                    setMigrationReady(false)
                } else {
                    setMigrationReady(true)
                }
            })
    }, [empresa?.id])

    /* ── Lectura del archivo ───────────────────────────────────────────── */
    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0]
        if (!f) return
        setFile(f)
        setSummary(null)

        const reader = new FileReader()
        reader.onload = ev => {
            const text = ev.target?.result as string
            const parsed = parseCsv(text)
            setRows(parsed)
        }
        reader.readAsText(f, 'UTF-8')
    }

    /* ── Importar ─────────────────────────────────────────────────────── */
    async function handleImport() {
        if (!empresa?.id || rows.length === 0) return
        setImporting(true)
        setSummary(null)

        const results: RowResult[] = []
        let inserted = 0
        let skipped  = 0
        let errors   = 0

        for (let idx = 0; idx < rows.length; idx++) {
            const row = rows[idx]
            const rowNum = idx + 2  // +2: header + 1-based

            // Validaciones básicas
            if (!row.identificacion) {
                results.push({ row: rowNum, identificacion: '—', numero_documento: row.numero_documento, status: 'error', message: 'Identificación vacía' })
                errors++; continue
            }
            const fechaEm = parseFecha(row.fecha_emision)
            if (!fechaEm) {
                results.push({ row: rowNum, identificacion: row.identificacion, numero_documento: row.numero_documento, status: 'error', message: `Fecha emisión inválida: "${row.fecha_emision}" (use DD/MM/YYYY)` })
                errors++; continue
            }
            if (row.valor_original <= 0) {
                results.push({ row: rowNum, identificacion: row.identificacion, numero_documento: row.numero_documento, status: 'error', message: 'valor_original debe ser mayor a 0' })
                errors++; continue
            }
            if (row.saldo < 0) {
                results.push({ row: rowNum, identificacion: row.identificacion, numero_documento: row.numero_documento, status: 'error', message: 'saldo no puede ser negativo' })
                errors++; continue
            }

            // Buscar cliente por identificación
            const { data: cliente } = await supabase
                .from('clientes')
                .select('id, nombre')
                .eq('empresa_id', empresa!.id)
                .eq('identificacion', row.identificacion)
                .maybeSingle()

            if (!cliente) {
                results.push({ row: rowNum, identificacion: row.identificacion, numero_documento: row.numero_documento, status: 'skip', message: `Cliente con identificación "${row.identificacion}" no encontrado — créelo primero` })
                skipped++; continue
            }

            // Determinar estado según saldo
            const estado =
                row.saldo <= 0              ? 'pagada'   :
                row.saldo < row.valor_original ? 'parcial'  : 'pendiente'

            // Omitir cartera ya completamente pagada (saldo = 0)
            if (row.saldo <= 0) {
                results.push({ row: rowNum, identificacion: row.identificacion, numero_documento: row.numero_documento, status: 'skip', message: 'Saldo = 0, registro omitido (ya pagado)' })
                skipped++; continue
            }

            const fechaVenc = parseFecha(row.fecha_vencimiento)

            const { error } = await supabase
                .from('cartera_cxc')
                .insert({
                    empresa_id:               empresa!.id,
                    cliente_id:               cliente.id,
                    comprobante_id:           null,
                    numero_documento_externo: row.numero_documento,
                    fecha_emision:            fechaEm,
                    fecha_vencimiento:        fechaVenc ?? null,
                    valor_original:           row.valor_original,
                    saldo:                    row.saldo,
                    estado,
                    observaciones:            row.observaciones || null,
                    origen:                   'MIGRACION',
                })

            if (error) {
                const isMigErr = error.message.toLowerCase().includes('origen') ||
                    error.message.toLowerCase().includes('numero_documento_externo') ||
                    error.message.toLowerCase().includes('not-null') ||
                    error.message.toLowerCase().includes('null value in column')
                const msg = isMigErr
                    ? `Error de esquema — ejecuta el SQL de migración en Supabase SQL Editor primero (${error.message})`
                    : error.message
                if (isMigErr) setMigrationReady(false)
                results.push({ row: rowNum, identificacion: row.identificacion, numero_documento: row.numero_documento, status: 'error', message: msg })
                errors++
            } else {
                results.push({ row: rowNum, identificacion: row.identificacion, numero_documento: row.numero_documento, status: 'ok', message: `${cliente.nombre} — ${formatCurrency(row.saldo)} pendiente` })
                inserted++
            }
        }

        setSummary({ inserted, skipped, errors, results })
        setImporting(false)
    }

    /* ── Descargar plantilla ─────────────────────────────────────────── */
    function downloadTemplate() {
        const header = 'identificacion;numero_documento;fecha_emision;fecha_vencimiento;valor_original;saldo;observaciones'
        const example = [
            '0912345678001;FAC-2025-0001;15/01/2025;14/02/2025;1500.00;1200.00;Saldo de factura enero',
            '1712345678;001-001-000000123;20/03/2025;;800.00;800.00;',
            '9999999999999;NC-2025-005;01/04/2025;30/04/2025;250.00;250.00;Nota de crédito',
        ]
        const csv = [header, ...example].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'plantilla_migracion_cartera.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    const totalSaldo = rows.reduce((s, r) => s + r.saldo, 0)

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Wallet className="w-7 h-7 text-primary-600" />
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Migración de Cartera</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Importa cuentas por cobrar pendientes desde un sistema externo</p>
                </div>
            </div>

            {/* Banner: migración SQL pendiente */}
            {migrationReady === false && (
                <div className="bg-red-50 border border-red-300 rounded-2xl p-5 flex gap-4">
                    <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <p className="text-sm font-bold text-red-800">
                            Paso previo obligatorio: ejecutar el SQL de migración en Supabase
                        </p>
                        <p className="text-sm text-red-700">
                            La base de datos no tiene las columnas necesarias para esta función.
                            Ve a <strong>Supabase → SQL Editor</strong> y ejecuta el siguiente script:
                        </p>
                        <pre className="bg-red-100 text-red-900 rounded-xl p-3 text-xs overflow-x-auto whitespace-pre-wrap select-all">
{`-- Permitir comprobante_id NULL (registros migrados no tienen comprobante interno)
ALTER TABLE facturacion.cartera_cxc
    ALTER COLUMN comprobante_id DROP NOT NULL;

-- Número de documento externo (referencia del sistema anterior)
ALTER TABLE facturacion.cartera_cxc
    ADD COLUMN IF NOT EXISTS numero_documento_externo TEXT;

-- Origen del registro
ALTER TABLE facturacion.cartera_cxc
    ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'SISTEMA'
    CHECK (origen IN ('SISTEMA', 'MIGRACION'));

CREATE INDEX IF NOT EXISTS idx_cartera_cxc_origen
    ON facturacion.cartera_cxc(empresa_id, origen);`}
                        </pre>
                        <p className="text-xs text-red-600">
                            Después de ejecutarlo, recarga esta página.
                        </p>
                    </div>
                </div>
            )}

            {/* Info CSV */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-bold text-blue-800 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Formato del archivo CSV (separador: punto y coma)
                </p>
                <div className="overflow-x-auto">
                    <table className="text-xs w-full">
                        <thead>
                            <tr className="text-left text-blue-700 border-b border-blue-200">
                                <th className="pb-1.5 pr-4 font-bold">Columna</th>
                                <th className="pb-1.5 pr-4 font-bold">Obligatorio</th>
                                <th className="pb-1.5 font-bold">Descripción</th>
                            </tr>
                        </thead>
                        <tbody className="text-blue-900">
                            {[
                                ['identificacion',    '✅', 'Cédula o RUC del cliente (debe existir en el sistema)'],
                                ['numero_documento',  '✅', 'Número de factura/documento del sistema anterior'],
                                ['fecha_emision',     '✅', 'Fecha DD/MM/YYYY'],
                                ['fecha_vencimiento', '—',  'Fecha DD/MM/YYYY — dejar vacío si no aplica'],
                                ['valor_original',    '✅', 'Monto total original del documento (ej: 1500.00)'],
                                ['saldo',             '✅', 'Saldo pendiente actual (puede ser menor si hay abonos)'],
                                ['observaciones',     '—',  'Notas opcionales'],
                            ].map(([col, req, desc]) => (
                                <tr key={col} className="border-b border-blue-100 last:border-0">
                                    <td className="py-1.5 pr-4 font-mono font-semibold">{col}</td>
                                    <td className="py-1.5 pr-4 text-center">{req}</td>
                                    <td className="py-1.5">{desc}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="pt-1">
                    <button
                        onClick={downloadTemplate}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                    >
                        <Download className="w-4 h-4" /> Descargar plantilla CSV
                    </button>
                </div>
            </div>

            {/* Selección de archivo */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Seleccionar archivo</h2>
                <div
                    onClick={() => fileRef.current?.click()}
                    className={cn(
                        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                        file ? 'border-primary-300 bg-primary-50' : 'border-slate-200 hover:border-primary-300 hover:bg-primary-50'
                    )}
                >
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    {file ? (
                        <p className="text-sm font-semibold text-primary-700">{file.name}</p>
                    ) : (
                        <p className="text-sm text-slate-500">Haga clic para seleccionar el archivo CSV</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Solo archivos .csv, separados por punto y coma (;)</p>
                    <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                </div>

                {rows.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <p className="text-sm text-slate-600">
                                <strong>{rows.length}</strong> registros detectados ·
                                Saldo total: <strong className="text-primary-700">{formatCurrency(totalSaldo)}</strong>
                            </p>
                        </div>

                        {/* Preview primeras 5 filas */}
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-500 uppercase">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">#</th>
                                        <th className="px-3 py-2 text-left font-semibold">Identificación</th>
                                        <th className="px-3 py-2 text-left font-semibold">N° Documento</th>
                                        <th className="px-3 py-2 text-left font-semibold">Fecha Emis.</th>
                                        <th className="px-3 py-2 text-right font-semibold">V. Original</th>
                                        <th className="px-3 py-2 text-right font-semibold">Saldo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 5).map((r, i) => (
                                        <tr key={i} className="border-t border-slate-100">
                                            <td className="px-3 py-2 text-slate-400">{i + 2}</td>
                                            <td className="px-3 py-2 font-mono">{r.identificacion}</td>
                                            <td className="px-3 py-2">{r.numero_documento}</td>
                                            <td className="px-3 py-2">{r.fecha_emision}</td>
                                            <td className="px-3 py-2 text-right">{formatCurrency(r.valor_original)}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-primary-700">{formatCurrency(r.saldo)}</td>
                                        </tr>
                                    ))}
                                    {rows.length > 5 && (
                                        <tr className="border-t border-slate-100 bg-slate-50">
                                            <td colSpan={6} className="px-3 py-2 text-center text-slate-400 italic">
                                                … y {rows.length - 5} registros más
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <button
                            onClick={handleImport}
                            disabled={importing || migrationReady === false}
                            title={migrationReady === false ? 'Ejecuta el SQL de migración en Supabase primero' : undefined}
                            className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {importing
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando…</>
                                : <><Upload className="w-4 h-4" /> Importar {rows.length} registros</>
                            }
                        </button>
                    </div>
                )}
            </div>

            {/* Resultado */}
            {summary && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* KPIs */}
                    <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                        <div className="p-5 text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Importados</p>
                            <p className="text-3xl font-black text-emerald-600 mt-1">{summary.inserted}</p>
                        </div>
                        <div className="p-5 text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Omitidos</p>
                            <p className="text-3xl font-black text-amber-500 mt-1">{summary.skipped}</p>
                        </div>
                        <div className="p-5 text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Errores</p>
                            <p className="text-3xl font-black text-red-500 mt-1">{summary.errors}</p>
                        </div>
                    </div>

                    {/* Detalle */}
                    <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
                        {summary.results.map((r, i) => (
                            <div key={i} className={cn(
                                'flex items-start gap-3 p-3 rounded-xl text-sm',
                                r.status === 'ok'    && 'bg-emerald-50',
                                r.status === 'skip'  && 'bg-amber-50',
                                r.status === 'error' && 'bg-red-50',
                            )}>
                                {r.status === 'ok'    && <CheckCircle   className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                                {r.status === 'skip'  && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                                {r.status === 'error' && <AlertCircle   className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                                <div className="min-w-0">
                                    <span className="text-xs text-slate-400 mr-2">Fila {r.row}</span>
                                    <span className="font-mono text-xs font-semibold mr-2">{r.identificacion}</span>
                                    <span className="text-xs text-slate-500 mr-2">{r.numero_documento}</span>
                                    <span className={cn(
                                        'text-xs',
                                        r.status === 'ok'    && 'text-emerald-700',
                                        r.status === 'skip'  && 'text-amber-700',
                                        r.status === 'error' && 'text-red-600 font-semibold',
                                    )}>{r.message}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {summary.inserted > 0 && (
                        <div className="px-5 pb-5">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                <p className="text-sm font-semibold text-emerald-800">
                                    ✓ {summary.inserted} registros importados correctamente.
                                    Ya están disponibles en el módulo de Cartera CxC.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
