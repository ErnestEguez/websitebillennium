import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Eye, CheckCircle, Ban, Loader2, Filter, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatFecha, formatMoneda, mesNombre } from '../../../lib/utils'
import type { LpComprobante, LpTipoComprobante } from '../../../types/conta'

const ESTADO_STYLE = {
    borrador:   { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Borrador' },
    confirmado: { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Confirmado' },
    anulado:    { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Anulado' },
}

const MESES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: mesNombre(i + 1) }))

const añoActual = new Date().getFullYear()
const AÑOS = Array.from({ length: 6 }, (_, i) => añoActual - 4 + i).reverse()

type OrdenCampo = 'fecha' | 'tipo' | 'numero'
type OrdenDir   = 'asc' | 'desc'

function SortHeader({
    label, campo, ordenCampo, ordenDir, onSort,
}: {
    label: string
    campo: OrdenCampo
    ordenCampo: OrdenCampo
    ordenDir: OrdenDir
    onSort: (c: OrdenCampo) => void
}) {
    const activo = ordenCampo === campo
    return (
        <button
            onClick={() => onSort(campo)}
            className="flex items-center gap-1 group"
        >
            {label}
            {activo
                ? ordenDir === 'asc'
                    ? <ArrowUp className="w-3 h-3 text-primary-600" />
                    : <ArrowDown className="w-3 h-3 text-primary-600" />
                : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
            }
        </button>
    )
}

