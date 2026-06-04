import { useEffect, useState } from 'react'
import { Plus, ArrowRightLeft, Loader2, AlertCircle, X, Download, Printer } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { exportarExcelProfesional } from '../../lib/excelUtils'
import { imprimirReporte, generarTablaHtml } from '../../lib/printUtils'
import { anticipoService } from '../../services/anticipoService'
import { cuentasBancariasService, proveedoresService } from '../../services/bancosService'
import { cn, formatMoneda, formatFecha } from '../../lib/utils'
import type { AnticipoProveedor, Proveedor, CuentaBancaria, TipoBeneficiario } from '../../types/finance'

const ESTADO_BADGE: Record<string, string> = {
    disponible:      'bg-green-100 text-green-700',
    aplicado_parcial:'bg-blue-100 text-blue-700',
    aplicado_total:  'bg-slate-100 text-slate-500',
    anulado:         'bg-red-100 text-red-700',
}

const TIPO_BENEFICIARIO_LABELS: Record<TipoBeneficiario, string> = {
    proveedor: 'Proveedor',
    empleado:  'Empleado',
    otro:      'Otro',
}

type FormAnticipo = {
    tipo_beneficiario: TipoBeneficiario
    proveedor_id: string
    beneficiario_libre: string
    cuenta_bancaria_id: string
    forma_pago: 'transferencia' | 'cheque'
    monto: number
    fecha: string
    referencia: string
    concepto: string
}

function nombreBeneficiario(a: AnticipoProveedor): string {
    if (a.tipo_beneficiario !== 'proveedor' && a.beneficiario_libre) return a.beneficiario_libre
    return (a as AnticipoProveedor & { proveedor?: { nombre_empresa: string } }).proveedor?.nombre_empresa ?? a.beneficiario_libre ?? '—'
}

