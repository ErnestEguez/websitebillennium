import { useEffect, useState } from 'react'
import { Receipt, Loader2, AlertCircle, X, Plus, Search, CreditCard, Trash2 } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { formatMoneda, mesNombre } from '../../../lib/utils'
import { HelpButton } from '../../../components/help/HelpButton'
import { RetencionesEditor, type RetLine } from '../../../components/vendor/RetencionesEditor'
import { codigoRetencionService, type CodigoRetencion } from '../../../services/codigoRetencionService'
import { carteraCxcService } from '../../../services/carteraCxcService'
import { retencionesVentasService, type FacturaParaRetencion, type RetencionTarjetaBanco } from '../../../services/retencionesVentasService'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface RetVentaRow {
    id: string
    fecha_emision: string
    tipo: 'FUENTE' | 'IVA'
    codigo_retencion: string
    descripcion: string | null
    base_imponible: number
    porcentaje: number
    valor: number
    numero_retencion: string | null
    origen: 'FACTURA' | 'CARTERA'
    factura_numero: string
    cliente_nombre: string
    cliente_identificacion: string
}

const f2 = (n: number) => n.toFixed(2)

// ── Componente ─────────────────────────────────────────────────────────────

export function ConsultaRetencionesClientesPage() {
    const { empresa, profile } = useAuth()

    const [año, setAño] = useState(new Date().getFullYear())
    const [mes, setMes] = useState(new Date().getMonth() + 1)
    const [busqueda, setBusqueda] = useState('')

    const [filas, setFilas] = useState<RetVentaRow[]>([])
    const [tarjeta, setTarjeta] = useState<RetencionTarjetaBanco[]>([])
    const [cargando, setCargando] = useState(false)
    const [error, setError] = useState('')

    const [codigos, setCodigos] = useState<CodigoRetencion[]>([])
    const [eliminandoId, setEliminandoId] = useState<string | null>(null)

    // ── Modal: registrar retención de cliente (posterior a facturar) ──
    const [modalCliente, setModalCliente] = useState(false)
    const [buscandoFactura, setBuscandoFactura] = useState(false)
    const [numeroFacturaBuscar, setNumeroFacturaBuscar] = useState('')
    const [resultadosFactura, setResultadosFactura] = useState<FacturaParaRetencion[]>([])
    const [facturaEncontrada, setFacturaEncontrada] = useState<FacturaParaRetencion | null>(null)
    const [errorBusqueda, setErrorBusqueda] = useState('')
    const [numeroRetencion, setNumeroRetencion] = useState('')
    const [fechaRetencion, setFechaRetencion] = useState(() => new Date().toISOString().slice(0, 10))
    const [retLines, setRetLines] = useState<RetLine[]>([])
    const [basesFactura, setBasesFactura] = useState({ baseFuente: 0, baseIva: 0 })
    const [guardandoRet, setGuardandoRet] = useState(false)

    // ── Modal: registrar retención de tarjeta (RECAP banco) ──
    const [modalTarjeta, setModalTarjeta] = useState(false)
    const [formTarjeta, setFormTarjeta] = useState({
        fecha: new Date().toISOString().slice(0, 10),
        banco: '', numero_lote: '', base_imponible: 0, porcentaje: 0, valor: 0, observaciones: '',
    })
    const [guardandoTarjeta, setGuardandoTarjeta] = useState(false)

    useEffect(() => {
        if (empresa?.id) { cargar(); codigoRetencionService.listar(empresa.id).then(setCodigos).catch(() => {}) }
    }, [empresa?.id, año, mes])

    async function cargar() {
        if (!empresa?.id) return
        setCargando(true); setError('')
        const desde = `${año}-${String(mes).padStart(2, '0')}-01`
        const hasta = `${año}-${String(mes).padStart(2, '0')}-${new Date(año, mes, 0).getDate()}`
        try {
            const { ventas, tarjeta: tarj } = await retencionesVentasService.listarPorPeriodo(empresa.id, desde, hasta)
            setFilas((ventas as any[]).map(r => ({
                id: r.id,
                fecha_emision: r.fecha_emision,
                tipo: r.tipo,
                codigo_retencion: r.codigo_retencion,
                descripcion: r.descripcion,
                base_imponible: Number(r.base_imponible) || 0,
                porcentaje: Number(r.porcentaje) || 0,
                valor: Number(r.valor) || 0,
                numero_retencion: r.numero_retencion,
                origen: r.origen,
                factura_numero: r.comprobantes?.secuencial ?? '',
                cliente_nombre: r.clientes?.nombre ?? '',
                cliente_identificacion: r.clientes?.identificacion ?? '',
            })))
            setTarjeta(tarj)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setCargando(false)
        }
    }

    async function eliminarRetencionVenta(row: RetVentaRow) {
        if (row.origen === 'FACTURA') {
            alert('Esta retención se capturó al emitir la factura y está ligada a su pago — no se puede eliminar desde aquí.')
            return
        }
        if (!confirm(`¿Eliminar esta retención de ${row.cliente_nombre} (${formatMoneda(row.valor)})? Esta acción no se puede deshacer — vuelve a registrarla con los datos correctos después.`)) return
        setEliminandoId(row.id)
        try {
            await retencionesVentasService.anularRetencionVenta(row.id, row.origen)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setEliminandoId(null)
        }
    }

    async function eliminarRetencionTarjeta(row: RetencionTarjetaBanco) {
        if (!confirm(`¿Eliminar esta retención de tarjeta (${row.banco}, ${formatMoneda(row.valor)})? Esta acción no se puede deshacer.`)) return
        setEliminandoId(row.id)
        try {
            await retencionesVentasService.anularRetencionTarjeta(row.id)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setEliminandoId(null)
        }
    }

    const filtradas = filas.filter(r => {
        if (!busqueda.trim()) return true
        const b = busqueda.toLowerCase()
        return r.cliente_nombre.toLowerCase().includes(b) || r.cliente_identificacion.includes(b) || r.factura_numero.includes(b)
    })

    const totalIvaClientes = filtradas.filter(r => r.tipo === 'IVA').reduce((s, r) => s + r.valor, 0)
    const totalRentaClientes = filtradas.filter(r => r.tipo === 'FUENTE').reduce((s, r) => s + r.valor, 0)
    const totalTarjeta = tarjeta.reduce((s, r) => s + r.valor, 0)

    // ── Modal cliente ──

    function abrirModalCliente() {
        setNumeroFacturaBuscar(''); setResultadosFactura([]); setFacturaEncontrada(null); setErrorBusqueda('')
        setNumeroRetencion(''); setFechaRetencion(new Date().toISOString().slice(0, 10))
        setRetLines([]); setBasesFactura({ baseFuente: 0, baseIva: 0 })
        setModalCliente(true)
    }

    async function buscarFactura() {
        if (!empresa?.id || !numeroFacturaBuscar.trim()) return
        setBuscandoFactura(true); setErrorBusqueda(''); setFacturaEncontrada(null); setResultadosFactura([])
        try {
            const facturas = await retencionesVentasService.buscarFacturas(empresa.id, numeroFacturaBuscar)
            if (facturas.length === 0) { setErrorBusqueda('No se encontró ninguna factura con ese número, cliente o RUC/CI.'); return }
            if (facturas.length === 1) {
                await seleccionarFactura(facturas[0])
            } else {
                setResultadosFactura(facturas)
            }
        } catch (e: any) {
            setErrorBusqueda(e.message)
        } finally {
            setBuscandoFactura(false)
        }
    }

    async function seleccionarFactura(factura: FacturaParaRetencion) {
        setResultadosFactura([])
        setFacturaEncontrada(factura)
        setErrorBusqueda('')
        const bases = await carteraCxcService.getBaseImponibleFactura(factura.id)
        setBasesFactura(bases)
        setRetLines([{ tipo: 'FUENTE', codigo: '', descripcion: '', base: bases.baseFuente, pct: 0, valor: 0 }])
    }

    async function guardarRetencionCliente() {
        if (!empresa?.id || !facturaEncontrada) return
        setGuardandoRet(true); setErrorBusqueda('')
        try {
            await retencionesVentasService.registrarRetencionPosterior({
                empresa_id: empresa.id,
                factura: facturaEncontrada,
                numero_retencion: numeroRetencion || undefined,
                fecha_emision: fechaRetencion,
                retenciones: retLines,
                created_by: profile?.id ?? null,
            })
            setModalCliente(false)
            await cargar()
        } catch (e: any) {
            setErrorBusqueda(e.message)
        } finally {
            setGuardandoRet(false)
        }
    }

    // ── Modal tarjeta ──

    function abrirModalTarjeta() {
        setFormTarjeta({ fecha: new Date().toISOString().slice(0, 10), banco: '', numero_lote: '', base_imponible: 0, porcentaje: 0, valor: 0, observaciones: '' })
        setModalTarjeta(true)
    }

    async function guardarRetencionTarjeta() {
        if (!empresa?.id) return
        setGuardandoTarjeta(true); setError('')
        try {
            await retencionesVentasService.registrarRetencionTarjeta({
                empresa_id: empresa.id,
                ...formTarjeta,
                created_by: profile?.id ?? null,
            })
            setModalTarjeta(false)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setGuardandoTarjeta(false)
        }
    }

    const periodo = `${mesNombre(mes)} ${año}`

    return (
        <div className="space-y-5 max-w-full">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Retenciones de Clientes</h1>
                        <p className="text-slate-500 text-sm mt-0.5">Retenciones que los clientes aplican a esta empresa — {periodo}</p>
                    </div>
                    <HelpButton pageKey="retenciones-clientes" />
                </div>
                <div className="flex gap-2">
                    <button onClick={abrirModalCliente} className="btn btn-primary gap-2">
                        <Plus className="w-4 h-4" /> Registrar retención de cliente
                    </button>
                    <button onClick={abrirModalTarjeta} className="btn btn-secondary gap-2">
                        <CreditCard className="w-4 h-4" /> Registrar retención de tarjeta
                    </button>
                </div>
            </div>

            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Filtros */}
            <div className="card p-5">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="label">Año</label>
                        <select className="input" value={año} onChange={e => setAño(+e.target.value)}>
                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label">Mes</label>
                        <select className="input" value={mes} onChange={e => setMes(+e.target.value)}>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{mesNombre(m)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="label">Buscar</label>
                        <input className="input" placeholder="Cliente, RUC/CI, No. factura..."
                            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4">
                    <p className="text-xl font-bold text-purple-600">{filtradas.length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Líneas de retención</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-blue-600">{formatMoneda(totalRentaClientes)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total retención Fuente</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-violet-600">{formatMoneda(totalIvaClientes)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total retención IVA (facturas)</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-emerald-600">{formatMoneda(totalTarjeta)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total retención IVA (tarjeta)</p>
                </div>
            </div>

            {/* Tabla retenciones de facturas */}
            <div className="card overflow-hidden">
                <div className="bg-purple-700 px-5 py-3 text-white font-bold text-sm flex items-center gap-2">
                    <Receipt className="w-4 h-4" /> Retenciones sobre facturas — {periodo}
                </div>
                {cargando ? (
                    <div className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
                ) : filtradas.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <Receipt className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>Sin retenciones de clientes para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-700 text-white text-center">
                                    <th className="py-2 px-2 text-left border border-slate-600 whitespace-nowrap">Fecha</th>
                                    <th className="py-2 px-2 text-left border border-slate-600 whitespace-nowrap">No. Factura</th>
                                    <th className="py-2 px-2 text-left border border-slate-600 whitespace-nowrap min-w-[140px]">Cliente</th>
                                    <th className="py-2 px-2 border border-slate-600 whitespace-nowrap">RUC/CI</th>
                                    <th className="py-2 px-2 border border-slate-600 whitespace-nowrap">Tipo</th>
                                    <th className="py-2 px-2 border border-slate-600 whitespace-nowrap">Código</th>
                                    <th className="py-2 px-2 text-right border border-slate-600 whitespace-nowrap">Base</th>
                                    <th className="py-2 px-2 text-right border border-slate-600 whitespace-nowrap">%</th>
                                    <th className="py-2 px-2 text-right border border-slate-600 whitespace-nowrap">Valor</th>
                                    <th className="py-2 px-2 border border-slate-600 whitespace-nowrap">Origen</th>
                                    <th className="py-2 px-2 border border-slate-600 whitespace-nowrap"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map((r, idx) => (
                                    <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">{r.fecha_emision}</td>
                                        <td className="py-2 px-2 border border-slate-200 font-mono whitespace-nowrap">{r.factura_numero}</td>
                                        <td className="py-2 px-2 border border-slate-200">{r.cliente_nombre}</td>
                                        <td className="py-2 px-2 border border-slate-200 font-mono whitespace-nowrap">{r.cliente_identificacion}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-center">
                                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.tipo === 'FUENTE' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>{r.tipo}</span>
                                        </td>
                                        <td className="py-2 px-2 border border-slate-200 font-mono text-center">{r.codigo_retencion}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-right">{f2(r.base_imponible)}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-right">{f2(r.porcentaje)}%</td>
                                        <td className="py-2 px-2 border border-slate-200 text-right font-semibold text-emerald-700">{f2(r.valor)}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-center text-slate-500">{r.origen === 'FACTURA' ? 'Al facturar' : 'Posterior'}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-center">
                                            {r.origen === 'CARTERA' && (
                                                <button onClick={() => eliminarRetencionVenta(r)} disabled={eliminandoId === r.id}
                                                    title="Eliminar retención" className="text-red-400 hover:text-red-600 disabled:opacity-40">
                                                    {eliminandoId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Tabla retenciones de tarjeta */}
            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Retenciones de tarjeta de crédito (RECAP banco) — {periodo}
                </div>
                {tarjeta.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-sm">Sin retenciones de tarjeta registradas este período.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-600 text-white text-center">
                                    <th className="py-2 px-2 text-left border border-slate-500 whitespace-nowrap">Fecha</th>
                                    <th className="py-2 px-2 text-left border border-slate-500 whitespace-nowrap">Banco</th>
                                    <th className="py-2 px-2 border border-slate-500 whitespace-nowrap">Lote</th>
                                    <th className="py-2 px-2 text-right border border-slate-500 whitespace-nowrap">Base</th>
                                    <th className="py-2 px-2 text-right border border-slate-500 whitespace-nowrap">%</th>
                                    <th className="py-2 px-2 text-right border border-slate-500 whitespace-nowrap">Valor</th>
                                    <th className="py-2 px-2 text-left border border-slate-500 whitespace-nowrap">Observaciones</th>
                                    <th className="py-2 px-2 border border-slate-500 whitespace-nowrap"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {tarjeta.map((r, idx) => (
                                    <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">{r.fecha}</td>
                                        <td className="py-2 px-2 border border-slate-200">{r.banco}</td>
                                        <td className="py-2 px-2 border border-slate-200 font-mono text-center">{r.numero_lote ?? '—'}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-right">{f2(r.base_imponible)}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-right">{f2(r.porcentaje)}%</td>
                                        <td className="py-2 px-2 border border-slate-200 text-right font-semibold text-emerald-700">{f2(r.valor)}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-slate-500">{r.observaciones ?? '—'}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-center">
                                            <button onClick={() => eliminarRetencionTarjeta(r)} disabled={eliminandoId === r.id}
                                                title="Eliminar retención" className="text-red-400 hover:text-red-600 disabled:opacity-40">
                                                {eliminandoId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ══════════ MODAL: Registrar retención de cliente ══════════ */}
            {modalCliente && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h2 className="font-bold text-slate-900 text-lg">Registrar retención de cliente</h2>
                            <button onClick={() => setModalCliente(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="label text-xs">Número de factura, nombre o RUC/CI del cliente</label>
                                <div className="flex gap-2">
                                    <input className="input flex-1" placeholder="001-002-000000123, Juan Pérez o 0912345678"
                                        value={numeroFacturaBuscar}
                                        onChange={e => setNumeroFacturaBuscar(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarFactura() } }} />
                                    <button onClick={buscarFactura} disabled={buscandoFactura || !numeroFacturaBuscar.trim()}
                                        className="btn btn-secondary gap-2 disabled:opacity-50">
                                        {buscandoFactura ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                        Buscar
                                    </button>
                                </div>
                                {errorBusqueda && <p className="text-red-600 text-sm mt-1">{errorBusqueda}</p>}
                            </div>

                            {resultadosFactura.length > 0 && (
                                <div className="border border-slate-200 rounded-lg divide-y max-h-56 overflow-y-auto">
                                    {resultadosFactura.map(f => (
                                        <button key={f.id} type="button" onClick={() => seleccionarFactura(f)}
                                            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-xs font-mono text-slate-700">{f.secuencial}</p>
                                                <p className="text-xs text-slate-500">{f.cliente_nombre} · {f.cliente_identificacion}</p>
                                            </div>
                                            <span className="text-xs font-semibold text-slate-600 shrink-0">{formatMoneda(f.total)}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {facturaEncontrada && (
                                <>
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                                        <p className="font-semibold text-emerald-800">{facturaEncontrada.cliente_nombre}</p>
                                        <p className="text-emerald-700 text-xs">{facturaEncontrada.cliente_identificacion} · Total: {formatMoneda(facturaEncontrada.total)}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="label text-xs">Fecha de la retención</label>
                                            <input type="date" className="input" value={fechaRetencion} onChange={e => setFechaRetencion(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="label text-xs">Nº Retención (opcional)</label>
                                            <input className="input font-mono" value={numeroRetencion} onChange={e => setNumeroRetencion(e.target.value)} placeholder="001-001-000000001" />
                                        </div>
                                    </div>

                                    <RetencionesEditor
                                        numeroRetencion={numeroRetencion}
                                        onChangeNumero={setNumeroRetencion}
                                        retenciones={retLines}
                                        onChange={setRetLines}
                                        baseDefault={basesFactura.baseFuente}
                                        baseIva={basesFactura.baseIva}
                                        codigos={codigos}
                                    />
                                </>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 p-5 border-t">
                            <button onClick={() => setModalCliente(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                            <button onClick={guardarRetencionCliente}
                                disabled={!facturaEncontrada || guardandoRet || retLines.every(r => !r.codigo || r.valor <= 0)}
                                className="btn btn-primary gap-2 disabled:opacity-50">
                                {guardandoRet ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Guardar retención
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════ MODAL: Registrar retención de tarjeta ══════════ */}
            {modalTarjeta && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h2 className="font-bold text-slate-900 text-lg">Registrar retención de tarjeta</h2>
                            <button onClick={() => setModalTarjeta(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-xs text-slate-500">
                                Retención de IVA que aplica el banco por consumos con tarjeta de crédito (según el RECAP),
                                sin número de factura asociado. No se declara en el ATS, solo en el Formulario 104.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="label text-xs">Fecha</label>
                                    <input type="date" className="input" value={formTarjeta.fecha}
                                        onChange={e => setFormTarjeta(f => ({ ...f, fecha: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="label text-xs">Banco</label>
                                    <input className="input" value={formTarjeta.banco}
                                        onChange={e => setFormTarjeta(f => ({ ...f, banco: e.target.value }))} placeholder="Banco Pichincha" />
                                </div>
                            </div>
                            <div>
                                <label className="label text-xs">Nº de lote / RECAP (opcional)</label>
                                <input className="input" value={formTarjeta.numero_lote}
                                    onChange={e => setFormTarjeta(f => ({ ...f, numero_lote: e.target.value }))} />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="label text-xs">Base imponible</label>
                                    <input type="number" step={0.01} className="input text-right"
                                        value={formTarjeta.base_imponible || ''}
                                        onChange={e => {
                                            const base = parseFloat(e.target.value) || 0
                                            setFormTarjeta(f => ({ ...f, base_imponible: base, valor: Math.round(base * f.porcentaje / 100 * 100) / 100 }))
                                        }} />
                                </div>
                                <div>
                                    <label className="label text-xs">%</label>
                                    <input type="number" step={0.01} className="input text-right"
                                        value={formTarjeta.porcentaje || ''}
                                        onChange={e => {
                                            const pct = parseFloat(e.target.value) || 0
                                            setFormTarjeta(f => ({ ...f, porcentaje: pct, valor: Math.round(f.base_imponible * pct / 100 * 100) / 100 }))
                                        }} />
                                </div>
                                <div>
                                    <label className="label text-xs">Valor retenido</label>
                                    <input type="number" step={0.01} className="input text-right font-bold"
                                        value={formTarjeta.valor || ''}
                                        onChange={e => setFormTarjeta(f => ({ ...f, valor: parseFloat(e.target.value) || 0 }))} />
                                </div>
                            </div>
                            <div>
                                <label className="label text-xs">Observaciones (opcional)</label>
                                <textarea rows={2} className="input resize-none" value={formTarjeta.observaciones}
                                    onChange={e => setFormTarjeta(f => ({ ...f, observaciones: e.target.value }))} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-5 border-t">
                            <button onClick={() => setModalTarjeta(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                            <button onClick={guardarRetencionTarjeta}
                                disabled={guardandoTarjeta || !formTarjeta.banco.trim() || !(formTarjeta.valor > 0)}
                                className="btn btn-primary gap-2 disabled:opacity-50">
                                {guardandoTarjeta ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
