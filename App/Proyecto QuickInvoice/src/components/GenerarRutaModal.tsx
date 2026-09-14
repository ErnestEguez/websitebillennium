import { useState, useEffect } from 'react'
import { X, Loader2, MapPin, Route, CheckCircle2, ExternalLink } from 'lucide-react'
import { HelpButton } from './help/HelpButton'
import { cobradorService, type Cobrador } from '../services/cobradorService'
import { rutaCobroService, type CandidatoRuta, type RutaCobro } from '../services/rutaCobroService'
import { formatCurrency } from '../lib/utils'

interface GenerarRutaModalProps {
    empresaId: string
    onClose: () => void
}

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })

export function GenerarRutaModal({ empresaId, onClose }: GenerarRutaModalProps) {
    const [cobradores, setCobradores] = useState<Cobrador[]>([])
    const [cobradorId, setCobradorId] = useState('')
    const [fecha] = useState(HOY)
    const [candidatos, setCandidatos] = useState<CandidatoRuta[]>([])
    const [seleccion, setSeleccion] = useState<Record<string, boolean>>({})
    const [loading, setLoading] = useState(false)
    const [generando, setGenerando] = useState(false)
    const [rutaGenerada, setRutaGenerada] = useState<RutaCobro | null>(null)
    const [origenEmpresa, setOrigenEmpresa] = useState<{ lat: number; lng: number } | null>(null)
    const [capturandoOrigen, setCapturandoOrigen] = useState(false)

    useEffect(() => {
        cobradorService.getCobradoresActivos(empresaId).then(setCobradores)
        rutaCobroService.getOrigenEmpresa(empresaId).then(setOrigenEmpresa)
    }, [empresaId])

    async function buscarCandidatos(id: string) {
        setCobradorId(id)
        setRutaGenerada(null)
        setCandidatos([])
        setSeleccion({})
        if (!id) return
        setLoading(true)
        try {
            const r = await rutaCobroService.obtenerCandidatos(empresaId, id, fecha)
            setCandidatos(r)
            setSeleccion(Object.fromEntries(r.map(c => [c.cliente_id, true])))
        } catch (e: any) {
            alert('Error al buscar clientes con cuotas vencidas o que vencen hoy: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleCapturarOrigen() {
        if (!navigator.geolocation) { alert('Este dispositivo/navegador no soporta geolocalización.'); return }
        setCapturandoOrigen(true)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const lat = pos.coords.latitude
                    const lng = pos.coords.longitude
                    await rutaCobroService.capturarOrigenEmpresa(empresaId, lat, lng)
                    setOrigenEmpresa({ lat, lng })
                } catch (e: any) {
                    alert('Error al guardar la ubicación del local: ' + e.message)
                } finally {
                    setCapturandoOrigen(false)
                }
            },
            (err) => { alert('No se pudo obtener la ubicación: ' + err.message); setCapturandoOrigen(false) },
            { enableHighAccuracy: true, timeout: 15000 }
        )
    }

    const seleccionados = candidatos.filter(c => seleccion[c.cliente_id])
    const totalSeleccionado = seleccionados.reduce((s, c) => s + c.monto_pendiente, 0)

    async function handleGenerar() {
        if (seleccionados.length === 0) return alert('Marca al menos un cliente para armar la ruta.')
        setGenerando(true)
        try {
            const ruta = await rutaCobroService.generarRuta(empresaId, cobradorId, fecha, seleccionados)
            setRutaGenerada(ruta)
        } catch (e: any) {
            alert('Error al generar la ruta: ' + e.message)
        } finally {
            setGenerando(false)
        }
    }

    const linkMaps = rutaGenerada ? rutaCobroService.linkGoogleMaps(origenEmpresa, rutaGenerada.paradas) : null
    const cobradorNombre = cobradores.find(c => c.id === cobradorId)?.nombres ?? ''

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Route className="w-5 h-5 text-primary-600" /> Generar Ruta de Cobro — {new Date(fecha + 'T12:00:00').toLocaleDateString('es-EC')}
                    </h2>
                    <div className="flex items-center gap-1">
                        <HelpButton pageKey="generar-ruta-cobro" />
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {!origenEmpresa && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                            <p className="text-xs text-amber-700">
                                No se ha capturado la ubicación del local — la ruta se ordenará sin un punto de partida fijo.
                            </p>
                            <button onClick={handleCapturarOrigen} disabled={capturandoOrigen}
                                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
                                {capturandoOrigen ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                                Capturar aquí
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cobrador</label>
                        <select value={cobradorId} onChange={e => buscarCandidatos(e.target.value)}
                            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-400">
                            <option value="">Selecciona un cobrador…</option>
                            {cobradores.map(c => <option key={c.id} value={c.id}>{c.nombres}</option>)}
                        </select>
                    </div>

                    {loading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}

                    {!loading && cobradorId && candidatos.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-8">
                            {cobradorNombre} no tiene clientes con cuotas vencidas ni que venzan hoy.
                        </p>
                    )}

                    {!loading && !rutaGenerada && candidatos.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                Vencidos + vencen hoy — desmarca los que no vas a visitar
                            </p>
                            <div className="border border-slate-200 rounded-xl divide-y divide-slate-50 max-h-72 overflow-y-auto">
                                {candidatos.map(c => (
                                    <label key={c.cliente_id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50">
                                        <input type="checkbox" checked={!!seleccion[c.cliente_id]}
                                            onChange={e => setSeleccion(prev => ({ ...prev, [c.cliente_id]: e.target.checked }))}
                                            className="w-4 h-4 rounded text-primary-600" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-900 text-sm truncate">{c.cliente_nombre}</p>
                                            <p className="text-xs text-slate-400 truncate">{c.direccion || 'Sin dirección registrada'}</p>
                                        </div>
                                        <p className="font-black text-primary-700 text-sm shrink-0">{formatCurrency(c.monto_pendiente)}</p>
                                    </label>
                                ))}
                            </div>
                            <div className="flex items-center justify-between px-1 pt-1">
                                <p className="text-sm text-slate-500">{seleccionados.length} de {candidatos.length} seleccionados</p>
                                <p className="font-black text-slate-900">Total: {formatCurrency(totalSeleccionado)}</p>
                            </div>
                        </div>
                    )}

                    {rutaGenerada && (
                        <div className="space-y-3">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                <p className="text-sm text-emerald-700 font-semibold">
                                    Ruta generada para {cobradorNombre} — ya está disponible en su Cobros Móvil.
                                </p>
                            </div>
                            <div className="border border-slate-200 rounded-xl divide-y divide-slate-50">
                                {rutaGenerada.paradas.map(p => (
                                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                                        <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-black flex items-center justify-center shrink-0">{p.orden}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-900 text-sm truncate">{p.cliente_nombre}</p>
                                            <p className="text-xs text-slate-400 truncate">{p.direccion || 'Sin dirección — ubicar manualmente'}</p>
                                        </div>
                                        <p className="font-black text-primary-700 text-sm shrink-0">{formatCurrency(p.monto_pendiente)}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center justify-between px-1">
                                <p className="text-sm text-slate-500">{rutaGenerada.paradas.length} paradas</p>
                                <p className="font-black text-slate-900">Total del día: {formatCurrency(rutaGenerada.total_estimado)}</p>
                            </div>
                            {linkMaps && (
                                <a href={linkMaps} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-bold">
                                    <ExternalLink className="w-4 h-4" /> Abrir ruta en Google Maps
                                </a>
                            )}
                        </div>
                    )}
                </div>

                {!rutaGenerada && (
                    <div className="px-6 py-4 border-t border-slate-100">
                        <button onClick={handleGenerar} disabled={generando || seleccionados.length === 0}
                            className="w-full py-3 rounded-xl bg-primary-600 text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                            {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
                            Generar Ruta
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
