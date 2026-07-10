// ============================================================
// Integración de Ventas desde Excel — LedgerPro
// Flujo: Subir → Validar → Vista previa → Mapeo → Asientos → Confirmar
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { HelpButton } from '../../../components/help/HelpButton'
import * as XLSX from 'xlsx'
import {
    Upload, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft,
    Loader2, Settings, Eye, FileSpreadsheet, X, RefreshCw,
    ChevronDown, ChevronUp, Info, Download,
} from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda } from '../../../lib/utils'
import type { LpCuenta, LpPeriodo } from '../../../types/conta'

// ── Columnas fijas de la plantilla (validadas por posición + nombre) ───────
// 27 columnas: A–AA  (tarjetas y otros son columnas separadas)
const COLS_ESPERADAS = [
    { idx: 0,  col: 'A',  nombre: 'fechaEmision',          campo: 'fecha_emision' },
    { idx: 1,  col: 'B',  nombre: 'Estab',                 campo: 'estab' },
    { idx: 2,  col: 'C',  nombre: 'ptoEmi',                campo: 'pto_emi' },
    { idx: 3,  col: 'D',  nombre: 'secuencial',            campo: 'secuencial' },
    { idx: 4,  col: 'E',  nombre: 'razonSocialComprador',  campo: 'razon_social' },
    { idx: 5,  col: 'F',  nombre: 'Cedula/Ruc',            campo: 'cedula_ruc' },
    { idx: 6,  col: 'G',  nombre: 'Base Iva 0%',           campo: 'base_iva_0' },
    { idx: 7,  col: 'H',  nombre: 'Base Iva 5%',           campo: 'base_iva_5' },
    { idx: 8,  col: 'I',  nombre: 'Base Iva 15%',          campo: 'base_iva_15' },
    { idx: 9,  col: 'J',  nombre: 'Total Bases',           campo: 'total_bases' },
    { idx: 10, col: 'K',  nombre: 'valor IVA',             campo: 'valor_iva' },
    { idx: 11, col: 'L',  nombre: 'importe Total',         campo: 'importe_total' },
    { idx: 12, col: 'M',  nombre: 'efectivo',              campo: 'efectivo' },
    { idx: 13, col: 'N',  nombre: 'crédito',               campo: 'credito' },
    { idx: 14, col: 'O',  nombre: 'cheques',               campo: 'cheques' },
    { idx: 15, col: 'P',  nombre: 'transferencias',        campo: 'transferencias' },
    { idx: 16, col: 'Q',  nombre: 'tarjetas',              campo: 'tarjetas' },
    { idx: 17, col: 'R',  nombre: 'otros',                 campo: 'otros' },
    { idx: 18, col: 'S',  nombre: 'base',                  campo: 'ret_fuente_base' },
    { idx: 19, col: 'T',  nombre: 'Tasa',                  campo: 'ret_fuente_tasa' },
    { idx: 20, col: 'U',  nombre: 'Valor',                 campo: 'ret_fuente_valor' },
    { idx: 21, col: 'V',  nombre: 'base',                  campo: 'ret_transporte_base' },
    { idx: 22, col: 'W',  nombre: 'Tasa',                  campo: 'ret_transporte_tasa' },
    { idx: 23, col: 'X',  nombre: 'Valor',                 campo: 'ret_transporte_valor' },
    { idx: 24, col: 'Y',  nombre: 'base',                  campo: 'ret_iva_base' },
    { idx: 25, col: 'Z',  nombre: 'Tasa',                  campo: 'ret_iva_tasa' },
    { idx: 26, col: 'AA', nombre: 'Valor',                 campo: 'ret_iva_valor' },
]

// ── Tipos ──────────────────────────────────────────────────────────────────
interface VentaExcel {
    _linea: number
    _error: string | null
    _excluida: boolean
    fecha_emision: Date | null
    estab: string
    pto_emi: string
    secuencial: string
    numero_completo: string
    razon_social: string
    cedula_ruc: string
    base_iva_0: number
    base_iva_5: number
    base_iva_15: number
    total_bases: number
    valor_iva: number
    importe_total: number
    efectivo: number
    credito: number
    cheques: number
    transferencias: number
    tarjetas: number
    otros: number
    ret_fuente_base: number; ret_fuente_tasa: number; ret_fuente_valor: number
    ret_transporte_base: number; ret_transporte_tasa: number; ret_transporte_valor: number
    ret_iva_base: number; ret_iva_tasa: number; ret_iva_valor: number
}

interface Mapeo {
    cuenta_cobro_id: string
    cuenta_ventas_0_id: string
    cuenta_ventas_grav_id: string
    cuenta_iva_debito_id: string
    cuenta_ret_fuente_id: string
    cuenta_ret_iva_id: string
    tipo_asiento: 'por_factura' | 'resumen_diario' | 'resumen_mensual'
    glosa_template: string
}

interface LineaAsiento { cuenta_id: string; debe: number; haber: number; descripcion?: string }
interface AsientoPreview {
    fecha: string
    glosa: string
    lineas: LineaAsiento[]
    totalDebe: number
    totalHaber: number
    cuadra: boolean
    ventasRef: VentaExcel[]
}

// ── Helpers ────────────────────────────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100

// Normaliza strings para comparaciones tolerantes a acentos, case y espacios
function norm(s: string): string {
    return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

function parseFecha(val: unknown): Date | null {
    if (!val) return null
    // cellDates:true → viene como Date directamente
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val
    // Serial numérico de Excel (días desde 1900-01-01, con offset de 25569 días a Unix epoch)
    if (typeof val === 'number' && val > 1) {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000))
        return isNaN(d.getTime()) ? null : d
    }
    if (typeof val === 'string' && val.trim()) {
        // ISO o formato americano
        const d1 = new Date(val)
        if (!isNaN(d1.getTime())) return d1
        // dd/MM/yyyy o dd-MM-yyyy
        const m = val.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
        if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
    }
    return null
}

