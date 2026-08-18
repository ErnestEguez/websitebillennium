import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { repararTextoCP437, estimarReemplazoUnicode } from '../../lib/codificacionCP437'
import { cn } from '../../lib/utils'
import { Languages, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface FilaEscaneada {
    tabla: 'clientes' | 'productos'
    id: string
    campo: string
    valor_actual: string
    referencia: string // código de producto o identificación de cliente, para ubicarlo
}

interface FilaRevision extends FilaEscaneada {
    valor_propuesto: string | null // null = no se pudo determinar automáticamente
    esEstimado: boolean            // true = propuesta de "�" (Ñ/ñ estimada), no una reversión matemática cierta
    incluir: boolean
}

type TablaFiltro = 'ambos' | 'clientes' | 'productos'

export function CorreccionCodificacionPage() {
    const [empresas, setEmpresas] = useState<{ id: string; nombre: string; ruc: string }[]>([])
    const [empresaId, setEmpresaId] = useState('')
    const [tablaFiltro, setTablaFiltro] = useState<TablaFiltro>('ambos')

    const [escaneando, setEscaneando] = useState(false)
    const [aplicando, setAplicando] = useState(false)
    const [filas, setFilas] = useState<FilaRevision[] | null>(null)
    const [error, setError] = useState('')
    const [resultado, setResultado] = useState('')

    // El RPC siempre trae clientes + productos juntos; el filtro es solo de
    // presentación/aplicación en el frontend, así que cambiar la tabla no
    // requiere volver a escanear.
    const filasVisibles = filas === null ? null
        : tablaFiltro === 'ambos' ? filas
        : filas.filter(f => f.tabla === tablaFiltro)

    useEffect(() => {
        supabase.from('empresas').select('id, nombre, ruc').order('nombre')
            .then(({ data }) => setEmpresas(data ?? []))
    }, [])

    async function handleRevisar() {
        if (!empresaId) return
        setEscaneando(true); setError(''); setResultado(''); setFilas(null)
        try {
            const { data, error } = await supabase.rpc('fn_escanear_codificacion', { p_empresa_id: empresaId })
            if (error) throw error

            const revisadas: FilaRevision[] = (data as FilaEscaneada[] ?? []).map(f => {
                const propuestoCierto = repararTextoCP437(f.valor_actual)
                const propuestoEstimado = propuestoCierto === null ? estimarReemplazoUnicode(f.valor_actual) : null
                return {
                    ...f,
                    valor_propuesto: propuestoCierto ?? propuestoEstimado,
                    esEstimado: propuestoCierto === null && propuestoEstimado !== null,
                    // Solo se pre-marca la corrección cuando es una reversión matemática
                    // cierta (CP437). Las estimadas ("�" → Ñ/ñ probable) requieren que el
                    // usuario las revise y las marque a mano antes de aplicar.
                    incluir: propuestoCierto !== null,
                }
            })
            setFilas(revisadas)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setEscaneando(false)
        }
    }

    async function handleAplicar() {
        if (!filasVisibles) return
        const seleccionadas = filasVisibles.filter(f => f.incluir && f.valor_propuesto !== null)
        if (seleccionadas.length === 0) { alert('No hay filas marcadas para corregir.'); return }
        if (!confirm(`¿Aplicar la corrección a ${seleccionadas.length} registro(s)? Esta acción se puede revertir manualmente, pero no de forma automática.`)) return

        setAplicando(true); setError('')
        try {
            const correcciones = seleccionadas.map(f => ({
                tabla: f.tabla, id: f.id, campo: f.campo, valor_nuevo: f.valor_propuesto,
            }))
            const { data, error } = await supabase.rpc('fn_aplicar_correccion_codificacion', {
                p_empresa_id: empresaId,
                p_correcciones: correcciones,
            })
            if (error) throw error
            setResultado(`✅ ${data} registro(s) corregido(s).`)
            setFilas(null)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setAplicando(false)
        }
    }

    function toggleFila(key: string) {
        setFilas(prev => prev?.map(f => (`${f.tabla}-${f.id}-${f.campo}` === key ? { ...f, incluir: !f.incluir } : f)) ?? null)
    }

    // Permite corregir a mano cualquier propuesta (incluida una "estimado"
    // que esté mal, o una fila que empezó en "revisar a mano" sin propuesta).
    function editarValorPropuesto(key: string, nuevoValor: string) {
        setFilas(prev => prev?.map(f => {
            if (`${f.tabla}-${f.id}-${f.campo}` !== key) return f
            const valor = nuevoValor.trim() === '' ? null : nuevoValor
            return { ...f, valor_propuesto: valor, esEstimado: false }
        }) ?? null)
    }

    const empresa = empresas.find(e => e.id === empresaId)

    const totales = filasVisibles ? {
        total: filasVisibles.length,
        ciertas: filasVisibles.filter(f => f.valor_propuesto !== null && !f.esEstimado).length,
        estimadas: filasVisibles.filter(f => f.esEstimado).length,
        sinPropuesta: filasVisibles.filter(f => f.valor_propuesto === null).length,
    } : null

    return (
        <div className="max-w-5xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <Languages className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Corrección de Codificación</h1>
                    <p className="text-sm text-slate-500">
                        Repara nombres/direcciones migrados con codificación incorrecta (ej. "CEDE¥O" → "CEDEÑO") — solo admin_plataforma.
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Empresa</label>
                        <select
                            value={empresaId}
                            onChange={e => { setEmpresaId(e.target.value); setFilas(null); setResultado('') }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            <option value="">— Seleccionar empresa —</option>
                            {empresas.map(e => (
                                <option key={e.id} value={e.id}>{e.nombre} ({e.ruc})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Tabla</label>
                        <select
                            value={tablaFiltro}
                            onChange={e => setTablaFiltro(e.target.value as TablaFiltro)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            <option value="ambos">Clientes y productos</option>
                            <option value="clientes">Solo clientes</option>
                            <option value="productos">Solo productos</option>
                        </select>
                    </div>
                    <button
                        onClick={handleRevisar}
                        disabled={!empresaId || escaneando}
                        className="btn btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {escaneando ? <><Loader2 className="w-4 h-4 animate-spin" /> Revisando...</> : 'Revisar'}
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

            {filasVisibles && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
                        <div className="text-sm text-slate-600">
                            <p className="font-medium text-slate-800">{empresa?.nombre} — {totales?.total} registro(s) con codificación sospechosa</p>
                            {totales && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {totales.ciertas} corrección(es) segura(s) · {totales.estimadas} estimada(s) (revisar) · {totales.sinPropuesta} sin propuesta (revisar a mano)
                                </p>
                            )}
                        </div>
                        <button
                            onClick={handleAplicar}
                            disabled={aplicando || filasVisibles.every(f => !f.incluir)}
                            className="btn btn-primary btn-sm flex items-center gap-2 disabled:opacity-50 shrink-0"
                        >
                            {aplicando ? <><Loader2 className="w-4 h-4 animate-spin" /> Aplicando...</> : 'Aplicar corrección'}
                        </button>
                    </div>

                    {filasVisibles.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No se encontraron registros con codificación sospechosa en esta empresa{tablaFiltro !== 'ambos' ? ` (tabla: ${tablaFiltro})` : ''}.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                                <tr>
                                    <th className="w-8 py-2 px-3" />
                                    <th className="text-left py-2 px-3">Tabla</th>
                                    <th className="text-left py-2 px-3">Código / ID</th>
                                    <th className="text-left py-2 px-3">Campo</th>
                                    <th className="text-left py-2 px-3">Valor actual</th>
                                    <th className="text-left py-2 px-3">Valor propuesto (editable)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filasVisibles.map(f => {
                                    const key = `${f.tabla}-${f.id}-${f.campo}`
                                    return (
                                        <tr key={key} className={f.valor_propuesto === null ? 'bg-amber-50/50' : ''}>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="checkbox"
                                                    checked={f.incluir}
                                                    disabled={f.valor_propuesto === null}
                                                    onChange={() => toggleFila(key)}
                                                />
                                            </td>
                                            <td className="py-2 px-3 capitalize">{f.tabla}</td>
                                            <td className="py-2 px-3 font-mono text-slate-700 select-text">{f.referencia}</td>
                                            <td className="py-2 px-3 text-slate-500">{f.campo}</td>
                                            <td className="py-2 px-3 font-mono text-red-600 select-text">{f.valor_actual}</td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="text"
                                                    value={f.valor_propuesto ?? ''}
                                                    onChange={e => editarValorPropuesto(key, e.target.value)}
                                                    placeholder="revisar a mano — escribe el valor correcto"
                                                    className={cn(
                                                        'w-full px-2 py-1 border rounded font-mono text-sm outline-none focus:ring-2 focus:ring-primary-500',
                                                        f.valor_propuesto === null ? 'border-amber-300 text-amber-600 placeholder:italic placeholder:text-amber-400'
                                                            : f.esEstimado ? 'border-amber-300 text-amber-700 bg-amber-50'
                                                            : 'border-emerald-200 text-emerald-700'
                                                    )}
                                                />
                                                {f.esEstimado && (
                                                    <p className="text-[10px] text-amber-600 mt-0.5">estimado — el dato original se perdió, confírmalo o corrígelo antes de marcar</p>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    )
}
