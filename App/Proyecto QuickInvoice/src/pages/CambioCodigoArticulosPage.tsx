import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { HelpButton } from '../components/help/HelpButton'
import { Barcode, Search, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react'

interface ProductoFila {
    id: string
    codigo: string | null
    nombre: string
    nuevoCodigo: string
}

export function CambioCodigoArticulosPage() {
    const { empresa } = useAuth()

    const [busqueda, setBusqueda] = useState('')
    const [buscando, setBuscando] = useState(false)
    const [filas, setFilas] = useState<ProductoFila[] | null>(null)
    const [error, setError] = useState('')
    const [resultado, setResultado] = useState('')
    const [aplicando, setAplicando] = useState(false)

    async function handleBuscar() {
        if (!empresa?.id || busqueda.trim().length < 2) return
        setBuscando(true); setError(''); setResultado(''); setFilas(null)
        try {
            const pattern = '%' + busqueda.trim().replace(/\*/g, '%') + '%'
            const { data, error } = await supabase
                .from('productos')
                .select('id, codigo, nombre')
                .eq('empresa_id', empresa.id)
                .or(`nombre.ilike.${pattern},codigo.ilike.${pattern}`)
                .order('nombre')
                .limit(200)
            if (error) throw error
            setFilas((data ?? []).map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, nuevoCodigo: '' })))
        } catch (e: any) {
            setError(e.message)
        } finally {
            setBuscando(false)
        }
    }

    function editarNuevoCodigo(id: string, valor: string) {
        setFilas(prev => prev?.map(f => f.id === id ? { ...f, nuevoCodigo: valor } : f) ?? null)
    }

    async function handleAplicar() {
        if (!filas || !empresa?.id) return
        const cambios = filas
            .map(f => ({ ...f, nuevoCodigo: f.nuevoCodigo.trim() }))
            .filter(f => f.nuevoCodigo !== '' && f.nuevoCodigo !== (f.codigo ?? ''))

        if (cambios.length === 0) { alert('No hay ningún código nuevo para aplicar.'); return }

        // Duplicados entre las propias filas que se van a cambiar
        const vistos = new Map<string, string>()
        const conflictosInternos: string[] = []
        for (const c of cambios) {
            const key = c.nuevoCodigo.toUpperCase()
            if (vistos.has(key) && vistos.get(key) !== c.id) conflictosInternos.push(c.nuevoCodigo)
            vistos.set(key, c.id)
        }
        if (conflictosInternos.length > 0) {
            setError(`No se puede aplicar: dos o más artículos de esta lista quedarían con el mismo código nuevo (${[...new Set(conflictosInternos)].join(', ')}).`)
            return
        }

        setAplicando(true); setError('')
        try {
            // Duplicados contra el resto del catálogo de la empresa (excluyendo los propios artículos que se están renombrando)
            const nuevosCodigos = cambios.map(c => c.nuevoCodigo)
            const idsEnCambio = cambios.map(c => c.id)
            const { data: existentes, error: existErr } = await supabase
                .from('productos')
                .select('id, codigo')
                .eq('empresa_id', empresa.id)
                .in('codigo', nuevosCodigos)
            if (existErr) throw existErr

            const conflictosExternos = (existentes ?? []).filter(p => !idsEnCambio.includes(p.id))
            if (conflictosExternos.length > 0) {
                const codigosConflicto = [...new Set(conflictosExternos.map(p => p.codigo))]
                setError(`No se puede aplicar: el código ya lo tiene otro artículo de esta empresa (${codigosConflicto.join(', ')}). Cambia ese artículo primero o usa otro código.`)
                return
            }

            if (!confirm(`¿Aplicar el cambio de código a ${cambios.length} artículo(s)? Esta acción actualiza el maestro de artículos de inmediato.`)) return

            let corregidos = 0
            const errores: string[] = []
            for (const c of cambios) {
                const { error: updErr } = await supabase
                    .from('productos')
                    .update({ codigo: c.nuevoCodigo })
                    .eq('id', c.id)
                    .eq('empresa_id', empresa.id)
                if (updErr) errores.push(`${c.nombre}: ${updErr.message}`)
                else corregidos++
            }

            if (errores.length > 0) {
                setError(`${corregidos} corregido(s). Fallaron ${errores.length}: ${errores.join(' · ')}`)
            } else {
                setResultado(`✅ ${corregidos} artículo(s) actualizado(s) con su nuevo código.`)
            }
            setFilas(null)
            setBusqueda('')
        } catch (e: any) {
            setError(e.message)
        } finally {
            setAplicando(false)
        }
    }

    const totalCambios = filas?.filter(f => f.nuevoCodigo.trim() !== '' && f.nuevoCodigo.trim() !== (f.codigo ?? '')).length ?? 0

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
                    <Barcode className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Cambio de Código de Artículos</h1>
                    <p className="text-sm text-slate-500">
                        Busca artículos por código o descripción y asigna el código nuevo. Se valida que no quede repetido antes de grabar.
                    </p>
                </div>
                <HelpButton pageKey="cambio-codigo-articulos" />
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                    Esto cambia el código en el maestro de artículos de forma inmediata. Kardex, Compras, Ventas, Ajustes y Transferencias — pasados y futuros —
                    reflejan el cambio automáticamente porque referencian al artículo por su ID, no guardan el código por separado. Las guías de remisión
                    ya emitidas son la única excepción: conservan el código con el que se generaron y no se alteran.
                </span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Buscar por código o descripción</label>
                        <input
                            type="text"
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleBuscar() }}
                            placeholder="Ej: TORNILLO o COD-0012"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={handleBuscar}
                        disabled={busqueda.trim().length < 2 || buscando}
                        className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
                    >
                        {buscando ? <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</> : <><Search className="w-4 h-4" /> Buscar</>}
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}

            {resultado && (
                <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {resultado}
                </div>
            )}

            {filas && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <p className="text-sm text-slate-600">
                            {filas.length} artículo(s) encontrado(s) — {totalCambios} con código nuevo para aplicar
                        </p>
                        <button
                            onClick={handleAplicar}
                            disabled={aplicando || totalCambios === 0}
                            className="btn btn-primary btn-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            {aplicando ? <><Loader2 className="w-4 h-4 animate-spin" /> Aplicando...</> : 'Aplicar cambios'}
                        </button>
                    </div>

                    {filas.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No se encontraron artículos con ese criterio.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                                <tr>
                                    <th className="text-left py-2 px-3">Código actual</th>
                                    <th className="text-left py-2 px-3">Descripción</th>
                                    <th className="text-left py-2 px-3">Nuevo código</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filas.map(f => (
                                    <tr key={f.id}>
                                        <td className="py-2 px-3 font-mono text-slate-500">{f.codigo || '—'}</td>
                                        <td className="py-2 px-3">{f.nombre}</td>
                                        <td className="py-2 px-3">
                                            <input
                                                type="text"
                                                value={f.nuevoCodigo}
                                                onChange={e => editarNuevoCodigo(f.id, e.target.value)}
                                                placeholder={f.codigo || 'Nuevo código'}
                                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-primary-500"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    )
}
