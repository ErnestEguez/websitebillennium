import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
    Trash2, AlertTriangle, ShieldAlert, CheckCircle,
    Loader2, RefreshCw, ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'

// ─── Definición de grupos ────────────────────────────────────────────────────

const TRANSACCIONES = [
    { key: 'facturas',     label: 'Facturas / Comprobantes',      desc: 'comprobantes, detalles, pagos, cartera relacionada' },
    { key: 'notas_credito', label: 'Notas de Crédito',            desc: 'notas_credito, detalles' },
    { key: 'proformas',    label: 'Proformas',                     desc: 'proformas, proforma_detalles' },
    { key: 'compras',      label: 'Compras / Ingresos Inventario', desc: 'ingresos_stock, retenciones, cuentas_por_pagar' },
    { key: 'kardex',       label: 'Kardex de Inventario',          desc: 'movimientos de entrada/salida' },
    { key: 'caja',         label: 'Cierres de Caja',               desc: 'caja_sesiones, caja_general_cierres, movimientos, depósitos' },
    { key: 'cartera',      label: 'Cartera CxC y Cobros',          desc: 'cartera_cxc, pagos, gestiones, acuerdos' },
    { key: 'pagos_prov',   label: 'Pagos a Proveedores / Egresos', desc: 'comprobantes_egreso, pagos_proveedores, anticipos' },
    { key: 'mov_bancarios', label: 'Movimientos Bancarios',        desc: 'movimientos_bancarios, cheques, conciliaciones' },
    { key: 'nominas',      label: 'Nóminas / Roles de Pago',       desc: 'periodos, rol_cabecera, rol_lineas' },
]

const MAESTROS = [
    { key: 'productos',   label: 'Artículos / Productos',  desc: 'productos, stock_bodega, kardex' },
    { key: 'clientes',    label: 'Clientes',                desc: 'clientes (excepto Consumidor Final)' },
    { key: 'proveedores', label: 'Proveedores',             desc: 'proveedores' },
    { key: 'empleados',   label: 'Empleados',               desc: 'empleados, nóminas relacionadas' },
    { key: 'vendedores',  label: 'Vendedores',              desc: 'vendedores' },
    { key: 'categorias',  label: 'Categorías',              desc: 'categorías de productos' },
]

type Counts = Record<string, number | null>   // null = no consultado
type Selected = Record<string, boolean>

// ─── Componente ──────────────────────────────────────────────────────────────

