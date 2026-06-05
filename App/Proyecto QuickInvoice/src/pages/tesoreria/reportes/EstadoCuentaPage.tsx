import { useState } from 'react'
import { FileText, Loader2, AlertCircle, X, Download, Search, Printer } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { cuentasBancariasService } from '../../../services/finance/bancosService'
import { movimientoService } from '../../../services/finance/movimientoService'
import { cn, formatMoneda, formatFecha } from '../../../lib/utils'
import { exportarExcelProfesional } from '../../../lib/excelUtils'
import { imprimirReporte, generarTablaHtml } from '../../../lib/printUtils'
import type { CuentaBancaria, MovimientoBancario } from '../../../types/finance'
import { useEffect } from 'react'

const TIPO_LABELS: Record<string, string> = {
    deposito: 'Depósito', nota_debito: 'Nota débito', nota_credito: 'Nota crédito',
    comision: 'Comisión', interes: 'Interés', cargo_automatico: 'Cargo automático', otro: 'Otro',
}

export function EstadoCuentaPage() {
    const { empresa } = useAuth()

    const [cuentas, setCuentas]     = useState<CuentaBancaria[]>([])
    const [cuentaId, setCuentaId]   = useState('')
    const [desde, setDesde]         = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
    const [hasta, setHasta]         = useState(new Date().toISOString().slice(0, 10))
    const [movimientos, setMovimientos] = useState<MovimientoBancario[]>([])
    const [cuentaSel, setCuentaSel] = useState<CuentaBancaria | null>(null)
    const [loading, setLoading]     = useState(false)
    const [error, setError]         = useState('')
    const [buscado, setBuscado]     = useState(false)

    useEffect(() => {
        if (!empresa?.id) return
        cuentasBancariasService.listar(empresa.id)
            .then(c => setCuentas(c.filter(x => x.estado === 'activa')))
            .catch(() => {})
    }, [empresa?.id])

    async function buscar() {
        if (!cuentaId) { setError('Selecciona una cuenta bancaria'); return }
        if (!empresa?.id) return
        setLoading(true); setError(''); setBuscado(false)
        try {
            const mvs = await movimientoService.listar(empresa.id, {
                cuentaId,
                desde,
                hasta,
            })
            setMovimientos(mvs.filter(m => m.estado === 'activo'))
            setCuentaSel(cuentas.find(c => c.id === cuentaId) ?? null)
            setBuscado(true)
        } catch (e: unknown) { setError(String(e)) }
        finally { setLoading(false) }
    }

    const totalCreditos = movimientos.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.monto, 0)
    const totalDebitos  = movimientos.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.monto, 0)
    const neto          = totalCreditos - totalDebitos

    function imprimir() {
        const nombreCuenta = cuentaSel ? `${cuentaSel.banco?.nombre} — ${cuentaSel.numero_cuenta}` : ''
        const TIPO_LABELS_EC: Record<string, string> = {
            deposito: 'Depósito', nota_debito: 'N/D', nota_credito: 'N/C',
            comision: 'Comisión', interes: 'Interés', cargo_automatico: 'Cargo Auto.',
            cheque: 'Cheque', transferencia: 'Transferencia', otro: 'Otro',
        }
        const html = generarTablaHtml(
            [
                { label: 'Fecha',       key: 'fecha',  width: '10%' },
                { label: 'Tipo',        key: 'tipo',   width: '13%' },
                { label: 'Descripción', key: 'desc',   width: '35%' },
                { label: 'Referencia',  key: 'ref',    width: '15%' },
                { label: 'Débito',      key: 'deb',    align: 'right', width: '12%' },
                { label: 'Crédito',     key: 'cred',   align: 'right', width: '12%' },
            ],
            movimientos.map(m => ({
                fecha: formatFecha(m.fecha),
                tipo:  TIPO_LABELS_EC[m.tipo] ?? m.tipo,
                desc:  m.descripcion ?? m.referencia ?? '—',
                ref:   m.referencia ?? '—',
                deb:   m.sentido === 'debito'  ? formatMoneda(m.monto) : '',
                cred:  m.sentido === 'credito' ? formatMoneda(m.monto) : '',
            })),
            { fecha: `${movimientos.length} movs.`, deb: formatMoneda(totalDebitos), cred: formatMoneda(totalCreditos) }
        )
        imprimirReporte({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  `Estado de Cuenta — ${nombreCuenta}`,
            periodo: `${desde} al ${hasta}`,
            html,
        })
    }

    function exportar() {
        const nombreCuenta = cuentaSel ? `${cuentaSel.banco?.nombre} — ${cuentaSel.numero_cuenta}` : ''
        exportarExcelProfesional({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  `Estado de Cuenta — ${nombreCuenta}`,
            periodo: `${desde} al ${hasta}`,
            columnas: [
                { key: 'Fecha',       label: 'Fecha',       width: 12 },
                { key: 'Tipo',        label: 'Tipo',        width: 18 },
                { key: 'Descripcion', label: 'Descripción', width: 35 },
                { key: 'Referencia',  label: 'Referencia',  width: 18 },
                { key: 'Debito',      label: 'Débito',      width: 13 },
                { key: 'Credito',     label: 'Crédito',     width: 13 },
                { key: 'Conciliado',  label: 'Conciliado',  width: 11 },
            ],
            filas: movimientos.map(m => ({
                Fecha:       formatFecha(m.fecha),
                Tipo:        TIPO_LABELS[m.tipo] ?? m.tipo,
                Descripcion: m.descripcion ?? '',
                Referencia:  m.referencia ?? '',
                Debito:      m.sentido === 'debito'  ? m.monto : '',
                Credito:     m.sentido === 'credito' ? m.monto : '',
                Conciliado:  m.conciliado ? 'Sí' : 'No',
            })),
            nombreArchivo: `EstadoCuenta_${empresa?.ruc ?? ''}_${desde}_${hasta}`,
            hojaExtra: {
                nombre: 'Resumen',
                aoa: [
                    [`${empresa?.nombre ?? ''} — Estado de Cuenta`],
                    [nombreCuenta],
                    [`Período: ${desde} al ${hasta}`],
                    [],
                    ['', 'Débitos', 'Créditos', 'Neto'],
                    ['Total', totalDebitos, totalCreditos, totalCreditos - totalDebitos],
                ],
            },
        })
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Estado de Cuenta</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Movimientos por cuenta bancaria y período</p>
                </div>
                {buscado && movimientos.length > 0 && (
                    <div className="flex gap-2">
                        <button onClick={imprimir} className="btn btn-secondary gap-2">
                            <Printer className="w-4 h-4" />Imprimir
                        </button>
                        <button onClick={exportar} className="btn btn-secondary gap-2">
                            <Download className="w-4 h-4" />Excel
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card p-4 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="label">Cuenta bancaria *</label>
                    <select className="input" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
                        <option value="">Seleccionar...</option>
                        {cuentas.map(c => (
                            <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label">Desde</label>
                    <input type="date" className="input" value={desde} onChange={e => setDesde(e.target.value)} />
                </div>
                <div>
                    <label className="label">Hasta</label>
                    <input type="date" className="input" value={hasta} onChange={e => setHasta(e.target.value)} />
                </div>
                <button onClick={buscar} disabled={loading} className="btn btn-primary gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Consultar
                </button>
            </div>

            {buscado && (
                <>
                    {cuentaSel && (
                        <div className="card p-4 bg-primary-50 border-primary-100">
                            <p className="font-bold text-primary-900">{cuentaSel.banco?.nombre}</p>
                            <p className="text-sm text-primary-700 font-mono">{cuentaSel.numero_cuenta} — {cuentaSel.tipo}</p>
                            <p className="text-xs text-primary-600 mt-1">{formatFecha(desde)} al {formatFecha(hasta)}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-4">
                        <div className="card p-4">
                            <p className="text-xs text-slate-500">Total créditos</p>
                            <p className="text-xl font-bold text-green-700">{formatMoneda(totalCreditos)}</p>
                        </div>
                        <div className="card p-4">
                            <p className="text-xs text-slate-500">Total débitos</p>
                            <p className="text-xl font-bold text-red-600">{formatMoneda(totalDebitos)}</p>
                        </div>
                        <div className="card p-4">
                            <p className="text-xs text-slate-500">Neto</p>
                            <p className={cn('text-xl font-bold', neto >= 0 ? 'text-green-700' : 'text-red-600')}>
                                {formatMoneda(neto)}
                            </p>
                        </div>
                    </div>

                    <div className="card overflow-hidden">
                        <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                            <FileText className="w-4 h-4" />Movimientos ({movimientos.length})
                        </div>
                        {movimientos.length === 0 ? (
                            <div className="py-12 text-center text-slate-400">
                                <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                <p>No hay movimientos en el período seleccionado</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-4 text-left">Fecha</th>
                                            <th className="py-2 px-4 text-left">Tipo</th>
                                            <th className="py-2 px-4 text-left">Descripción</th>
                                            <th className="py-2 px-4 text-left">Origen</th>
                                            <th className="py-2 px-4 text-right">Débito</th>
                                            <th className="py-2 px-4 text-right">Crédito</th>
                                            <th className="py-2 px-4 text-center">Conciliado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movimientos.map(m => (
                                            <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2.5 px-4 text-xs text-slate-500">{formatFecha(m.fecha)}</td>
                                                <td className="py-2.5 px-4">
                                                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                                        {TIPO_LABELS[m.tipo] ?? m.tipo}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-slate-700 max-w-xs truncate">
                                                    {m.descripcion ?? m.referencia ?? '—'}
                                                </td>
                                                <td className="py-2.5 px-4 text-xs text-slate-400 capitalize">{m.origen}</td>
                                                <td className="py-2.5 px-4 text-right text-red-600 font-semibold">
                                                    {m.sentido === 'debito' ? formatMoneda(m.monto) : '—'}
                                                </td>
                                                <td className="py-2.5 px-4 text-right text-green-600 font-semibold">
                                                    {m.sentido === 'credito' ? formatMoneda(m.monto) : '—'}
                                                </td>
                                                <td className="py-2.5 px-4 text-center">
                                                    {m.conciliado
                                                        ? <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Sí</span>
                                                        : <span className="text-xs text-slate-400">No</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 font-bold text-sm">
                                            <td colSpan={4} className="py-3 px-4 text-right text-slate-600">Totales:</td>
                                            <td className="py-3 px-4 text-right text-red-600">{formatMoneda(totalDebitos)}</td>
                                            <td className="py-3 px-4 text-right text-green-600">{formatMoneda(totalCreditos)}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}





