import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { HelpButton } from '../../components/help/HelpButton'
import {
    Upload, CheckCircle, AlertCircle, Loader2,
    FileText, AlertTriangle, Wallet, Download, ShieldAlert,
} from 'lucide-react'
import { cn, formatCurrency } from '../../lib/utils'
import { ACCEPT_CSV_EXCEL, esArchivoExcel, leerFilasExcel } from '../../lib/excelRows'

/* ── Tipos ──────────────────────────────────────────────────────────────── */

interface FilaCuota {
    identificacion: string
    numero_factura: string
    cobrador: string
    numero_cuota: number
    numero_cuotas_total: number
    fecha_vencimiento: string   // DD/MM/YYYY
    valor_cuota: number
    fecha_venta: string         // DD/MM/YYYY | ''
    valor_entrada: number
    observaciones: string
    valorCuotaAmbiguo: boolean
    valorEntradaAmbiguo: boolean
}

interface RowResult {
    identificacion: string
    numero_factura: string
    status: 'ok' | 'error' | 'skip'
    message: string
}

interface ImportSummary {
    inserted: number
    skipped: number
    errors: number
    results: RowResult[]
}

/* ── Utilidades (mismo criterio que MigrarCarteraPage.tsx) ────────────────── */

type FieldDelimiter = ';' | ','