export function ComprobantesPage() {
    const { empresaActiva } = useAuth()
    const [comprobantes, setComprobantes] = useState<LpComprobante[]>([])
    const [tipos, setTipos] = useState<LpTipoComprobante[]>([])
    const [loading, setLoading] = useState(true)

    // Filtros
    const [busqueda, setBusqueda]     = useState('')
    const [filtroEstado, setFiltroEstado] = useState<string>('todos')
    const [filtroAño, setFiltroAño]   = useState<number | ''>(añoActual)
    const [filtroMes, setFiltroMes]   = useState<number | ''>(new Date().getMonth() + 1)
    const [filtroTipo, setFiltroTipo] = useState<string>('todos')

    // Ordenamiento
    const [ordenCampo, setOrdenCampo] = useState<OrdenCampo>('fecha')
    const [ordenDir, setOrdenDir]     = useState<OrdenDir>('desc')

    const [accionando, setAccionando] = useState<string | null>(null)

    useEffect(() => {
        if (!empresaActiva) return
        cargarTipos()
    }, [empresaActiva])

    useEffect(() => {
        if (empresaActiva) cargar()
    }, [empresaActiva, filtroAño, filtroMes, filtroTipo])

    async function cargarTipos() {
        const { data } = await supabase
            .from('lp_tipos_comprobante')
            .select('id, codigo, nombre, naturaleza, activo')
            .eq('empresa_id', empresaActiva!.id)
            .eq('activo', true)
            .order('nombre')
        setTipos(data ?? [])
    }

    async function cargar() {
        if (!empresaActiva) return
        setLoading(true)

        let q = supabase
            .from('lp_comprobantes')
            .select(`*, tipo_comprobante:lp_tipos_comprobante(id, codigo, nombre, naturaleza, activo)`)
            .eq('empresa_id', empresaActiva.id)

        // Filtro período
        if (filtroAño !== '') {
            if (filtroMes !== '') {
                const mesStr = String(filtroMes).padStart(2, '0')
                const nextMes = filtroMes === 12 ? 1 : filtroMes + 1
                const nextAño = filtroMes === 12 ? filtroAño + 1 : filtroAño
                const nextMesStr = String(nextMes).padStart(2, '0')
                q = q.gte('fecha', `${filtroAño}-${mesStr}-01`)
                     .lt('fecha',  `${nextAño}-${nextMesStr}-01`)
            } else {
                q = q.gte('fecha', `${filtroAño}-01-01`)
                     .lt('fecha',  `${filtroAño + 1}-01-01`)
            }
        }

        // Filtro tipo
        if (filtroTipo !== 'todos') {
            q = q.eq('tipo_comprobante_id', filtroTipo)
        }

        const { data } = await q.order('fecha', { ascending: false }).order('numero', { ascending: false })
        setComprobantes(data ?? [])
        setLoading(false)
    }

    function toggleOrden(campo: OrdenCampo) {
        if (ordenCampo === campo) {
            setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setOrdenCampo(campo)
            setOrdenDir('asc')
        }
    }

    async function confirmar(id: string) {
        setAccionando(id)
        const { error } = await supabase.from('lp_comprobantes')
            .update({ estado: 'confirmado', updated_at: new Date().toISOString() })
            .eq('id', id).eq('estado', 'borrador')
        if (!error) await supabase.rpc('lp_actualizar_saldos', { p_comprobante_id: id, p_operacion: 'sumar' })
        setAccionando(null)
        cargar()
    }

    async function anular(id: string) {
        if (!confirm('¿Anular este comprobante? La acción no se puede deshacer.')) return
        setAccionando(id)
        const comp = comprobantes.find(c => c.id === id)
        const { error } = await supabase.from('lp_comprobantes')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('id', id)
        if (!error && comp?.estado === 'confirmado') {
            await supabase.rpc('lp_actualizar_saldos', { p_comprobante_id: id, p_operacion: 'restar' })
        }
        setAccionando(null)
        cargar()
    }

    // Filtro cliente (estado + búsqueda)
    const filtrados = comprobantes.filter(c => {
        const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado
        const q = busqueda.toLowerCase()
        const matchBusqueda = !busqueda ||
            c.numero.toLowerCase().includes(q) ||
            c.glosa.toLowerCase().includes(q) ||
            (c.tipo_comprobante?.nombre ?? '').toLowerCase().includes(q)
        return matchEstado && matchBusqueda
    })

    // Ordenamiento cliente
    const ordenados = [...filtrados].sort((a, b) => {
        let cmp = 0
        if (ordenCampo === 'tipo') {
            cmp = (a.tipo_comprobante?.nombre ?? '').localeCompare(b.tipo_comprobante?.nombre ?? '')
            if (cmp === 0) cmp = a.fecha.localeCompare(b.fecha)
        } else if (ordenCampo === 'numero') {
            cmp = a.numero.localeCompare(b.numero)
        } else {
            cmp = a.fecha.localeCompare(b.fecha)
            if (cmp === 0) cmp = a.numero.localeCompare(b.numero)
        }
        return ordenDir === 'asc' ? cmp : -cmp
    })

    const sym = empresaActiva?.moneda?.simbolo ?? '$'

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Diarios Contables</h1>
                    <p className="text-slate-500 text-sm mt-0.5">{ordenados.length} de {comprobantes.length} comprobantes</p>
                </div>
                <Link to="/comprobantes/nuevo" className="btn btn-primary gap-2 text-sm">
                    <Plus className="w-4 h-4" /> Nuevo Asiento
                </Link>
            </div>

            {/* Filtros */}
            <div className="card px-4 py-3 space-y-3">
                {/* Fila 1: período + tipo + estado */}
                <div className="flex items-center gap-3 flex-wrap">
                    <Filter className="w-4 h-4 text-slate-400 shrink-0" />

                    {/* Período */}
                    <select
                        value={filtroAño}
                        onChange={e => { setFiltroAño(e.target.value === '' ? '' : Number(e.target.value)); setFiltroMes('') }}
                        className="input py-1.5 text-sm w-28"
                    >
                        <option value="">Todos los años</option>
                        {AÑOS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>

                    <select
                        value={filtroMes}
                        onChange={e => setFiltroMes(e.target.value === '' ? '' : Number(e.target.value))}
                        disabled={filtroAño === ''}
                        className="input py-1.5 text-sm w-36 disabled:opacity-50"
                    >
                        <option value="">Todos los meses</option>
                        {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>

                    <div className="h-5 w-px bg-slate-200" />

                    {/* Tipo comprobante */}
                    <select
                        value={filtroTipo}
                        onChange={e => setFiltroTipo(e.target.value)}
                        className="input py-1.5 text-sm w-44"
                    >
                        <option value="todos">Todos los tipos</option>
                        {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>

                    <div className="h-5 w-px bg-slate-200" />

                    {/* Estado */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {(['todos', 'borrador', 'confirmado', 'anulado'] as const).map(e => (
                            <button
                                key={e}
                                onClick={() => setFiltroEstado(e)}
                                className={cn('text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
                                    filtroEstado === e
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                )}
                            >
                                {e === 'todos' ? 'Todos' : ESTADO_STYLE[e].label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Fila 2: búsqueda */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        className="input pl-9 text-sm"
                        placeholder="Buscar número, glosa o tipo..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                    />
                </div>
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                <SortHeader label="Número" campo="numero" ordenCampo={ordenCampo} ordenDir={ordenDir} onSort={toggleOrden} />
                            </th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                <SortHeader label="Fecha" campo="fecha" ordenCampo={ordenCampo} ordenDir={ordenDir} onSort={toggleOrden} />
                            </th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                <SortHeader label="Tipo" campo="tipo" ordenCampo={ordenCampo} ordenDir={ordenDir} onSort={toggleOrden} />
                            </th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">Glosa</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">Estado</th>
                            <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">Debe</th>
                            <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">Haber</th>
                            <th className="py-3 px-4 w-24" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /></td></tr>
                        ) : ordenados.length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-slate-400">
                                {comprobantes.length === 0 ? 'No hay comprobantes para el período seleccionado.' : 'Sin resultados con los filtros actuales.'}
                            </td></tr>
                        ) : ordenados.map(c => {
                            const est = ESTADO_STYLE[c.estado]
                            return (
                                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="py-3 px-4">
                                        <span className="font-mono text-xs font-semibold text-slate-700">{c.numero}</span>
                                    </td>
                                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatFecha(c.fecha)}</td>
                                    <td className="py-3 px-4">
                                        {c.tipo_comprobante && (
                                            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                                                {c.tipo_comprobante.nombre}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-slate-700 max-w-[220px] truncate">{c.glosa}</td>
                                    <td className="py-3 px-4">
                                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', est.bg, est.text)}>
                                            {est.label}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-700">{formatMoneda(c.total_debe, sym)}</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-700">{formatMoneda(c.total_haber, sym)}</td>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-1 justify-end">
                                            <Link to={`/comprobantes/${c.id}`} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-md" title="Ver">
                                                <Eye className="w-3.5 h-3.5" />
                                            </Link>
                                            {c.estado === 'borrador' && (
                                                <button
                                                    onClick={() => confirmar(c.id)}
                                                    disabled={accionando === c.id}
                                                    className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-md"
                                                    title="Confirmar"
                                                >
                                                    {accionando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                                </button>
                                            )}
                                            {c.estado !== 'anulado' && (
                                                <button
                                                    onClick={() => anular(c.id)}
                                                    disabled={accionando === c.id}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                                                    title="Anular"
                                                >
                                                    <Ban className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}




