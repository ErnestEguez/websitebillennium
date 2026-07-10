import { useEffect, useState } from 'react'
import { HelpButton } from '../../../components/help/HelpButton'
import { CheckSquare, Loader2, AlertCircle, X, Download, Clock, Printer } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { chequeService } from '../../../services/finance/chequeService'
import { exportarExcelProfesional } from '../../../lib/excelUtils'
import { imprimirReporte, generarTablaHtml } from '../../../lib/printUtils'
import { formatMoneda, formatFecha } from '../../../lib/utils'
import type { Cheque } from '../../../types/finance'

export function ChequesAFechaPage() {
    const { empresa } = useAuth()

    const [lista, setLista]       = useState<Cheque[]>([])
    const [loading, setLoading]   = useState(true)
    const [error, setError]       = useState('')
    const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())

    const [modalCobro, setModalCobro] = useState<Cheque | null>(null)
    const [fechaCobro, setFechaCobro] = useState(new Date().toISOString().slice(0, 10))
    const [guardando, setGuardando]   = useState(false)

    const hoy = new Date().toISOString().slice(0, 10)

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        chequeService.listar(empresa.id, { soloPostfechados: true })
            .then(c => setLista(c))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [empresa?.id])

    async function marcarCobrado(cheque: Cheque) {
        if (!empresa?.id) return
        setGuardando(true)
        try {
            await chequeService.marcarCobrado(cheque.id, fechaCobro, empresa.id)
            setLista(prev => prev.filter(c => c.id !== cheque.id))
            setModalCobro(null)
        } catch (e: unknown) { setError(String(e)) }
        finally { setGuardando(false) }
    }

    const vencidos = lista.filter(c => c.fecha_cobro && c.fecha_cobro <= hoy)
    const futuros  = lista.filter(c => !c.fecha_cobro || c.fecha_cobro > hoy)

    function imprimir() {
        const cols = [
            { label: 'N° Cheque',    key: 'num',  width: '13%' },
            { label: 'Cuenta',       key: 'cta',  width: '22%' },
            { label: 'Beneficiario', key: 'ben',  width: '22%' },
            { label: 'F. Cobro',     key: 'fcob', width: '12%' },
            { label: 'Monto',        key: 'monto', align: 'right' as const, width: '12%' },
            { label: 'Vencido',      key: 'venc', align: 'center' as const, width: '8%' },
        ]
        const toFila = (c: Cheque) => ({
            num:   c.numero_cheque,
            cta:   `${c.cuenta_bancaria?.banco?.nombre ?? ''} ${c.cuenta_bancaria?.numero_cuenta ?? ''}`,
            ben:   c.beneficiario,
            fcob:  c.fecha_cobro ? formatFecha(c.fecha_cobro) : '—',
            monto: formatMoneda(c.monto),
            venc:  c.fecha_cobro && c.fecha_cobro <= hoy ? 'SÍ' : 'No',
        })
        const htmlVenc  = vencidos.length  ? generarTablaHtml(cols, vencidos.map(toFila),  { num: `${vencidos.length} cheques`,  monto: formatMoneda(vencidos.reduce((s,c)=>s+c.monto,0))  }) : '<p style="color:#888;font-size:10px">Sin vencidos</p>'
        const htmlFutur = futuros.length   ? generarTablaHtml(cols, futuros.map(toFila),   { num: `${futuros.length} cheques`,   monto: formatMoneda(futuros.reduce((s,c)=>s+c.monto,0))   }) : ''
        imprimirReporte({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Cheques Post-fechados Pendientes',
            html:    htmlVenc,
            subtablas: futuros.length ? [{ titulo: 'Próximos vencimientos', html: htmlFutur }] : undefined,
        })
    }

    function exportarExcel() {
        exportarExcelProfesional({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Cheques Post-fechados Pendientes',
            columnas: [
                { key: 'NCheque',    label: 'N° Cheque',    width: 14 },
                { key: 'Cuenta',     label: 'Cuenta',       width: 28 },
                { key: 'Beneficiario', label: 'Beneficiario', width: 28 },
                { key: 'FEmision',   label: 'F. Emisión',   width: 13 },
                { key: 'FCobro',     label: 'F. Cobro',     width: 13 },
                { key: 'Monto',      label: 'Monto',        width: 12 },
                { key: 'Vencido',    label: 'Vencido',      width: 10 },
            ],
            filas: lista.map(c => ({
                NCheque:     c.numero_cheque,
                Cuenta:      `${c.cuenta_bancaria?.banco?.nombre ?? ''} — ${c.cuenta_bancaria?.numero_cuenta ?? ''}`,
                Beneficiario: c.beneficiario,
                FEmision:    formatFecha(c.fecha_emision),
                FCobro:      c.fecha_cobro ? formatFecha(c.fecha_cobro) : '',
                Monto:       c.monto,
                Vencido:     c.fecha_cobro && c.fecha_cobro <= hoy ? 'Sí' : 'No',
            })),
            nombreArchivo: `ChequesAFecha_${empresa?.ruc ?? ''}`,
        })
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Cheques a Fecha</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Post-fechados pendientes de cobro</p>
                </div>
                <div className="flex gap-2">
                    <HelpButton pageKey="cheques-a-fecha" />
                    <button onClick={imprimir} disabled={lista.length === 0} className="btn btn-secondary gap-2">
                        <Printer className="w-4 h-4" />Imprimir
                    </button>
                    <button onClick={exportarExcel} disabled={lista.length === 0} className="btn btn-secondary gap-2">
                        <Download className="w-4 h-4" />Excel
                    </button>
                </div>
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card p-4">
                    <p className="text-xl font-bold text-slate-900">{lista.length}</p>
                    <p className="text-xs text-slate-500">Total pendientes</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-red-600">{vencidos.length}</p>
                    <p className="text-xs text-slate-500">Vencidos hoy o antes</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-primary-600">{formatMoneda(lista.reduce((s, c) => s + c.monto, 0))}</p>
                    <p className="text-xs text-slate-500">Total pendiente</p>
                </div>
            </div>

            {loading ? (
                <div className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
            ) : lista.length === 0 ? (
                <div className="card py-12 text-center text-slate-400">
                    <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p>No hay cheques post-fechados pendientes</p>
                </div>
            ) : (
                <>
                    {vencidos.length > 0 && (
                        <div className="card overflow-hidden">
                            <div className="bg-red-600 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                                <Clock className="w-4 h-4" />Vencidos ({vencidos.length})
                            </div>
                            <ChequesTable items={vencidos} onCobrar={c => { setModalCobro(c); setFechaCobro(hoy) }}
                                seleccionados={seleccionados} onToggle={id => setSeleccionados(prev => {
                                    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
                                })} />
                        </div>
                    )}
                    {futuros.length > 0 && (
                        <div className="card overflow-hidden">
                            <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                                <CheckSquare className="w-4 h-4" />Próximos vencimientos ({futuros.length})
                            </div>
                            <ChequesTable items={futuros} onCobrar={c => { setModalCobro(c); setFechaCobro(hoy) }}
                                seleccionados={seleccionados} onToggle={id => setSeleccionados(prev => {
                                    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
                                })} />
                        </div>
                    )}
                </>
            )}

            {modalCobro && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="font-bold text-green-700">Registrar cobro de cheque</h2>
                            <button onClick={() => setModalCobro(null)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <p className="text-sm text-slate-600">Cheque <strong>{modalCobro.numero_cheque}</strong></p>
                            <p className="text-sm text-slate-600">Beneficiario: <strong>{modalCobro.beneficiario}</strong></p>
                            <p className="text-lg font-bold text-primary-700">{formatMoneda(modalCobro.monto)}</p>
                            <div>
                                <label className="label">Fecha de cobro real *</label>
                                <input className="input" type="date" value={fechaCobro} onChange={e => setFechaCobro(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalCobro(null)} className="btn btn-secondary">Cancelar</button>
                            <button onClick={() => marcarCobrado(modalCobro)} disabled={guardando} className="btn btn-primary gap-2">
                                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}Confirmar cobro
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function ChequesTable({ items, onCobrar, seleccionados, onToggle }: {
    items: Cheque[]
    onCobrar: (c: Cheque) => void
    seleccionados: Set<string>
    onToggle: (id: string) => void
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                        <th className="py-2 px-4 w-8"></th>
                        <th className="py-2 px-4 text-left">N° Cheque</th>
                        <th className="py-2 px-4 text-left">Beneficiario</th>
                        <th className="py-2 px-4 text-left">F. Cobro Pactada</th>
                        <th className="py-2 px-4 text-right">Monto</th>
                        <th className="py-2 px-4 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(c => (
                        <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2.5 px-4">
                                <input type="checkbox" className="w-4 h-4 accent-primary-600"
                                    checked={seleccionados.has(c.id)} onChange={() => onToggle(c.id)} />
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs font-bold">{c.numero_cheque}</td>
                            <td className="py-2.5 px-4 text-sm">{c.beneficiario}</td>
                            <td className="py-2.5 px-4 text-xs font-semibold text-amber-700">
                                {c.fecha_cobro ? formatFecha(c.fecha_cobro) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold">{formatMoneda(c.monto)}</td>
                            <td className="py-2.5 px-4 text-center">
                                <button onClick={() => onCobrar(c)}
                                    className="text-xs text-green-600 hover:text-green-800 hover:underline font-semibold">
                                    Marcar cobrado
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}





