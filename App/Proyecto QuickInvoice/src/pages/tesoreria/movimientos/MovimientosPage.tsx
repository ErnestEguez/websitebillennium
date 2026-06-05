import { useEffect, useState } from 'react'
import { Plus, ArrowDownUp, Loader2, AlertCircle, X, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAuth } from '../../../contexts/AuthContext'
import { movimientoService } from '../../../services/finance/movimientoService'
import { cuentasBancariasService } from '../../../services/finance/bancosService'
import { cn, formatMoneda, formatFecha } from '../../../lib/utils'
import { TIPO_MOVIMIENTO_LABELS } from '../../../types/finance'
import type { MovimientoBancario, CuentaBancaria, TipoMovimiento, SentidoMovimiento } from '../../../types/finance'

type FormMov = {
    cuenta_bancaria_id: string; tipo: TipoMovimiento; fecha: string
    monto: number; sentido: SentidoMovimiento; referencia: string; descripcion: string
}

export function MovimientosPage() {
    const { empresa, user } = useAuth()

    const hoy = new Date().toISOString().slice(0, 10)
    const ini = hoy.slice(0, 7) + '-01'

    const [lista, setLista]       = useState<MovimientoBancario[]>([])
    const [cuentas, setCuentas]   = useState<CuentaBancaria[]>([])
    const [loading, setLoading]   = useState(true)
    const [error, setError]       = useState('')
    const [modal, setModal]       = useState(false)
    const [saving, setSaving]     = useState(false)

    const [cuentaFiltro, setCuentaFiltro] = useState('')
    const [tipoFiltro, setTipoFiltro]     = useState('')
    const [desde, setDesde]               = useState(ini)
    const [hasta, setHasta]               = useState(hoy)

    const [form, setForm] = useState<FormMov>({
        cuenta_bancaria_id: '', tipo: 'deposito', fecha: hoy,
        monto: 0, sentido: 'credito', referencia: '', descripcion: '',
    })

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        cuentasBancariasService.listar(empresa.id)
            .then(c => setCuentas(c.filter(x => x.estado === 'activa')))
            .catch(() => {})
    }, [empresa?.id])

    useEffect(() => { if (empresa?.id) cargar() }, [empresa?.id, cuentaFiltro, tipoFiltro, desde, hasta])

    async function cargar() {
        if (!empresa?.id) return
        setLoading(true)
        try {
            setLista(await movimientoService.listar(empresa.id, {
                cuentaId: cuentaFiltro || undefined,
                tipo:     tipoFiltro || undefined,
                desde, hasta,
            }))
        } catch (e: unknown) { setError(String(e)) }
        finally { setLoading(false) }
    }

    // Cuando cambia tipo de movimiento, ajustar sentido por defecto
    function cambiarTipo(tipo: TipoMovimiento) {
        const sentidoPorDefecto: Record<TipoMovimiento, SentidoMovimiento> = {
            deposito: 'credito', nota_debito: 'debito', nota_credito: 'credito',
            comision: 'debito', interes: 'credito', cargo_automatico: 'debito',
            cheque: 'debito', transferencia: 'debito', otro: 'credito',
        }
        setForm(f => ({ ...f, tipo, sentido: sentidoPorDefecto[tipo] }))
    }

    async function guardar() {
        if (!form.cuenta_bancaria_id) { setError('Selecciona una cuenta bancaria'); return }
        if (form.monto <= 0)          { setError('El monto debe ser mayor a 0'); return }
        if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return }
        setSaving(true); setError('')
        try {
            await movimientoService.crear({
                empresa_id:        empresa!.id,
                cuenta_bancaria_id: form.cuenta_bancaria_id,
                tipo:              form.tipo,
                fecha:             form.fecha,
                monto:             form.monto,
                sentido:           form.sentido,
                referencia:        form.referencia || null,
                descripcion:       form.descripcion,
                estado:            'activo',
                conciliado:        false,
                conciliacion_id:   null,
                tiene_asiento:     false,
                comprobante_contable_id: null,
                origen:            'manual',
                origen_id:         null,
                created_by:        user?.id || null,
            })
            setModal(false)
            await cargar()
        } catch (e: unknown) { setError(String(e)) }
        finally { setSaving(false) }
    }

    async function anular(id: string) {
        if (!confirm('¿Anular este movimiento?')) return
        try {
            await movimientoService.anular(id)
            await cargar()
        } catch (e: unknown) { setError(String(e)) }
    }

    function exportarExcel() {
        const filas = lista.map(m => ({
            'Cuenta':       m.cuenta_bancaria?.banco?.nombre + ' — ' + m.cuenta_bancaria?.numero_cuenta,
            'Tipo':         TIPO_MOVIMIENTO_LABELS[m.tipo],
            'Fecha':        m.fecha,
            'Sentido':      m.sentido,
            'Monto':        m.monto,
            'Referencia':   m.referencia ?? '',
            'Descripción':  m.descripcion ?? '',
            'Estado':       m.estado,
            'Conciliado':   m.conciliado ? 'Sí' : 'No',
        }))
        const ws = XLSX.utils.json_to_sheet(filas)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Movimientos')
        XLSX.writeFile(wb, `Movimientos_${empresa?.ruc ?? ''}_${desde}_${hasta}.xlsx`)
    }

    const totalCredito = lista.filter(m => m.sentido === 'credito' && m.estado === 'activo').reduce((s, m) => s + m.monto, 0)
    const totalDebito  = lista.filter(m => m.sentido === 'debito'  && m.estado === 'activo').reduce((s, m) => s + m.monto, 0)

    return (
        <div className="space-y-5 max-w-7xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Movimientos Bancarios</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Depósitos, notas, comisiones y otros</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={exportarExcel} disabled={lista.length === 0} className="btn btn-secondary gap-2">
                        <Download className="w-4 h-4" />Excel
                    </button>
                    <button onClick={() => { setForm(f => ({ ...f, cuenta_bancaria_id: '', monto: 0, referencia: '', descripcion: '' })); setModal(true); setError('') }}
                        className="btn btn-primary gap-2">
                        <Plus className="w-4 h-4" />Nuevo movimiento
                    </button>
                </div>
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card p-4 flex flex-wrap gap-3 items-end">
                <div>
                    <label className="label">Desde</label>
                    <input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
                </div>
                <div>
                    <label className="label">Hasta</label>
                    <input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
                </div>
                <div>
                    <label className="label">Cuenta</label>
                    <select className="input" value={cuentaFiltro} onChange={e => setCuentaFiltro(e.target.value)}>
                        <option value="">Todas</option>
                        {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label">Tipo</label>
                    <select className="input" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
                        <option value="">Todos</option>
                        {(Object.entries(TIPO_MOVIMIENTO_LABELS) as [TipoMovimiento, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="card p-4">
                    <p className="text-xl font-bold text-green-600">{formatMoneda(totalCredito)}</p>
                    <p className="text-xs text-slate-500">Total créditos</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-red-600">{formatMoneda(totalDebito)}</p>
                    <p className="text-xs text-slate-500">Total débitos</p>
                </div>
                <div className="card p-4">
                    <p className={`text-xl font-bold ${totalCredito - totalDebito >= 0 ? 'text-primary-600' : 'text-red-600'}`}>
                        {formatMoneda(totalCredito - totalDebito)}
                    </p>
                    <p className="text-xs text-slate-500">Neto del período</p>
                </div>
            </div>

            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                    <ArrowDownUp className="w-4 h-4" />Movimientos ({lista.length})
                </div>
                {loading ? (
                    <div className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
                ) : lista.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <ArrowDownUp className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>No hay movimientos en el período</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-4 text-left">Cuenta</th>
                                    <th className="py-2 px-4 text-left">Tipo</th>
                                    <th className="py-2 px-4 text-left">Fecha</th>
                                    <th className="py-2 px-4 text-left">Descripción</th>
                                    <th className="py-2 px-4 text-left">Referencia</th>
                                    <th className="py-2 px-4 text-right">Débito</th>
                                    <th className="py-2 px-4 text-right">Crédito</th>
                                    <th className="py-2 px-4 text-center">Concil.</th>
                                    <th className="py-2 px-4 text-center">Estado</th>
                                    <th className="py-2 px-4 text-center">Acc.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lista.map(m => (
                                    <tr key={m.id} className={cn('border-b border-slate-100 hover:bg-slate-50', m.estado === 'anulado' && 'opacity-50')}>
                                        <td className="py-2.5 px-4 text-xs text-slate-500">
                                            {m.cuenta_bancaria?.banco?.nombre}<br/>
                                            <span className="font-mono">{m.cuenta_bancaria?.numero_cuenta}</span>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                                {TIPO_MOVIMIENTO_LABELS[m.tipo]}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-xs text-slate-500">{formatFecha(m.fecha)}</td>
                                        <td className="py-2.5 px-4 text-sm text-slate-700">{m.descripcion || '—'}</td>
                                        <td className="py-2.5 px-4 text-xs font-mono text-slate-400">{m.referencia || '—'}</td>
                                        <td className="py-2.5 px-4 text-right text-red-600 font-semibold">
                                            {m.sentido === 'debito' ? formatMoneda(m.monto) : '—'}
                                        </td>
                                        <td className="py-2.5 px-4 text-right text-green-600 font-semibold">
                                            {m.sentido === 'credito' ? formatMoneda(m.monto) : '—'}
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            {m.conciliado
                                                ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Sí</span>
                                                : <span className="text-xs text-slate-400">No</span>
                                            }
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                                                m.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            )}>{m.estado}</span>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            {m.estado === 'activo' && m.origen === 'manual' && (
                                                <button onClick={() => anular(m.id)}
                                                    className="text-xs text-red-500 hover:underline">Anular</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal nuevo movimiento */}
            {modal && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-4">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="font-bold text-slate-900">Nuevo Movimiento Bancario</h2>
                            <button onClick={() => setModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <p className="text-red-600 text-sm">{error}</p>}
                            <div>
                                <label className="label">Cuenta bancaria *</label>
                                <select className="input" value={form.cuenta_bancaria_id}
                                    onChange={e => setForm(f => ({ ...f, cuenta_bancaria_id: e.target.value }))}>
                                    <option value="">Seleccionar...</option>
                                    {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Tipo *</label>
                                    <select className="input" value={form.tipo}
                                        onChange={e => cambiarTipo(e.target.value as TipoMovimiento)}>
                                        {(Object.entries(TIPO_MOVIMIENTO_LABELS) as [TipoMovimiento, string][]).map(([k, v]) => (
                                            <option key={k} value={k}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Sentido *</label>
                                    <select className="input" value={form.sentido}
                                        onChange={e => setForm(f => ({ ...f, sentido: e.target.value as SentidoMovimiento }))}>
                                        <option value="credito">Crédito (+)</option>
                                        <option value="debito">Débito (−)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Monto *</label>
                                    <input className="input text-right" type="number" step="0.01"
                                        value={form.monto} onChange={e => setForm(f => ({ ...f, monto: parseFloat(e.target.value) || 0 }))} />
                                </div>
                                <div>
                                    <label className="label">Fecha *</label>
                                    <input className="input" type="date" value={form.fecha}
                                        onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                                </div>
                            </div>
                            <div>
                                <label className="label">Descripción *</label>
                                <input className="input" value={form.descripcion}
                                    onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                            </div>
                            <div>
                                <label className="label">Referencia</label>
                                <input className="input font-mono" value={form.referencia}
                                    onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModal(false)} className="btn btn-secondary">Cancelar</button>
                            <button onClick={guardar} disabled={saving} className="btn btn-primary gap-2">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}Registrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}





