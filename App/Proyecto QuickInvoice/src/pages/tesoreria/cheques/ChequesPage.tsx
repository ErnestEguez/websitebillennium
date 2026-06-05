import { useEffect, useState } from 'react'
import { CheckSquare, Loader2, AlertCircle, X, Download, Printer } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { chequeService } from '../../../services/finance/chequeService'
import { cuentasBancariasService } from '../../../services/finance/bancosService'
import { cn, formatMoneda, formatFecha } from '../../../lib/utils'
import { exportarExcelProfesional } from '../../../lib/excelUtils'
import { imprimirReporte, generarTablaHtml } from '../../../lib/printUtils'
import type { Cheque, CuentaBancaria } from '../../../types/finance'

const ESTADO_BADGE: Record<string, string> = {
    emitido:     'bg-blue-100 text-blue-700',
    cobrado:     'bg-green-100 text-green-700',
    anulado:     'bg-red-100 text-red-700',
    en_transito: 'bg-amber-100 text-amber-700',
}

export function ChequesPage() {
    const { empresa } = useAuth()

    const [lista, setLista]     = useState<Cheque[]>([])
    const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState('')
    const [estado, setEstado]   = useState('')
    const [cuentaId, setCuentaId] = useState('')

    const [modalCobro, setModalCobro] = useState<Cheque | null>(null)
    const [fechaCobro, setFechaCobro] = useState(new Date().toISOString().slice(0, 10))
    const [anulando, setAnulando]     = useState(false)
    const [modalAnular, setModalAnular] = useState<Cheque | null>(null)
    const [notaAnular, setNotaAnular] = useState('')

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        cuentasBancariasService.listar(empresa.id).then(c => setCuentas(c)).catch(() => {})
        cargar()
    }, [empresa?.id])

    async function cargar() {
        if (!empresa?.id) return
        setLoading(true)
        try {
            setLista(await chequeService.listar(empresa.id, {
                cuentaId:  cuentaId || undefined,
                estado:    estado || undefined,
            }))
        } catch (e: unknown) { setError(String(e)) }
        finally { setLoading(false) }
    }

    useEffect(() => { if (empresa?.id) cargar() }, [cuentaId, estado])

    async function marcarCobrado() {
        if (!modalCobro || !empresa?.id) return
        setAnulando(true)
        try {
            await chequeService.marcarCobrado(modalCobro.id, fechaCobro, empresa.id)
            setModalCobro(null)
            await cargar()
        } catch (e: unknown) { setError(String(e)) }
        finally { setAnulando(false) }
    }

    async function anularCheque() {
        if (!modalAnular) return
        setAnulando(true)
        try {
            await chequeService.anular(modalAnular.id, notaAnular)
            setModalAnular(null); setNotaAnular('')
            await cargar()
        } catch (e: unknown) { setError(String(e)) }
        finally { setAnulando(false) }
    }

    function imprimir() {
        const totalMonto = lista.reduce((s, c) => s + c.monto, 0)
        const html = generarTablaHtml(
            [
                { label: 'N° Cheque',    key: 'num',  width: '10%' },
                { label: 'Cuenta',       key: 'cta',  width: '22%' },
                { label: 'Beneficiario', key: 'ben',  width: '22%' },
                { label: 'F. Emisión',   key: 'fem',  width: '11%' },
                { label: 'F. Cobro',     key: 'fcob', width: '11%' },
                { label: 'Monto',        key: 'monto', align: 'right', width: '11%' },
                { label: 'Post-f.',      key: 'pf',   align: 'center', width: '7%' },
                { label: 'Estado',       key: 'est',  align: 'center', width: '8%' },
            ],
            lista.map(c => ({
                num:   c.numero_cheque,
                cta:   `${c.cuenta_bancaria?.banco?.nombre ?? ''} ${c.cuenta_bancaria?.numero_cuenta ?? ''}`,
                ben:   c.beneficiario,
                fem:   formatFecha(c.fecha_emision),
                fcob:  c.fecha_cobro ? formatFecha(c.fecha_cobro) : '—',
                monto: formatMoneda(c.monto),
                pf:    c.es_postfechado ? 'Sí' : 'No',
                est:   c.estado,
            })),
            { num: `${lista.length} cheques`, monto: formatMoneda(totalMonto) }
        )
        imprimirReporte({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Cheques Emitidos',
            html,
        })
    }

    function exportarExcel() {
        exportarExcelProfesional({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Cheques Emitidos',
            columnas: [
                { key: 'NCheque',    label: 'N° Cheque',      width: 14 },
                { key: 'Cuenta',     label: 'Cuenta',         width: 30 },
                { key: 'Beneficiario', label: 'Beneficiario', width: 28 },
                { key: 'FEmision',   label: 'F. Emisión',     width: 13 },
                { key: 'FCobro',     label: 'F. Cobro',       width: 13 },
                { key: 'FCReal',     label: 'F. Cobro Real',  width: 15 },
                { key: 'Monto',      label: 'Monto',          width: 12 },
                { key: 'PostF',      label: 'Post-fechado',   width: 13 },
                { key: 'Estado',     label: 'Estado',         width: 12 },
            ],
            filas: lista.map(c => ({
                NCheque:     c.numero_cheque,
                Cuenta:      `${c.cuenta_bancaria?.banco?.nombre ?? ''} — ${c.cuenta_bancaria?.numero_cuenta ?? ''}`,
                Beneficiario: c.beneficiario,
                FEmision:    formatFecha(c.fecha_emision),
                FCobro:      c.fecha_cobro ? formatFecha(c.fecha_cobro) : '',
                FCReal:      c.fecha_cobro_real ? formatFecha(c.fecha_cobro_real) : '',
                Monto:       c.monto,
                PostF:       c.es_postfechado ? 'Sí' : 'No',
                Estado:      c.estado,
            })),
            nombreArchivo: `Cheques_${empresa?.ruc ?? ''}`,
        })
    }

    return (
        <div className="space-y-5 max-w-7xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Cheques Emitidos</h1>
                    <p className="text-slate-500 text-sm mt-0.5">{lista.length} cheque{lista.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={imprimir} disabled={lista.length === 0} className="btn btn-secondary gap-2">
                    <Printer className="w-4 h-4" />Imprimir
                </button>
                <button onClick={exportarExcel} disabled={lista.length === 0} className="btn btn-secondary gap-2">
                    <Download className="w-4 h-4" />Excel
                </button>
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card p-4 flex flex-wrap gap-3">
                <div>
                    <label className="label">Cuenta</label>
                    <select className="input" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
                        <option value="">Todas</option>
                        {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label">Estado</label>
                    <select className="input" value={estado} onChange={e => setEstado(e.target.value)}>
                        <option value="">Todos</option>
                        <option value="emitido">Emitido</option>
                        <option value="cobrado">Cobrado</option>
                        <option value="anulado">Anulado</option>
                        <option value="en_transito">En tránsito</option>
                    </select>
                </div>
            </div>

            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                    <CheckSquare className="w-4 h-4" />Cheques ({lista.length})
                </div>
                {loading ? (
                    <div className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
                ) : lista.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>No hay cheques con los filtros seleccionados</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-4 text-left">N° Cheque</th>
                                    <th className="py-2 px-4 text-left">Cuenta</th>
                                    <th className="py-2 px-4 text-left">Beneficiario</th>
                                    <th className="py-2 px-4 text-left">F. Emisión</th>
                                    <th className="py-2 px-4 text-left">F. Cobro</th>
                                    <th className="py-2 px-4 text-right">Monto</th>
                                    <th className="py-2 px-4 text-center">Post-f.</th>
                                    <th className="py-2 px-4 text-center">Estado</th>
                                    <th className="py-2 px-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lista.map(c => (
                                    <tr key={c.id} className={cn('border-b border-slate-100 hover:bg-slate-50', c.estado === 'anulado' && 'opacity-50')}>
                                        <td className="py-2.5 px-4 font-mono text-xs font-bold">{c.numero_cheque}</td>
                                        <td className="py-2.5 px-4 text-xs text-slate-500">
                                            {c.cuenta_bancaria?.banco?.nombre}<br/>
                                            <span className="font-mono">{c.cuenta_bancaria?.numero_cuenta}</span>
                                        </td>
                                        <td className="py-2.5 px-4 text-sm">{c.beneficiario}</td>
                                        <td className="py-2.5 px-4 text-xs text-slate-500">{formatFecha(c.fecha_emision)}</td>
                                        <td className="py-2.5 px-4 text-xs text-slate-500">{c.fecha_cobro ? formatFecha(c.fecha_cobro) : '—'}</td>
                                        <td className="py-2.5 px-4 text-right font-semibold">{formatMoneda(c.monto)}</td>
                                        <td className="py-2.5 px-4 text-center">
                                            {c.es_postfechado ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Sí</span> : '—'}
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ESTADO_BADGE[c.estado] || 'bg-slate-100 text-slate-500')}>
                                                {c.estado}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                {c.estado === 'emitido' && (
                                                    <>
                                                        <button onClick={() => { setModalCobro(c); setFechaCobro(new Date().toISOString().slice(0, 10)) }}
                                                            className="text-xs text-green-600 hover:underline">Cobrado</button>
                                                        <button onClick={() => { setModalAnular(c); setNotaAnular('') }}
                                                            className="text-xs text-red-500 hover:underline">Anular</button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal cobro */}
            {modalCobro && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="font-bold text-green-700">Marcar cheque cobrado</h2>
                            <button onClick={() => setModalCobro(null)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <p className="text-sm text-slate-600">Cheque <strong>{modalCobro.numero_cheque}</strong> — {formatMoneda(modalCobro.monto)}</p>
                            <div>
                                <label className="label">Fecha de cobro real *</label>
                                <input className="input" type="date" value={fechaCobro} onChange={e => setFechaCobro(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalCobro(null)} className="btn btn-secondary">Cancelar</button>
                            <button onClick={marcarCobrado} disabled={anulando} className="btn btn-primary gap-2">
                                {anulando && <Loader2 className="w-4 h-4 animate-spin" />}Confirmar cobro
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal anular */}
            {modalAnular && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="font-bold text-red-700">Anular cheque {modalAnular.numero_cheque}</h2>
                            <button onClick={() => setModalAnular(null)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <div>
                                <label className="label">Motivo / Notas</label>
                                <textarea className="input resize-none" rows={3} value={notaAnular}
                                    onChange={e => setNotaAnular(e.target.value)} placeholder="Describe el motivo..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalAnular(null)} className="btn btn-secondary">Cancelar</button>
                            <button onClick={anularCheque} disabled={anulando} className="btn btn-danger gap-2">
                                {anulando && <Loader2 className="w-4 h-4 animate-spin" />}Anular cheque
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}