function parseNum(val: unknown): number {
    if (val === undefined || val === null || val === '') return 0
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, '.'))
    return isNaN(n) ? 0 : r2(n)
}

function buildGlosa(template: string, v: VentaExcel): string {
    return template
        .replace('{numero}', v.numero_completo)
        .replace('{razon_social}', v.razon_social ?? '')
        .replace('{cedula_ruc}', v.cedula_ruc ?? '')
        .replace('{fecha}', v.fecha_emision?.toLocaleDateString('es-EC') ?? '')
        .replace('{total}', v.importe_total.toFixed(2))
}

function generarLineasAsiento(venta: VentaExcel, mapeo: Mapeo): LineaAsiento[] {
    const lineas: LineaAsiento[] = []
    // DEBE
    const netoCobro = r2(venta.importe_total - venta.ret_fuente_valor - venta.ret_iva_valor)
    if (netoCobro !== 0 && mapeo.cuenta_cobro_id)
        lineas.push({ cuenta_id: mapeo.cuenta_cobro_id, debe: netoCobro, haber: 0 })
    if (venta.ret_fuente_valor > 0 && mapeo.cuenta_ret_fuente_id)
        lineas.push({ cuenta_id: mapeo.cuenta_ret_fuente_id, debe: venta.ret_fuente_valor, haber: 0 })
    if (venta.ret_iva_valor > 0 && mapeo.cuenta_ret_iva_id)
        lineas.push({ cuenta_id: mapeo.cuenta_ret_iva_id, debe: venta.ret_iva_valor, haber: 0 })
    // HABER
    if (venta.base_iva_0 > 0 && mapeo.cuenta_ventas_0_id)
        lineas.push({ cuenta_id: mapeo.cuenta_ventas_0_id, debe: 0, haber: venta.base_iva_0 })
    const baseGrav = r2(venta.base_iva_5 + venta.base_iva_15)
    if (baseGrav > 0 && mapeo.cuenta_ventas_grav_id)
        lineas.push({ cuenta_id: mapeo.cuenta_ventas_grav_id, debe: 0, haber: baseGrav })
    if (venta.valor_iva > 0 && mapeo.cuenta_iva_debito_id)
        lineas.push({ cuenta_id: mapeo.cuenta_iva_debito_id, debe: 0, haber: venta.valor_iva })
    return lineas
}

function agruparAsientos(ventas: VentaExcel[], mapeo: Mapeo): AsientoPreview[] {
    const validas = ventas.filter(v => !v._excluida && !v._error)
    if (mapeo.tipo_asiento === 'por_factura') {
        return validas.map(v => {
            const lineas = generarLineasAsiento(v, mapeo)
            const totalDebe  = r2(lineas.reduce((s, l) => s + l.debe, 0))
            const totalHaber = r2(lineas.reduce((s, l) => s + l.haber, 0))
            return {
                fecha: v.fecha_emision?.toISOString().slice(0, 10) ?? '',
                glosa: buildGlosa(mapeo.glosa_template, v),
                lineas, totalDebe, totalHaber,
                cuadra: Math.abs(totalDebe - totalHaber) < 0.02,
                ventasRef: [v],
            }
        })
    }
    // Agrupar por día o por mes
    const grupos = new Map<string, VentaExcel[]>()
    validas.forEach(v => {
        const d = v.fecha_emision
        const key = mapeo.tipo_asiento === 'resumen_diario'
            ? d?.toISOString().slice(0, 10) ?? 'sin_fecha'
            : d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'sin_fecha'
        if (!grupos.has(key)) grupos.set(key, [])
        grupos.get(key)!.push(v)
    })
    return Array.from(grupos.entries()).map(([key, grupo]) => {
        // Consolidar valores
        const totales: VentaExcel = grupo.reduce((acc, v) => ({
            ...acc,
            base_iva_0: r2(acc.base_iva_0 + v.base_iva_0),
            base_iva_5: r2(acc.base_iva_5 + v.base_iva_5),
            base_iva_15: r2(acc.base_iva_15 + v.base_iva_15),
            total_bases: r2(acc.total_bases + v.total_bases),
            valor_iva: r2(acc.valor_iva + v.valor_iva),
            importe_total: r2(acc.importe_total + v.importe_total),
            ret_fuente_valor: r2(acc.ret_fuente_valor + v.ret_fuente_valor),
            ret_iva_valor: r2(acc.ret_iva_valor + v.ret_iva_valor),
        }), { ...grupo[0], base_iva_0: 0, base_iva_5: 0, base_iva_15: 0, total_bases: 0, valor_iva: 0, importe_total: 0, ret_fuente_valor: 0, ret_iva_valor: 0 })
        const n = grupo.length
        const glosa = mapeo.tipo_asiento === 'resumen_diario'
            ? `Ventas del día ${key} — ${n} comprobante(s)`
            : `Ventas del mes ${key} — ${n} comprobante(s)`
        const lineas = generarLineasAsiento(totales, mapeo)
        const totalDebe  = r2(lineas.reduce((s, l) => s + l.debe, 0))
        const totalHaber = r2(lineas.reduce((s, l) => s + l.haber, 0))
        return {
            fecha: grupo[0].fecha_emision?.toISOString().slice(0, 10) ?? key,
            glosa, lineas, totalDebe, totalHaber,
            cuadra: Math.abs(totalDebe - totalHaber) < 0.02,
            ventasRef: grupo,
        }
    })
}

