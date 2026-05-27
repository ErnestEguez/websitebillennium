import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Upload, CheckCircle, AlertCircle, Loader2,
    Settings, List, Search, ChevronDown, ChevronUp, Zap, X, Plus, Trash2, FileDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../lib/utils'

// ── Tipos ──────────────────────────────────────────────────────────────────

type TipoDoc = 'factura' | 'retencion' | 'nota_credito' | 'nota_debito'

const TIPOS: { value: TipoDoc; label: string }[] = [
    { value: 'factura',       label: 'Facturas de Compras' },
    { value: 'retencion',     label: 'Retenciones Recibidas' },
    { value: 'nota_credito',  label: 'Notas de Crédito' },
    { value: 'nota_debito',   label: 'Notas de Débito' },
]

interface FilaParsed {
    proveedor_ruc:    string
    proveedor_nombre: string
    numero:           string
    clave_acceso:     string
    fecha_emision:    string
    base_cero:        number
    base_iva:         number
    iva:              number
    total:            number
    codigo_retencion: string
    porcentaje_ret:   number
    valor_retenido:   number
    raw:              Record<string, string>
}

interface Comprobante extends FilaParsed {
    id:                  string
    tipo:                TipoDoc
    año:                 number
    mes:                 number
    estado:              'pendiente' | 'listo' | 'contabilizado'
    cuenta_gasto_id?:    string
    cuenta_iva_id?:      string
    cuenta_retencion_id?:string
    cuenta_proveedor_id?:string
}

interface Mapeo {
    id:                  string
    tipo:                TipoDoc
    proveedor_ruc:       string | null
    proveedor_nombre?:   string
    cuenta_gasto_id?:    string
    cuenta_iva_id?:      string
    cuenta_retencion_id?:string
    cuenta_proveedor_id?:string
    descripcion?:        string
}

interface CuentaOpc { id: string; codigo: string; nombre: string }

// ── Detectar columnas del CSV del SRI ─────────────────────────────────────

const COL_KEYS: Record<string, string[]> = {
    proveedor_ruc:    ['ruc emisor', 'ruc_emisor', 'ruc', 'identificacion emisor'],
    proveedor_nombre: ['razon social emisor', 'razon_social_emisor', 'razon social', 'denominacion'],
    numero:           ['serie comprobante', 'serie_comprobante', 'numero comprobante', 'secuencial'],
    clave_acceso:     ['clave acceso', 'clave_acceso', 'autorizacion', 'numero autorizacion'],
    fecha_emision:    ['fecha emision', 'fecha_emision', 'fecha de emision'],
    // VALOR_SIN_IMPUESTOS del SRI — se asigna a base_iva; luego se mueve a base_cero si iva=0
    base_iva:         ['valor sin impuestos', 'valor_sin_impuestos', 'base imponible diferente', 'base 12', 'base 15', 'gravada'],
    base_cero:        ['base 0', 'base cero', 'base imponible 0', 'exenta', 'monto exento'],
    iva:              ['iva', 'valor iva', 'valor_iva', 'valor del iva'],
    total:            ['importe total', 'importe_total', 'valor total', 'total comprobante'],
    codigo_retencion: ['codigo retencion', 'codigo_retencion', 'codigo de retencion'],
    porcentaje_ret:   ['porcentaje', '% retencion'],
    valor_retenido:   ['valor retenido', 'valor_retenido', 'monto retenido'],
}

function detectarCols(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {}
    // Normalizar: minúsculas, guiones_bajos → espacios, quitar caracteres especiales
    const norm = (s: string) => s.toLowerCase().trim()
        .replace(/_/g, ' ')
        .replace(/[^a-z0-9%áéíóúñ ]/g, '')
    headers.forEach((h, i) => {
        const hn = norm(h)
        for (const [campo, keywords] of Object.entries(COL_KEYS)) {
            if (!(campo in map) && keywords.some(k => hn.includes(k))) {
                map[campo] = i
            }
        }
    })
    return map
}

function parsearCSV(texto: string): FilaParsed[] {
    // Quitar BOM si existe
    const txt = texto.replace(/^﻿/, '')
    const lines = txt.split('\n').filter(l => l.trim())
    if (lines.length < 2) return []

    // Detectar delimitador: tab > pipe > punto y coma > coma
    const primera = lines[0]
    const delim = primera.includes('\t') ? '\t'
                : primera.includes('|')  ? '|'
                : primera.includes(';')  ? ';'
                : ','
    const splitLine = (l: string) => l.split(delim).map(c => c.trim().replace(/^"|"$/g, ''))

    const headers = splitLine(lines[0])
    const cols    = detectarCols(headers)

    const get = (row: string[], campo: string) =>
        cols[campo] !== undefined ? (row[cols[campo]] ?? '').trim() : ''

    const num = (s: string) => parseFloat(s.replace(/,/g, '.').replace(/[^0-9.-]/g, '')) || 0

    return lines.slice(1).map(line => {
        const row = splitLine(line)
        const raw: Record<string, string> = {}
        headers.forEach((h, i) => { raw[h] = row[i] ?? '' })

        const iva             = num(get(row, 'iva'))
        const valorBase       = num(get(row, 'base_iva'))   // VALOR_SIN_IMPUESTOS del SRI
        const baseCeroDirecta = num(get(row, 'base_cero'))  // si existe columna explícita

        // Si el archivo SRI no tiene columna base_cero separada,
        // determinamos según si hay IVA:
        const base_iva  = iva > 0 ? valorBase : 0
        const base_cero = baseCeroDirecta > 0 ? baseCeroDirecta : (iva === 0 ? valorBase : 0)

        return {
            proveedor_ruc:    get(row, 'proveedor_ruc'),
            proveedor_nombre: get(row, 'proveedor_nombre'),
            numero:           get(row, 'numero'),
            clave_acceso:     get(row, 'clave_acceso'),
            fecha_emision:    normalizarFecha(get(row, 'fecha_emision')),
            base_cero,
            base_iva,
            iva,
            total:            num(get(row, 'total')),
            codigo_retencion: get(row, 'codigo_retencion'),
            porcentaje_ret:   num(get(row, 'porcentaje_ret')),
            valor_retenido:   num(get(row, 'valor_retenido')),
            raw,
        }
    }).filter(f => f.proveedor_ruc || f.numero)
}