export function AnticiposPage() {
    const { empresa, user } = useAuth()

    const [lista, setLista]         = useState<AnticipoProveedor[]>([])
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [cuentas, setCuentas]     = useState<CuentaBancaria[]>([])
    const [loading, setLoading]     = useState(true)
    const [error, setError]         = useState('')
    const [modal, setModal]         = useState(false)
    const [saving, setSaving]       = useState(false)

    const hoy = new Date().toISOString().slice(0, 10)

    const [form, setForm] = useState<FormAnticipo>({
        tipo_beneficiario: 'proveedor',
        proveedor_id: '', beneficiario_libre: '',
        cuenta_bancaria_id: '', forma_pago: 'transferencia',
        monto: 0, fecha: hoy, referencia: '', concepto: '',
    })

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        Promise.all([
            anticipoService.listar(empresa.id),
            proveedoresService.listar(empresa.id),
            cuentasBancariasService.listar(empresa.id),
        ]).then(([a, p, c]) => {
            setProveedores(p)
            setCuentas(c.filter(x => x.estado === 'activa'))
            setLista(enriquecerConProveedor(a, p))
        }).catch(() => {}).finally(() => setLoading(false))
    }, [empresa?.id])

    async function cargar() {
        if (!empresa?.id) return
        const [a] = await Promise.all([anticipoService.listar(empresa.id)])
        setLista(enriquecerConProveedor(a, proveedores))
    }

    function enriquecerConProveedor(lista: AnticipoProveedor[], provs: Proveedor[]): AnticipoProveedor[] {
        return lista.map(item => ({
            ...item,
            proveedor: item.proveedor_id
                ? { nombre_empresa: provs.find(p => p.id === item.proveedor_id)?.nombre_empresa ?? '—', ruc: provs.find(p => p.id === item.proveedor_id)?.ruc ?? '' }
                : undefined,
        }))
    }

    async function guardar() {
        if (form.tipo_beneficiario === 'proveedor' && !form.proveedor_id) {
            setError('Selecciona un proveedor'); return
        }
        if (form.tipo_beneficiario !== 'proveedor' && !form.beneficiario_libre.trim()) {
            setError('Ingresa el nombre del beneficiario'); return
        }
        if (form.monto <= 0) { setError('El monto debe ser mayor a 0'); return }
        setSaving(true); setError('')
        try {
            await anticipoService.crear({
                empresa_id:         empresa!.id,
                proveedor_id:       form.tipo_beneficiario === 'proveedor' ? form.proveedor_id : null,
                beneficiario_libre: form.tipo_beneficiario !== 'proveedor' ? form.beneficiario_libre.trim() : null,
                tipo_beneficiario:  form.tipo_beneficiario,
                cuenta_bancaria_id: form.cuenta_bancaria_id || null,
                forma_pago:         form.forma_pago,
                monto:              form.monto,
                fecha:              form.fecha,
                referencia:         form.referencia || null,
                concepto:           form.concepto || null,
                tiene_asiento:      false,
                comprobante_contable_id: null,
                created_by:         user?.id || null,
            })
            setModal(false)
            await cargar()
        } catch (e: unknown) { setError(String(e)) }
        finally { setSaving(false) }
    }

    async function anular(id: string) {
        if (!confirm('¿Anular este registro?')) return
        try {
            await anticipoService.anular(id)
            await cargar()
        } catch (e: unknown) { setError(String(e)) }
    }

    function abrirModal() {
        setForm({
            tipo_beneficiario: 'proveedor', proveedor_id: '', beneficiario_libre: '',
            cuenta_bancaria_id: '', forma_pago: 'transferencia',
            monto: 0, fecha: hoy, referencia: '', concepto: '',
        })
        setError('')
        setModal(true)
    }

    function imprimir() {
        const totalMonto = lista.reduce((s, a) => s + a.monto, 0)
        const totalDisp  = lista.reduce((s, a) => s + (a.monto - a.monto_aplicado), 0)
        const html = generarTablaHtml(
            [
                { label: 'Beneficiario', key: 'ben',   width: '26%' },
                { label: 'Tipo',         key: 'tipo',  width: '12%' },
                { label: 'Forma Pago',   key: 'fp',    width: '13%' },
                { label: 'Fecha',        key: 'fecha', width: '10%' },
                { label: 'Monto',        key: 'monto', align: 'right', width: '12%' },
                { label: 'Aplicado',     key: 'aplic', align: 'right', width: '12%' },
                { label: 'Disponible',   key: 'disp',  align: 'right', width: '12%' },
            ],
            lista.map(a => ({
                ben:   nombreBeneficiario(a),
                tipo:  TIPO_BENEFICIARIO_LABELS[a.tipo_beneficiario] ?? a.tipo_beneficiario,
                fp:    a.forma_pago,
                fecha: formatFecha(a.fecha),
                monto: formatMoneda(a.monto),
                aplic: formatMoneda(a.monto_aplicado),
                disp:  formatMoneda(a.monto - a.monto_aplicado),
            })),
            { ben: `${lista.length} registros`, monto: formatMoneda(totalMonto), disp: formatMoneda(totalDisp) }
        )
        imprimirReporte({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Cheques / Transferencias Varios',
            html,
        })
    }

    function exportarExcel() {
        exportarExcelProfesional({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Cheques / Transferencias Varios',
            columnas: [
                { key: 'Beneficiario', label: 'Beneficiario', width: 30 },
                { key: 'Tipo',         label: 'Tipo',         width: 14 },
                { key: 'FormaPago',    label: 'Forma Pago',   width: 16 },
                { key: 'Fecha',        label: 'Fecha',        width: 12 },
                { key: 'Monto',        label: 'Monto',        width: 12 },
                { key: 'Aplicado',     label: 'Aplicado',     width: 12 },
                { key: 'Disponible',   label: 'Disponible',   width: 12 },
                { key: 'Estado',       label: 'Estado',       width: 16 },
            ],
            filas: lista.map(a => ({
                Beneficiario: nombreBeneficiario(a),
                Tipo:         TIPO_BENEFICIARIO_LABELS[a.tipo_beneficiario] ?? a.tipo_beneficiario,
                FormaPago:    a.forma_pago,
                Fecha:        formatFecha(a.fecha),
                Monto:        a.monto,
                Aplicado:     a.monto_aplicado,
                Disponible:   a.monto - a.monto_aplicado,
                Estado:       a.estado.replace('_', ' '),
            })),
            nombreArchivo: `ChequesTransf_${empresa?.ruc ?? ''}`,
        })
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Cheques / Transf. Varios</h1>
                    <p className="text-slate-500 text-sm mt-0.5">{lista.filter(a => a.estado === 'disponible' || a.estado === 'aplicado_parcial').length} disponibles</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={imprimir} disabled={lista.length === 0} className="btn btn-secondary gap-2">
                        <Printer className="w-4 h-4" />Imprimir
                    </button>
                    <button onClick={exportarExcel} disabled={lista.length === 0} className="btn btn-secondary gap-2">
                        <Download className="w-4 h-4" />Excel
                    </button>
                    <button onClick={abrirModal} className="btn btn-primary gap-2">
                        <Plus className="w-4 h-4" />Nuevo registro
                    </button>
                </div>
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4" />Registros ({lista.length})
                </div>
                {loading ? (
                    <div className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
                ) : lista.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <ArrowRightLeft className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>No hay registros</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-4 text-left">Beneficiario</th>
                                    <th className="py-2 px-4 text-left">Tipo</th>
                                    <th className="py-2 px-4 text-left">Fecha</th>
                                    <th className="py-2 px-4 text-left">Forma pago</th>
                                    <th className="py-2 px-4 text-right">Monto</th>
                                    <th className="py-2 px-4 text-right">Aplicado</th>
                                    <th className="py-2 px-4 text-right">Disponible</th>
                                    <th className="py-2 px-4 text-center">Estado</th>
                                    <th className="py-2 px-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lista.map(a => (
                                    <tr key={a.id} className={cn('border-b border-slate-100 hover:bg-slate-50', a.estado === 'anulado' && 'opacity-50')}>
                                        <td className="py-2.5 px-4 font-semibold text-slate-800">{nombreBeneficiario(a)}</td>
                                        <td className="py-2.5 px-4">
                                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                                {TIPO_BENEFICIARIO_LABELS[a.tipo_beneficiario] ?? a.tipo_beneficiario}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-xs text-slate-500">{formatFecha(a.fecha)}</td>
                                        <td className="py-2.5 px-4">
                                            <span className="text-xs capitalize bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{a.forma_pago}</span>
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-semibold">{formatMoneda(a.monto)}</td>
                                        <td className="py-2.5 px-4 text-right text-slate-500">{formatMoneda(a.monto_aplicado)}</td>
                                        <td className="py-2.5 px-4 text-right font-bold text-primary-700">{formatMoneda(a.monto - a.monto_aplicado)}</td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ESTADO_BADGE[a.estado] || 'bg-slate-100 text-slate-500')}>
                                                {a.estado.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            {['disponible', 'aplicado_parcial'].includes(a.estado) && (
                                                <button onClick={() => anular(a.id)}
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

            {/* Modal nuevo registro */}
            {modal && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="font-bold text-slate-900">Nuevo Cheque / Transferencia</h2>
                            <button onClick={() => setModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <p className="text-red-600 text-sm">{error}</p>}

                            {/* Tipo de beneficiario */}
                            <div>
                                <label className="label">Tipo de beneficiario *</label>
                                <div className="flex gap-3">
                                    {(['proveedor', 'empleado', 'otro'] as TipoBeneficiario[]).map(t => (
                                        <label key={t} className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" className="accent-primary-600"
                                                checked={form.tipo_beneficiario === t}
                                                onChange={() => setForm(f => ({ ...f, tipo_beneficiario: t, proveedor_id: '', beneficiario_libre: '' }))} />
                                            <span className="text-sm text-slate-700">{TIPO_BENEFICIARIO_LABELS[t]}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Proveedor o beneficiario libre */}
                            {form.tipo_beneficiario === 'proveedor' ? (
                                <div>
                                    <label className="label">Proveedor *</label>
                                    <select className="input" value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}>
                                        <option value="">Seleccionar...</option>
                                        {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre_empresa}</option>)}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <label className="label">
                                        {form.tipo_beneficiario === 'empleado' ? 'Nombre del empleado *' : 'Beneficiario *'}
                                    </label>
                                    <input className="input" value={form.beneficiario_libre}
                                        onChange={e => setForm(f => ({ ...f, beneficiario_libre: e.target.value }))}
                                        placeholder={form.tipo_beneficiario === 'empleado' ? 'Nombre completo' : 'Nombre o descripción'} />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Monto *</label>
                                    <input className="input text-right" type="number" step="0.01"
                                        value={form.monto} onChange={e => setForm(f => ({ ...f, monto: parseFloat(e.target.value) || 0 }))} />
                                </div>
                                <div>
                                    <label className="label">Fecha *</label>
                                    <input className="input" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                                </div>
                            </div>
                            <div>
                                <label className="label">Forma de pago</label>
                                <select className="input" value={form.forma_pago} onChange={e => setForm(f => ({ ...f, forma_pago: e.target.value as 'transferencia' | 'cheque' }))}>
                                    <option value="transferencia">Transferencia</option>
                                    <option value="cheque">Cheque</option>
                                </select>
                            </div>
                            <div>
                                <label className="label">Cuenta bancaria</label>
                                <select className="input" value={form.cuenta_bancaria_id} onChange={e => setForm(f => ({ ...f, cuenta_bancaria_id: e.target.value }))}>
                                    <option value="">Ninguna</option>
                                    {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">Referencia</label>
                                <input className="input font-mono" value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} />
                            </div>
                            <div>
                                <label className="label">Concepto</label>
                                <input className="input" value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} />
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
