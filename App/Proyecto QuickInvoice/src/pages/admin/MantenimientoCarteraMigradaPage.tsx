import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
    Trash2, AlertTriangle, CheckCircle,
    Loader2, RefreshCw, Search, Lock, Wallet,
} from 'lucide-react'
import { cn, formatCurrency } from '../../lib/utils'

// ============================================================
// Mantenimiento de Cartera Migrada — herramienta interna, temporal.
// Corrige errores de digitación en cartera_cxc importada por
// MigrarCarteraPage.tsx (origen='MIGRACION') SIN abrir un botón de
// eliminar en el módulo normal de Cartera CxC, que nunca debe permitir
// borrar deudas a los usuarios de la empresa.
//
// Apaga esta herramienta (sin quitarla del código, para poder
// reactivarla si hace falta otra corrección) cambiando HABILITADO a
// false y haciendo deploy — pídeselo a Claude cuando ya terminaron la
// limpieza de la empresa que la necesitaba.
// ============================================================
const HABILITADO = true

interface Empresa { id: string; nombre: string; ruc: string }

interface FilaCartera {
    id: string
    cliente_nombre: string
    cliente_identificacion: string
    numero_documento_externo: string | null
    fecha_emision: string
    valor_original: number
    saldo: number
    estado: string
    tienePagos: boolean
    tieneAplicacionesNc: boolean
}

