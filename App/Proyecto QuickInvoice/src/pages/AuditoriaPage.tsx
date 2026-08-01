import { Fragment, useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ShieldCheck, Loader2, Search, Download, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

interface AuditoriaRow {
    id: string
    correlation_id: string
    empresa_id: string
    user_id: string | null
    user_nombre: string | null
    user_rol: string | null
    user_email: string | null
    ip: string | null
    user_agent: string | null
    origen: string
    modulo: string
    accion: string
    entidad: string
    entidad_id: string | null
    tipo_documento: string | null
    numero_documento: string | null
    sucursal_id: string | null
    serie: string | null
    bodega_id: string | null
    resumen: string
    detalle: Record<string, unknown> | null
    cambios: Record<string, unknown> | null
    estado: 'exitoso' | 'fallido' | 'intento'
    error_mensaje: string | null
    nivel: 'operativo' | 'sensible' | 'compliance'
    created_at: string
}

const MODULO_LABEL: Record<string, string> = {
    facturacion: 'Facturación', compras: 'Compras', cierres: 'Cierres', bodegas: 'Bodegas',
    cartera_cxc: 'Cartera CxC', cartera_cxp: 'Cartera CxP', bancos: 'Bancos',
    nomina: 'Nómina', talento_humano: 'Talento Humano', lopdp: 'LOPDP', configuracion: 'Configuración',
}

const ACCION_LABEL: Record<string, string> = {
    crear: 'Crear', actualizar: 'Actualizar', anular: 'Anular', eliminar: 'Eliminar',
    cerrar: 'Cerrar', transferir: 'Transferir', aprobar: 'Aprobar', rechazar: 'Rechazar',
    notificar: 'Notificar', reversar: 'Reversar', liquidar: 'Liquidar',
}

const ESTADO_BADGE: Record<string, string> = {
    exitoso: 'bg-emerald-100 text-emerald-700',
    fallido: 'bg-red-100 text-red-700',
    intento: 'bg-amber-100 text-amber-700',
}

const NIVEL_BADGE: Record<string, string> = {
    operativo: 'bg-slate-100 text-slate-600',
    sensible: 'bg-amber-100 text-amber-700',
    compliance: 'bg-purple-100 text-purple-700',
}

const PAGE_SIZE = 50

function fechaHace(dias: number): string {
    const d = new Date()
    d.setDate(d.getDate() - dias)
    return d.toISOString().split('T')[0]
}

export function AuditoriaPage() {
    const { empresa, profile } = useAuth()
    const esAdminPlataforma = profile?.rol === 'admin_plataforma'

    const [empresas, setEmpresas] = useState<{ id: string; nombre: string; ruc: string }[]>([])
    const [empresaId, setEmpresaId] = useState('')

    const [desde, setDesde] = useState(fechaHace(7))
    const [hasta, setHasta] = useState(fechaHace(0))
    const [modulo, setModulo] = useState('')
    const [accion, setAccion] = useState('')
    const [estado, setEstado] = useState('')
    const [texto, setTexto] = useState('')

    const [rows, setRows] = useState<AuditoriaRow[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [buscado, setBuscado] = useState(false)
    const [exportando, setExportando] = useState(false)
    const [expandido, setExpandido] = useState<string | null>(null)

    useEffect(() => {
        if (esAdminPlataforma) {
            supabase.from('empresas').select('id, nombre, ruc').order('nombre')
                .then(({ data }) => setEmpresas(data ?? []))
        } else if (empresa?.id) {
            setEmpresaId(empresa.id)
        }
    }, [esAdminPlataforma, empresa?.id])

    function construirQuery(base: any) {
        let q: any = base
            .eq('empresa_id', empresaId)
            .gte('created_at', `${desde}T00:00:00`)
            .lte('created_at', `${hasta}T23:59:59`)
        if (modulo) q = q.eq('modulo', modulo)
        if (accion) q = q.eq('accion', accion)
        if (estado) q = q.eq('estado', estado)
        if (texto.trim()) {
            const t = texto.trim()
            q = q.or(`resumen.ilike.%${t}%,numero_documento.ilike.%${t}%,user_nombre.ilike.%${t}%,user_email.ilike.%${t}%`)
        }
        return q
    }

    async function buscar(nuevaPagina = 0) {
        if (!empresaId) return
        setLoading(true); setBuscado(true); setPage(nuevaPagina)
        try {
            const query = construirQuery(
                supabase.from('auditoria_eventos').select('*', { count: 'exact' })
            )
                .order('created_at', { ascending: false })
                .range(nuevaPagina * PAGE_SIZE, nuevaPagina * PAGE_SIZE + PAGE_SIZE - 1)

            const { data, error, count } = await query
            if (error) throw error
            setRows((data ?? []) as AuditoriaRow[])
            setTotal(count ?? 0)
        } catch (e: any) {
            console.error('Error cargando auditoría:', e.message)
            setRows([]); setTotal(0)
        } finally {
            setLoading(false)
        }
    }

    async function exportarExcel() {
        if (!empresaId) return
        setExportando(true)
        try {
            const todas: AuditoriaRow[] = []
            let desde0 = 0
            const CHUNK = 1000
            while (true) {
                const { data, error } = await construirQuery(supabase.from('auditoria_eventos').select('*'))
                    .order('created_at', { ascending: false })
                    .range(desde0, desde0 + CHUNK - 1)
                if (error) throw error
                todas.push(...((data ?? []) as AuditoriaRow[]))
                if (!data || data.length < CHUNK) break
                desde0 += CHUNK
            }

            const empresaNombre = empresas.find(e => e.id === empresaId)?.nombre ?? empresa?.nombre ?? ''
            const filtrosTexto = [
                modulo ? `Módulo: ${MODULO_LABEL[modulo] ?? modulo}` : null,
                accion ? `Acción: ${ACCION_LABEL[accion] ?? accion}` : null,
                estado ? `Estado: ${estado}` : null,
                texto ? `Texto: "${texto}"` : null,
            ].filter(Boolean).join(' | ') || 'Ninguno'

            const filas: (string | number)[][] = [
                ['Empresa:', empresaNombre],
                ['Período:', `${desde} a ${hasta}`],
                ['Filtros:', filtrosTexto],
                ['Generado:', new Date().toLocaleString('es-EC')],
                [],
                ['Fecha', 'Usuario (correo)', 'Nombre', 'Rol', 'Módulo', 'Acción', 'Entidad', 'Documento', 'Resumen', 'Estado', 'Nivel', 'IP'],
                ...todas.map(r => [
                    new Date(r.created_at).toLocaleString('es-EC'),
                    r.user_email ?? r.user_nombre ?? '',
                    r.user_nombre ?? '',
                    r.user_rol ?? '',
                    MODULO_LABEL[r.modulo] ?? r.modulo,
                    ACCION_LABEL[r.accion] ?? r.accion,
                    r.entidad,
                    r.numero_documento ?? '',
                    r.resumen,
                    r.estado,
                    r.nivel,
                    r.ip ?? '',
                ]),
            ]

            const ws = XLSX.utils.aoa_to_sheet(filas)
            ws['!cols'] = [
                { wch: 18 }, { wch: 26 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
                { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 50 }, { wch: 10 }, { wch: 12 }, { wch: 15 },
            ]
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Auditoría')
            XLSX.writeFile(wb, `Auditoria_${empresaNombre.replace(/\s+/g, '_')}_${desde}_${hasta}.xlsx`)
        } catch (e: any) {
            alert('Error al exportar: ' + e.message)
        } finally {
            setExportando(false)
        }
    }

    const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

    const jsonDetalle = useMemo(() => {
        if (!expandido) return null
        const r = rows.find(x => x.id === expandido)
        if (!r) return null
        return { detalle: r.detalle, cambios: r.cambios, ip: r.ip, user_agent: r.user_agent, correlation_id: r.correlation_id }
    }, [expandido, rows])

    return (
        <div className="max-w-7xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Auditoría / Trazabilidad</h1>
                    <p className="text-sm text-slate-500">Quién hizo qué, cuándo y sobre qué documento. Solo lectura.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap items-end gap-4">
                {esAdminPlataforma && (
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Empresa</label>
                        <select
                            value={empresaId}
                            onChange={e => setEmpresaId(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none min-w-[220px]"
                        >
                            <option value="">— Selecciona una empresa —</option>
                            {empresas.map(e => (
                                <option key={e.id} value={e.id}>{e.nombre} ({e.ruc})</option>
                            ))}
                        </select>
                    </div>
                )}
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Desde</label>
                    <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Hasta</label>
                    <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Módulo</label>
                    <select value={modulo} onChange={e => setModulo(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary-500 min-w-[150px]">
                        <option value="">Todos</option>
                        {Object.entries(MODULO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Acción</label>
                    <select value={accion} onChange={e => setAccion(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary-500 min-w-[140px]">
                        <option value="">Todas</option>
                        {Object.entries(ACCION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Estado</label>
                    <select value={estado} onChange={e => setEstado(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary-500 min-w-[130px]">
                        <option value="">Todos</option>
                        <option value="exitoso">Exitoso</option>
                        <option value="fallido">Fallido</option>
                        <option value="intento">Intento</option>
                    </select>
                </div>
                <div className="flex-1 min-w-[220px]">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Buscar</label>
                    <input
                        type="text"
                        placeholder="Resumen, usuario, número de documento..."
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => buscar(0)}
                        disabled={loading || !empresaId}
                        className="flex items-center gap-2 px-5 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-semibold"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Buscar
                    </button>
                    <button
                        onClick={exportarExcel}
                        disabled={exportando || !empresaId || total === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 font-semibold"
                    >
                        {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Excel
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-slate-600 text-left">
                                <th className="px-4 py-2.5 font-semibold">Fecha</th>
                                <th className="px-4 py-2.5 font-semibold">Usuario</th>
                                <th className="px-4 py-2.5 font-semibold">Módulo</th>
                                <th className="px-4 py-2.5 font-semibold">Acción</th>
                                <th className="px-4 py-2.5 font-semibold">Resumen</th>
                                <th className="px-4 py-2.5 font-semibold">Documento</th>
                                <th className="px-4 py-2.5 font-semibold">Estado</th>
                                <th className="px-4 py-2.5 font-semibold w-8"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(r => (
                                <Fragment key={r.id}>
                                    <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandido(expandido === r.id ? null : r.id)}>
                                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                                            {new Date(r.created_at).toLocaleString('es-EC')}
                                        </td>
                                        <td className="px-4 py-2 font-medium text-slate-800 whitespace-nowrap">
                                            {r.user_email || r.user_nombre || '—'}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', NIVEL_BADGE[r.nivel])}>
                                                {MODULO_LABEL[r.modulo] ?? r.modulo}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{ACCION_LABEL[r.accion] ?? r.accion}</td>
                                        <td className="px-4 py-2 text-slate-700 max-w-[380px] truncate">{r.resumen}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{r.numero_documento || '—'}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ESTADO_BADGE[r.estado])}>
                                                {r.estado}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-400">
                                            {expandido === r.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </td>
                                    </tr>
                                    {expandido === r.id && (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-3 bg-slate-50 text-xs">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                                                    <div><span className="text-slate-400">Nombre:</span> {r.user_nombre || '—'}</div>
                                                    <div><span className="text-slate-400">Rol:</span> {r.user_rol || '—'}</div>
                                                    <div><span className="text-slate-400">IP:</span> {r.ip || '—'}</div>
                                                    <div><span className="text-slate-400">Serie:</span> {r.serie || '—'}</div>
                                                    <div><span className="text-slate-400">Nivel:</span> {r.nivel}</div>
                                                </div>
                                                {r.error_mensaje && (
                                                    <div className="mb-2 text-red-600">Error: {r.error_mensaje}</div>
                                                )}
                                                <div className="text-slate-400 mb-1">User Agent: {r.user_agent || '—'}</div>
                                                {jsonDetalle && (jsonDetalle.detalle || jsonDetalle.cambios) && (
                                                    <pre className="bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto text-[11px]">
                                                        {JSON.stringify({ detalle: r.detalle, cambios: r.cambios }, null, 2)}
                                                    </pre>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                {buscado && !loading && rows.length === 0 && (
                    <p className="text-center text-slate-400 py-8 text-sm">Sin resultados para el filtro seleccionado.</p>
                )}
                {!buscado && (
                    <p className="text-center text-slate-400 py-8 text-sm">Selecciona un rango de fechas y presiona Buscar.</p>
                )}
                {total > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
                        <span>{total} registro{total !== 1 ? 's' : ''} — página {page + 1} de {totalPaginas}</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => buscar(page - 1)}
                                disabled={page === 0 || loading}
                                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => buscar(page + 1)}
                                disabled={page + 1 >= totalPaginas || loading}
                                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