function normalizarFecha(s: string): string {
    if (!s) return new Date().toISOString().slice(0, 10)
    // dd/mm/yyyy → yyyy-mm-dd
    const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    // yyyy-mm-dd already
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return s
}

// ── Componente principal ───────────────────────────────────────────────────

export function IntegracionSRIPage() {
    const { empresaActiva } = useAuth()
    const navigate  = useNavigate()
    const fileRef   = useRef<HTMLInputElement>(null)

    const [tab, setTab]           = useState<'importar' | 'comprobantes' | 'reglas'>('importar')

    // ── Importar ───────────────────────────────────────────────────────────
    const [año, setAño]           = useState(new Date().getFullYear())
    const [mes, setMes]           = useState(new Date().getMonth() + 1)
    const [tipo, setTipo]         = useState<TipoDoc>('factura')
    const [archivo, setArchivo]   = useState<string>('')
    const [preview, setPreview]   = useState<FilaParsed[]>([])
    const [importando, setImportando] = useState(false)
    const [importOk, setImportOk] = useState('')

    // ── Comprobantes ───────────────────────────────────────────────────────
    const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
    const [filtAño, setFiltAño]   = useState(new Date().getFullYear())
    const [filtMes, setFiltMes]   = useState(new Date().getMonth() + 1)
    const [filtTipo, setFiltTipo] = useState<TipoDoc | ''>('')
    const [filtEstado, setFiltEstado] = useState<string>('')
    const [busqueda, setBusqueda] = useState('')
    const [expandido, setExpandido] = useState<string | null>(null)
    const [cargandoComp, setCargandoComp] = useState(false)
    const [generando, setGenerando]       = useState(false)
    const [logGen, setLogGen]             = useState<string[]>([])

    // ── Mapeos ─────────────────────────────────────────────────────────────
    const [mapeos, setMapeos]       = useState<Mapeo[]>([])
    const [cargandoMap, setCargandoMap] = useState(false)
    const [editMapeo, setEditMapeo] = useState<Partial<Mapeo> | null>(null)
    const [guardandoMap, setGuardandoMap] = useState(false)

    // ── Cuentas ────────────────────────────────────────────────────────────
    const [cuentas, setCuentas]   = useState<CuentaOpc[]>([])
    const [error, setError]       = useState('')

    useEffect(() => {
        if (empresaActiva) {
            cargarCuentas()
            cargarComprobantes()
            cargarMapeos()
        }
    }, [empresaActiva])

    // ── Carga de cuentas ───────────────────────────────────────────────────

    async function cargarCuentas() {
        if (!empresaActiva) return
        const { data } = await supabase.from('lp_cuentas')
            .select('id, codigo, nombre')
            .eq('empresa_id', empresaActiva.id)
            .eq('acepta_movimientos', true)
            .order('codigo')
        setCuentas(data ?? [])
    }

    // ── Lectura de archivo CSV ─────────────────────────────────────────────

    function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setArchivo(file.name)
        const reader = new FileReader()
        reader.onload = ev => {
            const texto = ev.target?.result as string
            const filas = parsearCSV(texto)
            setPreview(filas)
            setError(filas.length === 0 ? 'No se pudo leer el CSV. Verifica el formato.' : '')
        }
        reader.readAsText(file, 'utf-8')
    }

    // ── Importar al DB ─────────────────────────────────────────────────────

    async function confirmarImportacion() {
        if (!preview.length) return
        if (!empresaActiva) {
            setError('No hay empresa activa. Si acabas de crear una empresa LP, recarga la página e ingresa de nuevo.')
            return
        }
        setImportando(true)
        setError('')

        // Crear registro de importación
        const impId = crypto.randomUUID()
        await supabase.from('lp_sri_importaciones').insert({
            id: impId, empresa_id: empresaActiva.id, año, mes, tipo,
            archivo, total_reg: preview.length,
        })

        // Buscar mapeos aplicables
        const { data: reglasData } = await supabase.from('lp_sri_mapeos')
            .select('*')
            .eq('empresa_id', empresaActiva.id)
            .eq('tipo', tipo)
            .eq('activo', true)

        const reglas: Mapeo[] = reglasData ?? []

        const rows = preview.map(f => {
            // Aplicar regla específica (por RUC) o genérica (RUC null)
            const regla = reglas.find(r => r.proveedor_ruc === f.proveedor_ruc)
                       ?? reglas.find(r => !r.proveedor_ruc)

            const tieneMapeo = !!(regla?.cuenta_proveedor_id && regla?.cuenta_gasto_id)
            return {
                empresa_id:          empresaActiva.id,
                importacion_id:      impId,
                año, mes, tipo,
                proveedor_ruc:       f.proveedor_ruc,
                proveedor_nombre:    f.proveedor_nombre,
                numero:              f.numero,
                clave_acceso:        f.clave_acceso || null,
                fecha_emision:       f.fecha_emision,
                base_cero:           f.base_cero,
                base_iva:            f.base_iva,
                iva:                 f.iva,
                total:               f.total,
                codigo_retencion:    f.codigo_retencion || null,
                porcentaje_ret:      f.porcentaje_ret || null,
                valor_retenido:      f.valor_retenido || null,
                cuenta_gasto_id:     regla?.cuenta_gasto_id ?? null,
                cuenta_iva_id:       regla?.cuenta_iva_id ?? null,
                cuenta_retencion_id: regla?.cuenta_retencion_id ?? null,
                cuenta_proveedor_id: regla?.cuenta_proveedor_id ?? null,
                estado:              tieneMapeo ? 'listo' : 'pendiente',
                raw_data:            f.raw,
            }
        })

        // Obtener números ya existentes para esta empresa/tipo
        const { data: existentes } = await supabase.from('lp_sri_comprobantes')
            .select('numero, proveedor_ruc')
            .eq('empresa_id', empresaActiva.id)
            .eq('tipo', tipo)

        const claveExistente = new Set(
            (existentes ?? []).map((r: any) => `${r.numero}|${r.proveedor_ruc}`)
        )

        const rowsNuevos = rows.filter(r =>
            !claveExistente.has(`${r.numero}|${r.proveedor_ruc}`)
        )

        let nuevos = 0
        let primerError = ''

        // Insertar en lotes de 50
        for (let i = 0; i < rowsNuevos.length; i += 50) {
            const lote = rowsNuevos.slice(i, i + 50)
            const { error: er } = await supabase.from('lp_sri_comprobantes').insert(lote)
            if (er) { primerError = primerError || er.message }
            else     { nuevos += lote.length }
        }

        if (primerError) setError(`Error al importar: ${primerError}`)

        await supabase.from('lp_sri_importaciones').update({ nuevos })
            .eq('id', impId)

        setImportOk(`${nuevos} nuevos importados. ${preview.length - rowsNuevos.length} ya existían.`)
        setPreview([])
        setArchivo('')
        if (fileRef.current) fileRef.current.value = ''
        await cargarComprobantes()
        setImportando(false)
        setTab('comprobantes')
    }

    // ── Comprobantes ───────────────────────────────────────────────────────

    async function cargarComprobantes() {
        if (!empresaActiva) return
        setCargandoComp(true)
        let q = supabase.from('lp_sri_comprobantes')
            .select('*')
            .eq('empresa_id', empresaActiva.id)
            .order('fecha_emision', { ascending: false })

        if (filtAño) q = q.eq('año', filtAño)
        if (filtMes) q = q.eq('mes', filtMes)
        if (filtTipo) q = q.eq('tipo', filtTipo)
        if (filtEstado) q = q.eq('estado', filtEstado)

        const { data } = await q
        setComprobantes((data ?? []) as Comprobante[])
        setCargandoComp(false)
    }

    useEffect(() => { if (empresaActiva) cargarComprobantes() }, [filtAño, filtMes, filtTipo, filtEstado])

    const compFiltrados = comprobantes.filter(c =>
        !busqueda ||
        c.proveedor_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.proveedor_ruc.includes(busqueda) ||
        c.numero.includes(busqueda)
    )

    // ── Guardar mapeo en un comprobante ────────────────────────────────────

    async function guardarCuentasComp(id: string, campos: Partial<Comprobante>, crearRegla: boolean) {
        if (!empresaActiva) return
        const tieneMapeo = !!(campos.cuenta_proveedor_id && campos.cuenta_gasto_id)
        await supabase.from('lp_sri_comprobantes').update({
            ...campos,
            estado: tieneMapeo ? 'listo' : 'pendiente',
        }).eq('id', id)

        if (crearRegla && tieneMapeo) {
            const comp = comprobantes.find(c => c.id === id)
            if (comp) {
                await supabase.from('lp_sri_mapeos').upsert({
                    empresa_id:          empresaActiva.id,
                    tipo:                comp.tipo as TipoDoc,
                    proveedor_ruc:       comp.proveedor_ruc,
                    cuenta_gasto_id:     campos.cuenta_gasto_id ?? null,
                    cuenta_iva_id:       campos.cuenta_iva_id ?? null,
                    cuenta_retencion_id: campos.cuenta_retencion_id ?? null,
                    cuenta_proveedor_id: campos.cuenta_proveedor_id ?? null,
                    descripcion:         `Mapeo automático — ${comp.proveedor_nombre}`,
                }, { onConflict: 'empresa_id,tipo,proveedor_ruc' })
                await cargarMapeos()
            }
        }
        await cargarComprobantes()
        setExpandido(null)
    }

    // ── Eliminar comprobantes ──────────────────────────────────────────────

    async function eliminarComprobante(id: string) {
        if (!window.confirm('¿Eliminar este comprobante? Esta acción no se puede deshacer.')) return
        const { error: er } = await supabase.from('lp_sri_comprobantes').delete().eq('id', id)
        if (er) { setError(er.message); return }
        await cargarComprobantes()
    }

    async function eliminarPeriodo() {
        if (!empresaActiva) return
        const eliminables = compFiltrados.filter(c => c.estado !== 'contabilizado')
        const nCont = compFiltrados.filter(c => c.estado === 'contabilizado').length
        if (!eliminables.length) {
            setError('Todos los comprobantes del período ya están contabilizados y no se pueden eliminar desde aquí.')
            return
        }
        const aviso = nCont > 0
            ? `Se eliminarán ${eliminables.length} comprobante(s). Los ${nCont} contabilizados no se tocarán.\n¿Confirmar?`
            : `¿Eliminar los ${eliminables.length} comprobante(s) de ${mesNombre(filtMes)} ${filtAño}?\nEsta acción no se puede deshacer.`
        if (!window.confirm(aviso)) return
        const ids = eliminables.map(c => c.id)
        for (let i = 0; i < ids.length; i += 50) {
            const { error: er } = await supabase.from('lp_sri_comprobantes').delete().in('id', ids.slice(i, i + 50))
            if (er) { setError(er.message); return }
        }
        await cargarComprobantes()
    }

    // ── Aplicar reglas a pendientes ────────────────────────────────────────

    async function aplicarReglas() {
        if (!empresaActiva) return
        const pendientes = comprobantes.filter(c => c.estado === 'pendiente')
        for (const c of pendientes) {
            const regla = mapeos.find(m => m.tipo === c.tipo && m.proveedor_ruc === c.proveedor_ruc)
                       ?? mapeos.find(m => m.tipo === c.tipo && !m.proveedor_ruc)
            if (!regla) continue
            const tieneMapeo = !!(regla.cuenta_proveedor_id && regla.cuenta_gasto_id)
            await supabase.from('lp_sri_comprobantes').update({
                cuenta_gasto_id:     regla.cuenta_gasto_id ?? null,
                cuenta_iva_id:       regla.cuenta_iva_id ?? null,
                cuenta_retencion_id: regla.cuenta_retencion_id ?? null,
                cuenta_proveedor_id: regla.cuenta_proveedor_id ?? null,
                estado: tieneMapeo ? 'listo' : 'pendiente',
            }).eq('id', c.id)
        }
        await cargarComprobantes()
    }

    // ── Generar diarios ────────────────────────────────────────────────────

    async function generarDiarios() {
        if (!empresaActiva) return
        const listos = compFiltrados.filter(c => c.estado === 'listo')
        if (!listos.length) return
        setGenerando(true)
        setLogGen([])

        const { data: tc } = await supabase.from('lp_tipos_comprobante')
            .select('id').eq('codigo', 'CE').maybeSingle()
        if (!tc) { setError('No se encontró tipo comprobante CE.'); setGenerando(false); return }

        const { data: periodos } = await supabase.from('lp_periodos')
            .select('*').eq('empresa_id', empresaActiva.id).eq('estado', 'abierto')

        let ok = 0
        for (const c of listos) {
            const periodo = periodos?.find(p => p.año === c.año && p.mes === c.mes)
                         ?? periodos?.[periodos.length - 1]
            if (!periodo) { addLog(`✗ Sin período abierto para ${mesNombre(c.mes)} ${c.año}`); continue }

            const mesStr = String(periodo.mes ?? c.mes).padStart(2, '0')
            const prefijo = `CE-${periodo.año}-${mesStr}-`
            const { data: ult } = await supabase.from('lp_comprobantes')
                .select('numero').eq('empresa_id', empresaActiva.id)
                .like('numero', `${prefijo}%`).order('numero', { ascending: false }).limit(1)
            const seq = (ult?.length ? parseInt(ult[0].numero.replace(prefijo,''), 10) : 0) + 1
            const numero = `${prefijo}${String(seq).padStart(6,'0')}`

            // Construir líneas del asiento
            const lineas: any[] = []
            let orden = 1

            if (c.tipo === 'factura' || c.tipo === 'nota_credito' || c.tipo === 'nota_debito') {
                // DEBE: gasto
                const baseTotal = c.base_cero + c.base_iva
                if (baseTotal > 0 && c.cuenta_gasto_id)
                    lineas.push({ cuenta_id: c.cuenta_gasto_id, debe: baseTotal, haber: 0, descripcion: `${c.tipo} ${c.numero} — ${c.proveedor_nombre}`, orden: orden++ })
                // DEBE: IVA compras
                if (c.iva > 0 && c.cuenta_iva_id)
                    lineas.push({ cuenta_id: c.cuenta_iva_id, debe: c.iva, haber: 0, descripcion: 'IVA en compras', orden: orden++ })
                // HABER: proveedor
                if (c.cuenta_proveedor_id)
                    lineas.push({ cuenta_id: c.cuenta_proveedor_id, debe: 0, haber: c.total, descripcion: `${c.tipo} ${c.numero} — ${c.proveedor_nombre}`, orden: orden++ })
            } else if (c.tipo === 'retencion') {
                // DEBE: retención por cobrar
                if (c.valor_retenido && c.cuenta_retencion_id)
                    lineas.push({ cuenta_id: c.cuenta_retencion_id, debe: c.valor_retenido, haber: 0, descripcion: `Retención ${c.codigo_retencion} — ${c.proveedor_nombre}`, orden: orden++ })
                // HABER: CxC o proveedor
                if (c.valor_retenido && c.cuenta_proveedor_id)
                    lineas.push({ cuenta_id: c.cuenta_proveedor_id, debe: 0, haber: c.valor_retenido, descripcion: `Retención ${c.numero}`, orden: orden++ })
            }

            const totalDebe  = lineas.reduce((s, l) => s + l.debe,  0)
            const totalHaber = lineas.reduce((s, l) => s + l.haber, 0)
            if (Math.abs(totalDebe - totalHaber) > 0.01) { addLog(`✗ No cuadra: ${c.numero}`); continue }

            try {
                const { data: comp, error: er } = await supabase.from('lp_comprobantes').insert({
                    empresa_id: empresaActiva.id, periodo_id: periodo.id,
                    tipo_comprobante_id: tc.id, numero, secuencial: seq,
                    fecha: c.fecha_emision,
                    glosa: `${c.tipo.toUpperCase()} SRI — ${c.numero} — ${c.proveedor_nombre}`,
                    estado: 'confirmado', total_debe: totalDebe, total_haber: totalHaber,
                    origen: 'sri', referencia_externa: c.id,
                }).select('id').single()

                if (er || !comp) throw new Error(er?.message)

                await supabase.from('lp_comprobante_lineas').insert(
                    lineas.map(l => ({ ...l, comprobante_id: comp.id, empresa_id: empresaActiva.id }))
                )
                await supabase.rpc('lp_actualizar_saldos', { p_comprobante_id: comp.id, p_operacion: 'sumar' })
                await supabase.from('lp_sri_comprobantes').update({ estado: 'contabilizado', comprobante_id: comp.id }).eq('id', c.id)

                addLog(`✓ ${numero} — ${c.proveedor_nombre} — ${formatMoneda(c.total, '$')}`)
                ok++
            } catch (e: any) { addLog(`✗ Error en ${c.numero}: ${e.message}`) }
        }

        addLog(`──── Completado: ${ok} diarios generados.`)
        await cargarComprobantes()
        setGenerando(false)
    }

    function addLog(m: string) {
        setLogGen(prev => [...prev, `[${new Date().toLocaleTimeString('es-EC')}] ${m}`])
    }

    // ── Mapeos CRUD ────────────────────────────────────────────────────────

    async function cargarMapeos() {
        if (!empresaActiva) return
        setCargandoMap(true)
        const { data } = await supabase.from('lp_sri_mapeos')
            .select('*').eq('empresa_id', empresaActiva.id).eq('activo', true).order('tipo')
        setMapeos(data ?? [])
        setCargandoMap(false)
    }

    async function guardarMapeo() {
        if (!empresaActiva || !editMapeo?.tipo) return
        setGuardandoMap(true)
        const fila = {
            empresa_id:          empresaActiva.id,
            tipo:                editMapeo.tipo,
            proveedor_ruc:       editMapeo.proveedor_ruc || null,
            cuenta_gasto_id:     editMapeo.cuenta_gasto_id || null,
            cuenta_iva_id:       editMapeo.cuenta_iva_id || null,
            cuenta_retencion_id: editMapeo.cuenta_retencion_id || null,
            cuenta_proveedor_id: editMapeo.cuenta_proveedor_id || null,
            descripcion:         editMapeo.descripcion || null,
            activo:              true,
        }
        if (editMapeo.id) {
            await supabase.from('lp_sri_mapeos').update(fila).eq('id', editMapeo.id)
        } else {
            await supabase.from('lp_sri_mapeos').insert(fila)
        }
        setEditMapeo(null)
        await cargarMapeos()
        setGuardandoMap(false)
    }

    async function eliminarMapeo(id: string) {
        await supabase.from('lp_sri_mapeos').update({ activo: false }).eq('id', id)
        await cargarMapeos()
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    const sym = empresaActiva?.moneda?.simbolo ?? '$'
    const labelCuenta = (id?: string) => {
        const c = cuentas.find(x => x.id === id)
        return c ? `${c.codigo} — ${c.nombre}` : '—'
    }

    const ESTADO_BADGE: Record<string, string> = {
        pendiente:     'bg-amber-100 text-amber-700',
        listo:         'bg-green-100 text-green-700',
        contabilizado: 'bg-slate-100 text-slate-500',
    }

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="space-y-5 max-w-6xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Integración SRI</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                    Importa comprobantes del SRI y genera asientos contables automáticamente
                </p>
            </div>

            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}
            {importOk && (
                <div className="card px-5 py-3 bg-green-50 border-green-200 text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> {importOk}
                    <button onClick={() => setImportOk('')} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm w-fit">
                {([
                    ['importar',      'Importar CSV',    Upload  ],
                    ['comprobantes',  'Comprobantes',    List    ],
                    ['reglas',        'Reglas de Mapeo', Settings],
                ] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setTab(id)}
                        className={cn('flex items-center gap-2 px-5 py-2.5 border-l border-slate-200 first:border-l-0',
                            tab === id ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                        <Icon className="w-4 h-4" /> {label}
                        {id === 'comprobantes' && comprobantes.filter(c => c.estado === 'pendiente').length > 0 && (
                            <span className="ml-1 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                                {comprobantes.filter(c => c.estado === 'pendiente').length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ══════════════════ Tab: Importar CSV ══════════════════ */}
            {tab === 'importar' && (
                <div className="space-y-4">
                    <div className="card p-5 space-y-4">
                        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
                            Paso 1 — Seleccionar período y tipo
                        </h2>
                        <div className="flex flex-wrap gap-4">
                            <div>
                                <label className="label">Año</label>
                                <select className="input" value={año} onChange={e => setAño(+e.target.value)}>
                                    {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">Mes</label>
                                <select className="input" value={mes} onChange={e => setMes(+e.target.value)}>
                                    {Array.from({length:12},(_,i)=>i+1).map(m => (
                                        <option key={m} value={m}>{mesNombre(m)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">Tipo de comprobante</label>
                                <select className="input" value={tipo} onChange={e => setTipo(e.target.value as TipoDoc)}>
                                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide pt-2 border-t border-slate-100">
                            Paso 2 — Seleccionar archivo CSV del SRI
                        </h2>
                        <div>
                            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFileChange} />
                            <button onClick={() => fileRef.current?.click()}
                                className="btn border border-dashed border-primary-300 text-primary-600 hover:bg-primary-50 gap-2 px-6 py-3">
                                <Upload className="w-5 h-5" />
                                {archivo ? archivo : 'Seleccionar archivo CSV del SRI...'}
                            </button>
                            <p className="text-xs text-slate-400 mt-1">
                                Descarga el CSV desde: SRI en Línea → Consultas → Comprobantes Electrónicos Recibidos
                            </p>
                        </div>

                        {/* Preview */}
                        {preview.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-slate-700">
                                        Vista previa — {preview.length} registros detectados
                                    </p>
                                    <button onClick={confirmarImportacion} disabled={importando}
                                        className="btn btn-primary gap-2">
                                        {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                        Confirmar importación
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 border-b text-slate-500 uppercase tracking-wide">
                                                <th className="py-2 px-3 text-left">RUC</th>
                                                <th className="py-2 px-3 text-left">Proveedor</th>
                                                <th className="py-2 px-3 text-left">Número</th>
                                                <th className="py-2 px-3 text-left">Fecha</th>
                                                <th className="py-2 px-3 text-right">Base 0%</th>
                                                <th className="py-2 px-3 text-right">Base Grav.</th>
                                                <th className="py-2 px-3 text-right">IVA</th>
                                                <th className="py-2 px-3 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.slice(0, 10).map((f, i) => (
                                                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                                    <td className="py-1.5 px-3 font-mono">{f.proveedor_ruc}</td>
                                                    <td className="py-1.5 px-3 max-w-[180px] truncate">{f.proveedor_nombre}</td>
                                                    <td className="py-1.5 px-3 font-mono">{f.numero}</td>
                                                    <td className="py-1.5 px-3">{f.fecha_emision}</td>
                                                    <td className="py-1.5 px-3 text-right">{f.base_cero > 0 ? formatMoneda(f.base_cero,sym) : '—'}</td>
                                                    <td className="py-1.5 px-3 text-right">{f.base_iva > 0 ? formatMoneda(f.base_iva,sym) : '—'}</td>
                                                    <td className="py-1.5 px-3 text-right">{f.iva > 0 ? formatMoneda(f.iva,sym) : '—'}</td>
                                                    <td className="py-1.5 px-3 text-right font-semibold">{formatMoneda(f.total,sym)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {preview.length > 10 && (
                                        <p className="text-xs text-slate-400 text-center py-2">
                                            Mostrando 10 de {preview.length} registros
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════ Tab: Comprobantes ══════════════════ */}
            {tab === 'comprobantes' && (
                <div className="space-y-4">
                    {/* Filtros */}
                    <div className="card p-4 flex flex-wrap gap-3 items-end">
                        <div>
                            <label className="label">Año</label>
                            <select className="input" value={filtAño} onChange={e => setFiltAño(+e.target.value)}>
                                {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label">Mes</label>
                            <select className="input" value={filtMes} onChange={e => setFiltMes(+e.target.value)}>
                                <option value={0}>Todos</option>
                                {Array.from({length:12},(_,i)=>i+1).map(m => (
                                    <option key={m} value={m}>{mesNombre(m)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Tipo</label>
                            <select className="input" value={filtTipo} onChange={e => setFiltTipo(e.target.value as any)}>
                                <option value="">Todos</option>
                                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label">Estado</label>
                            <select className="input" value={filtEstado} onChange={e => setFiltEstado(e.target.value)}>
                                <option value="">Todos</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="listo">Listo</option>
                                <option value="contabilizado">Contabilizado</option>
                            </select>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                            <label className="label">Buscar</label>
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input className="input pl-9" placeholder="RUC, nombre o número..."
                                    value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                            </div>
                        </div>
                        <button onClick={cargarComprobantes} disabled={cargandoComp}
                            className="btn border border-slate-200 text-slate-600 gap-2">
                            {cargandoComp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            Buscar
                        </button>
                        <button onClick={aplicarReglas} className="btn border border-primary-200 text-primary-700 hover:bg-primary-50 gap-2">
                            <Settings className="w-4 h-4" /> Aplicar reglas
                        </button>
                        <button
                            onClick={() => navigate(`/tributario/ats?año=${filtAño}&mes=${filtMes}`)}
                            className="btn border border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-2"
                            title="Ir al módulo ATS con este período seleccionado"
                        >
                            <FileDown className="w-4 h-4" /> Exportar ATS
                        </button>
                        <button
                            onClick={eliminarPeriodo}
                            disabled={cargandoComp || compFiltrados.filter(c => c.estado !== 'contabilizado').length === 0}
                            className="btn border border-red-200 text-red-600 hover:bg-red-50 gap-2 disabled:opacity-40"
                            title="Eliminar todos los comprobantes no contabilizados del período filtrado"
                        >
                            <Trash2 className="w-4 h-4" /> Eliminar período
                        </button>
                    </div>

                    {/* Grid */}
                    <div className="card overflow-hidden">
                        <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm flex items-center justify-between">
                            <span>Comprobantes SRI — {compFiltrados.length} registros</span>
                            <div className="flex gap-2 text-xs font-normal">
                                <span className="bg-amber-500 text-white px-2 py-0.5 rounded">
                                    {compFiltrados.filter(c=>c.estado==='pendiente').length} pendientes
                                </span>
                                <span className="bg-green-500 text-white px-2 py-0.5 rounded">
                                    {compFiltrados.filter(c=>c.estado==='listo').length} listos
                                </span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                        <th className="py-2 px-2 w-8"></th>
                                        <th className="py-2 px-3 text-left">Proveedor</th>
                                        <th className="py-2 px-3 text-left">Número</th>
                                        <th className="py-2 px-3 text-left">Fecha</th>
                                        <th className="py-2 px-3 text-left">Tipo</th>
                                        <th className="py-2 px-3 text-right">Base 0%</th>
                                        <th className="py-2 px-3 text-right">Base Grav.</th>
                                        <th className="py-2 px-3 text-right">IVA</th>
                                        <th className="py-2 px-3 text-right">Total</th>
                                        <th className="py-2 px-3 text-center">Estado</th>
                                        <th className="py-2 px-2 w-8" title="Regla de mapeo"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cargandoComp ? (
                                        <tr><td colSpan={10} className="py-8 text-center text-slate-400">
                                            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                                        </td></tr>
                                    ) : compFiltrados.length === 0 ? (
                                        <tr><td colSpan={10} className="py-8 text-center text-slate-400">
                                            Sin comprobantes. Importa un CSV del SRI.
                                        </td></tr>
                                    ) : compFiltrados.map(c => {
                                        const isExp = expandido === c.id
                                        return (
                                            <Fragment key={c.id}>
                                                <tr className="border-b border-slate-100 hover:bg-slate-50">
                                                    <td className="py-2 px-2">
                                                        {c.estado !== 'contabilizado' && (
                                                            <button onClick={() => setExpandido(isExp ? null : c.id)}
                                                                className="text-slate-400 hover:text-slate-600">
                                                                {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <div className="font-medium text-slate-700 text-xs">{c.proveedor_nombre}</div>
                                                        <div className="text-slate-400 text-xs font-mono">{c.proveedor_ruc}</div>
                                                    </td>
                                                    <td className="py-2 px-3 font-mono text-xs text-slate-600">{c.numero}</td>
                                                    <td className="py-2 px-3 text-xs text-slate-500">{c.fecha_emision}</td>
                                                    <td className="py-2 px-3 text-xs text-slate-500 capitalize">{c.tipo.replace('_',' ')}</td>
                                                    <td className="py-2 px-3 text-right text-xs">{c.base_cero > 0 ? formatMoneda(c.base_cero,sym) : '—'}</td>
                                                    <td className="py-2 px-3 text-right text-xs">{c.base_iva > 0 ? formatMoneda(c.base_iva,sym) : '—'}</td>
                                                    <td className="py-2 px-3 text-right text-xs">{c.iva > 0 ? formatMoneda(c.iva,sym) : '—'}</td>
                                                    <td className="py-2 px-3 text-right font-semibold">{formatMoneda(c.total,sym)}</td>
                                                    <td className="py-2 px-3 text-center">
                                                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ESTADO_BADGE[c.estado])}>
                                                            {c.estado}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-2 flex gap-0.5">
                                                        <button
                                                            title="Crear / editar regla de mapeo para este proveedor"
                                                            onClick={() => setEditMapeo({
                                                                tipo:            c.tipo as TipoDoc,
                                                                proveedor_ruc:   c.proveedor_ruc,
                                                                descripcion:     c.proveedor_nombre,
                                                                cuenta_gasto_id:     mapeos.find(m => m.tipo === c.tipo && m.proveedor_ruc === c.proveedor_ruc)?.cuenta_gasto_id,
                                                                cuenta_iva_id:       mapeos.find(m => m.tipo === c.tipo && m.proveedor_ruc === c.proveedor_ruc)?.cuenta_iva_id,
                                                                cuenta_retencion_id: mapeos.find(m => m.tipo === c.tipo && m.proveedor_ruc === c.proveedor_ruc)?.cuenta_retencion_id,
                                                                cuenta_proveedor_id: mapeos.find(m => m.tipo === c.tipo && m.proveedor_ruc === c.proveedor_ruc)?.cuenta_proveedor_id,
                                                                id: mapeos.find(m => m.tipo === c.tipo && m.proveedor_ruc === c.proveedor_ruc)?.id,
                                                            })}
                                                            className="text-slate-400 hover:text-primary-600 p-1 rounded transition-colors"
                                                        >
                                                            <Settings className="w-3.5 h-3.5" />
                                                        </button>
                                                        {c.estado !== 'contabilizado' && (
                                                            <button
                                                                title="Eliminar comprobante"
                                                                onClick={() => eliminarComprobante(c.id)}
                                                                className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>

                                                {/* Asignación de cuentas */}
                                                {isExp && (
                                                    <MapeoCuentas
                                                        comp={c}
                                                        cuentas={cuentas}
                                                        onGuardar={(campos, crearRegla) => guardarCuentasComp(c.id, campos, crearRegla)}
                                                        onCancelar={() => setExpandido(null)}
                                                    />
                                                )}
                                            </Fragment>
                                        )
                                    })}
                                </tbody>
                                {compFiltrados.length > 0 && (
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 font-semibold text-sm">
                                            <td colSpan={5} className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase">Totales</td>
                                            <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(compFiltrados.reduce((s,c)=>s+c.base_cero,0),sym)}</td>
                                            <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(compFiltrados.reduce((s,c)=>s+c.base_iva,0),sym)}</td>
                                            <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(compFiltrados.reduce((s,c)=>s+c.iva,0),sym)}</td>
                                            <td className="py-2.5 px-3 text-right">{formatMoneda(compFiltrados.reduce((s,c)=>s+c.total,0),sym)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* Botón generar + log */}
                    {compFiltrados.filter(c=>c.estado==='listo').length > 0 && (
                        <div className="card px-5 py-4 bg-green-50 border-green-200 flex items-center gap-4 flex-wrap">
                            <p className="text-sm text-green-800 flex-1">
                                <strong>{compFiltrados.filter(c=>c.estado==='listo').length} comprobante(s)</strong> listos para generar diarios contables.
                            </p>
                            <button onClick={generarDiarios} disabled={generando} className="btn btn-primary gap-2 shrink-0">
                                {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                Generar diarios
                            </button>
                        </div>
                    )}
                    {logGen.length > 0 && (
                        <div className="card p-4 bg-slate-900 font-mono text-xs text-green-400 space-y-0.5 max-h-48 overflow-y-auto">
                            {logGen.map((l,i) => <div key={i}>{l}</div>)}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ Tab: Reglas ══════════════════ */}
            {tab === 'reglas' && (
                <div className="space-y-4">
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
                                Reglas de mapeo contable ({mapeos.length})
                            </h2>
                            <button onClick={() => setEditMapeo({ tipo: 'factura' })}
                                className="btn btn-primary gap-2 text-sm">
                                <Plus className="w-4 h-4" /> Nueva regla
                            </button>
                        </div>

                        {cargandoMap ? (
                            <div className="text-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
                        ) : mapeos.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-8">
                                Sin reglas. Las reglas se crean al asignar cuentas a un comprobante.
                            </p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-slate-400 uppercase tracking-wide border-b">
                                        <th className="text-left py-2 px-3">Tipo</th>
                                        <th className="text-left py-2 px-3">Proveedor RUC</th>
                                        <th className="text-left py-2 px-3">Cuenta Gasto</th>
                                        <th className="text-left py-2 px-3">Cuenta Proveedor</th>
                                        <th className="py-2 px-3 w-20"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mapeos.map(m => (
                                        <tr key={m.id} className="border-b border-slate-50">
                                            <td className="py-2 px-3 capitalize text-slate-600">{m.tipo.replace('_',' ')}</td>
                                            <td className="py-2 px-3 font-mono text-xs text-slate-500">{m.proveedor_ruc ?? <span className="italic text-slate-400">Todos</span>}</td>
                                            <td className="py-2 px-3 text-xs text-slate-600 max-w-[200px] truncate">{labelCuenta(m.cuenta_gasto_id)}</td>
                                            <td className="py-2 px-3 text-xs text-slate-600 max-w-[200px] truncate">{labelCuenta(m.cuenta_proveedor_id)}</td>
                                            <td className="py-2 px-3 flex gap-1 justify-end">
                                                <button onClick={() => setEditMapeo(m)}
                                                    className="text-slate-400 hover:text-primary-600 p-1"><Settings className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => eliminarMapeo(m.id)}
                                                    className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Modal editar mapeo */}
            {editMapeo && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                            <h3 className="font-bold text-slate-900">{editMapeo.id ? 'Editar' : 'Nueva'} regla de mapeo</h3>
                            {editMapeo.descripcion && (
                                <p className="text-xs text-slate-500 mt-0.5">{editMapeo.descripcion}</p>
                            )}
                        </div>
                            <button onClick={() => setEditMapeo(null)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Tipo</label>
                                <select className="input w-full" value={editMapeo.tipo}
                                    onChange={e => setEditMapeo(m => ({...m, tipo: e.target.value as TipoDoc}))}>
                                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">RUC Proveedor <span className="text-slate-400 text-xs">(vacío = todos)</span></label>
                                <input className="input w-full font-mono" value={editMapeo.proveedor_ruc ?? ''}
                                    onChange={e => setEditMapeo(m => ({...m, proveedor_ruc: e.target.value}))}
                                    placeholder="0000000000001" />
                            </div>
                        </div>
                        {([
                            ['cuenta_gasto_id',     'Cuenta de Gasto / Costo'],
                            ['cuenta_iva_id',        'IVA en Compras'],
                            ['cuenta_retencion_id',  'Retención (si aplica)'],
                            ['cuenta_proveedor_id',  'Cuentas por Pagar'],
                        ] as const).map(([campo, etiqueta]) => (
                            <div key={campo}>
                                <label className="label">{etiqueta}</label>
                                <select className="input w-full"
                                    value={(editMapeo as any)[campo] ?? ''}
                                    onChange={e => setEditMapeo(m => ({...m, [campo]: e.target.value || undefined}))}>
                                    <option value="">— Sin asignar —</option>
                                    {cuentas.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                                </select>
                            </div>
                        ))}
                        <div className="flex gap-3 pt-2">
                            <button onClick={guardarMapeo} disabled={guardandoMap} className="btn btn-primary flex-1 gap-2">
                                {guardandoMap ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Guardar regla
                            </button>
                            <button onClick={() => setEditMapeo(null)} className="btn border border-slate-200 text-slate-600">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Sub-componente: asignación de cuentas por comprobante ──────────────────

function MapeoCuentas({ comp, cuentas, onGuardar, onCancelar }: {
    comp:      Comprobante
    cuentas:   CuentaOpc[]
    onGuardar: (campos: Partial<Comprobante>, crearRegla: boolean) => void
    onCancelar: () => void
}) {
    const [cGasto,     setCGasto]     = useState(comp.cuenta_gasto_id ?? '')
    const [cIva,       setCIva]       = useState(comp.cuenta_iva_id ?? '')
    const [cRet,       setCRet]       = useState(comp.cuenta_retencion_id ?? '')
    const [cProv,      setCProv]      = useState(comp.cuenta_proveedor_id ?? '')
    const [crearRegla, setCrearRegla] = useState(true)

    return (
        <tr className="bg-blue-50 border-b border-blue-100">
            <td colSpan={10} className="px-8 py-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Asignar cuentas contables — {comp.proveedor_nombre}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    {([
                        ['Gasto / Costo',     cGasto, setCGasto],
                        ['IVA en Compras',    cIva,   setCIva],
                        ['Retención',         cRet,   setCRet],
                        ['Cuentas por Pagar', cProv,  setCProv],
                    ] as const).map(([lbl, val, set]) => (
                        <div key={lbl}>
                            <label className="label text-xs">{lbl}</label>
                            <select className="input w-full text-xs" value={val}
                                onChange={e => (set as any)(e.target.value)}>
                                <option value="">— Sin asignar —</option>
                                {cuentas.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={crearRegla} onChange={e => setCrearRegla(e.target.checked)}
                            className="rounded" />
                        Guardar como regla para futuros comprobantes de este proveedor
                    </label>
                    <div className="flex gap-2 ml-auto">
                        <button onClick={onCancelar} className="btn text-xs border border-slate-200 text-slate-600">Cancelar</button>
                        <button
                            onClick={() => onGuardar({
                                cuenta_gasto_id: cGasto || undefined,
                                cuenta_iva_id:   cIva   || undefined,
                                cuenta_retencion_id: cRet || undefined,
                                cuenta_proveedor_id: cProv || undefined,
                            }, crearRegla)}
                            disabled={!cProv && !cGasto}
                            className="btn btn-primary text-xs gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Guardar
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    )
}