function parseFecha(raw: string): string | null {
    const t = raw.trim()
    if (!t) return null
    const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (!m) return null
    const [, d, mo, y] = m
    if (Number(mo) > 12 || Number(d) > 31) return null
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

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

function isAmbiguousNumber(val: string): boolean {
    const s = (val ?? '').trim()
    return s.includes(',') && s.includes('.')
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

function mapRowToFilaCuota(p: string[]): FilaCuota | null {
    const identificacion       = (p[0] ?? '').trim()
    const numero_factura       = (p[1] ?? '').trim()
    const cobrador              = (p[2] ?? '').trim()
    const numero_cuota          = parseInt((p[3] ?? '').trim(), 10)
    const numero_cuotas_total   = parseInt((p[4] ?? '').trim(), 10)
    const fecha_vencimiento     = (p[5] ?? '').trim()
    const valorCuotaRaw          = p[6] ?? ''
    const fecha_venta            = (p[7] ?? '').trim()
    const valorEntradaRaw        = p[8] ?? ''
    const observaciones          = (p[9] ?? '').trim()

    if (!identificacion || !numero_factura) return null
    return {
        identificacion, numero_factura, cobrador,
        numero_cuota: isNaN(numero_cuota) ? 0 : numero_cuota,
        numero_cuotas_total: isNaN(numero_cuotas_total) ? 0 : numero_cuotas_total,
        fecha_vencimiento,
        valor_cuota: parseNumero(valorCuotaRaw) ?? 0,
        fecha_venta,
        valor_entrada: parseNumero(valorEntradaRaw) ?? 0,
        observaciones,
        valorCuotaAmbiguo: isAmbiguousNumber(valorCuotaRaw),
        valorEntradaAmbiguo: isAmbiguousNumber(valorEntradaRaw),
    }
}

function parseCsv(text: string, delimiter: FieldDelimiter): FilaCuota[] {
    const lines = text.split(/\r?\n/)
    const rows: FilaCuota[] = []
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const row = mapRowToFilaCuota(splitCsvLine(line, delimiter))
        if (row) rows.push(row)
    }
    return rows
}

function mapExcelRows(rows: string[][]): FilaCuota[] {
    const out: FilaCuota[] = []
    for (let i = 1; i < rows.length; i++) {
        const row = mapRowToFilaCuota(rows[i] ?? [])
        if (row) out.push(row)
    }
    return out
}

// MENSUAL si no se puede inferir (1 sola cuota en el grupo) — es lo más
// común en electrodomésticos. Con 2+ cuotas, compara la diferencia real
// entre la primera y la segunda fecha de vencimiento del grupo.
function inferirPeriodicidad(fechasOrdenadas: string[]): 'DIARIA' | 'SEMANAL' | 'MENSUAL' {
    if (fechasOrdenadas.length < 2) return 'MENSUAL'
    const d1 = new Date(fechasOrdenadas[0] + 'T12:00:00')
    const d2 = new Date(fechasOrdenadas[1] + 'T12:00:00')
    const dias = Math.round((d2.getTime() - d1.getTime()) / 86400000)
    if (dias <= 2) return 'DIARIA'
    if (dias <= 10) return 'SEMANAL'
    return 'MENSUAL'
}

/* ── Componente ─────────────────────────────────────────────────────────── */

export function MigrarCarteraCreditoElectrodomesticosPage() {
    const { empresa } = useAuth()
    const fileRef = useRef<HTMLInputElement>(null)

    const [file, setFile] = useState<File | null>(null)
    const [rawText, setRawText] = useState('')
    const [excelRows, setExcelRows] = useState<string[][] | null>(null)
    const [delimiter, setDelimiter] = useState<FieldDelimiter>(';')
    const [rows, setRows] = useState<FilaCuota[]>([])
    const [parseError, setParseError] = useState('')
    const [importing, setImporting] = useState(false)
    const [summary, setSummary] = useState<ImportSummary | null>(null)
    const [migrationReady, setMigrationReady] = useState<boolean | null>(null)

    useEffect(() => {
        if (!empresa?.id) return
        supabase
            .from('creditos_electrodomesticos')
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

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0]
        if (!f) return
        setFile(f)
        setSummary(null)
        setParseError('')

        if (esArchivoExcel(f)) {
            setRawText(''); setExcelRows(null)
            leerFilasExcel(f)
                .then(rows => setExcelRows(rows))
                .catch(() => setParseError('Error al leer el archivo Excel.'))
            return
        }

        setExcelRows(null)
        const reader = new FileReader()
        reader.onload = ev => setRawText(ev.target?.result as string)
        reader.onerror = () => setParseError('Error al leer el archivo CSV.')
        reader.readAsText(f, 'UTF-8')
    }

    useEffect(() => {
        if (excelRows) {
            try {
                const parsed = mapExcelRows(excelRows)
                if (parsed.length === 0) { setParseError('No se encontraron filas válidas en el Excel.'); setRows([]); return }
                setParseError('')
                setRows(parsed)
            } catch {
                setParseError('Error al leer el archivo Excel.')
                setRows([])
            }
            return
        }
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
    }, [rawText, delimiter, excelRows])

    /* ── Importar ─────────────────────────────────────────────────────── */
    async function handleImport() {
        if (!empresa?.id || rows.length === 0) return
        setImporting(true)
        setSummary(null)

        const results: RowResult[] = []
        let inserted = 0, skipped = 0, errors = 0
        const hoy = new Date().toISOString().slice(0, 10)

        // Agrupar filas por crédito (identificación + número de factura) —
        // cada fila es UNA cuota pendiente de ESE crédito.
        const grupos = new Map<string, FilaCuota[]>()
        for (const row of rows) {
            const key = `${row.identificacion}|${row.numero_factura}`
            if (!grupos.has(key)) grupos.set(key, [])
            grupos.get(key)!.push(row)
        }

        for (const [, filas] of grupos) {
            const primera = filas[0]
            const ident = primera.identificacion
            const numFactura = primera.numero_factura

            // Validaciones básicas del grupo
            if (!primera.cobrador) {
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'error', message: 'Cobrador vacío' })
                errors++; continue
            }
            const filasSinFecha = filas.filter(f => !parseFecha(f.fecha_vencimiento))
            if (filasSinFecha.length > 0) {
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'error', message: `Fecha de vencimiento inválida en cuota #${filasSinFecha[0].numero_cuota}` })
                errors++; continue
            }
            if (filas.some(f => f.valor_cuota <= 0)) {
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'error', message: 'Hay una cuota con valor_cuota en 0 o vacío' })
                errors++; continue
            }
            const cuotasTotalValores = new Set(filas.map(f => f.numero_cuotas_total))
            if (cuotasTotalValores.size > 1) {
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'error', message: `numero_cuotas_total inconsistente entre filas del mismo crédito (${[...cuotasTotalValores].join(', ')})` })
                errors++; continue
            }
            const numeroCuotasTotal = primera.numero_cuotas_total
            if (!numeroCuotasTotal || numeroCuotasTotal <= 0) {
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'error', message: 'numero_cuotas_total vacío o inválido' })
                errors++; continue
            }

            // Cliente
            const { data: cliente } = await supabase
                .from('clientes').select('id, nombre')
                .eq('empresa_id', empresa.id).eq('identificacion', ident).maybeSingle()
            if (!cliente) {
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'skip', message: `Cliente con identificación "${ident}" no encontrado — créelo primero` })
                skipped++; continue
            }

            // Cobrador (por código exacto o nombre, sin distinguir mayúsculas)
            const { data: cobradores } = await supabase
                .from('cobradores').select('id, nombres, codigo')
                .eq('empresa_id', empresa.id).eq('estado', 'activo')
            const cobrador = (cobradores ?? []).find(c =>
                (c.codigo && c.codigo.trim().toLowerCase() === primera.cobrador.trim().toLowerCase()) ||
                c.nombres.trim().toLowerCase() === primera.cobrador.trim().toLowerCase()
            )
            if (!cobrador) {
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'skip', message: `Cobrador "${primera.cobrador}" no encontrado — créelo primero en Cobradores` })
                skipped++; continue
            }

            // Evitar duplicados en reintentos de importación
            const { data: yaExiste } = await supabase
                .from('creditos_electrodomesticos')
                .select('id')
                .eq('empresa_id', empresa.id)
                .eq('cliente_id', cliente.id)
                .eq('numero_documento_externo', numFactura)
                .maybeSingle()
            if (yaExiste) {
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'skip', message: 'Ya existe un crédito migrado con este número de factura para este cliente — omitido' })
                skipped++; continue
            }

            const cuotasOrdenadas = [...filas].sort((a, b) => a.numero_cuota - b.numero_cuota)
            const fechasVenc = cuotasOrdenadas.map(f => parseFecha(f.fecha_vencimiento)!)
            const fechaPrimerVenc = fechasVenc[0]
            const fechaUltimoVenc = fechasVenc[fechasVenc.length - 1]
            const saldoPendiente = cuotasOrdenadas.reduce((s, f) => s + f.valor_cuota, 0)
            const valorCuotaRef = cuotasOrdenadas[cuotasOrdenadas.length - 1].valor_cuota
            const valorEntrada = primera.valor_entrada || 0
            // Aproximado -- no se preserva el desglose de interés real del
            // sistema anterior, solo lo que falta cobrar de cada cuota.
            const totalFinanciado = numeroCuotasTotal * valorCuotaRef
            const totalFactura = valorEntrada + totalFinanciado
            const totalPagado = Math.max(0, totalFinanciado - saldoPendiente)
            const periodicidad = inferirPeriodicidad(fechasVenc)
            const estado = fechasVenc.some(f => f < hoy) ? 'EN_MORA' : 'VIGENTE'
            const fechaVenta = parseFecha(primera.fecha_venta) ?? hoy

            const { data: credito, error: errCredito } = await supabase
                .from('creditos_electrodomesticos')
                .insert({
                    empresa_id: empresa.id,
                    factura_id: null,
                    cliente_id: cliente.id,
                    garante_cliente_id: null,
                    cobrador_id: cobrador.id,
                    fecha_venta: fechaVenta,
                    fecha_primer_vencimiento: fechaPrimerVenc,
                    fecha_ultimo_vencimiento: fechaUltimoVenc,
                    total_factura: totalFactura,
                    valor_entrada: valorEntrada,
                    saldo_a_diferir: totalFinanciado,
                    base_calculo_interes: 'TOTAL_VENTA',
                    tipo_tasa: 'TASA_PERIODICA',
                    tasa_valor: 0,
                    periodicidad,
                    numero_cuotas: numeroCuotasTotal,
                    valor_cuota_referencial: valorCuotaRef,
                    total_intereses: 0,
                    total_financiado: totalFinanciado,
                    total_pagado: totalPagado,
                    saldo_pendiente: saldoPendiente,
                    estado,
                    observaciones: `Migrado desde Excel${primera.observaciones ? ' — ' + primera.observaciones : ''}`,
                    numero_documento_externo: numFactura,
                    origen: 'MIGRACION',
                })
                .select('id')
                .single()

            if (errCredito || !credito) {
                const msg = errCredito?.message ?? 'Error desconocido'
                const isMigErr = msg.toLowerCase().includes('origen') || msg.toLowerCase().includes('factura_id') || msg.toLowerCase().includes('null value')
                if (isMigErr) setMigrationReady(false)
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'error', message: isMigErr ? `Error de esquema — ejecuta el SQL de migración en Supabase primero (${msg})` : msg })
                errors++; continue
            }

            let saldoAcumulado = saldoPendiente
            const cuotasInsert = cuotasOrdenadas.map(f => {
                const saldoInicial = saldoAcumulado
                saldoAcumulado = Math.max(0, saldoAcumulado - f.valor_cuota)
                const vencida = parseFecha(f.fecha_vencimiento)! < hoy
                return {
                    empresa_id: empresa.id,
                    credito_id: credito.id,
                    numero_cuota: f.numero_cuota,
                    fecha_vencimiento: parseFecha(f.fecha_vencimiento),
                    saldo_inicial: saldoInicial,
                    capital_programado: f.valor_cuota,
                    interes_programado: 0,
                    otros_cargos_programados: 0,
                    cuota_programada: f.valor_cuota,
                    saldo_final_programado: saldoAcumulado,
                    saldo_pendiente: f.valor_cuota,
                    estado: vencida ? 'VENCIDA' : 'PENDIENTE',
                }
            })

            const { error: errCuotas } = await supabase.from('creditos_electrodomesticos_cuotas').insert(cuotasInsert)
            if (errCuotas) {
                results.push({ identificacion: ident, numero_factura: numFactura, status: 'error', message: `Crédito creado pero fallaron las cuotas: ${errCuotas.message}` })
                errors++; continue
            }

            results.push({ identificacion: ident, numero_factura: numFactura, status: 'ok', message: `${cliente.nombre} — ${cuotasOrdenadas.length} cuota(s), ${formatCurrency(saldoPendiente)} pendiente` })
            inserted++
        }

        setSummary({ inserted, skipped, errors, results })
        setImporting(false)
    }

    /* ── Plantilla ─────────────────────────────────────────────────────── */
    function downloadTemplate() {
        const cols = ['identificacion', 'numero_factura', 'cobrador', 'numero_cuota', 'numero_cuotas_total', 'fecha_vencimiento', 'valor_cuota', 'fecha_venta', 'valor_entrada', 'observaciones']
        const header = cols.join(delimiter)
        const example = [
            ['0912345678001', 'FAC-001', 'Juan Pérez', '7', '12', '15/10/2026', '45.00', '15/01/2026', '50.00', ''],
            ['0912345678001', 'FAC-001', 'Juan Pérez', '8', '12', '15/11/2026', '45.00', '15/01/2026', '50.00', ''],
            ['0912345678001', 'FAC-001', 'Juan Pérez', '9', '12', '15/12/2026', '45.00', '15/01/2026', '50.00', ''],
            ['1712345678', 'FAC-002', 'María Sánchez', '3', '6', '20/10/2026', '80.00', '', '0', 'Cliente antiguo'],
        ].map(row => row.join(delimiter))
        const csv = [header, ...example].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'plantilla_migracion_cartera_electrodomesticos.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    const totalCuotas = rows.length
    const totalSaldo = rows.reduce((s, r) => s + r.valor_cuota, 0)
    const creditosUnicos = new Set(rows.map(r => `${r.identificacion}|${r.numero_factura}`)).size
    const filasAmbiguas = rows.filter(r => r.valorCuotaAmbiguo || r.valorEntradaAmbiguo)

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Wallet className="w-7 h-7 text-primary-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Migrar Cartera — Créditos Electrodomésticos</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Importa cuotas pendientes desde un sistema externo (una fila por cuota)</p>
                    </div>
                </div>
                <HelpButton pageKey="migrar-cartera-credito-electrodomesticos" />
            </div>

            {migrationReady === false && (
                <div className="bg-red-50 border border-red-300 rounded-2xl p-5 flex gap-4">
                    <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <p className="text-sm font-bold text-red-800">Paso previo obligatorio: ejecutar el SQL de migración en Supabase</p>
                        <p className="text-sm text-red-700">
                            Ve a <strong>Supabase → SQL Editor</strong> y ejecuta el script de la migración
                            <code className="mx-1 px-1.5 py-0.5 bg-red-100 rounded text-xs">20260917_migrar_cartera_credito_electrodomesticos.sql</code>
                            antes de importar.
                        </p>
                        <p className="text-xs text-red-600">Después de ejecutarlo, recarga esta página.</p>
                    </div>
                </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <p className="text-sm font-bold text-blue-800 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Formato del archivo — una fila por CUOTA pendiente
                    </p>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-blue-700 whitespace-nowrap">Separador (solo CSV):</label>
                        <select value={delimiter} onChange={e => setDelimiter(e.target.value as FieldDelimiter)}
                            className="px-3 py-1.5 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none">
                            <option value=";">Punto y coma ( ; )</option>
                            <option value=",">Coma ( , )</option>
                        </select>
                    </div>
                </div>
                <p className="text-xs text-blue-600 -mt-1">
                    Si un cliente tiene varias cuotas pendientes, repite <strong>identificacion</strong> y <strong>numero_factura</strong> en una fila por cada cuota.
                    Los decimales pueden ir con coma o punto.
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
                                ['identificacion',       '✅', 'Cédula o RUC del cliente (debe existir en el sistema)'],
                                ['numero_factura',       '✅', 'Número/referencia del crédito en el sistema anterior — agrupa las cuotas de un mismo crédito'],
                                ['cobrador',              '✅', 'Nombre o código del cobrador (debe existir, activo, en Cobradores)'],
                                ['numero_cuota',          '✅', 'Número de esta cuota dentro del plan (ej: 7)'],
                                ['numero_cuotas_total',   '✅', 'Total de cuotas del crédito completo — mismo valor repetido en todas las filas del mismo crédito'],
                                ['fecha_vencimiento',     '✅', 'Fecha DD/MM/YYYY de vencimiento de ESTA cuota'],
                                ['valor_cuota',           '✅', 'Monto pendiente de ESTA cuota'],
                                ['fecha_venta',           '—',  'Fecha original de la venta a crédito — si vacío, se usa hoy'],
                                ['valor_entrada',         '—',  'Entrada pagada al inicio — si vacío, se asume 0'],
                                ['observaciones',         '—',  'Notas opcionales'],
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
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    <strong>Nota:</strong> el crédito migrado no lleva desglose de interés real del sistema anterior (se registra 100% como capital) —
                    lo que importa para la operación diaria (saldo, vencimientos, cobros) queda exacto; los totales de interés del crédito quedan aproximados.
                </div>
                <div className="pt-1">
                    <button onClick={downloadTemplate}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                        <Download className="w-4 h-4" /> Descargar plantilla CSV
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Seleccionar archivo</h2>
                <div onClick={() => fileRef.current?.click()}
                    className={cn('border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                        file ? 'border-primary-300 bg-primary-50' : 'border-slate-200 hover:border-primary-300 hover:bg-primary-50')}>
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    {file ? <p className="text-sm font-semibold text-primary-700">{file.name}</p> : <p className="text-sm text-slate-500">Haga clic para seleccionar el archivo CSV o Excel</p>}
                    <input ref={fileRef} type="file" accept={ACCEPT_CSV_EXCEL} className="hidden" onChange={handleFileChange} />
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
                                {totalCuotas} cuotas — {creditosUnicos} crédito(s) — sumas de control
                            </p>
                            <div className="bg-white rounded-lg border border-emerald-100 p-3">
                                <p className="text-2xl font-bold text-primary-700 tabular-nums">{formatCurrency(totalSaldo)}</p>
                                <p className="text-xs text-slate-500">Suma de valor_cuota (saldo total a importar)</p>
                            </div>
                            {filasAmbiguas.length > 0 && (
                                <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-800">
                                        <strong>{filasAmbiguas.length}</strong> fila(s) con valor_cuota o valor_entrada con punto Y coma a la vez — verifica que se haya interpretado el decimal correctamente.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-500 uppercase">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">Identificación</th>
                                        <th className="px-3 py-2 text-left font-semibold">N° Factura</th>
                                        <th className="px-3 py-2 text-left font-semibold">Cobrador</th>
                                        <th className="px-3 py-2 text-center font-semibold">Cuota</th>
                                        <th className="px-3 py-2 text-left font-semibold">Vencimiento</th>
                                        <th className="px-3 py-2 text-right font-semibold">Valor Cuota</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 8).map((r, i) => (
                                        <tr key={i} className={cn('border-t border-slate-100', (r.valorCuotaAmbiguo || r.valorEntradaAmbiguo) && 'bg-amber-50')}>
                                            <td className="px-3 py-2 font-mono">{r.identificacion}</td>
                                            <td className="px-3 py-2">{r.numero_factura}</td>
                                            <td className="px-3 py-2">{r.cobrador}</td>
                                            <td className="px-3 py-2 text-center">{r.numero_cuota}/{r.numero_cuotas_total}</td>
                                            <td className="px-3 py-2">{r.fecha_vencimiento}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-primary-700">{formatCurrency(r.valor_cuota)}{r.valorCuotaAmbiguo && ' ⚠️'}</td>
                                        </tr>
                                    ))}
                                    {rows.length > 8 && (
                                        <tr className="border-t border-slate-100 bg-slate-50">
                                            <td colSpan={6} className="px-3 py-2 text-center text-slate-400 italic">… y {rows.length - 8} filas más</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <button onClick={handleImport} disabled={importing || migrationReady === false}
                            title={migrationReady === false ? 'Ejecuta el SQL de migración en Supabase primero' : undefined}
                            className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando…</> : <><Upload className="w-4 h-4" /> Importar {creditosUnicos} crédito(s)</>}
                        </button>
                    </div>
                )}
            </div>

            {summary && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                        <div className="p-5 text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Créditos importados</p>
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
                    <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
                        {summary.results.map((r, i) => (
                            <div key={i} className={cn('flex items-start gap-3 p-3 rounded-xl text-sm',
                                r.status === 'ok' && 'bg-emerald-50', r.status === 'skip' && 'bg-amber-50', r.status === 'error' && 'bg-red-50')}>
                                {r.status === 'ok' && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                                {r.status === 'skip' && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                                {r.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                                <div className="min-w-0">
                                    <span className="font-mono text-xs font-semibold mr-2">{r.identificacion}</span>
                                    <span className="text-xs text-slate-500 mr-2">{r.numero_factura}</span>
                                    <span className={cn('text-xs', r.status === 'ok' && 'text-emerald-700', r.status === 'skip' && 'text-amber-700', r.status === 'error' && 'text-red-600 font-semibold')}>{r.message}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {summary.inserted > 0 && (
                        <div className="px-5 pb-5">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                <p className="text-sm font-semibold text-emerald-800">
                                    ✓ {summary.inserted} crédito(s) importados. Ya están disponibles en Créditos Electrodomésticos.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
