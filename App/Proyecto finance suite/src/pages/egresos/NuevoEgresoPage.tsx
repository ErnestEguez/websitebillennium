import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, AlertCircle, X, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { egresoService } from '../../services/egresoService'
import { cuentasBancariasService, proveedoresService, cxpService } from '../../services/bancosService'
import { chequeService } from '../../services/chequeService'
import { formatMoneda, formatFecha } from '../../lib/utils'
import { FORMA_PAGO_LABELS, ESTADO_CXP_BADGE } from '../../types/finance'
import type { Proveedor, CuentaBancaria, CuentaPorPagar, FormasPagoEgreso } from '../../types/finance'

type CxPSeleccion = { cxp: CuentaPorPagar; monto: number; seleccionado: boolean }

export function NuevoEgresoPage() {
    const { empresa, user } = useAuth()
    const navigate = useNavigate()

    const [paso, setPaso]     = useState<1 | 2 | 3>(1)
    const [error, setError]   = useState('')
    const [saving, setSaving] = useState(false)
    const [ok, setOk]         = useState(false)

    // Paso 1 — Proveedor
    const [proveedores, setProveedores]   = useState<Proveedor[]>([])
    const [busqProv, setBusqProv]         = useState('')
    const [provSelec, setProvSelec]       = useState<Proveedor | null>(null)
    const [cargProv, setCargProv]         = useState(false)

    // Paso 2 — CxP
    const [cxpLista, setCxpLista]         = useState<CxPSeleccion[]>([])
    const [cargCxp, setCargCxp]           = useState(false)
    const [expandCxp, setExpandCxp]       = useState<string | null>(null)

    // Paso 3 — Pago
    const [formaPago, setFormaPago]       = useState<FormasPagoEgreso>('transferencia')
    const [cuentas, setCuentas]           = useState<CuentaBancaria[]>([])
    const [cuentaId, setCuentaId]         = useState('')
    const [referencia, setReferencia]     = useState('')
    const [concepto, setConcepto]         = useState('')
    // Cheque fields
    const [numeroCheque, setNumeroCheque] = useState('')
    const [beneficiario, setBeneficiario] = useState('')
    const [fechaCobro, setFechaCobro]     = useState('')
    const [esPostfechado, setEsPostfechado] = useState(false)

    useEffect(() => {
        if (!empresa?.id) return
        cuentasBancariasService.listar(empresa.id)
            .then(c => setCuentas(c.filter(x => x.estado === 'activa')))
            .catch(() => {})
    }, [empresa?.id])

    async function buscarProveedor() {
        if (!empresa?.id || !busqProv.trim()) return
        setCargProv(true)
        try { setProveedores(await proveedoresService.buscar(empresa.id, busqProv)) }
        catch (e: unknown) { setError(String(e)) }
        finally { setCargProv(false) }
    }

    async function seleccionarProveedor(p: Proveedor) {
        setProvSelec(p); setProveedores([]); setBusqProv('')
        setCargCxp(true); setError('')
        try {
            const cxps = await cxpService.listarPendientes(empresa!.id, p.id)
            setCxpLista(cxps.map(c => ({
                cxp: c,
                monto: c.saldo_pendiente,
                seleccionado: false,
            })))
        } catch (e: unknown) { setError(String(e)) }
        finally { setCargCxp(false) }
    }

    function toggleCxp(id: string) {
        setCxpLista(prev => prev.map(x =>
            x.cxp.id === id ? { ...x, seleccionado: !x.seleccionado } : x
        ))
    }

    function actualizarMonto(id: string, val: string) {
        const n = parseFloat(val) || 0
        setCxpLista(prev => prev.map(x =>
            x.cxp.id === id ? { ...x, monto: Math.min(n, x.cxp.saldo_pendiente) } : x
        ))
    }

    const seleccionadas = cxpLista.filter(x => x.seleccionado)
    const totalSeleccion = seleccionadas.reduce((s, x) => s + x.monto, 0)

    async function confirmar() {
        if (!provSelec || !empresa?.id || !user?.id) return
        if (seleccionadas.length === 0) { setError('Selecciona al menos una factura a pagar'); return }
        const necesitaCuenta = ['transferencia', 'cheque', 'cheque_postfechado'].includes(formaPago)
        if (necesitaCuenta && !cuentaId) { setError('Selecciona la cuenta bancaria de origen'); return }
        if (['cheque', 'cheque_postfechado'].includes(formaPago) && !numeroCheque) { setError('Ingresa el número de cheque'); return }

        setSaving(true); setError('')
        try {
            const egreso = await egresoService.crear({
                empresaId:     empresa.id,
                proveedorId:   provSelec.id,
                formaPago,
                cuentaBancariaId: necesitaCuenta ? cuentaId : undefined,
                monto:         totalSeleccion,
                referencia:    referencia || undefined,
                concepto:      concepto || `Pago proveedor ${provSelec.nombre_empresa}`,
                cxpSeleccionados: seleccionadas.map(x => ({ cxpId: x.cxp.id, montoAplicado: x.monto })),
                createdBy:     user.id,
            })

            // Registrar cheque si aplica
            if (['cheque', 'cheque_postfechado'].includes(formaPago) && cuentaId) {
                await chequeService.crear({
                    empresa_id:        empresa.id,
                    cuenta_bancaria_id: cuentaId,
                    egreso_id:         egreso.id,
                    numero_cheque:     numeroCheque,
                    beneficiario:      beneficiario || provSelec.nombre_empresa,
                    monto:             totalSeleccion,
                    fecha_emision:     new Date().toISOString().slice(0, 10),
                    fecha_cobro:       esPostfechado ? fechaCobro : null,
                    es_postfechado:    esPostfechado,
                    estado:            'emitido',
                    fecha_cobro_real:  null,
                    movimiento_cobro_id: null,
                    notas:             null,
                    created_by:        user.id,
                })
            }

            setOk(true)
            setTimeout(() => navigate('/egresos'), 2000)
        } catch (e: unknown) { setError(String(e)) }
        finally { setSaving(false) }
    }

    if (ok) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="text-center">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-900">Egreso registrado correctamente</h2>
                    <p className="text-slate-500 text-sm mt-1">Redirigiendo...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Nuevo Comprobante de Egreso</h1>
                <p className="text-slate-500 text-sm mt-0.5">Pago a proveedor</p>
            </div>

            {/* Steps */}
            <div className="flex items-center gap-2">
                {(['1. Proveedor', '2. Facturas', '3. Pago'] as const).map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                            paso === i + 1 ? 'bg-primary-600 text-white' :
                            paso > i + 1   ? 'bg-green-500 text-white' :
                                             'bg-slate-200 text-slate-500'
                        }`}>{paso > i + 1 ? '✓' : i + 1}</div>
                        <span className={`text-sm font-medium ${paso === i + 1 ? 'text-primary-700' : 'text-slate-400'}`}>{label.slice(3)}</span>
                        {i < 2 && <div className="w-8 h-px bg-slate-300 mx-1" />}
                    </div>
                ))}
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Paso 1: Proveedor */}
            {paso === 1 && (
                <div className="card p-6 space-y-4">
                    <h2 className="font-bold text-slate-800">Seleccionar proveedor</h2>
                    {provSelec ? (
                        <div className="flex items-center justify-between p-4 bg-primary-50 rounded-xl border border-primary-200">
                            <div>
                                <p className="font-semibold text-primary-800">{provSelec.nombre_empresa}</p>
                                <p className="text-xs text-primary-600 font-mono mt-0.5">{provSelec.ruc}</p>
                            </div>
                            <button onClick={() => { setProvSelec(null); setCxpLista([]) }}
                                className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <input className="input flex-1" placeholder="RUC o nombre del proveedor..."
                                value={busqProv} onChange={e => setBusqProv(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && buscarProveedor()} />
                            <button onClick={buscarProveedor} disabled={cargProv} className="btn btn-secondary gap-2">
                                {cargProv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                Buscar
                            </button>
                        </div>
                    )}
                    {proveedores.length > 0 && (
                        <div className="border rounded-xl overflow-hidden">
                            {proveedores.map(p => (
                                <button key={p.id} onClick={() => seleccionarProveedor(p)}
                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 border-b last:border-0 text-left">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">{p.nombre_empresa}</p>
                                        <p className="text-xs text-slate-500 font-mono">{p.ruc}</p>
                                    </div>
                                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.condicion_pago}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex justify-end">
                        <button onClick={() => { if (!provSelec) { setError('Selecciona un proveedor'); return }; setError(''); setPaso(2) }}
                            className="btn btn-primary">Continuar →</button>
                    </div>
                </div>
            )}

            {/* Paso 2: Facturas */}
            {paso === 2 && (
                <div className="card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-slate-800">Facturas pendientes — {provSelec?.nombre_empresa}</h2>
                        {cargCxp && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    </div>
                    {cxpLista.length === 0 && !cargCxp ? (
                        <p className="text-sm text-slate-500 text-center py-8">No hay facturas pendientes para este proveedor.</p>
                    ) : (
                        <div className="space-y-2">
                            {cxpLista.map(({ cxp, monto, seleccionado }) => (
                                <div key={cxp.id} className={`border rounded-xl p-4 ${seleccionado ? 'border-primary-300 bg-primary-50' : 'border-slate-200'}`}>
                                    <div className="flex items-center gap-3">
                                        <input type="checkbox" className="w-4 h-4 accent-primary-600 shrink-0"
                                            checked={seleccionado} onChange={() => toggleCxp(cxp.id)} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-slate-800 truncate">
                                                    {cxp.compra?.numero_factura || '—'}
                                                </p>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ESTADO_CXP_BADGE[cxp.estado]}`}>
                                                    {cxp.estado}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 mt-0.5">
                                                <p className="text-xs text-slate-500">Vence: {formatFecha(cxp.fecha_vencimiento)}</p>
                                                <p className="text-xs text-slate-500">Original: {formatMoneda(cxp.monto_original)}</p>
                                                <p className="text-xs font-semibold text-amber-600">Saldo: {formatMoneda(cxp.saldo_pendiente)}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setExpandCxp(expandCxp === cxp.id ? null : cxp.id)}
                                            className="text-slate-400 shrink-0">
                                            {expandCxp === cxp.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {seleccionado && expandCxp === cxp.id && (
                                        <div className="mt-3 pt-3 border-t border-primary-200">
                                            <label className="label">Monto a aplicar</label>
                                            <input className="input max-w-[160px] text-right"
                                                type="number" step="0.01" min="0.01" max={cxp.saldo_pendiente}
                                                value={monto}
                                                onChange={e => actualizarMonto(cxp.id, e.target.value)} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {seleccionadas.length > 0 && (
                        <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-700">
                                {seleccionadas.length} factura{seleccionadas.length > 1 ? 's' : ''} seleccionada{seleccionadas.length > 1 ? 's' : ''}
                            </span>
                            <span className="text-lg font-bold text-primary-700">{formatMoneda(totalSeleccion)}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <button onClick={() => setPaso(1)} className="btn btn-secondary">← Volver</button>
                        <button onClick={() => { if (seleccionadas.length === 0) { setError('Selecciona al menos una factura'); return }; setError(''); setPaso(3) }}
                            className="btn btn-primary">Continuar →</button>
                    </div>
                </div>
            )}

            {/* Paso 3: Forma de pago */}
            {paso === 3 && (
                <div className="card p-6 space-y-5">
                    <h2 className="font-bold text-slate-800">Forma de pago — Total: {formatMoneda(totalSeleccion)}</h2>

                    <div>
                        <label className="label">Forma de pago *</label>
                        <select className="input max-w-xs" value={formaPago}
                            onChange={e => setFormaPago(e.target.value as FormasPagoEgreso)}>
                            {(Object.entries(FORMA_PAGO_LABELS) as [FormasPagoEgreso, string][]).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                    </div>

                    {/* Cuenta bancaria (transferencia / cheque) */}
                    {['transferencia', 'cheque', 'cheque_postfechado'].includes(formaPago) && (
                        <div>
                            <label className="label">Cuenta bancaria origen *</label>
                            <select className="input max-w-sm" value={cuentaId}
                                onChange={e => setCuentaId(e.target.value)}>
                                <option value="">Seleccionar cuenta...</option>
                                {cuentas.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.banco?.nombre} — {c.numero_cuenta} ({c.tipo})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Cheque */}
                    {['cheque', 'cheque_postfechado'].includes(formaPago) && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border">
                            <div>
                                <label className="label">Número de cheque *</label>
                                <input className="input font-mono" value={numeroCheque}
                                    onChange={e => setNumeroCheque(e.target.value)} placeholder="0001234" />
                            </div>
                            <div>
                                <label className="label">Beneficiario</label>
                                <input className="input" value={beneficiario}
                                    onChange={e => setBeneficiario(e.target.value)}
                                    placeholder={provSelec?.nombre_empresa} />
                            </div>
                            <div className="flex items-end gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" className="w-4 h-4 accent-primary-600"
                                        checked={esPostfechado}
                                        onChange={e => setEsPostfechado(e.target.checked)} />
                                    <span className="text-sm text-slate-700">Post-fechado</span>
                                </label>
                            </div>
                            {esPostfechado && (
                                <div>
                                    <label className="label">Fecha de cobro *</label>
                                    <input className="input" type="date" value={fechaCobro}
                                        onChange={e => setFechaCobro(e.target.value)} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Referencia / concepto */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Número de referencia</label>
                            <input className="input font-mono" value={referencia}
                                onChange={e => setReferencia(e.target.value)}
                                placeholder="Nro. transferencia, etc." />
                        </div>
                        <div>
                            <label className="label">Concepto / Detalle</label>
                            <input className="input" value={concepto}
                                onChange={e => setConcepto(e.target.value)} />
                        </div>
                    </div>

                    {/* Resumen */}
                    <div className="bg-primary-50 rounded-xl p-4 space-y-1 border border-primary-200">
                        <p className="text-sm font-semibold text-primary-800">Resumen del pago</p>
                        <p className="text-xs text-slate-600">Proveedor: <strong>{provSelec?.nombre_empresa}</strong></p>
                        <p className="text-xs text-slate-600">Facturas: {seleccionadas.length}</p>
                        <p className="text-sm font-bold text-primary-700 mt-1">Total: {formatMoneda(totalSeleccion)}</p>
                    </div>

                    <div className="flex justify-between">
                        <button onClick={() => setPaso(2)} className="btn btn-secondary">← Volver</button>
                        <button onClick={confirmar} disabled={saving} className="btn btn-primary gap-2">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            Confirmar egreso
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
