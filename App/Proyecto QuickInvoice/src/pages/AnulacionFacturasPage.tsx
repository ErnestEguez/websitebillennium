import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import {
    Search, AlertTriangle, CheckCircle2, Copy, Check,
    ChevronDown, ChevronUp, Trash2, FileX,
} from 'lucide-react'

interface Factura {
    id: string
    secuencial: string
    created_at: string
    total: number
    estado_sri: string
    estado_sistema: string
    fecha_anulacion: string | null
    motivo_anulacion: string | null
    clave_acceso: string | null
    autorizacion_numero: string | null
    clientes: { nombre: string; identificacion: string } | null
    // cartera (puede no existir si fue contado)
    cartera?: {
        id: string
        saldo: number
        estado: string
        pagos: { id: string; fecha_pago: string; valor: number; metodo_pago: string; referencia: string | null }[]
    } | null
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    function copy() {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }
    return (
        <button
            onClick={copy}
            className="ml-1.5 p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
            title="Copiar"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    )
}

export function AnulacionFacturasPage() {
    const { empresa } = useAuth()
    const [facturas, setFacturas]       = useState<Factura[]>([])
    const [loading, setLoading]         = useState(false)
    const [busqueda, setBusqueda]       = useState('')
    const [filtro, setFiltro]           = useState<'VIGENTE' | 'ANULADA' | 'todas'>('VIGENTE')
    const [expandedId, setExpandedId]   = useState<string | null>(null)

    // Modal anulación
    const [anulandoId, setAnulandoId]   = useState<string | null>(null)
    const [motivo, setMotivo]           = useState('')
    const [savingAnul, setSavingAnul]   = useState(false)

    // Revertir pago
    const [revirtiendoPago, setRevirtiendoPago] = useState<string | null>(null)

    useEffect(() => {
        if (empresa?.id) cargar()
    }, [empresa?.id, filtro])

    async function cargar() {
        if (!empresa?.id) return
        setLoading(true)
        try {
            let query = supabase
                .from('comprobantes')
                .select(`
                    id, secuencial, created_at, total,
                    estado_sri, estado_sistema, fecha_anulacion, motivo_anulacion,
                    clave_acceso, autorizacion_numero,
                    clientes (nombre, identificacion)
                `)
                .eq('empresa_id', empresa.id)
                .eq('tipo_comprobante', 'FACTURA')
                .order('created_at', { ascending: false })

            if (filtro !== 'todas') {
                query = query.eq('estado_sistema', filtro)
            }

            const { data, error } = await query
            if (error) throw error

            // Para cada factura, cargar cartera + pagos separado
            const ids = (data || []).map((f: any) => f.id)
            let carteraMap: Record<string, any> = {}

            if (ids.length > 0) {
                const { data: carteras } = await supabase
                    .from('cartera_cxc')
                    .select('id, comprobante_id, saldo, estado')
                    .in('comprobante_id', ids)

                const carteraIds = (carteras || []).map(c => c.id)
                let pagosMap: Record<string, any[]> = {}

                if (carteraIds.length > 0) {
                    const { data: pagos } = await supabase
                        .from('cartera_cxc_pagos')
                        .select('id, cartera_id, fecha_pago, valor, metodo_pago, referencia')
                        .in('cartera_id', carteraIds)
                        .order('fecha_pago', { ascending: false })

                    for (const p of pagos || []) {
                        if (!pagosMap[p.cartera_id]) pagosMap[p.cartera_id] = []
                        pagosMap[p.cartera_id].push(p)
                    }
                }

                for (const c of carteras || []) {
                    carteraMap[c.comprobante_id] = { ...c, pagos: pagosMap[c.id] || [] }
                }
            }

            const result: Factura[] = (data || []).map((f: any) => ({
                ...f,
                clientes: f.clientes,
                cartera: carteraMap[f.id] || null,
            }))

            setFacturas(result)
        } catch (e: any) {
            alert('Error cargando facturas: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    async function revertirPago(pagoId: string, _carteraId: string) {
        if (!confirm('¿Revertir este pago? El saldo de la cartera se recalculará.')) return
        setRevirtiendoPago(pagoId)
        try {
            const { error } = await supabase
                .from('cartera_cxc_pagos')
                .delete()
                .eq('id', pagoId)
            if (error) throw error
            await cargar()
        } catch (e: any) {
            alert('Error al revertir pago: ' + e.message)
        } finally {
            setRevirtiendoPago(null)
        }
    }

    async function anularFactura() {
        if (!anulandoId || !motivo.trim()) { alert('El motivo es obligatorio'); return }
        const f = facturas.find(f => f.id === anulandoId)
        if (!f) return

        // Verificar que no tenga pagos pendientes en cartera
        if (f.cartera && f.cartera.pagos.length > 0) {
            alert('Debe revertir todos los pagos antes de anular la factura.')
            return
        }

        setSavingAnul(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()

            // 1. Anular el comprobante
            const { error: errComp } = await supabase
                .from('comprobantes')
                .update({
                    estado_sistema:    'ANULADA',
                    fecha_anulacion:   new Date().toISOString(),
                    motivo_anulacion:  motivo.trim(),
                    usuario_anulacion: user?.id || null,
                })
                .eq('id', anulandoId)
            if (errComp) throw errComp

            // 2. Si tiene cartera, marcarla como anulada
            if (f.cartera?.id) {
                await supabase
                    .from('cartera_cxc')
                    .update({ estado: 'anulada', updated_at: new Date().toISOString() })
                    .eq('id', f.cartera.id)
            }

            setAnulandoId(null)
            setMotivo('')
            await cargar()
        } catch (e: any) {
            alert('Error al anular: ' + e.message)
        } finally {
            setSavingAnul(false)
        }
    }

    const facturasFiltradas = busqueda.trim()
        ? facturas.filter(f =>
            f.secuencial?.toLowerCase().includes(busqueda.toLowerCase()) ||
            f.clientes?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
            f.clientes?.identificacion?.includes(busqueda))
        : facturas

    const anulandoFactura = facturas.find(f => f.id === anulandoId)
    const tienePagos = (anulandoFactura?.cartera?.pagos?.length ?? 0) > 0

    return (
        <div className="space-y-6">
            {/* Encabezado */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Anulación de Facturas</h1>
                <p className="text-slate-600 mt-1">Gestión de facturas anuladas. Las facturas anuladas se excluyen de los totales de ventas.</p>
            </div>

            {/* Aviso SQL */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3 items-start">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800">
                    <strong>Requisito previo:</strong> Ejecutar <code className="bg-amber-100 px-1 rounded">SQL_Revertir_Pagos_Anulacion.sql</code> en Supabase si aún no se ha hecho.
                </div>
            </div>

            {/* Filtros + búsqueda */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar factura, cliente..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-primary-500 outline-none w-64"
                    />
                </div>
                <div className="flex gap-2">
                    {([
                        { value: 'VIGENTE', label: 'Vigentes' },
                        { value: 'ANULADA', label: 'Anuladas' },
                        { value: 'todas',   label: 'Todas' },
                    ] as const).map(f => (
                        <button
                            key={f.value}
                            onClick={() => setFiltro(f.value)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                filtro === f.value
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <span className="text-sm text-slate-500 ml-auto">{facturasFiltradas.length} factura(s)</span>
            </div>

            {/* Tabla */}
            {loading ? (
                <div className="text-center py-16 text-slate-400">Cargando...</div>
            ) : (
                <div className="card overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Factura</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Cliente</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Estado SRI</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Sistema</th>
                                <th className="px-4 py-3 w-28" />
                            </tr>
                        </thead>
                        <tbody>
                            {facturasFiltradas.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-12 text-slate-400">
                                        No hay facturas que coincidan con el filtro
                                    </td>
                                </tr>
                            )}
                            {facturasFiltradas.map(f => {
                                const isExp = expandedId === f.id
                                const esAnulada = f.estado_sistema === 'ANULADA'
                                const puedeAnular = !esAnulada

                                return (
                                    <>
                                        <tr
                                            key={f.id}
                                            className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${esAnulada ? 'opacity-60 bg-red-50/20' : ''}`}
                                            onClick={() => setExpandedId(isExp ? null : f.id)}
                                        >
                                            <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">
                                                {esAnulada && <span className="line-through text-red-400 mr-1">{f.secuencial}</span>}
                                                {!esAnulada && f.secuencial}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-600">
                                                {new Date(f.created_at).toLocaleDateString('es-EC')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-sm font-medium text-slate-900">{f.clientes?.nombre || 'Consumidor Final'}</div>
                                                <div className="text-xs text-slate-500">{f.clientes?.identificacion}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                                                {esAnulada
                                                    ? <span className="line-through text-slate-400">{formatCurrency(f.total)}</span>
                                                    : formatCurrency(f.total)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    f.estado_sri === 'AUTORIZADO' ? 'bg-green-100 text-green-700'
                                                    : f.estado_sri === 'RECHAZADO' ? 'bg-red-100 text-red-700'
                                                    : 'bg-yellow-100 text-yellow-700'
                                                }`}>{f.estado_sri}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    esAnulada ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                                }`}>{f.estado_sistema}</span>
                                            </td>
                                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                <div className="flex gap-1 justify-end">
                                                    {puedeAnular && (
                                                        <button
                                                            onClick={() => { setAnulandoId(f.id); setMotivo('') }}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 font-medium"
                                                        >
                                                            <FileX className="w-3.5 h-3.5" />
                                                            Anular
                                                        </button>
                                                    )}
                                                    <button className="p-1.5 text-slate-400">
                                                        {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Panel expandido */}
                                        {isExp && (
                                            <tr key={`${f.id}-exp`} className="bg-slate-50/80">
                                                <td colSpan={7} className="px-6 py-5">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                                                        {/* Datos SRI (para copiar y usar en portal SRI) */}
                                                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                                                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                                                                Datos SRI — para anulación en portal SRI
                                                            </p>
                                                            <div className="space-y-2.5">
                                                                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                                                                    <div>
                                                                        <p className="text-xs text-slate-400 uppercase font-semibold">No. Factura</p>
                                                                        <p className="font-mono font-bold text-slate-800">{f.secuencial}</p>
                                                                    </div>
                                                                    <CopyButton text={f.secuencial} />
                                                                </div>
                                                                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                                                                    <div>
                                                                        <p className="text-xs text-slate-400 uppercase font-semibold">Nro. Autorización SRI</p>
                                                                        <p className="font-mono text-sm text-slate-800 break-all">
                                                                            {f.autorizacion_numero || <span className="text-slate-400 italic">No autorizada</span>}
                                                                        </p>
                                                                    </div>
                                                                    {f.autorizacion_numero && <CopyButton text={f.autorizacion_numero} />}
                                                                </div>
                                                                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                                                                    <div>
                                                                        <p className="text-xs text-slate-400 uppercase font-semibold">RUC / Cédula Cliente</p>
                                                                        <p className="font-mono font-bold text-slate-800">
                                                                            {f.clientes?.identificacion || '9999999999999'}
                                                                        </p>
                                                                    </div>
                                                                    <CopyButton text={f.clientes?.identificacion || '9999999999999'} />
                                                                </div>
                                                                <div className="flex items-start justify-between bg-slate-50 rounded-lg px-3 py-2">
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-xs text-slate-400 uppercase font-semibold">Clave de Acceso</p>
                                                                        <p className="font-mono text-xs text-slate-600 break-all leading-tight mt-0.5">
                                                                            {f.clave_acceso || <span className="italic text-slate-400">—</span>}
                                                                        </p>
                                                                    </div>
                                                                    {f.clave_acceso && <CopyButton text={f.clave_acceso} />}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Cartera y pagos */}
                                                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                                                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                                                                Cartera / Pagos
                                                            </p>
                                                            {!f.cartera ? (
                                                                <p className="text-sm text-slate-400 italic">Factura de contado — sin cartera registrada</p>
                                                            ) : (
                                                                <>
                                                                    <div className="flex justify-between text-sm mb-3 bg-slate-50 rounded-lg px-3 py-2">
                                                                        <div>
                                                                            <p className="text-xs text-slate-400">Estado cartera</p>
                                                                            <p className="font-semibold capitalize text-slate-800">{f.cartera.estado}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-xs text-slate-400">Saldo pendiente</p>
                                                                            <p className={`font-bold ${Number(f.cartera.saldo) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                                {formatCurrency(f.cartera.saldo)}
                                                                            </p>
                                                                        </div>
                                                                    </div>

                                                                    {f.cartera.pagos.length === 0 ? (
                                                                        <p className="text-sm text-slate-400">Sin pagos registrados</p>
                                                                    ) : (
                                                                        <div>
                                                                            <p className="text-xs text-slate-500 font-semibold mb-2">
                                                                                Pagos registrados — debe revertirlos antes de anular:
                                                                            </p>
                                                                            <div className="space-y-1.5">
                                                                                {f.cartera.pagos.map(p => (
                                                                                    <div key={p.id} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                                                                                        <div>
                                                                                            <span className="text-sm font-semibold text-slate-800">{formatCurrency(p.valor)}</span>
                                                                                            <span className="ml-2 text-xs text-slate-500 capitalize">{p.metodo_pago.replace('_', ' ')}</span>
                                                                                            {p.referencia && <span className="ml-1 text-xs text-slate-400">#{p.referencia}</span>}
                                                                                            <span className="ml-2 text-xs text-slate-400">{p.fecha_pago}</span>
                                                                                        </div>
                                                                                        <button
                                                                                            onClick={() => revertirPago(p.id, f.cartera!.id)}
                                                                                            disabled={revirtiendoPago === p.id}
                                                                                            className="flex items-center gap-1 px-2 py-1 bg-orange-600 text-white text-xs rounded-lg hover:bg-orange-700 disabled:opacity-50"
                                                                                        >
                                                                                            {revirtiendoPago === p.id
                                                                                                ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                                                                                                : <Trash2 className="w-3 h-3" />}
                                                                                            Revertir
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}

                                                            {/* Motivo si ya está anulada */}
                                                            {esAnulada && f.motivo_anulacion && (
                                                                <div className="mt-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                                                    <p className="text-xs text-red-500 font-semibold uppercase">Motivo de anulación</p>
                                                                    <p className="text-sm text-red-800 mt-0.5">{f.motivo_anulacion}</p>
                                                                    {f.fecha_anulacion && (
                                                                        <p className="text-xs text-red-400 mt-0.5">
                                                                            {new Date(f.fecha_anulacion).toLocaleString('es-EC')}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ═══════════════════════════════════════
                MODAL CONFIRMAR ANULACIÓN
            ═══════════════════════════════════════ */}
            {anulandoId && anulandoFactura && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="p-6 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Anular Factura</h2>
                                    <p className="text-sm text-slate-500">{anulandoFactura.secuencial} — {anulandoFactura.clientes?.nombre}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-4">
                            {tienePagos ? (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                                    <strong>No se puede anular:</strong> esta factura tiene {anulandoFactura.cartera?.pagos.length} pago(s) registrado(s).
                                    Expanda la fila y revierta los pagos primero.
                                </div>
                            ) : (
                                <>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                                        Esta acción es <strong>irreversible</strong>. La factura quedará marcada como ANULADA y no se contabilizará en los reportes de ventas.
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-1 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Factura:</span>
                                            <span className="font-mono font-bold">{anulandoFactura.secuencial}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Total:</span>
                                            <span className="font-bold">{formatCurrency(anulandoFactura.total)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Cliente:</span>
                                            <span>{anulandoFactura.clientes?.nombre}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                                            Motivo de anulación <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={motivo}
                                            onChange={e => setMotivo(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500 text-sm"
                                            placeholder="Ej: Error en datos del cliente, devolución total, duplicado..."
                                            autoFocus
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                            <button onClick={() => { setAnulandoId(null); setMotivo('') }} className="btn btn-secondary" disabled={savingAnul}>
                                Cancelar
                            </button>
                            {!tienePagos && (
                                <button
                                    onClick={anularFactura}
                                    disabled={savingAnul || !motivo.trim()}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 text-sm"
                                >
                                    {savingAnul
                                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        : <CheckCircle2 className="w-4 h-4" />}
                                    Confirmar Anulación
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