export function AdminDepuracionPage() {
    // Empresas
    const [empresas, setEmpresas]       = useState<{ id: string; nombre: string; ruc: string }[]>([])
    const [empresaId, setEmpresaId]     = useState('')
    const [empresa, setEmpresa]         = useState<{ id: string; nombre: string; ruc: string } | null>(null)

    // Período
    const [desde, setDesde]   = useState('')
    const [hasta, setHasta]   = useState('')
    const [sinFiltro, setSinFiltro] = useState(false)

    // Selección
    const [selected, setSelected] = useState<Selected>({})
    const [counts, setCounts]     = useState<Counts>({})
    const [loadingCounts, setLoadingCounts] = useState(false)

    // Confirmación
    const [confirmText, setConfirmText] = useState('')
    const [paso, setPaso]               = useState<'config' | 'confirm' | 'done'>('config')

    // Ejecución
    const [running, setRunning]         = useState(false)
    const [log, setLog]                 = useState<{ key: string; label: string; deleted: number; error?: string }[]>([])

    // Secciones expandidas
    const [openT, setOpenT] = useState(true)
    const [openM, setOpenM] = useState(true)

    useEffect(() => {
        supabase.from('empresas').select('id, nombre, ruc').order('nombre')
            .then(({ data }) => setEmpresas(data ?? []))
    }, [])

    function onEmpresaChange(id: string) {
        setEmpresaId(id)
        setEmpresa(empresas.find(e => e.id === id) ?? null)
        setCounts({}); setSelected({}); setPaso('config'); setLog([])
    }

    function toggleGroup(key: string) {
        setSelected(prev => ({ ...prev, [key]: !prev[key] }))
    }

    async function cargarConteos() {
        if (!empresaId) return
        setLoadingCounts(true)
        const todos = [...TRANSACCIONES, ...MAESTROS]
        const result: Counts = {}
        await Promise.all(todos.map(async g => {
            try {
                const isMaestro = MAESTROS.some(m => m.key === g.key)
                const { data } = await supabase.rpc('admin_contar_grupo', {
                    p_empresa_id: empresaId,
                    p_grupo: g.key,
                    p_desde: (!isMaestro && !sinFiltro && desde) ? desde : null,
                    p_hasta: (!isMaestro && !sinFiltro && hasta) ? hasta : null,
                })
                result[g.key] = data as number
            } catch { result[g.key] = -1 }
        }))
        setCounts(result)
        setLoadingCounts(false)
    }

    const selectedList = [...TRANSACCIONES, ...MAESTROS].filter(g => selected[g.key])

    async function ejecutar() {
        if (!empresaId || selectedList.length === 0) return
        setRunning(true); setLog([])
        for (const g of selectedList) {
            const isMaestro = MAESTROS.some(m => m.key === g.key)
            try {
                const { data, error } = await supabase.rpc('admin_depurar_grupo', {
                    p_empresa_id: empresaId,
                    p_grupo: g.key,
                    p_desde: (!isMaestro && !sinFiltro && desde) ? desde : null,
                    p_hasta: (!isMaestro && !sinFiltro && hasta) ? hasta : null,
                })
                if (error) throw error
                setLog(prev => [...prev, { key: g.key, label: g.label, deleted: data as number }])
            } catch (e: any) {
                setLog(prev => [...prev, { key: g.key, label: g.label, deleted: 0, error: e.message }])
            }
        }
        setRunning(false); setPaso('done')
    }

    const confirmacionEsperada = empresa ? `ELIMINAR ${empresa.nombre.toUpperCase()}` : ''
    const confirmacionOk = confirmText.trim().toUpperCase() === confirmacionEsperada

    return (
        <div className="max-w-3xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6 text-red-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Depuración de Datos</h1>
                    <p className="text-sm text-slate-500">Elimina transacciones y/o maestros de una empresa. Acción irreversible.</p>
                </div>
            </div>

            {paso === 'done' ? (
                /* ── Resultado final ─────────────────────────────────────── */
                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600" /> Depuración completada
                    </h2>
                    <div className="space-y-2">
                        {log.map(l => (
                            <div key={l.key} className={cn(
                                'flex items-center justify-between px-4 py-2.5 rounded-lg text-sm',
                                l.error ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-200'
                            )}>
                                <span className="font-medium">{l.label}</span>
                                {l.error
                                    ? <span className="text-red-600 text-xs">{l.error}</span>
                                    : <span className="font-mono text-slate-600">{l.deleted.toLocaleString()} eliminados</span>
                                }
                            </div>
                        ))}
                    </div>
                    <button onClick={() => { setPaso('config'); setSelected({}); setCounts({}); setConfirmText(''); setLog([]) }}
                        className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
                        Nueva depuración
                    </button>
                </div>
            ) : paso === 'confirm' ? (
                /* ── Confirmación ────────────────────────────────────────── */
                <div className="space-y-4">
                    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold text-red-800 text-lg">⚠️ ACCIÓN IRREVERSIBLE</p>
                                <p className="text-red-700 text-sm mt-1">
                                    Estás a punto de eliminar datos de <strong>{empresa?.nombre}</strong> ({empresa?.ruc}).
                                </p>
                                <div className="mt-3 space-y-1">
                                    {selectedList.map(g => (
                                        <div key={g.key} className="flex items-center gap-2 text-sm text-red-700">
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>{g.label}</span>
                                            {counts[g.key] !== undefined && counts[g.key]! >= 0 && (
                                                <span className="font-mono text-xs bg-red-100 px-1.5 rounded">
                                                    {counts[g.key]?.toLocaleString()} registros
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Para confirmar, escribe exactamente:
                            <span className="font-mono text-red-600 ml-2">{confirmacionEsperada}</span>
                        </label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none font-mono"
                            placeholder={confirmacionEsperada}
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => setPaso('config')}
                            className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
                            Cancelar
                        </button>
                        <button
                            onClick={ejecutar}
                            disabled={!confirmacionOk || running}
                            className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-semibold"
                        >
                            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            {running ? 'Eliminando...' : 'Ejecutar eliminación'}
                        </button>
                    </div>
                </div>
            ) : (
                /* ── Configuración ───────────────────────────────────────── */
                <>
                    {/* Empresa */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                        <h2 className="font-semibold text-slate-700">1. Seleccionar empresa</h2>
                        <select
                            value={empresaId}
                            onChange={e => onEmpresaChange(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            <option value="">— Seleccionar empresa —</option>
                            {empresas.map(e => (
                                <option key={e.id} value={e.id}>{e.nombre} ({e.ruc})</option>
                            ))}
                        </select>
                        {empresa && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                Empresa seleccionada: <strong>{empresa.nombre}</strong> — RUC: {empresa.ruc}
                            </div>
                        )}
                    </div>

                    {/* Período */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                        <h2 className="font-semibold text-slate-700">2. Período (solo para Transacciones)</h2>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={sinFiltro} onChange={e => setSinFiltro(e.target.checked)} />
                            <span className="font-medium text-red-600">Sin filtro de fecha (eliminar TODO el historial)</span>
                        </label>
                        {!sinFiltro && (
                            <div className="flex items-center gap-3">
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
                            </div>
                        )}
                    </div>

                    {/* Selección de grupos */}
                    {empresaId && (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-3 border-b flex items-center justify-between">
                                <h2 className="font-semibold text-slate-700">3. Seleccionar qué eliminar</h2>
                                <button
                                    onClick={cargarConteos}
                                    disabled={loadingCounts}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                                >
                                    {loadingCounts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                    Ver conteos
                                </button>
                            </div>

                            {/* Transacciones */}
                            <div className="border-b">
                                <button onClick={() => setOpenT(o => !o)}
                                    className="w-full flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                    {openT ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    TRANSACCIONES
                                </button>
                                {openT && (
                                    <div className="px-5 pb-3 space-y-2">
                                        {TRANSACCIONES.map(g => (
                                            <label key={g.key} className={cn(
                                                'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                                                selected[g.key]
                                                    ? 'bg-red-50 border-red-300'
                                                    : 'border-slate-100 hover:bg-slate-50'
                                            )}>
                                                <input type="checkbox"
                                                    checked={!!selected[g.key]}
                                                    onChange={() => toggleGroup(g.key)}
                                                    className="accent-red-600 w-4 h-4"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-800">{g.label}</p>
                                                    <p className="text-xs text-slate-400 truncate">{g.desc}</p>
                                                </div>
                                                {counts[g.key] !== undefined && (
                                                    <span className={cn('text-xs font-mono px-2 py-0.5 rounded-full',
                                                        counts[g.key]! > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                                                    )}>
                                                        {counts[g.key]! >= 0 ? counts[g.key]!.toLocaleString() : '—'}
                                                    </span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Maestros */}
                            <div>
                                <button onClick={() => setOpenM(o => !o)}
                                    className="w-full flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                    {openM ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    MAESTROS <span className="text-xs font-normal text-slate-400">(sin filtro de fecha)</span>
                                </button>
                                {openM && (
                                    <div className="px-5 pb-3 space-y-2">
                                        {MAESTROS.map(g => (
                                            <label key={g.key} className={cn(
                                                'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                                                selected[g.key]
                                                    ? 'bg-red-50 border-red-300'
                                                    : 'border-slate-100 hover:bg-slate-50'
                                            )}>
                                                <input type="checkbox"
                                                    checked={!!selected[g.key]}
                                                    onChange={() => toggleGroup(g.key)}
                                                    className="accent-red-600 w-4 h-4"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-800">{g.label}</p>
                                                    <p className="text-xs text-slate-400 truncate">{g.desc}</p>
                                                </div>
                                                {counts[g.key] !== undefined && (
                                                    <span className={cn('text-xs font-mono px-2 py-0.5 rounded-full',
                                                        counts[g.key]! > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                                                    )}>
                                                        {counts[g.key]! >= 0 ? counts[g.key]!.toLocaleString() : '—'}
                                                    </span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Botón continuar */}
                    {selectedList.length > 0 && (
                        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-5 py-3">
                            <p className="text-sm text-red-700">
                                <strong>{selectedList.length}</strong> grupo(s) seleccionado(s) para eliminar de <strong>{empresa?.nombre}</strong>
                            </p>
                            <button
                                onClick={() => setPaso('confirm')}
                                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
                            >
                                Continuar →
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
