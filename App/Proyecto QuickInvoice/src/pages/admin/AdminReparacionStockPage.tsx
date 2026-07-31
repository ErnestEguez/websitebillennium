import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Wrench, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'

export function AdminReparacionStockPage() {
    const [empresas, setEmpresas] = useState<{ id: string; nombre: string; ruc: string }[]>([])
    const [empresaId, setEmpresaId] = useState('')
    const [running, setRunning] = useState(false)
    const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)

    useEffect(() => {
        supabase.from('empresas').select('id, nombre, ruc').order('nombre')
            .then(({ data }) => setEmpresas(data ?? []))
    }, [])

    const empresa = empresas.find(e => e.id === empresaId)

    async function reparar() {
        if (!empresaId) return
        setRunning(true); setResultado(null)
        try {
            const { error } = await supabase.rpc('fn_recalcular_stock_bodega', { p_empresa_id: empresaId })
            if (error) throw error
            setResultado({ ok: true, mensaje: `Costo de inventario recalculado para ${empresa?.nombre}.` })
        } catch (e: any) {
            setResultado({ ok: false, mensaje: e.message || 'Error desconocido' })
        } finally {
            setRunning(false)
        }
    }

    return (
        <div className="max-w-2xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Wrench className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Reparación de Inventario</h1>
                    <p className="text-sm text-slate-500">
                        Reconstruye cantidad y costo promedio de <code>stock_bodega</code> a partir del Kardex, por empresa.
                    </p>
                </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                Útil cuando el costo del inventario aparece en $0,00 al filtrar "Inventario Valorado" por una bodega
                específica — típicamente por productos migrados masivamente antes de la corrección de este bug.
                Solo afecta a la empresa seleccionada; el resto queda intacto.
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Empresa</label>
                    <select
                        value={empresaId}
                        onChange={e => { setEmpresaId(e.target.value); setResultado(null) }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                    >
                        <option value="">— Seleccionar empresa —</option>
                        {empresas.map(e => (
                            <option key={e.id} value={e.id}>{e.nombre} ({e.ruc})</option>
                        ))}
                    </select>
                </div>

                {empresa && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        Se va a recalcular el inventario de: <strong>{empresa.nombre}</strong> ({empresa.ruc})
                    </div>
                )}

                <button
                    onClick={reparar}
                    disabled={!empresaId || running}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 font-semibold"
                >
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                    {running ? 'Reparando...' : 'Reparar costo de inventario'}
                </button>
            </div>

            {resultado && (
                <div className={
                    resultado.ok
                        ? 'flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm'
                        : 'flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm'
                }>
                    {resultado.ok ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
                    {resultado.mensaje}
                </div>
            )}
        </div>
    )
}
