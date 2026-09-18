import { useState, useEffect } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { HelpButton } from '../../../components/help/HelpButton'
import { carteraCxcService, numeroFacturaCartera, type ChequeCliente } from '../../../services/carteraCxcService'
import { cuentasBancariasService } from '../../../services/finance/bancosService'
import type { CuentaBancaria } from '../../../types/finance'
import { formatCurrency } from '../../../lib/utils'
import { Landmark, Calendar, Save, X, Ban, Loader2, AlertCircle } from 'lucide-react'

function hoyISO() {
    return new Date().toISOString().split('T')[0]
}

export function DepositoChequesCustodiaPage() {
    const { empresa } = useAuth()

    const [cheques, setCheques]   = useState<ChequeCliente[]>([])
    const [loading, setLoading]   = useState(true)
    const [error, setError]       = useState('')
    const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([])

    // ── Modal depósito ──
    const [chequeModal, setChequeModal] = useState<ChequeCliente | null>(null)
    const [facturasCheque, setFacturasCheque] = useState<any[]>([])
    const [loadingFacturas, setLoadingFacturas] = useState(false)
    const [cuentaId, setCuentaId] = useState('')
    const [numeroComprobante, setNumeroComprobante] = useState('')
    const [fechaDeposito, setFechaDeposito] = useState(hoyISO())
    const [saving, setSaving] = useState(false)

    // ── Rechazar ──
    const [rechazandoId, setRechazandoId] = useState<string | null>(null)

    useEffect(() => {
        if (empresa?.id) {
            cargar()
            cuentasBancariasService.listar(empresa.id)
                .then(data => setCuentasBancarias(data.filter(c => c.estado === 'activa')))
                .catch(() => {})
        }
    }, [empresa?.id])

    async function cargar() {
        try {
            setLoading(true); setError('')
            const data = await carteraCxcService.getChequesEnCustodia(empresa!.id)
            setCheques(data)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    async function abrirDeposito(cheque: ChequeCliente) {
        setChequeModal(cheque)
        setCuentaId(''); setNumeroComprobante(''); setFechaDeposito(hoyISO())
        setLoadingFacturas(true)
        try {
            const facts = await carteraCxcService.getFacturasDeCheque(cheque.id)
            setFacturasCheque(facts)
        } catch (e: any) {
            alert(`Error cargando facturas del cheque: ${e.message}`)
        } finally {
            setLoadingFacturas(false)
        }
    }

    function cerrarModal() {
        setChequeModal(null); setFacturasCheque([]); setCuentaId(''); setNumeroComprobante('')
    }

    async function confirmarDeposito() {
        if (!chequeModal) return
        if (!cuentaId) { alert('Selecciona la cuenta bancaria destino'); return }
        if (!numeroComprobante.trim()) { alert('Ingresa el número de comprobante del depósito'); return }
        if (!fechaDeposito) { alert('Ingresa la fecha del depósito'); return }

        try {
            setSaving(true)
            const { avisoContable: aviso } = await carteraCxcService.depositarChequeCustodia(
                chequeModal.id, empresa!.id,
                { cuentaBancariaId: cuentaId, numeroComprobante: numeroComprobante.trim(), fechaDeposito },
            )
            if (aviso) {
                alert(`Cheque depositado. El movimiento bancario y la cartera del cliente ya quedaron actualizados, pero el asiento contable no se generó: ${aviso}`)
            }
            cerrarModal()
            await cargar()
        } catch (e: any) {
            alert(`Error al depositar: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function rechazarCheque(cheque: ChequeCliente) {
        const motivo = prompt(`Motivo por el que se retira de custodia el cheque Nro. ${cheque.numero_cheque} (${formatCurrency(cheque.monto)}):`)
        if (!motivo?.trim()) return
        try {
            setRechazandoId(cheque.id)
            await carteraCxcService.anularChequeCustodia(cheque.id, motivo.trim())
            await cargar()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        } finally {
            setRechazandoId(null)
        }
    }

    const hoy = hoyISO()
    const totalCustodia = cheques.reduce((s, c) => s + Number(c.monto), 0)

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Landmark className="w-6 h-6 text-primary-600" />
                        Depósito de Cheques en Custodia
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        Cheques a fecha recibidos de clientes como garantía — deposítalos aquí el día que los envíes al banco.
                    </p>
                </div>
                <HelpButton pageKey="deposito-cheques-custodia" />
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            <div className="bg-primary-50 border border-primary-200 rounded-xl px-5 py-3 flex items-center justify-between">
                <p className="text-sm text-primary-700">Cheques en custodia (sin depositar)</p>
                <p className="text-xl font-bold text-primary-800">{formatCurrency(totalCustodia)} · {cheques.length} cheque(s)</p>
            </div>

            {loading ? (
                <p className="text-sm text-slate-500">Cargando...</p>
            ) : cheques.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-6 text-center">No hay cheques en custodia pendientes de depósito.</p>
            ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="text-left px-3 py-2 text-xs text-slate-500 uppercase">Cliente</th>
                                <th className="text-left px-3 py-2 text-xs text-slate-500 uppercase">Nro. Cheque</th>
                                <th className="text-left px-3 py-2 text-xs text-slate-500 uppercase">Banco</th>
                                <th className="text-left px-3 py-2 text-xs text-slate-500 uppercase">Fecha de cobro</th>
                                <th className="text-right px-3 py-2 text-xs text-slate-500 uppercase">Monto</th>
                                <th className="text-center px-3 py-2 text-xs text-slate-500 uppercase w-56"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {cheques.map(c => {
                                const vencido = c.fecha_cobro <= hoy
                                return (
                                    <tr key={c.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-slate-700">{c.clientes?.nombre}</div>
                                            <div className="text-slate-400 text-xs">{c.clientes?.identificacion}</div>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-slate-700">{c.numero_cheque}</td>
                                        <td className="px-3 py-2 text-slate-600">{c.banco_emisor || '—'}</td>
                                        <td className="px-3 py-2">
                                            <div className={`flex items-center gap-1 ${vencido ? 'text-amber-600 font-medium' : 'text-slate-600'}`}>
                                                <Calendar className="w-3.5 h-3.5" /> {c.fecha_cobro}
                                            </div>
                                            {vencido && <div className="text-[10px] text-amber-600">Listo para depositar</div>}
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(c.monto)}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => abrirDeposito(c)}
                                                    className="btn btn-primary text-xs py-1.5 px-3"
                                                >
                                                    Depositar
                                                </button>
                                                <button
                                                    onClick={() => rechazarCheque(c)}
                                                    disabled={rechazandoId === c.id}
                                                    title="Retirar este cheque de custodia (no se depositará)"
                                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                                >
                                                    {rechazandoId === c.id
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <Ban className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════
                MODAL DEPÓSITO
            ═══════════════════════════════════════════════════ */}
            {chequeModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Depositar Cheque</h2>
                                <p className="text-sm text-slate-500">
                                    Nro. {chequeModal.numero_cheque} — {chequeModal.clientes?.nombre} — {formatCurrency(chequeModal.monto)}
                                </p>
                            </div>
                            <button onClick={cerrarModal} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto flex-1">
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-2">Facturas que cubre este cheque</p>
                                {loadingFacturas ? (
                                    <p className="text-sm text-slate-500">Cargando...</p>
                                ) : (
                                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                                        {facturasCheque.map((p: any) => (
                                            <div key={p.id} className="px-3 py-2 flex justify-between text-sm">
                                                <span className="font-mono text-slate-600">
                                                    {numeroFacturaCartera({ comprobantes: p.cartera_cxc?.comprobantes, numero_documento_externo: p.cartera_cxc?.numero_documento_externo })}
                                                </span>
                                                <span className="font-semibold text-slate-700">{formatCurrency(p.valor)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Cuenta bancaria destino <span className="text-red-500">*</span></label>
                                <select
                                    value={cuentaId}
                                    onChange={e => setCuentaId(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">— Selecciona cuenta —</option>
                                    {cuentasBancarias.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {(c as any).banco?.nombre || ''} — {c.numero_cuenta} ({c.tipo})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Nro. comprobante de depósito <span className="text-red-500">*</span></label>
                                    <input
                                        type="text" value={numeroComprobante} onChange={e => setNumeroComprobante(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                        placeholder="Papeleta / comprobante"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha de depósito <span className="text-red-500">*</span></label>
                                    <input
                                        type="date" value={fechaDeposito} onChange={e => setFechaDeposito(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                                Al confirmar: se aplica el pago a cada factura cubierta, se acredita la cuenta bancaria
                                seleccionada y el cheque queda marcado como depositado.
                            </p>
                        </div>

                        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                            <button onClick={cerrarModal} className="btn btn-secondary" disabled={saving}>Cancelar</button>
                            <button
                                onClick={confirmarDeposito}
                                className="btn btn-primary flex items-center gap-2"
                                disabled={saving || loadingFacturas}
                            >
                                {saving
                                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    : <Save className="w-4 h-4" />}
                                Confirmar Depósito
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