export function MantenimientoCarteraMigradaPage() {
    const [empresas, setEmpresas] = useState<Empresa[]>([])
    const [empresaId, setEmpresaId] = useState('')
    const [empresa, setEmpresa] = useState<Empresa | null>(null)

    const [filas, setFilas] = useState<FilaCartera[]>([])
    const [cargando, setCargando] = useState(false)
    const [busqueda, setBusqueda] = useState('')
    const [seleccion, setSeleccion] = useState<Record<string, boolean>>({})

    const [paso, setPaso] = useState<'lista' | 'confirmar' | 'listo'>('lista')
    const [confirmText, setConfirmText] = useState('')
    const [ejecutando, setEjecutando] = useState(false)
    const [log, setLog] = useState<{ id: string; label: string; ok: boolean; msg: string }[]>([])
    const [error, setError] = useState('')

    useEffect(() => {
        if (!HABILITADO) return
        supabase.from('empresas').select('id, nombre, ruc').order('nombre')
            .then(({ data }) => setEmpresas(data ?? []))
    }, [])

    function onEmpresaChange(id: string) {
        setEmpresaId(id)
        setEmpresa(empresas.find(e => e.id === id) ?? null)
        setFilas([]); setSeleccion({}); setPaso('lista'); setLog([]); setError('')
        if (id) cargarFilas(id)
    }

    async function cargarFilas(id: string) {
        setCargando(true); setError('')
        try {
            // SOLO cartera migrada — jamás cartera generada por facturas reales
            // del sistema (origen='SISTEMA'). Este filtro es el que evita que
            // esta herramienta pueda tocar una deuda real de cualquier cliente.
            const { data, error: err } = await supabase
                .from('cartera_cxc')
                .select('id, numero_documento_externo, fecha_emision, valor_original, saldo, estado, clientes(nombre, identificacion)')
                .eq('empresa_id', id)
                .eq('origen', 'MIGRACION')
                .order('fecha_emision', { ascending: false })
            if (err) throw err

            const ids = (data ?? []).map((r: any) => r.id)
            const [{ data: pagos }, { data: aplic }] = await Promise.all([
                ids.length ? supabase.from('cartera_cxc_pagos').select('cartera_id').in('cartera_id', ids) : Promise.resolve({ data: [] as any[] }),
                ids.length ? supabase.from('aplicaciones_nc_cxc').select('cartera_cxc_id').in('cartera_cxc_id', ids) : Promise.resolve({ data: [] as any[] }),
            ])
            const conPagos = new Set((pagos ?? []).map((p: any) => p.cartera_id))
            const conAplic = new Set((aplic ?? []).map((a: any) => a.cartera_cxc_id))

            setFilas((data ?? []).map((r: any) => ({
                id: r.id,
                cliente_nombre: r.clientes?.nombre ?? '(cliente eliminado)',
                cliente_identificacion: r.clientes?.identificacion ?? '',
                numero_documento_externo: r.numero_documento_externo,
                fecha_emision: r.fecha_emision,
                valor_original: Number(r.valor_original) || 0,
                saldo: Number(r.saldo) || 0,
                estado: r.estado,
                tienePagos: conPagos.has(r.id),
                tieneAplicacionesNc: conAplic.has(r.id),
            })))
        } catch (e: any) {
            setError(e.message)
        } finally {
            setCargando(false)
        }
    }

    const filtradas = filas.filter(f => {
        if (!busqueda.trim()) return true
        const b = busqueda.toLowerCase()
        return f.cliente_nombre.toLowerCase().includes(b) ||
            f.cliente_identificacion.includes(b) ||
            (f.numero_documento_externo ?? '').toLowerCase().includes(b)
    })

    function toggle(id: string, bloqueado: boolean) {
        if (bloqueado) return
        setSeleccion(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const seleccionados = filas.filter(f => seleccion[f.id] && !f.tienePagos && !f.tieneAplicacionesNc)

    async function ejecutar() {
        if (!empresaId || seleccionados.length === 0) return
        setEjecutando(true); setLog([])
        for (const f of seleccionados) {
            const label = `${f.cliente_nombre} — ${f.numero_documento_externo ?? f.id} — ${formatCurrency(f.saldo)}`
            try {
                // Filtro de seguridad repetido en el propio DELETE (no solo en la
                // carga de la lista): aunque algo manipulara el estado del
                // navegador, esta consulta solo puede borrar filas de ESTA
                // empresa y con origen='MIGRACION'.
                const { error: e1 } = await supabase.from('cartera_cxc_pagos').delete().eq('cartera_id', f.id)
                if (e1) throw e1
                const { error: e2 } = await supabase.from('aplicaciones_nc_cxc').delete().eq('cartera_cxc_id', f.id)
                if (e2) throw e2
                const { error: e3 } = await supabase.from('cartera_cxc').delete()
                    .eq('id', f.id).eq('empresa_id', empresaId).eq('origen', 'MIGRACION')
                if (e3) throw e3
                setLog(prev => [...prev, { id: f.id, label, ok: true, msg: 'Eliminado' }])
            } catch (e: any) {
                setLog(prev => [...prev, { id: f.id, label, ok: false, msg: e.message }])
            }
        }
        setEjecutando(false); setPaso('listo')
    }

    const confirmacionEsperada = empresa ? `ELIMINAR ${empresa.nombre.toUpperCase()}` : ''
    const confirmacionOk = confirmText.trim().toUpperCase() === confirmacionEsperada

    if (!HABILITADO) {
        return (
            <div className="max-w-lg mx-auto mt-16 text-center space-y-3">
                <Lock className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-slate-500 text-sm">Esta herramienta está deshabilitada por ahora.</p>
            </div>
        )
    }

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Mantenimiento de Cartera Migrada</h1>
                    <p className="text-sm text-slate-500">
                        Corrige errores de una migración de cartera (CSV/Excel) — solo registros con origen "Migración", nunca facturas reales.
                    </p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
            )}

            {paso === 'listo' ? (
                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600" /> Limpieza completada
                    </h2>
                    <div className="space-y-2">
                        {log.map(l => (
                            <div key={l.id} className={cn('flex items-center justify-between px-4 py-2.5 rounded-lg text-sm',
                                l.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200')}>
                                <span className="font-medium">{l.label}</span>
                                <span className={l.ok ? 'text-emerald-700 text-xs' : 'text-red-600 text-xs'}>{l.msg}</span>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => { setPaso('lista'); setSeleccion({}); setConfirmText(''); setLog([]); if (empresaId) cargarFilas(empresaId) }}
                        className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
                        Volver a la lista
                    </button>
                </div>
            ) : paso === 'confirmar' ? (
                <div className="space-y-4">
                    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold text-red-800 text-lg">⚠️ ACCIÓN IRREVERSIBLE</p>
                                <p className="text-red-700 text-sm mt-1">
                                    Vas a eliminar <strong>{seleccionados.length}</strong> registro(s) de cartera migrada de <strong>{empresa?.nombre}</strong>.
                                </p>
                                <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                                    {seleccionados.map(f => (
                                        <div key={f.id} className="flex items-center gap-2 text-sm text-red-700">
                                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                            <span>{f.cliente_nombre} — {f.numero_documento_externo ?? '—'} — {formatCurrency(f.saldo)}</span>
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
                        <input type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none font-mono"
                            placeholder={confirmacionEsperada} value={confirmText} onChange={e => setConfirmText(e.target.value)} />
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setPaso('lista')} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
                        <button onClick={ejecutar} disabled={!confirmacionOk || ejecutando}
                            className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-semibold">
                            {ejecutando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            {ejecutando ? 'Eliminando...' : 'Ejecutar eliminación'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                        <h2 className="font-semibold text-slate-700">1. Seleccionar empresa</h2>
                        <select value={empresaId} onChange={e => onEmpresaChange(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none">
                            <option value="">— Seleccionar empresa —</option>
                            {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre} ({e.ruc})</option>)}
                        </select>
                        {empresa && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                Empresa seleccionada: <strong>{empresa.nombre}</strong> — RUC: {empresa.ruc}
                            </div>
                        )}
                    </div>

                    {empresaId && (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
                                <h2 className="font-semibold text-slate-700">2. Registros migrados ({filtradas.length})</h2>
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs w-48 outline-none focus:ring-2 focus:ring-primary-500"
                                            placeholder="Cliente, RUC/CI o número..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                                    </div>
                                    <button onClick={() => cargarFilas(empresaId)} disabled={cargando}
                                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                                        {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                        Recargar
                                    </button>
                                </div>
                            </div>

                            {cargando ? (
                                <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
                            ) : filtradas.length === 0 ? (
                                <div className="py-10 text-center text-slate-400 text-sm">
                                    Sin registros de cartera migrada (origen "Migración") para esta empresa.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 text-slate-500 uppercase">
                                            <tr>
                                                <th className="px-3 py-2 w-8"></th>
                                                <th className="px-3 py-2 text-left">Cliente</th>
                                                <th className="px-3 py-2 text-left">N° Documento</th>
                                                <th className="px-3 py-2 text-left">Fecha</th>
                                                <th className="px-3 py-2 text-right">V. Original</th>
                                                <th className="px-3 py-2 text-right">Saldo</th>
                                                <th className="px-3 py-2 text-center">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtradas.map(f => {
                                                const bloqueado = f.tienePagos || f.tieneAplicacionesNc
                                                return (
                                                    <tr key={f.id} className={cn('border-t border-slate-100', bloqueado ? 'bg-slate-50 opacity-60' : seleccion[f.id] && 'bg-red-50')}>
                                                        <td className="px-3 py-2 text-center">
                                                            {bloqueado ? (
                                                                <span title="Tiene pagos o notas de crédito aplicadas — no se puede eliminar desde aquí">
                                                                    <Lock className="w-3.5 h-3.5 text-slate-300 inline" />
                                                                </span>
                                                            ) : (
                                                                <input type="checkbox" checked={!!seleccion[f.id]} onChange={() => toggle(f.id, bloqueado)}
                                                                    className="accent-red-600 w-3.5 h-3.5" />
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium text-slate-700">{f.cliente_nombre}</div>
                                                            <div className="text-slate-400 font-mono">{f.cliente_identificacion}</div>
                                                        </td>
                                                        <td className="px-3 py-2 font-mono">{f.numero_documento_externo ?? '—'}</td>
                                                        <td className="px-3 py-2">{f.fecha_emision}</td>
                                                        <td className="px-3 py-2 text-right">{formatCurrency(f.valor_original)}</td>
                                                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(f.saldo)}</td>
                                                        <td className="px-3 py-2 text-center text-slate-500">{f.estado}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {seleccionados.length > 0 && (
                        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-5 py-3">
                            <p className="text-sm text-red-700">
                                <strong>{seleccionados.length}</strong> registro(s) seleccionado(s) de <strong>{empresa?.nombre}</strong>
                            </p>
                            <button onClick={() => setPaso('confirmar')}
                                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold">
                                Continuar →
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
