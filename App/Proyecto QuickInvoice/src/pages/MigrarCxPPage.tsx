import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { proveedorService, cxpService } from '../services/vendorService'
import type { TipoProveedor } from '../types/vendors'
import {
    Upload, CheckCircle, AlertCircle, Loader2,
    FileText, AlertTriangle, Truck, Download, ShieldAlert, Sparkles,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { formatCurrency } from '../lib/utils'
import { HelpButton } from '../components/help/HelpButton'

/* ── Tipos ──────────────────────────────────────────────────────────────── */

interface CsvRow {
    ruc_proveedor: string
    nombre_proveedor: string     // solo se usa si el RUC no existe y el SRI no responde
    numero_documento: string
    fecha_emision: string        // DD/MM/YYYY
    fecha_vencimiento: string    // DD/MM/YYYY | ''
    monto_original: number
    saldo_pendiente: number
    observaciones: string
    // true si la celda de origen traía punto Y coma a la vez — ver parseNumero.
    montoOriginalAmbiguo: boolean
    saldoAmbiguo: boolean
}

interface RowResult {
    row: number
    ruc: string
    numero_documento: string
    status: 'ok' | 'error' | 'skip'
    message: string
    proveedorCreado?: boolean
}

interface ImportSummary {
    inserted: number
    skipped: number
    errors: number
    proveedoresCreados: number
    results: RowResult[]
}

/* ── Utilidades ─────────────────────────────────────────────────────────── */

type FieldDelimiter = ';' | ','

/** Convierte DD/MM/YYYY o DD-MM-YYYY → YYYY-MM-DD. Devuelve null si inválido o vacío. */
function parseFecha(raw: string): string | null {
    const t = raw.trim()
    if (!t) return null
    const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (!m) return null
    const [, d, mo, y] = m
    if (Number(mo) > 12 || Number(d) > 31) return null
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Acepta "1500,00" y "1500.00" indistintamente. Si trae ambos separadores
// (ej. "1.500,00" o "1,500.00"), asume que el último es el decimal.
function parseNumero(val: string): number | null {
    let s = (val ?? '').trim()
    if (!s) return null
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
    return isNaN(n) ? null : n
}

// Trae punto Y coma a la vez → el parseo tiene que adivinar cuál es el
// separador decimal (ver parseNumero). Vale la pena que el usuario lo
// confirme visualmente antes de importar.
function isAmbiguousNumber(val: string): boolean {
    const s = (val ?? '').trim()
    return s.includes(',') && s.includes('.')
}

// Separa una línea de CSV respetando comillas (RFC 4180): un campo que
// empieza con " puede contener el delimitador o comillas escapadas como ""
// sin que se corten las columnas (ej. observaciones con comas si el
// separador elegido es punto y coma).
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

function parseCsv(text: string, delimiter: FieldDelimiter): CsvRow[] {
    const lines = text.split(/\r?\n/)
    const rows: CsvRow[] = []
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const p = splitCsvLine(line, delimiter)
        const ruc_proveedor    = (p[0] ?? '').trim()
        const nombre_proveedor = (p[1] ?? '').trim()
        const numero_documento = (p[2] ?? '').trim()
        const fecha_emision    = (p[3] ?? '').trim()
        const fecha_vencimiento = (p[4] ?? '').trim()
        const montoOriginalRaw = p[5] ?? ''
        const saldoRaw          = p[6] ?? ''
        const monto_original   = parseNumero(montoOriginalRaw) ?? 0
        const saldo_pendiente  = parseNumero(saldoRaw) ?? 0
        const observaciones    = (p[7] ?? '').trim()

        if (!ruc_proveedor || !numero_documento) continue
        rows.push({
            ruc_proveedor, nombre_proveedor, numero_documento, fecha_emision, fecha_vencimiento,
            monto_original, saldo_pendiente, observaciones,
            montoOriginalAmbiguo: isAmbiguousNumber(montoOriginalRaw),
            saldoAmbiguo: isAmbiguousNumber(saldoRaw),
        })
    }
    return rows
}

/* ── Componente ─────────────────────────────────────────────────────────── */

export function MigrarCxPPage() {
    const { empresa } = useAuth()
    const fileRef = useRef<HTMLInputElement>(null)

    const [file, setFile] = useState<File | null>(null)
    const [rawText, setRawText] = useState('')
    const [delimiter, setDelimiter] = useState<FieldDelimiter>(';')
    const [rows, setRows] = useState<CsvRow[]>([])
    const [parseError, setParseError] = useState('')
    const [importing, setImporting] = useState(false)
    const [summary, setSummary] = useState<ImportSummary | null>(null)
    const [migrationReady, setMigrationReady] = useState<boolean | null>(null)  // null=checking

    /* Verificar si la migración SQL fue ejecutada en Supabase */
    useEffect(() => {
        if (!empresa?.id) return
        supabase
            .from('cuentas_por_pagar')
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
        setParseError('')

        const reader = new FileReader()
        reader.onload = ev => {
            const text = ev.target?.result as string
            setRawText(text)
        }
        reader.onerror = () => setParseError('Error al leer el archivo CSV.')
        reader.readAsText(f, 'UTF-8')
    }

    // Reparsea si cambia el archivo o el separador de campo elegido — así el
    // usuario puede cambiar de ; a , (o viceversa) sin tener que reseleccionar
    // el archivo si al inicio no detecta filas válidas.
    useEffect(() => {
        if (!rawText) return
        try {
            const parsed = parseCsv(rawText, delimiter)
            if (parsed.length === 0) {
                setParseError('No se encontraron filas válidas con este separador. Prueba cambiar el separador de campo.')
                setRows([])
                return
            }
            setParseError('')
            setRows(parsed)
        } catch {
            setParseError('Error al leer el archivo CSV.')
            setRows([])
        }
    }, [rawText, delimiter])

    /* ── Resolver proveedor por RUC — buscar, o consultar SRI y crear ──── */
    async function resolverProveedor(row: CsvRow): Promise<{ id: string; nombre: string; creado: boolean } | { error: string }> {
        const { data: existente } = await supabase
            .from('proveedores')
            .select('id, nombre_empresa')
            .eq('empresa_id', empresa!.id)
            .eq('ruc', row.ruc_proveedor)
            .maybeSingle()

        if (existente) return { id: existente.id, nombre: existente.nombre_empresa, creado: false }

        // No existe — intentar resolver en el SRI
        let nombreSri: string | undefined
        try {
            const { data } = await supabase.functions.invoke('sri-lookup', { body: { identificacion: row.ruc_proveedor } })
            nombreSri = data?.razonSocial || data?.nombreCompleto
        } catch {
            // sin conexión al SRI — seguimos con el nombre del CSV si vino
        }

        const nombreFinal = nombreSri || row.nombre_proveedor
        if (!nombreFinal) {
            return { error: `RUC "${row.ruc_proveedor}" no encontrado en el SRI ni en el sistema — agregue "nombre_proveedor" en el CSV para crearlo` }
        }

        const tercerDigito = parseInt(row.ruc_proveedor[2] ?? '9', 10)
        const tipoProveedor: TipoProveedor = tercerDigito <= 5 ? 'PERSONA_NATURAL' : 'SOCIEDAD'

        try {
            const nuevo = await proveedorService.crear({
                empresa_id:             empresa!.id,
                ruc:                    row.ruc_proveedor,
                nombre_empresa:         nombreFinal,
                tipo_identificacion:    'RUC',
                tipo_proveedor:         tipoProveedor,
                estado:                 'ACTIVO',
                condicion_pago:         'CREDITO',
                pais:                   'Ecuador',
                contribuyente_especial: false,
                agente_retencion:       false,
                tipo_regimen:           'GENERAL',
            })
            return { id: nuevo.id, nombre: nuevo.nombre_empresa, creado: true }
        } catch (e: any) {
            return { error: `No se pudo crear el proveedor: ${e.message}` }
        }
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
        let proveedoresCreados = 0

        for (let idx = 0; idx < rows.length; idx++) {
            const row = rows[idx]
            const rowNum = idx + 2  // +2: header + 1-based

            // Validaciones básicas
            if (!row.ruc_proveedor) {
                results.push({ row: rowNum, ruc: '—', numero_documento: row.numero_documento, status: 'error', message: 'RUC/identificación vacía' })
                errors++; continue
            }
            const fechaEm = parseFecha(row.fecha_emision)
            if (!fechaEm) {
                results.push({ row: rowNum, ruc: row.ruc_proveedor, numero_documento: row.numero_documento, status: 'error', message: `Fecha emisión inválida: "${row.fecha_emision}" (use DD/MM/YYYY o DD-MM-YYYY)` })
                errors++; continue
            }
            if (row.monto_original <= 0) {
                results.push({ row: rowNum, ruc: row.ruc_proveedor, numero_documento: row.numero_documento, status: 'error', message: 'monto_original debe ser mayor a 0' })
                errors++; continue
            }
            if (row.saldo_pendiente < 0) {
                results.push({ row: rowNum, ruc: row.ruc_proveedor, numero_documento: row.numero_documento, status: 'error', message: 'saldo_pendiente no puede ser negativo' })
                errors++; continue
            }

            // Omitir deuda ya completamente pagada (saldo = 0)
            if (row.saldo_pendiente <= 0) {
                results.push({ row: rowNum, ruc: row.ruc_proveedor, numero_documento: row.numero_documento, status: 'skip', message: 'Saldo = 0, registro omitido (ya pagado)' })
                skipped++; continue
            }

            // Buscar proveedor por RUC, o consultarlo en el SRI y crearlo
            const proveedor = await resolverProveedor(row)
            if ('error' in proveedor) {
                results.push({ row: rowNum, ruc: row.ruc_proveedor, numero_documento: row.numero_documento, status: 'error', message: proveedor.error })
                errors++; continue
            }
            if (proveedor.creado) proveedoresCreados++

            const estado =
                row.saldo_pendiente < row.monto_original ? 'PARCIALMENTE_PAGADO' : 'PENDIENTE'

            const fechaVenc = parseFecha(row.fecha_vencimiento)

            try {
                await cxpService.crear({
                    empresa_id:               empresa!.id,
                    proveedor_id:             proveedor.id,
                    compra_id:                null,
                    liquidacion_id:           null,
                    numero_documento_externo: row.numero_documento,
                    fecha_emision:            fechaEm,
                    fecha_vencimiento:        fechaVenc ?? fechaEm,
                    monto_original:           row.monto_original,
                    saldo_pendiente:          row.saldo_pendiente,
                    estado,
                    observaciones:            row.observaciones || undefined,
                    origen:                   'MIGRACION',
                })
                results.push({
                    row: rowNum, ruc: row.ruc_proveedor, numero_documento: row.numero_documento, status: 'ok',
                    message: `${proveedor.nombre} — ${formatCurrency(row.saldo_pendiente)} pendiente`,
                    proveedorCreado: proveedor.creado,
                })
                inserted++
            } catch (e: any) {
                const msg = e.message as string
                const isMigErr = msg.toLowerCase().includes('origen') ||
                    msg.toLowerCase().includes('numero_documento_externo') ||
                    msg.toLowerCase().includes('does not exist')
                if (isMigErr) setMigrationReady(false)
                results.push({
                    row: rowNum, ruc: row.ruc_proveedor, numero_documento: row.numero_documento, status: 'error',
                    message: isMigErr ? `Error de esquema — ejecuta el SQL de migración en Supabase SQL Editor primero (${msg})` : msg,
                })
                errors++
            }
        }

        setSummary({ inserted, skipped, errors, proveedoresCreados, results })
        setImporting(false)
    }

    /* ── Descargar plantilla ─────────────────────────────────────────── */
    function downloadTemplate() {
        const cols = ['ruc_proveedor', 'nombre_proveedor', 'numero_documento', 'fecha_emision', 'fecha_vencimiento', 'monto_original', 'saldo_pendiente', 'observaciones']
        const header = cols.join(delimiter)
        const example = [
            ['0912345678001', 'Distribuidora ABC S.A.', 'FAC-2025-0001', '15/01/2025', '14/02/2025', '1500.00', '1200.00', 'Saldo de factura enero'],
            ['1712345678', '', '001-001-000000123', '20/03/2025', '', '800.00', '800.00', 'Nombre vacío — se resuelve por SRI'],
            ['9999999999001', 'Proveedor sin RUC válido en SRI', 'NC-2025-005', '01/04/2025', '30/04/2025', '250.00', '250.00', ''],
        ].map(row => row.join(delimiter))
        const csv = [header, ...example].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'plantilla_migracion_cxp.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    const totalMontoOriginal = rows.reduce((s, r) => s + r.monto_original, 0)
    const totalSaldo = rows.reduce((s, r) => s + r.saldo_pendiente, 0)
    const filasAmbiguas = rows.filter(r => r.montoOriginalAmbiguo || r.saldoAmbiguo)

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Truck className="w-7 h-7 text-primary-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Migración de Deuda a Proveedores</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Importa cuentas por pagar pendientes desde un sistema externo</p>
                    </div>
                </div>
                <HelpButton pageKey="migrar-cxp" />
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
{`ALTER TABLE facturacion.cuentas_por_pagar
    ADD COLUMN IF NOT EXISTS numero_documento_externo TEXT,
    ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'COMPRA'
        CHECK (origen IN ('COMPRA', 'LIQUIDACION', 'MIGRACION'));`}
                        </pre>
                        <p className="text-xs text-red-600">
                            Después de ejecutarlo, recarga esta página.
                        </p>
                    </div>
                </div>
            )}

            {/* Info CSV */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <p className="text-sm font-bold text-blue-800 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Formato del archivo CSV
                    </p>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-blue-700 whitespace-nowrap">Separador de campo:</label>
                        <select
                            value={delimiter}
                            onChange={e => setDelimiter(e.target.value as FieldDelimiter)}
                            className="px-3 py-1.5 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            <option value=";">Punto y coma ( ; )</option>
                            <option value=",">Coma ( , )</option>
                        </select>
                    </div>
                </div>
                <p className="text-xs text-blue-600 -mt-1">
                    Los decimales de <strong>monto_original</strong> y <strong>saldo_pendiente</strong> pueden ir con coma o con punto (ej. 1500,00 o 1500.00).
                </p>
                <div className="flex items-start gap-2 bg-white border border-blue-100 rounded-lg p-3">
                    <Sparkles className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-800">
                        Si el RUC no existe todavía como proveedor, se consulta automáticamente en el SRI y se crea
                        con la razón social encontrada. Si el SRI no responde, se usa el "nombre_proveedor" del CSV
                        como respaldo — si ambos faltan, la fila queda en error.
                    </p>
                </div>
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
                                ['ruc_proveedor',     '✅', 'Cédula o RUC del proveedor'],
                                ['nombre_proveedor',  '—',  'Respaldo si el proveedor no existe y el SRI no responde'],
                                ['numero_documento',  '✅', 'Número de factura/documento del sistema anterior'],
                                ['fecha_emision',     '✅', 'Fecha DD/MM/YYYY o DD-MM-YYYY'],
                                ['fecha_vencimiento', '—',  'Fecha DD/MM/YYYY o DD-MM-YYYY — si se deja vacío, usa fecha_emision'],
                                ['monto_original',    '✅', 'Monto total original del documento (ej: 1500.00)'],
                                ['saldo_pendiente',   '✅', 'Saldo pendiente actual (puede ser menor si hay abonos)'],
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
                    <p className="text-xs text-slate-400 mt-1">
                        Solo archivos .csv — separador seleccionado arriba: {delimiter === ';' ? 'punto y coma ( ; )' : 'coma ( , )'}
                    </p>
                    <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                </div>

                {parseError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">{parseError}</p>
                    </div>
                )}

                {rows.length > 0 && (
                    <div className="space-y-3">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                            <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-2">
                                {rows.length} registros — sumas de control (compara contra SUMA() en tu Excel antes de importar)
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white rounded-lg border border-emerald-100 p-3">
                                    <p className="text-2xl font-bold text-slate-800 tabular-nums">{formatCurrency(totalMontoOriginal)}</p>
                                    <p className="text-xs text-slate-500">Suma columna "monto_original"</p>
                                </div>
                                <div className="bg-white rounded-lg border border-emerald-100 p-3">
                                    <p className="text-2xl font-bold text-primary-700 tabular-nums">{formatCurrency(totalSaldo)}</p>
                                    <p className="text-xs text-slate-500">Suma columna "saldo_pendiente"</p>
                                </div>
                            </div>
                            {filasAmbiguas.length > 0 && (
                                <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-800">
                                        <strong>{filasAmbiguas.length} fila{filasAmbiguas.length !== 1 ? 's' : ''}</strong> tienen monto_original o saldo_pendiente con punto Y coma a la vez
                                        (ej. "1.500,00") — marcadas en amarillo en la vista previa. El sistema asume cuál es el separador
                                        decimal, y en un valor así puede adivinar mal.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Preview primeras 5 filas */}
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-500 uppercase">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">#</th>
                                        <th className="px-3 py-2 text-left font-semibold">RUC</th>
                                        <th className="px-3 py-2 text-left font-semibold">N° Documento</th>
                                        <th className="px-3 py-2 text-left font-semibold">Fecha Emis.</th>
                                        <th className="px-3 py-2 text-right font-semibold">Monto Orig.</th>
                                        <th className="px-3 py-2 text-right font-semibold">Saldo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 5).map((r, i) => (
                                        <tr key={i} className={cn('border-t border-slate-100', (r.montoOriginalAmbiguo || r.saldoAmbiguo) && 'bg-amber-50')}>
                                            <td className="px-3 py-2 text-slate-400">{i + 2}</td>
                                            <td className="px-3 py-2 font-mono">{r.ruc_proveedor}</td>
                                            <td className="px-3 py-2">{r.numero_documento}</td>
                                            <td className="px-3 py-2">{r.fecha_emision}</td>
                                            <td className={cn('px-3 py-2 text-right', r.montoOriginalAmbiguo && 'text-amber-700 font-semibold')} title={r.montoOriginalAmbiguo ? 'Valor de origen con punto y coma a la vez — verificar' : undefined}>
                                                {formatCurrency(r.monto_original)}{r.montoOriginalAmbiguo && ' ⚠️'}
                                            </td>
                                            <td className={cn('px-3 py-2 text-right font-semibold', r.saldoAmbiguo ? 'text-amber-700' : 'text-primary-700')} title={r.saldoAmbiguo ? 'Valor de origen con punto y coma a la vez — verificar' : undefined}>
                                                {formatCurrency(r.saldo_pendiente)}{r.saldoAmbiguo && ' ⚠️'}
                                            </td>
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
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando… (consulta el SRI fila por fila, puede tardar)</>
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
                    <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                        <div className="p-5 text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Importados</p>
                            <p className="text-3xl font-black text-emerald-600 mt-1">{summary.inserted}</p>
                        </div>
                        <div className="p-5 text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Proveedores creados</p>
                            <p className="text-3xl font-black text-primary-600 mt-1">{summary.proveedoresCreados}</p>
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
                                    <span className="font-mono text-xs font-semibold mr-2">{r.ruc}</span>
                                    <span className="text-xs text-slate-500 mr-2">{r.numero_documento}</span>
                                    {r.proveedorCreado && (
                                        <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded mr-2">proveedor nuevo (SRI)</span>
                                    )}
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
                                    Ya están disponibles en el módulo de Cuentas por Pagar.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
