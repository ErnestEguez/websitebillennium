import { useState, useEffect } from 'react'
import { BarChart3, Loader2, AlertCircle, X, Download, Search, Printer } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { cuentasBancariasService } from '../../services/bancosService'
import { movimientoService } from '../../services/movimientoService'
import { cn, formatMoneda, formatFecha } from '../../lib/utils'
import { exportarExcelProfesional } from '../../lib/excelUtils'
import { imprimirReporte, generarTablaHtml } from '../../lib/printUtils'
import type { CuentaBancaria, MovimientoBancario, TipoMovimiento } from '../../types/finance'

const TIPO_LABELS: Record<TipoMovimiento, string> = {
    deposito: 'Depósito', nota_debito: 'Nota débito', nota_credito: 'Nota crédito',
    comision: 'Comisión', interes: 'Interés', cargo_automatico: 'Cargo automático', otro: 'Otro',
}

type ResumenTipo = { tipo: string; creditos: number; debitos: number; cantidad: number }

export function MovimientosPeriodoPage() {
    const { empresa } = useAuth()

    const [cuentas, setCuentas]     = useState<CuentaBancaria[]>([])
    const [cuentaId, setCuentaId]   = useState('')
    const [desde, setDesde]         = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10))
    const [hasta, setHasta]         = useState(new Date().toISOString().slice(0, 10))
    const [tipoFiltro, setTipoFiltro] = useState<TipoMovimiento | ''>('')
    const [sentidoFiltro, setSentidoFiltro] = useState<'debito' | 'credito' | ''>('')
    const [movimientos, setMovimientos] = useState<MovimientoBancario[]>([])
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
        if (!empresa?.id) return
        setLoading(true); setError(''); setBuscado(false)
        try {
            const mvs = await movimientoService.listar(empresa.id, {
                cuentaId:  cuentaId || undefined,
                desde,
                hasta,
            })
            setMovimientos(mvs.filter(m => m.estado === 'activo'))
            setBuscado(true)
        } catch (e: unknown) { setError(String(e)) }
        finally { setLoading(false) }
    }

    const movimientosFiltrados = movimientos
        .filter(m => !tipoFiltro   || m.tipo    === tipoFiltro)
        .filter(m => !sentidoFiltro || m.sentido === sentidoFiltro)

    const totalCreditos = movimientosFiltrados.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.monto, 0)
    const totalDebitos  = movimientosFiltrados.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.monto, 0)
    const neto          = totalCreditos - totalDebitos

    const resumenPorTipo: ResumenTipo[] = Object.entries(TIPO_LABELS).map(([tipo, label]) => {
        const items = movimientosFiltrados.filter(m => m.tipo === tipo)
        return {
            tipo: label,
            creditos: items.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.monto, 0),
            debitos:  items.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.monto, 0),
            cantidad: items.length,
        }
    }).filter(r => r.cantidad > 0)

    function imprimir() {
        const htmlMovs = generarTablaHtml(
            [
                { label: 'Fecha',       key: 'fecha',  width: '10%' },
                { label: 'Cuenta',      key: 'cta',    width: '20%' },
                { label: 'Tipo',        key: 'tipo',   width: '13%' },
                { label: 'Descripción', key: 'desc',   width: '30%' },
                { label: 'Débito',      key: 'deb',    align: 'right', width: '12%' },
                { label: 'Crédito',     key: 'cred',   align: 'right', width: '12%' },
            ],
            movimientosFiltrados.map(m => ({
                fecha: formatFecha(m.fecha),
                cta:   `${m.cuenta_bancaria?.banco?.nombre ?? ''} ${m.cuenta_bancaria?.numero_cuenta ?? ''}`,
                tipo:  TIPO_LABELS[m.tipo as TipoMovimiento] ?? m.tipo,
                desc:  m.descripcion ?? m.referencia ?? '—',
                deb:   m.sentido === 'debito'  ? formatMoneda(m.monto) : '',
                cred:  m.sentido === 'credito' ? formatMoneda(m.monto) : '',
            })),
            { fecha: `${movimientosFiltrados.length} registros`, deb: formatMoneda(totalDebitos), cred: formatMoneda(totalCreditos) }
        )
        const htmlResumen = generarTablaHtml(
            [
                { label: 'Tipo',     key: 'tipo',   width: '40%' },
                { label: 'Cantidad', key: 'cant',   align: 'center', width: '15%' },
                { label: 'Créditos', key: 'cred',   align: 'right',  width: '20%' },
                { label: 'Débitos',  key: 'deb',    align: 'right',  width: '20%' },
            ],
            resumenPorTipo.map(r => ({
                tipo: r.tipo, cant: r.cantidad,
                cred: r.creditos > 0 ? formatMoneda(r.creditos) : '—',
                deb:  r.debitos  > 0 ? formatMoneda(r.debitos)  : '—',
            }))
        )
        imprimirReporte({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Movimientos por Período',
            periodo: `${desde} al ${hasta}`,
            html:    htmlMovs,
            subtablas: [{ titulo: 'Resumen por tipo', html: htmlResumen }],
        })
    }

    function exportar() {
        exportarExcelProfesional({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Movimientos Bancarios por Período',
            periodo: `${desde} al ${hasta}`,
            columnas: [
                { key: 'Fecha',       label: 'Fecha',       width: 12 },
                { key: 'Cuenta',      label: 'Cuenta',      width: 28 },
                { key: 'Tipo',        label: 'Tipo',        width: 18 },
                { key: 'Descripcion', label: 'Descripción', width: 35 },
                { key: 'Referencia',  label: 'Referencia',  width: 18 },
                { key: 'Debito',      label: 'Débito',      width: 12 },
                { key: 'Credito',     label: 'Crédito',     width: 12 },
                { key: 'Conciliado',  label: 'Conciliado',  width: 11 },
            ],
            filas: movimientosFiltrados.map(m => ({
                Fecha:       formatFecha(m.fecha),
                Cuenta:      `${m.cuenta_bancaria?.banco?.nombre ?? ''} — ${m.cuenta_bancaria?.numero_cuenta ?? ''}`,
                Tipo:        TIPO_LABELS[m.tipo as TipoMovimiento] ?? m.tipo,
                Descripcion: m.descripcion ?? '',
                Referencia:  m.referencia ?? '',
                Debito:      m.sentido === 'debito'  ? m.monto : '',
                Credito:     m.sentido === 'credito' ? m.monto : '',
                Conciliado:  m.conciliado ? 'Sí' : 'No',
            })),
            nombreArchivo: `Movimientos_${empresa?.ruc ?? ''}_${desde}_${hasta}`,
            hojaExtra: {
                nombre: 'Resumen por Tipo',
                aoa: [
                    [`${empresa?.nombre ?? ''} — Resumen por Tipo`],
                    [`Período: ${desde} al ${hasta}`],
                    [],
                    ['Tipo', 'Cantidad', 'Créditos', 'Débitos', 'Neto'],
                    ...resumenPorTipo.map(r => [r.tipo, r.cantidad, r.creditos, r.debitos, r.creditos - r.debitos]),
                ],
            },
        })
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Movimientos por Período</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Resumen y detalle de movimientos bancarios</p>
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
                    <label className="label">Cuenta bancaria</label>
                    <select className="input" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
                        <option value="">Todas las cuentas</option>
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
                <div>
                    <label className="label">Tipo</label>
                    <select className="input" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as TipoMovimiento | '')}>
                        <option value="">Todos los tipos</option>
                        {(Object.entries(TIPO_LABELS) as [TipoMovimiento, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label">Sentido</label>
                    <select className="input" value={sentidoFiltro} onChange={e => setSentidoFiltro(e.target.value as 'debito' | 'credito' | '')}>
                        <option value="">Débito y Crédito</option>
                        <option value="debito">Solo débitos</option>
                        <option value="credito">Solo créditos</option>
                    </select>
                </div>
                <button onClick={buscar} disabled={loading} className="btn btn-primary gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Consultar
                </button>
            </div>

            {buscado && (
                <>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="card p-4">
                            <p className="text-xs text-slate-500">Total créditos</p>
                            <p className="text-xl font-bold text-green-700">{formatMoneda(totalCreditos)}</p>
                            <p className="text-xs text-slate-400 mt-1">{movimientos.filter(m => m.sentido === 'credito').length} movimientos</p>
                        </div>
                        <div className="card p-4">
                            <p className="text-xs text-slate-500">Total débitos</p>
                            <p className="text-xl font-bold text-red-600">{formatMoneda(totalDebitos)}</p>
                            <p className="text-xs text-slate-400 mt-1">{movimientos.filter(m => m.sentido === 'debito').length} movimientos</p>
                        </div>
                        <div className="card p-4">
                            <p className="text-xs text-slate-500">Neto del período</p>
                            <p className={cn('text-xl font-bold', neto >= 0 ? 'text-green-700' : 'text-red-600')}>
                                {formatMoneda(neto)}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">{movimientos.length} total</p>
                        </div>
                    </div>

                    {resumenPorTipo.length > 0 && (
                        <div className="card overflow-hidden">
                            <div className="bg-primary-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" />Resumen por tipo
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-4 text-left">Tipo</th>
                                            <th className="py-2 px-4 text-right">Cantidad</th>
                                            <th className="py-2 px-4 text-right">Créditos</th>
                                            <th className="py-2 px-4 text-right">Débitos</th>
                                            <th className="py-2 px-4 text-right">Neto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resumenPorTipo.map(r => (
                                            <tr key={r.tipo} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2.5 px-4 font-semibold">{r.tipo}</td>
                                                <td className="py-2.5 px-4 text-right text-slate-500">{r.cantidad}</td>
                                                <td className="py-2.5 px-4 text-right text-green-600">{r.creditos > 0 ? formatMoneda(r.creditos) : '—'}</td>
                                                <td className="py-2.5 px-4 text-right text-red-600">{r.debitos > 0 ? formatMoneda(r.debitos) : '—'}</td>
                                                <td className={cn('py-2.5 px-4 text-right font-bold',
                                                    r.creditos - r.debitos >= 0 ? 'text-green-700' : 'text-red-600')}>
                                                    {formatMoneda(r.creditos - r.debitos)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="card overflow-hidden">
                        <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />Detalle ({movimientosFiltrados.length}{movimientosFiltrados.length !== movimientos.length ? ` de ${movimientos.length}` : ''})
                        </div>
                        {movimientosFiltrados.length === 0 ? (
                            <div className="py-12 text-center text-slate-400">
                                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                <p>No hay movimientos en el período seleccionado</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-4 text-left">Fecha</th>
                                            <th className="py-2 px-4 text-left">Cuenta</th>
                                            <th className="py-2 px-4 text-left">Tipo</th>
                                            <th className="py-2 px-4 text-left">Descripción</th>
                                            <th className="py-2 px-4 text-right">Débito</th>
                                            <th className="py-2 px-4 text-right">Crédito</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movimientosFiltrados.map(m => (
                                            <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2.5 px-4 text-xs text-slate-500">{formatFecha(m.fecha)}</td>
                                                <td className="py-2.5 px-4 text-xs text-slate-500">
                                                    {m.cuenta_bancaria?.banco?.nombre}<br />
                                                    <span className="font-mono">{m.cuenta_bancaria?.numero_cuenta}</span>
                                                </td>
                                                <td className="py-2.5 px-4">
                                                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                                        {TIPO_LABELS[m.tipo as TipoMovimiento] ?? m.tipo}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-slate-700 max-w-xs truncate">
                                                    {m.descripcion ?? m.referencia ?? '—'}
                                                </td>
                                                <td className="py-2.5 px-4 text-right text-red-600 font-semibold">
                                                    {m.sentido === 'debito' ? formatMoneda(m.monto) : '—'}
                                                </td>
                                                <td className="py-2.5 px-4 text-right text-green-600 font-semibold">
                                                    {m.sentido === 'credito' ? formatMoneda(m.monto) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
