import { useEffect, useState } from 'react'
import { Plus, Pencil, Loader2, X, AlertCircle, CreditCard } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { bancosService, cuentasBancariasService } from '../../services/bancosService'
import { cn, formatMoneda } from '../../lib/utils'
import type { Banco, CuentaBancaria } from '../../types/finance'

type FormCuenta = Omit<CuentaBancaria, 'id' | 'created_at' | 'updated_at' | 'banco' | 'saldo_actual'>

function emptyForm(empresaId: string): FormCuenta {
    return {
        empresa_id: empresaId, banco_id: '', numero_cuenta: '', tipo: 'corriente',
        moneda: 'USD', descripcion: '', estado: 'activa', saldo_inicial: 0,
        fecha_apertura: '', cuenta_contable_id: null, participa_conciliacion: true,
    }
}

export function CuentasBancariasPage() {
    const { empresa } = useAuth()

    const [lista, setLista]     = useState<CuentaBancaria[]>([])
    const [bancos, setBancos]   = useState<Banco[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState('')
    const [modal, setModal]     = useState(false)
    const [editId, setEditId]   = useState<string | null>(null)
    const [form, setForm]       = useState<FormCuenta>(emptyForm(''))
    const [saving, setSaving]   = useState(false)

    // Bancos es catálogo global — carga sin depender de empresa
    useEffect(() => {
        bancosService.listar()
            .then(b => setBancos(b.filter(x => x.activo)))
            .catch(() => {})
    }, [])

    // Cuentas bancarias dependen de empresa
    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        cuentasBancariasService.listar(empresa.id)
            .then(setLista)
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [empresa?.id])

    async function cargar() {
        if (!empresa?.id) return
        setLista(await cuentasBancariasService.listar(empresa.id))
    }

    function abrirNuevo() {
        setEditId(null); setForm(emptyForm(empresa?.id ?? '')); setModal(true); setError('')
    }

    function abrirEditar(c: CuentaBancaria) {
        setEditId(c.id)
        setForm({
            empresa_id: c.empresa_id, banco_id: c.banco_id, numero_cuenta: c.numero_cuenta,
            tipo: c.tipo, moneda: c.moneda, descripcion: c.descripcion ?? '',
            estado: c.estado, saldo_inicial: c.saldo_inicial,
            fecha_apertura: c.fecha_apertura ?? '', cuenta_contable_id: c.cuenta_contable_id,
            participa_conciliacion: c.participa_conciliacion,
        })
        setModal(true); setError('')
    }

    async function guardar() {
        if (!form.banco_id)       { setError('Selecciona un banco'); return }
        if (!form.numero_cuenta)  { setError('El número de cuenta es obligatorio'); return }
        setSaving(true); setError('')
        try {
            const payload = { ...form, fecha_apertura: form.fecha_apertura || null }
            if (editId) await cuentasBancariasService.actualizar(editId, payload)
            else        await cuentasBancariasService.crear(payload)
            setModal(false)
            await cargar()
        } catch (e: unknown) { setError(String(e)) }
        finally { setSaving(false) }
    }

    const activas = lista.filter(c => c.estado === 'activa').length

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Cuentas Bancarias</h1>
                    <p className="text-slate-500 text-sm mt-0.5">{activas} activa{activas !== 1 ? 's' : ''} de {lista.length} total</p>
                </div>
                <button onClick={abrirNuevo} className="btn btn-primary gap-2">
                    <Plus className="w-4 h-4" />Nueva cuenta
                </button>
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />Cuentas bancarias
                </div>
                {loading ? (
                    <div className="py-12 text-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                    </div>
                ) : lista.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>No hay cuentas bancarias</p>
                        <button onClick={abrirNuevo} className="mt-3 btn btn-primary text-xs gap-1.5">
                            <Plus className="w-3.5 h-3.5" />Nueva cuenta
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-4 text-left">Banco</th>
                                    <th className="py-2 px-4 text-left">Número de cuenta</th>
                                    <th className="py-2 px-4 text-left">Tipo</th>
                                    <th className="py-2 px-4 text-right">Saldo inicial</th>
                                    <th className="py-2 px-4 text-center">Conciliación</th>
                                    <th className="py-2 px-4 text-center">Estado</th>
                                    <th className="py-2 px-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lista.map(c => (
                                    <tr key={c.id} className={cn('border-b border-slate-100 hover:bg-slate-50', c.estado !== 'activa' && 'opacity-50')}>
                                        <td className="py-2.5 px-4 font-semibold text-slate-800">{c.banco?.nombre}</td>
                                        <td className="py-2.5 px-4 font-mono text-xs">{c.numero_cuenta}</td>
                                        <td className="py-2.5 px-4">
                                            <span className="text-xs capitalize bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{c.tipo}</span>
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-semibold">{formatMoneda(c.saldo_inicial)}</td>
                                        <td className="py-2.5 px-4 text-center">
                                            {c.participa_conciliacion
                                                ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Sí</span>
                                                : <span className="text-xs text-slate-400">No</span>
                                            }
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                                                c.estado === 'activa'   ? 'bg-green-100 text-green-700' :
                                                c.estado === 'bloqueada'? 'bg-amber-100 text-amber-700' :
                                                                          'bg-slate-100 text-slate-500'
                                            )}>{c.estado}</span>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <button onClick={() => abrirEditar(c)}
                                                className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modal && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
                        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
                            <h2 className="font-bold text-slate-900">{editId ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}</h2>
                            <button onClick={() => setModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <p className="text-red-600 text-sm">{error}</p>}
                            <div>
                                <label className="label">Banco *</label>
                                <select className="input" value={form.banco_id} onChange={e => setForm(f => ({ ...f, banco_id: e.target.value }))}>
                                    <option value="">Seleccionar banco...</option>
                                    {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Número de cuenta *</label>
                                    <input className="input font-mono" value={form.numero_cuenta} onChange={e => setForm(f => ({ ...f, numero_cuenta: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="label">Tipo</label>
                                    <select className="input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'corriente' | 'ahorros' }))}>
                                        <option value="corriente">Corriente</option>
                                        <option value="ahorros">Ahorros</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Saldo inicial</label>
                                    <input className="input text-right" type="number" step="0.01" value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: parseFloat(e.target.value) || 0 }))} />
                                </div>
                                <div>
                                    <label className="label">Fecha apertura</label>
                                    <input className="input" type="date" value={form.fecha_apertura ?? ''} onChange={e => setForm(f => ({ ...f, fecha_apertura: e.target.value }))} />
                                </div>
                            </div>
                            <div>
                                <label className="label">Descripción</label>
                                <input className="input" value={form.descripcion ?? ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Estado</label>
                                    <select className="input" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as 'activa' | 'bloqueada' | 'cerrada' }))}>
                                        <option value="activa">Activa</option>
                                        <option value="bloqueada">Bloqueada</option>
                                        <option value="cerrada">Cerrada</option>
                                    </select>
                                </div>
                                <div className="flex items-end pb-0.5">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" className="w-4 h-4 accent-primary-600"
                                            checked={form.participa_conciliacion}
                                            onChange={e => setForm(f => ({ ...f, participa_conciliacion: e.target.checked }))} />
                                        <span className="text-sm text-slate-700">Participa en conciliación</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModal(false)} className="btn btn-secondary">Cancelar</button>
                            <button onClick={guardar} disabled={saving} className="btn btn-primary gap-2">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editId ? 'Guardar cambios' : 'Crear cuenta'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