// ── Selector de cuenta ─────────────────────────────────────────────────────
function SelectorCuenta({ cuentas, value, onChange, placeholder, opcional }: {
    cuentas: LpCuenta[]; value: string; onChange: (id: string) => void
    placeholder?: string; opcional?: boolean
}) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    const cuenta = cuentas.find(c => c.id === value)
    const filtradas = cuentas
        .filter(c => c.acepta_movimientos)
        .filter(c => !q || c.codigo.includes(q) || c.nombre.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 50)
    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen(v => !v)}
                className={cn('w-full text-left input text-sm flex items-center justify-between gap-2',
                    !value && 'text-slate-400')}>
                <span className="truncate">
                    {cuenta ? `${cuenta.codigo} — ${cuenta.nombre}` : (placeholder ?? 'Seleccionar...')}
                </span>
                {opcional && !value && <span className="text-xs text-slate-400 shrink-0">Opcional</span>}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 w-full min-w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50">
                    <div className="p-2 border-b flex items-center gap-2">
                        <input autoFocus className="flex-1 text-sm outline-none px-2"
                            placeholder="Buscar código o nombre..." value={q}
                            onChange={e => setQ(e.target.value)} />
                        <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {opcional && (
                            <button type="button" onClick={() => { onChange(''); setOpen(false); setQ('') }}
                                className="w-full text-left px-4 py-2 text-sm text-slate-400 hover:bg-slate-50 italic">
                                — Sin cuenta —
                            </button>
                        )}
                        {filtradas.map(c => (
                            <button key={c.id} type="button"
                                onClick={() => { onChange(c.id); setOpen(false); setQ('') }}
                                className="w-full text-left px-4 py-2 hover:bg-primary-50 flex items-center gap-3 text-sm">
                                <span className="font-mono text-xs text-slate-400 w-28 shrink-0">{c.codigo}</span>
                                <span className="text-slate-700 truncate">{c.nombre}</span>
                            </button>
                        ))}
                        {filtradas.length === 0 && <p className="text-center text-sm text-slate-400 py-4">Sin resultados</p>}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Componente principal ───────────────────────────────────────────────────
export function IntegracionExcelVentasPage() {
    const { empresaActiva, user } = useAuth()
    const fileRef = useRef<HTMLInputElement>(null)
    const sym = empresaActiva?.moneda?.simbolo ?? '$'

    // Estado del wizard
    const [paso, setPaso]             = useState<0 | 1 | 2 | 3 | 4>(0)
    const [archivo, setArchivo]       = useState<File | null>(null)
    const [erroresCols, setErroresCols] = useState<string[]>([])
    const [ventas, setVentas]         = useState<VentaExcel[]>([])
    const [cuentas, setCuentas]       = useState<LpCuenta[]>([])
    const [periodos, setPeriodos]     = useState<LpPeriodo[]>([])
    const [periodoId, setPeriodoId]   = useState('')
    const [mapeo, setMapeo]           = useState<Mapeo>({
        cuenta_cobro_id: '', cuenta_ventas_0_id: '', cuenta_ventas_grav_id: '',
        cuenta_iva_debito_id: '', cuenta_ret_fuente_id: '', cuenta_ret_iva_id: '',
        tipo_asiento: 'por_factura', glosa_template: 'Venta {numero} - {razon_social}',
    })
    const [asientos, setAsientos]     = useState<AsientoPreview[]>([])
    const [guardando, setGuardando]   = useState(false)
    const [resultado, setResultado]   = useState<{ loteId: string; ok: number; err: number; asientos: number } | null>(null)
    const [expandidoIdx, setExpandidoIdx] = useState<number | null>(null)

    useEffect(() => { if (empresaActiva) cargarCatalogos() }, [empresaActiva])

    async function cargarCatalogos() {
        if (!empresaActiva) return
        const [cRes, pRes, mapRes] = await Promise.all([
            supabase.from('lp_cuentas').select('*').eq('empresa_id', empresaActiva.id).eq('activa', true).order('codigo'),
            supabase.from('lp_periodos').select('*').eq('empresa_id', empresaActiva.id).eq('estado', 'abierto').order('año').order('mes'),
            supabase.from('lp_excel_mapeo_ventas').select('*').eq('empresa_id', empresaActiva.id).maybeSingle(),
        ])
        setCuentas(cRes.data ?? [])
        setPeriodos(pRes.data ?? [])
        if (pRes.data?.length) setPeriodoId(pRes.data[pRes.data.length - 1].id)
        if (mapRes.data) {
            setMapeo({
                cuenta_cobro_id:       mapRes.data.cuenta_cobro_id ?? '',
                cuenta_ventas_0_id:    mapRes.data.cuenta_ventas_0_id ?? '',
                cuenta_ventas_grav_id: mapRes.data.cuenta_ventas_grav_id ?? '',
                cuenta_iva_debito_id:  mapRes.data.cuenta_iva_debito_id ?? '',
                cuenta_ret_fuente_id:  mapRes.data.cuenta_ret_fuente_id ?? '',
                cuenta_ret_iva_id:     mapRes.data.cuenta_ret_iva_id ?? '',
                tipo_asiento:          mapRes.data.tipo_asiento as any ?? 'por_factura',
                glosa_template:        mapRes.data.glosa_template ?? 'Venta {numero} - {razon_social}',
            })
        }
    }

    // ── PASO 0: leer y validar Excel ──────────────────────────
    function procesarArchivo(file: File) {
        setArchivo(file)
        const reader = new FileReader()
        reader.onload = (e) => {
            const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: false })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
            if (!rows.length) { setErroresCols(['El archivo está vacío']); setPaso(0); return }

            // Buscar la fila de cabecera: la primera donde col A tenga "fechaEmision" (tolerante a case/acentos)
            let headerRowIdx = -1
            for (let r = 0; r < Math.min(rows.length, 10); r++) {
                const val = String(rows[r][0] ?? '').trim()
                if (norm(val) === norm('fechaEmision')) { headerRowIdx = r; break }
            }

            if (headerRowIdx === -1) {
                // No se encontró la cabecera — mostrar las primeras celdas de la columna A para diagnóstico
                const primeras = rows.slice(0, 8).map((r, i) => `Fila ${i + 1}: "${String(r[0] ?? '').trim()}"`)
                setErroresCols([
                    'No se encontró la columna "fechaEmision" en las primeras 10 filas.',
                    'Columna A encontrada:',
                    ...primeras,
                    'Asegúrate de que la plantilla tenga "fechaEmision" como cabecera de la primera columna.',
                ])
                setPaso(0)
                return
            }

            const cabecera: string[] = (rows[headerRowIdx] as any[]).map(c => String(c ?? '').trim())
            // Validación tolerante: normaliza acentos y case antes de comparar
            const errores: string[] = []
            COLS_ESPERADAS.forEach(col => {
                const real = cabecera[col.idx] ?? ''
                if (norm(real) !== norm(col.nombre)) {
                    errores.push(`Col ${col.col}: esperado "${col.nombre}" → encontrado "${real || 'vacío'}"`)
                }
            })

            if (errores.length > 0) {
                setErroresCols([
                    `Cabecera encontrada en fila ${headerRowIdx + 1} pero con ${errores.length} columna(s) incorrecta(s):`,
                    ...errores,
                    'Tip: verifica espacios, tildes y mayúsculas en tu plantilla.',
                ])
                setPaso(0)
                return
            }
            setErroresCols([])

            // Parsear filas
            const ventasParsed: VentaExcel[] = []
            for (let i = headerRowIdx + 1; i < rows.length; i++) {
                const row = rows[i] as any[]
                if (row.every(c => c === '' || c === null || c === undefined)) continue
                const errors: string[] = []
                const fecha = parseFecha(row[0])
                if (!fecha) errors.push('Fecha inválida')
                const venta: VentaExcel = {
                    _linea: i + 1, // número de fila real en Excel
                    _error: errors.length ? errors.join('; ') : null,
                    _excluida: false,
                    fecha_emision: fecha,
                    estab: String(row[1] ?? '').padStart(3, '0'),
                    pto_emi: String(row[2] ?? '').padStart(3, '0'),
                    secuencial: String(row[3] ?? '').padStart(9, '0'),
                    numero_completo: `${String(row[1] ?? '').padStart(3, '0')}-${String(row[2] ?? '').padStart(3, '0')}-${String(row[3] ?? '').padStart(9, '0')}`,
                    razon_social: String(row[4] ?? ''),
                    cedula_ruc: String(row[5] ?? ''),
                    base_iva_0: parseNum(row[6]),
                    base_iva_5: parseNum(row[7]),
                    base_iva_15: parseNum(row[8]),
                    total_bases: parseNum(row[9]),
                    valor_iva: parseNum(row[10]),
                    importe_total: parseNum(row[11]),
                    efectivo: parseNum(row[12]),
                    credito: parseNum(row[13]),
                    cheques: parseNum(row[14]),
                    transferencias: parseNum(row[15]),
                    tarjetas: parseNum(row[16]),
                    otros: parseNum(row[17]),
                    ret_fuente_base: parseNum(row[18]), ret_fuente_tasa: parseNum(row[19]), ret_fuente_valor: parseNum(row[20]),
                    ret_transporte_base: parseNum(row[21]), ret_transporte_tasa: parseNum(row[22]), ret_transporte_valor: parseNum(row[23]),
                    ret_iva_base: parseNum(row[24]), ret_iva_tasa: parseNum(row[25]), ret_iva_valor: parseNum(row[26]),
                }
                ventasParsed.push(venta)
            }
            setVentas(ventasParsed)
            setPaso(1)
        }
        reader.readAsBinaryString(file)
    }

    // ── PASO 2: guardar mapeo y generar preview asientos ──────
    async function guardarMapeoYPrevisualizarAsientos() {
        if (!empresaActiva) return
        await supabase.from('lp_excel_mapeo_ventas').upsert({
            empresa_id: empresaActiva.id, ...mapeo, updated_at: new Date().toISOString()
        })
        const previews = agruparAsientos(ventas, mapeo)
        setAsientos(previews)
        setPaso(3)
    }

    // ── PASO 3: confirmar y generar asientos ──────────────────
    async function confirmarYGenerar() {
        if (!empresaActiva || !periodoId) return
        setGuardando(true)
        try {
            const asientosCuadrados = asientos.filter(a => a.cuadra)
            const ventasOk   = asientosCuadrados.flatMap(a => a.ventasRef)
            const ventasErr  = ventas.filter(v => !v._excluida && v._error)
            const ventasExcl = ventas.filter(v => v._excluida)

            // Crear lote
            const { data: lote, error: loteErr } = await supabase.from('lp_excel_lotes').insert({
                empresa_id: empresaActiva.id,
                periodo_id: periodoId,
                nombre_archivo: archivo?.name ?? 'importacion.xlsx',
                total_filas: ventas.length,
                filas_ok: ventasOk.length,
                filas_error: ventasErr.length,
                filas_excluidas: ventasExcl.length,
                asientos_creados: asientosCuadrados.length,
                estado: ventasErr.length > 0 ? 'con_errores' : 'procesado',
                created_by: user?.id,
            }).select('id').single()
            if (loteErr || !lote) throw new Error('Error al crear lote: ' + loteErr?.message)

            // Guardar líneas en lp_excel_ventas
            const lineasParaGuardar = ventas.map(v => ({
                lote_id: lote.id,
                empresa_id: empresaActiva.id,
                linea_excel: v._linea,
                fecha_emision: v.fecha_emision?.toISOString().slice(0, 10) ?? null,
                estab: v.estab, pto_emi: v.pto_emi, secuencial: v.secuencial,
                numero_completo: v.numero_completo,
                razon_social: v.razon_social, cedula_ruc: v.cedula_ruc,
                base_iva_0: v.base_iva_0, base_iva_5: v.base_iva_5, base_iva_15: v.base_iva_15,
                total_bases: v.total_bases, valor_iva: v.valor_iva, importe_total: v.importe_total,
                efectivo: v.efectivo, credito: v.credito, cheques: v.cheques,
                transferencias: v.transferencias, tarjetas: v.tarjetas, otros: v.otros,
                ret_fuente_base: v.ret_fuente_base, ret_fuente_tasa: v.ret_fuente_tasa, ret_fuente_valor: v.ret_fuente_valor,
                ret_transporte_base: v.ret_transporte_base, ret_transporte_tasa: v.ret_transporte_tasa, ret_transporte_valor: v.ret_transporte_valor,
                ret_iva_base: v.ret_iva_base, ret_iva_tasa: v.ret_iva_tasa, ret_iva_valor: v.ret_iva_valor,
                excluida: v._excluida,
                error_mensaje: v._error,
            }))
            if (lineasParaGuardar.length > 0) {
                await supabase.from('lp_excel_ventas').insert(lineasParaGuardar)
            }

            // Obtener tipo/periodo para comprobantes
            const { data: tipoCD } = await supabase.from('lp_tipos_comprobante').select('id').eq('codigo', 'CD').maybeSingle()
            const tipoId = tipoCD?.id ?? ''
            const periodo = periodos.find(p => p.id === periodoId)!

            // Generar asientos contables
            let asientosCreados = 0

            for (const asiento of asientosCuadrados) {
                if (!asiento.cuadra) continue

                const { data: numData } = await supabase.rpc('lp_generar_numero_comprobante', {
                    p_empresa_id: empresaActiva.id,
                    p_tipo_codigo: 'CD',
                    p_año: periodo.año,
                    p_mes: periodo.mes ?? 1,
                })

                const { data: comp, error: compErr } = await supabase.from('lp_comprobantes').insert({
                    empresa_id: empresaActiva.id,
                    periodo_id: periodoId,
                    tipo_comprobante_id: tipoId,
                    numero: numData as string,
                    secuencial: 1,
                    fecha: asiento.fecha,
                    glosa: asiento.glosa,
                    estado: 'confirmado',
                    total_debe: asiento.totalDebe,
                    total_haber: asiento.totalHaber,
                    moneda_id: empresaActiva.moneda_id,
                    origen: 'manual',
                    created_by: user?.id,
                }).select('id').single()
                if (compErr || !comp) continue

                await supabase.from('lp_comprobante_lineas').insert(
                    asiento.lineas.map((l, i) => ({
                        comprobante_id: comp.id,
                        empresa_id: empresaActiva.id,
                        cuenta_id: l.cuenta_id,
                        descripcion: l.descripcion ?? null,
                        debe: l.debe,
                        haber: l.haber,
                        orden: i,
                    }))
                )

                await supabase.rpc('lp_actualizar_saldos', {
                    p_comprobante_id: comp.id, p_operacion: 'sumar'
                })

                // Vincular ventas del asiento al comprobante creado
                const lineasVentasIds = asiento.ventasRef.map(v => v._linea)
                await supabase.from('lp_excel_ventas')
                    .update({ comprobante_id: comp.id })
                    .eq('lote_id', lote.id)
                    .in('linea_excel', lineasVentasIds)

                asientosCreados++
            }

            setResultado({ loteId: lote.id, ok: ventasOk.length, err: ventasErr.length, asientos: asientosCreados })
            setPaso(4)
        } catch (err: any) {
            alert('Error al generar asientos: ' + err.message)
        } finally {
            setGuardando(false)
        }
    }

    function reiniciar() {
        setArchivo(null); setErroresCols([]); setVentas([]); setAsientos([])
        setResultado(null); setPaso(0)
        if (fileRef.current) fileRef.current.value = ''
    }

    // ── Totales de ventas ─────────────────────────────────────
    const ventasValidas   = ventas.filter(v => !v._excluida && !v._error)
    const ventasConError  = ventas.filter(v => v._error && !v._excluida)
    const sumaTotal       = r2(ventasValidas.reduce((s, v) => s + v.importe_total, 0))
    const sumaIva         = r2(ventasValidas.reduce((s, v) => s + v.valor_iva, 0))

    const mapeoCompleto = mapeo.cuenta_cobro_id && mapeo.cuenta_ventas_grav_id && mapeo.cuenta_iva_debito_id

    function descargarPlantilla() {
        const header = COLS_ESPERADAS.map(c => c.nombre)
        const ws = XLSX.utils.aoa_to_sheet([header])
        // Ancho de columnas
        ws['!cols'] = header.map(() => ({ wch: 18 }))
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Facturas')
        XLSX.writeFile(wb, 'Plantilla_Ventas_LedgerPro.xlsx')
    }

    // ── PASOS UI ─────────────────────────────────────────────
    const PASOS = ['Subir archivo', 'Vista previa', 'Mapeo contable', 'Pre-asientos', 'Resultado']

    return (
        <div className="space-y-5 max-w-6xl">
            {/* Encabezado */}
            <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-7 h-7 text-primary-600" />
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Integración de Ventas desde Excel</h1>
                    <p className="text-slate-500 text-sm">Importa ventas desde tu sistema de facturación y genera asientos contables automáticamente</p>
                </div>
                <HelpButton pageKey="excel-ventas" />
            </div>

            {/* Indicador de pasos */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {PASOS.map((label, i) => (
                    <div key={i} className="flex items-center gap-2 shrink-0">
                        <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
                            paso === i ? 'bg-primary-600 text-white'
                            : paso > i  ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-400')}>
                            {paso > i ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-4 h-4 flex items-center justify-center">{i + 1}</span>}
                            {label}
                        </div>
                        {i < PASOS.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />}
                    </div>
                ))}
            </div>

            {/* ══ PASO 0: Subir archivo ══ */}
            {paso === 0 && (
                <div className="space-y-4">
                    <div
                        className="card p-10 border-2 border-dashed border-slate-300 hover:border-primary-400 transition-colors text-center cursor-pointer"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) procesarArchivo(f) }}
                    >
                        <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600 font-medium mb-1">Arrastra el archivo Excel aquí</p>
                        <p className="text-slate-400 text-sm">o haz clic para seleccionarlo (.xlsx, .xls)</p>
                        <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls"
                            onChange={e => { const f = e.target.files?.[0]; if (f) procesarArchivo(f) }} />
                    </div>

                    {erroresCols.length > 0 && (
                        <div className="card p-5 border-red-200 bg-red-50 space-y-3">
                            <div className="flex items-center gap-2 text-red-700 font-semibold">
                                <AlertCircle className="w-5 h-5" />
                                La estructura del archivo no coincide con la plantilla ({erroresCols.length} error{erroresCols.length !== 1 ? 'es' : ''})
                            </div>
                            <ul className="space-y-1">
                                {erroresCols.map((e, i) => (
                                    <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                                        <X className="w-4 h-4 shrink-0 mt-0.5" /> {e}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-red-500">Corrige el archivo y vuelve a subirlo.</p>
                        </div>
                    )}

                    <div className="card p-4 bg-blue-50 border-blue-200 flex gap-3 items-start">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <div className="flex-1 text-sm text-blue-700">
                            <p className="font-semibold mb-1">Plantilla requerida — 27 columnas fijas (A→AA)</p>
                            <p className="text-xs mb-2">fechaEmision · Estab · ptoEmi · secuencial · razonSocialComprador · Cedula/Ruc · Base Iva 0% · Base Iva 5% · Base Iva 15% · Total Bases · valor IVA · importe Total · efectivo · crédito · cheques · transferencias · <strong>tarjetas · otros</strong> · [Ret. Fuente: base/Tasa/Valor] · [Ret. Transporte: base/Tasa/Valor] · [Ret. IVA: base/Tasa/Valor]</p>
                            <button onClick={descargarPlantilla}
                                className="inline-flex items-center gap-2 text-xs bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium transition-colors">
                                <Download className="w-3.5 h-3.5" /> Descargar plantilla vacía (.xlsx)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ PASO 1: Vista previa de ventas ══ */}
            {paso === 1 && (
                <div className="space-y-4">
                    {/* Aviso si el archivo no tiene filas de datos */}
                    {ventas.length === 0 && (
                        <div className="card p-5 border-amber-200 bg-amber-50 flex gap-3 items-start">
                            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                            <div className="text-sm text-amber-800 space-y-1">
                                <p className="font-semibold">El archivo fue leído correctamente pero no tiene filas de datos.</p>
                                <p>La cabecera de la plantilla es válida. Sin embargo, no hay ninguna fila debajo de ella.</p>
                                <p className="text-xs text-amber-700">
                                    Pasos a seguir:<br/>
                                    1. Abre el archivo Excel que usas para registrar tus ventas.<br/>
                                    2. Copia las filas de datos (sin la cabecera) y pégalas en la plantilla, a partir de la fila 2.<br/>
                                    3. Guarda y vuelve a subir el archivo.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Totales control */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: 'Filas leídas', val: ventas.length, color: 'text-slate-800' },
                            { label: 'Válidas', val: ventasValidas.length, color: 'text-green-700' },
                            { label: 'Con errores', val: ventasConError.length, color: 'text-red-600' },
                            { label: 'Total facturado', val: formatMoneda(sumaTotal, sym), color: 'text-primary-700' },
                        ].map(c => (
                            <div key={c.label} className="card p-4 text-center">
                                <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                                <p className={cn('text-xl font-bold', c.color)}>{c.val}</p>
                            </div>
                        ))}
                    </div>

                    {/* Período */}
                    <div className="card p-4 flex items-center gap-4">
                        <label className="text-sm font-semibold text-slate-700 shrink-0">Período contable *</label>
                        <select className="input flex-1 max-w-xs" value={periodoId} onChange={e => setPeriodoId(e.target.value)}>
                            <option value="">Seleccionar período...</option>
                            {periodos.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.mes ? `${String(p.mes).padStart(2, '0')}/${p.año}` : p.año} — {p.estado}
                                </option>
                            ))}
                        </select>
                        {periodos.length === 0 && <p className="text-xs text-amber-600">No hay períodos abiertos. Crea uno primero.</p>}
                    </div>

                    {/* Tabla de ventas */}
                    <div className="card overflow-hidden">
                        <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-700">Detalle de ventas importadas</p>
                            {ventasConError.length > 0 && (
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                    {ventasConError.length} fila(s) con error
                                </span>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        {['Fila','Fecha','Factura','Cliente','Base 0%','Base 5%','Base 15%','IVA','Total','Estado'].map(h => (
                                            <th key={h} className="text-left py-2 px-3 text-slate-500 font-semibold whitespace-nowrap">{h}</th>
                                        ))}
                                        <th className="w-16 px-3">Excluir</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ventas.slice(0, 200).map((v, i) => (
                                        <tr key={i} className={cn('border-b border-slate-100',
                                            v._excluida ? 'opacity-40 bg-slate-50' : v._error ? 'bg-red-50' : 'hover:bg-slate-50')}>
                                            <td className="py-2 px-3 text-slate-400">{v._linea}</td>
                                            <td className="py-2 px-3 whitespace-nowrap">{v.fecha_emision?.toLocaleDateString('es-EC') ?? '—'}</td>
                                            <td className="py-2 px-3 font-mono whitespace-nowrap">{v.numero_completo}</td>
                                            <td className="py-2 px-3 max-w-xs truncate">{v.razon_social}</td>
                                            <td className="py-2 px-3 text-right font-mono">{v.base_iva_0 > 0 ? v.base_iva_0.toFixed(2) : '—'}</td>
                                            <td className="py-2 px-3 text-right font-mono">{v.base_iva_5 > 0 ? v.base_iva_5.toFixed(2) : '—'}</td>
                                            <td className="py-2 px-3 text-right font-mono">{v.base_iva_15 > 0 ? v.base_iva_15.toFixed(2) : '—'}</td>
                                            <td className="py-2 px-3 text-right font-mono">{v.valor_iva.toFixed(2)}</td>
                                            <td className="py-2 px-3 text-right font-mono font-semibold">{v.importe_total.toFixed(2)}</td>
                                            <td className="py-2 px-3">
                                                {v._error
                                                    ? <span className="text-red-600 text-xs" title={v._error}>⚠ Error</span>
                                                    : <span className="text-green-600">✓</span>}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                                <input type="checkbox" checked={v._excluida}
                                                    onChange={() => setVentas(prev => prev.map((x, j) => j === i ? { ...x, _excluida: !x._excluida } : x))} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                    <tr>
                                        <td colSpan={4} className="py-2 px-3 text-right text-xs font-semibold text-slate-600">TOTALES ({ventasValidas.length} filas válidas)</td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-xs">{r2(ventasValidas.reduce((s,v)=>s+v.base_iva_0,0)).toFixed(2)}</td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-xs">{r2(ventasValidas.reduce((s,v)=>s+v.base_iva_5,0)).toFixed(2)}</td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-xs">{r2(ventasValidas.reduce((s,v)=>s+v.base_iva_15,0)).toFixed(2)}</td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-xs">{sumaIva.toFixed(2)}</td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-xs">{sumaTotal.toFixed(2)}</td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-between">
                        <button onClick={() => setPaso(0)} className="btn btn-secondary gap-2">
                            <ArrowLeft className="w-4 h-4" /> Volver
                        </button>
                        <button onClick={() => setPaso(2)} disabled={!periodoId || ventasValidas.length === 0}
                            className="btn btn-primary gap-2">
                            Configurar mapeo <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ══ PASO 2: Mapeo contable ══ */}
            {paso === 2 && (
                <div className="space-y-4">
                    <div className="card p-5 space-y-5">
                        <div className="flex items-center gap-2">
                            <Settings className="w-5 h-5 text-primary-600" />
                            <h2 className="font-bold text-slate-900">Reglas de mapeo contable</h2>
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Se guardan automáticamente para futuras importaciones</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Cuentas DEBE */}
                            <div className="space-y-3">
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">DEBE — Cuentas deudoras</p>
                                <div>
                                    <label className="label text-xs">Cuenta cobro / CxC Clientes <span className="text-red-500">*</span></label>
                                    <p className="text-xs text-slate-400 mb-1">Recibe el neto (importe total - retenciones)</p>
                                    <SelectorCuenta cuentas={cuentas} value={mapeo.cuenta_cobro_id}
                                        onChange={v => setMapeo(m => ({ ...m, cuenta_cobro_id: v }))}
                                        placeholder="Ej: 1.01.02.01 CxC Clientes" />
                                </div>
                                <div>
                                    <label className="label text-xs">Retención en fuente (DR) <span className="text-slate-400 text-xs">Opcional</span></label>
                                    <p className="text-xs text-slate-400 mb-1">Anticipo impuesto renta a favor</p>
                                    <SelectorCuenta cuentas={cuentas} value={mapeo.cuenta_ret_fuente_id}
                                        onChange={v => setMapeo(m => ({ ...m, cuenta_ret_fuente_id: v }))} opcional />
                                </div>
                                <div>
                                    <label className="label text-xs">Retención IVA (DR) <span className="text-slate-400 text-xs">Opcional</span></label>
                                    <p className="text-xs text-slate-400 mb-1">IVA retenido a favor</p>
                                    <SelectorCuenta cuentas={cuentas} value={mapeo.cuenta_ret_iva_id}
                                        onChange={v => setMapeo(m => ({ ...m, cuenta_ret_iva_id: v }))} opcional />
                                </div>
                            </div>

                            {/* Cuentas HABER */}
                            <div className="space-y-3">
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">HABER — Cuentas acreedoras</p>
                                <div>
                                    <label className="label text-xs">Ventas gravadas (IVA 5% + 15%) <span className="text-red-500">*</span></label>
                                    <p className="text-xs text-slate-400 mb-1">Base imponible con IVA</p>
                                    <SelectorCuenta cuentas={cuentas} value={mapeo.cuenta_ventas_grav_id}
                                        onChange={v => setMapeo(m => ({ ...m, cuenta_ventas_grav_id: v }))}
                                        placeholder="Ej: 4.01.01 Venta de bienes" />
                                </div>
                                <div>
                                    <label className="label text-xs">Ventas base 0% <span className="text-slate-400 text-xs">Opcional</span></label>
                                    <SelectorCuenta cuentas={cuentas} value={mapeo.cuenta_ventas_0_id}
                                        onChange={v => setMapeo(m => ({ ...m, cuenta_ventas_0_id: v }))} opcional />
                                </div>
                                <div>
                                    <label className="label text-xs">IVA débito fiscal <span className="text-red-500">*</span></label>
                                    <p className="text-xs text-slate-400 mb-1">IVA a pagar al SRI</p>
                                    <SelectorCuenta cuentas={cuentas} value={mapeo.cuenta_iva_debito_id}
                                        onChange={v => setMapeo(m => ({ ...m, cuenta_iva_debito_id: v }))}
                                        placeholder="Ej: 2.01.04.01 IVA por pagar" />
                                </div>
                            </div>
                        </div>

                        {/* Tipo asiento + Glosa */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                            <div>
                                <label className="label text-xs">Tipo de agrupación de asientos</label>
                                <select className="input" value={mapeo.tipo_asiento}
                                    onChange={e => setMapeo(m => ({ ...m, tipo_asiento: e.target.value as any }))}>
                                    <option value="por_factura">Un asiento por factura</option>
                                    <option value="resumen_diario">Un asiento resumen por día</option>
                                    <option value="resumen_mensual">Un asiento resumen por mes</option>
                                </select>
                            </div>
                            <div>
                                <label className="label text-xs">Plantilla de glosa</label>
                                <p className="text-xs text-slate-400 mb-1">Variables: {'{numero} {razon_social} {cedula_ruc} {fecha} {total}'}</p>
                                <input className="input text-sm" value={mapeo.glosa_template}
                                    onChange={e => setMapeo(m => ({ ...m, glosa_template: e.target.value }))} />
                            </div>
                        </div>

                        {/* Modelo contable */}
                        <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 space-y-1">
                            <p className="font-semibold text-slate-700 mb-2">Modelo del asiento generado:</p>
                            <p><span className="font-mono bg-white px-1 rounded">DEBE</span> Cuenta cobro = importe_total - ret_fuente - ret_iva</p>
                            <p><span className="font-mono bg-white px-1 rounded">DEBE</span> Ret. fuente = valor ret. fuente (si configurada)</p>
                            <p><span className="font-mono bg-white px-1 rounded">HABER</span> Ventas gravadas = base_iva_5 + base_iva_15</p>
                            <p><span className="font-mono bg-white px-1 rounded">HABER</span> Ventas 0% = base_iva_0 (si configurada)</p>
                            <p><span className="font-mono bg-white px-1 rounded">HABER</span> IVA débito = valor IVA</p>
                        </div>
                    </div>

                    <div className="flex justify-between">
                        <button onClick={() => setPaso(1)} className="btn btn-secondary gap-2">
                            <ArrowLeft className="w-4 h-4" /> Volver
                        </button>
                        <button onClick={guardarMapeoYPrevisualizarAsientos}
                            disabled={!mapeoCompleto}
                            className="btn btn-primary gap-2">
                            <Eye className="w-4 h-4" /> Previsualizar asientos <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ══ PASO 3: Preview asientos ══ */}
            {paso === 3 && (
                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="card p-4 text-center">
                            <p className="text-xs text-slate-500 mb-1">Asientos a generar</p>
                            <p className="text-2xl font-bold text-primary-700">{asientos.length}</p>
                        </div>
                        <div className="card p-4 text-center">
                            <p className="text-xs text-slate-500 mb-1">Cuadran</p>
                            <p className="text-2xl font-bold text-green-700">{asientos.filter(a => a.cuadra).length}</p>
                        </div>
                        <div className="card p-4 text-center">
                            <p className="text-xs text-slate-500 mb-1">No cuadran (serán omitidos)</p>
                            <p className="text-2xl font-bold text-red-600">{asientos.filter(a => !a.cuadra).length}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {asientos.map((a, i) => (
                            <div key={i} className={cn('card overflow-hidden', !a.cuadra && 'border-red-200')}>
                                <button
                                    onClick={() => setExpandidoIdx(expandidoIdx === i ? null : i)}
                                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 text-sm">
                                    <div className="flex items-center gap-3">
                                        {a.cuadra
                                            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            : <AlertCircle className="w-4 h-4 text-red-500" />}
                                        <span className="font-mono text-slate-500">{a.fecha}</span>
                                        <span className="text-slate-700 truncate max-w-sm">{a.glosa}</span>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0">
                                        <span className="font-mono font-semibold">{formatMoneda(a.totalDebe, sym)}</span>
                                        {!a.cuadra && <span className="text-xs text-red-600">descuadrado</span>}
                                        {expandidoIdx === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </div>
                                </button>
                                {expandidoIdx === i && (
                                    <div className="px-5 pb-4 border-t border-slate-100">
                                        <table className="w-full text-xs mt-2">
                                            <thead>
                                                <tr className="text-slate-400 uppercase">
                                                    <th className="text-left py-1">Cuenta</th>
                                                    <th className="text-right py-1 w-28">Debe</th>
                                                    <th className="text-right py-1 w-28">Haber</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {a.lineas.map((l, j) => {
                                                    const cuenta = cuentas.find(c => c.id === l.cuenta_id)
                                                    return (
                                                        <tr key={j} className="border-b border-slate-50">
                                                            <td className="py-1.5 text-slate-700">
                                                                <span className="font-mono text-slate-400 mr-2">{cuenta?.codigo}</span>
                                                                {cuenta?.nombre}
                                                            </td>
                                                            <td className="py-1.5 text-right font-mono">{l.debe > 0 ? l.debe.toFixed(2) : '—'}</td>
                                                            <td className="py-1.5 text-right font-mono">{l.haber > 0 ? l.haber.toFixed(2) : '—'}</td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                            <tfoot className="border-t-2 border-slate-200">
                                                <tr>
                                                    <td className="py-1.5 font-bold text-slate-700">TOTAL</td>
                                                    <td className={cn('py-1.5 text-right font-mono font-bold', a.cuadra ? 'text-green-700' : 'text-red-600')}>{a.totalDebe.toFixed(2)}</td>
                                                    <td className={cn('py-1.5 text-right font-mono font-bold', a.cuadra ? 'text-green-700' : 'text-red-600')}>{a.totalHaber.toFixed(2)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-between">
                        <button onClick={() => setPaso(2)} className="btn btn-secondary gap-2">
                            <ArrowLeft className="w-4 h-4" /> Ajustar mapeo
                        </button>
                        <button onClick={confirmarYGenerar}
                            disabled={guardando || asientos.filter(a => a.cuadra).length === 0}
                            className="btn btn-primary gap-2">
                            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Confirmar y generar {asientos.filter(a => a.cuadra).length} asiento(s)
                        </button>
                    </div>
                </div>
            )}

            {/* ══ PASO 4: Resultado ══ */}
            {paso === 4 && resultado && (
                <div className="space-y-4">
                    <div className="card p-8 text-center space-y-4">
                        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                        <h2 className="text-2xl font-bold text-slate-900">¡Importación completada!</h2>
                        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                            <div>
                                <p className="text-3xl font-bold text-primary-700">{resultado.ok}</p>
                                <p className="text-xs text-slate-500">Facturas procesadas</p>
                            </div>
                            <div>
                                <p className="text-3xl font-bold text-green-700">{resultado.asientos}</p>
                                <p className="text-xs text-slate-500">Asientos generados</p>
                            </div>
                            <div>
                                <p className={cn('text-3xl font-bold', resultado.err > 0 ? 'text-red-600' : 'text-slate-300')}>{resultado.err}</p>
                                <p className="text-xs text-slate-500">Con errores</p>
                            </div>
                        </div>
                        {resultado.err > 0 && (
                            <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-2">
                                Hay {resultado.err} fila(s) con errores que no fueron procesadas. Corrígelas en el Excel y vuelve a importar.
                            </p>
                        )}
                    </div>
                    <div className="flex justify-center gap-3">
                        <button onClick={reiniciar} className="btn btn-primary gap-2">
                            <RefreshCw className="w-4 h-4" /> Nueva importación
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}




