import { useState, useEffect, useRef, useCallback } from 'react'
import { useReactToPrint } from 'react-to-print'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatMoneda } from '../lib/utils'
import {
    FileText, Download, Printer, Search, ChevronDown, ChevronRight,
    User, X, Loader2, RefreshCw,
} from 'lucide-react'
import { cn } from '../lib/utils'

// ─── tipos ──────────────────────────────────────────────────────────────────

interface ClienteMini { id: string; nombre: string; identificacion: string }

interface DetalleLinea {
    nombre_producto: string
    cantidad: number
    precio_unitario: number
    descuento: number
    subtotal: number
    iva_porcentaje: number
    iva_valor: number
    total: number
}

interface FilaFactura {
    id: string
    secuencial: string
    fecha: string
    total: number
    saldo: number
    pagado: number
    estado_cartera: 'CANCELADA' | 'CRÉDITO' | 'PARCIAL' | 'ANULADA'
    estado_sri: string
    pagos: { metodo: string; valor: number }[]
    detalles: DetalleLinea[]
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function primerDiaMes() {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

function hoy() { return new Date().toISOString().split('T')[0] }

function fmtFecha(iso: string) {
    return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const PERIODOS = [
    { label: 'Hoy',          desde: () => hoy(),          hasta: () => hoy() },
    { label: 'Esta semana',  desde: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0] }, hasta: () => hoy() },
    { label: 'Este mes',     desde: () => primerDiaMes(),  hasta: () => hoy() },
    { label: 'Mes anterior', desde: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split('T')[0] }, hasta: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0] } },
    { label: 'Este año',     desde: () => `${new Date().getFullYear()}-01-01`, hasta: () => hoy() },
]

const BADGE: Record<string, string> = {
    CANCELADA: 'bg-emerald-100 text-emerald-700',
    CRÉDITO:   'bg-amber-100 text-amber-700',
    PARCIAL:   'bg-orange-100 text-orange-700',
    ANULADA:   'bg-red-100 text-red-600',
}

// ─── Componente principal ────────────────────────────────────────────────────

export function VentasClientePage() {
    const { empresa } = useAuth()
    const printRef = useRef<HTMLDivElement>(null)

    // Filtros
    const [fechaDesde, setFechaDesde]     = useState(primerDiaMes())
    const [fechaHasta, setFechaHasta]     = useState(hoy())
    const [cliente, setCliente]           = useState<ClienteMini | null>(null)
    const [searchCliente, setSearchCliente] = useState('')
    const [clienteResults, setClienteResults] = useState<ClienteMini[]>([])
    const [clienteOpen, setClienteOpen]   = useState(false)
    const [buscandoCli, setBuscandoCli]   = useState(false)

    // Datos
    const [filas, setFilas]             = useState<FilaFactura[]>([])
    const [loading, setLoading]         = useState(false)
    const [expandedId, setExpandedId]   = useState<string | null>(null)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Ventas_Cliente_${fechaDesde}_${fechaHasta}`,
    })

    // ── Búsqueda de clientes ──
    useEffect(() => {
        if (!empresa?.id || searchCliente.trim().length < 2) { setClienteResults([]); return }
        const timer = setTimeout(async () => {
            setBuscandoCli(true)
            try {
                const q = '%' + searchCliente.trim().replace(/\*/g, '%') + '%'
                const { data } = await supabase
                    .from('clientes')
                    .select('id, nombre, identificacion')
                    .eq('empresa_id', empresa.id)
                    .or(`nombre.ilike.${q},identificacion.ilike.${q}`)
                    .order('nombre')
                    .limit(50)
                setClienteResults((data ?? []) as ClienteMini[])
            } finally {
                setBuscandoCli(false)
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [searchCliente, empresa?.id])

    // ── Consultar ──
    const consultar = useCallback(async () => {
        if (!empresa?.id) return
        setLoading(true)
        setExpandedId(null)
        try {
            let q = supabase
                .from('comprobantes')
                .select(`
                    id, secuencial, created_at, total, estado_sri, estado_sistema,
                    comprobante_pagos(metodo_pago, valor),
                    comprobante_detalles(nombre_producto, cantidad, precio_unitario, descuento, subtotal, iva_porcentaje, iva_valor, total),
                    cartera_cxc(id, saldo, estado, valor_original)
                `)
                .eq('empresa_id', empresa.id)
                .eq('tipo_comprobante', 'FACTURA')
                .gte('created_at', `${fechaDesde}T00:00:00`)
                .lte('created_at', `${fechaHasta}T23:59:59`)
                .order('created_at', { ascending: true })

            if (cliente?.id) q = q.eq('cliente_id', cliente.id)

            const { data, error } = await q
            if (error) throw error

            const rows: FilaFactura[] = (data ?? []).map((c: any) => {
                const anulada = c.estado_sistema === 'ANULADO'
                // cartera_cxc puede llegar como objeto (FK única) o como array (sin unique constraint)
                const cxcRaw = c.cartera_cxc
                const cxc = Array.isArray(cxcRaw)
                    ? (cxcRaw[0] ?? null)
                    : (cxcRaw ?? null)

                const total = anulada ? 0 : Number(c.total ?? 0)

                let estado_cartera: FilaFactura['estado_cartera']
                let saldo = 0

                if (anulada) {
                    estado_cartera = 'ANULADA'
                } else if (cxc) {
                    saldo = Number(cxc.saldo ?? 0)
                    if (cxc.estado === 'pagada' || saldo <= 0) {
                        estado_cartera = 'CANCELADA'
                        saldo = 0
                    } else if (cxc.estado === 'parcial') {
                        estado_cartera = 'PARCIAL'
                    } else {
                        estado_cartera = 'CRÉDITO'
                    }
                } else {
                    // Sin registro cartera: totalmente pagado al contado
                    estado_cartera = 'CANCELADA'
                    saldo = 0
                }

                const pagado = total - saldo

                return {
                    id: c.id,
                    secuencial: c.secuencial ?? '',
                    fecha: c.created_at ?? '',
                    total,
                    saldo,
                    pagado,
                    estado_cartera,
                    estado_sri: c.estado_sri ?? '',
                    pagos: (c.comprobante_pagos ?? []).map((p: any) => ({
                        metodo: p.metodo_pago ?? '',
                        valor: Number(p.valor ?? 0),
                    })),
                    detalles: (c.comprobante_detalles ?? []).map((d: any) => ({
                        nombre_producto: d.nombre_producto ?? '',
                        cantidad:        Number(d.cantidad ?? 0),
                        precio_unitario: Number(d.precio_unitario ?? 0),
                        descuento:       Number(d.descuento ?? 0),
                        subtotal:        Number(d.subtotal ?? 0),
                        iva_porcentaje:  Number(d.iva_porcentaje ?? 0),
                        iva_valor:       Number(d.iva_valor ?? 0),
                        total:           Number(d.total ?? 0),
                    })),
                }
            })
            setFilas(rows)
        } catch (e: any) {
            alert('Error al consultar: ' + e.message)
        } finally {
            setLoading(false)
        }
    }, [empresa?.id, fechaDesde, fechaHasta, cliente?.id])

    // ── Totales ──
    const totales = filas.reduce((acc, f) => ({
        total:  acc.total  + f.total,
        pagado: acc.pagado + f.pagado,
        saldo:  acc.saldo  + f.saldo,
    }), { total: 0, pagado: 0, saldo: 0 })

    // ── Exportar Excel ──
    function exportarExcel() {
        const empresa_nombre = (empresa as any)?.nombre ?? 'Empresa'
        const clienteNombre = cliente?.nombre ?? 'Todos los clientes'
        const periodo = `${fmtFecha(fechaDesde)} al ${fmtFecha(fechaHasta)}`

        // Encabezados del reporte
        const header: any[][] = [
            [empresa_nombre],
            ['REPORTE DE VENTAS POR CLIENTE'],
            [`Cliente: ${clienteNombre}`],
            [`Período: ${periodo}`],
            [],
            ['No. Factura', 'Fecha', 'Total', 'Pagado', 'Saldo', 'Estado', 'Estado SRI'],
        ]

        const rows = filas.map(f => [
            f.secuencial,
            fmtFecha(f.fecha),
            +f.total.toFixed(2),
            +f.pagado.toFixed(2),
            +f.saldo.toFixed(2),
            f.estado_cartera,
            f.estado_sri,
        ])

        const totRow = [
            'TOTALES', '',
            +totales.total.toFixed(2),
            +totales.pagado.toFixed(2),
            +totales.saldo.toFixed(2),
            '', '',
        ]

        const ws = XLSX.utils.aoa_to_sheet([...header, ...rows, [], totRow])

        // Anchos de columnas
        ws['!cols'] = [20, 14, 14, 14, 14, 16, 16].map(w => ({ wch: w }))

        // Merge empresa_nombre across A1:G1
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } },
        ]

        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Ventas por Cliente')

        // Hoja de detalle si hay un cliente seleccionado
        if (cliente?.id && filas.some(f => f.detalles.length > 0)) {
            const detHeader = [
                [empresa_nombre],
                ['DETALLE DE VENTAS POR PRODUCTO'],
                [`Cliente: ${clienteNombre}`],
                [`Período: ${periodo}`],
                [],
                ['No. Factura', 'Fecha', 'Producto', 'Cant.', 'Precio', 'Desc.', 'Subtotal', 'IVA%', 'IVA $', 'Total'],
            ]
            const detRows: any[][] = []
            for (const f of filas) {
                for (const d of f.detalles) {
                    detRows.push([
                        f.secuencial,
                        fmtFecha(f.fecha),
                        d.nombre_producto,
                        +d.cantidad.toFixed(2),
                        +d.precio_unitario.toFixed(2),
                        +d.descuento.toFixed(2),
                        +d.subtotal.toFixed(2),
                        +d.iva_porcentaje.toFixed(0),
                        +d.iva_valor.toFixed(2),
                        +d.total.toFixed(2),
                    ])
                }
            }
            const wsD = XLSX.utils.aoa_to_sheet([...detHeader, ...detRows])
            wsD['!cols'] = [18, 12, 35, 8, 12, 8, 12, 6, 10, 12].map(w => ({ wch: w }))
            wsD['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
                { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
                { s: { r: 3, c: 0 }, e: { r: 3, c: 9 } },
            ]
            XLSX.utils.book_append_sheet(wb, wsD, 'Detalle Productos')
        }

        XLSX.writeFile(wb, `Ventas_${clienteNombre.replace(/\s+/g, '_')}_${fechaDesde}_${fechaHasta}.xlsx`)
    }

    // ── Render ──
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <User className="w-6 h-6 text-primary-600" />
                        Ventas por Cliente
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        Estado de cuenta, saldos y detalle de facturas por cliente
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={exportarExcel}
                        disabled={filas.length === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                    >
                        <Download className="w-4 h-4" /> Excel
                    </button>
                    <button
                        onClick={() => handlePrint()}
                        disabled={filas.length === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                    >
                        <Printer className="w-4 h-4" /> Imprimir
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                {/* Períodos rápidos */}
                <div className="flex flex-wrap gap-2">
                    {PERIODOS.map(p => (
                        <button
                            key={p.label}
                            onClick={() => { setFechaDesde(p.desde()); setFechaHasta(p.hasta()) }}
                            className="px-3 py-1 text-xs rounded-full border border-slate-200 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-colors"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    {/* Cliente */}
                    <div className="md:col-span-2 relative">
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Cliente</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                                placeholder="Buscar por nombre o cédula/RUC..."
                                value={searchCliente}
                                onChange={e => { setSearchCliente(e.target.value); setClienteOpen(true) }}
                                onFocus={() => setClienteOpen(true)}
                            />
                            {cliente && (
                                <button
                                    onClick={() => { setCliente(null); setSearchCliente(''); setClienteResults([]) }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {cliente && (
                            <p className="text-xs text-primary-600 mt-1 font-medium">
                                ✓ {cliente.nombre} — {cliente.identificacion}
                            </p>
                        )}
                        {clienteOpen && (searchCliente.trim().length >= 2) && (
                            <div className="absolute z-20 top-full mt-1 left-0 w-full bg-white rounded-xl border border-slate-200 shadow-xl">
                                {buscandoCli
                                    ? <div className="flex items-center gap-2 p-3 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</div>
                                    : clienteResults.length === 0
                                        ? <p className="p-3 text-sm text-slate-400">Sin resultados</p>
                                        : clienteResults.map(c => (
                                            <button
                                                key={c.id}
                                                className="w-full text-left px-4 py-2.5 hover:bg-primary-50 text-sm"
                                                onMouseDown={e => { e.preventDefault(); setCliente(c); setSearchCliente(c.nombre); setClienteOpen(false) }}
                                            >
                                                <span className="font-medium text-slate-800">{c.nombre}</span>
                                                <span className="text-xs text-slate-400 ml-2">{c.identificacion}</span>
                                            </button>
                                        ))}
                            </div>
                        )}
                    </div>
                    {/* Fechas */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Desde</label>
                        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Hasta</label>
                        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                    </div>
                </div>
                <div className="flex justify-end">
                    <button
                        onClick={consultar}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Consultar
                    </button>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="w-8 px-2 py-3"></th>
                                <th className="px-4 py-3 text-left">No. Factura</th>
                                <th className="px-4 py-3 text-left">Fecha</th>
                                <th className="px-4 py-3 text-right">Total</th>
                                <th className="px-4 py-3 text-right">Pagado</th>
                                <th className="px-4 py-3 text-right">Saldo</th>
                                <th className="px-4 py-3 text-center">Estado</th>
                                <th className="px-4 py-3 text-center">SRI</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && (
                                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                                    Consultando...
                                </td></tr>
                            )}
                            {!loading && filas.length === 0 && (
                                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    Sin resultados. Selecciona un cliente y período, luego haz clic en Consultar.
                                </td></tr>
                            )}
                            {filas.map(f => (
                                <>
                                    <tr
                                        key={f.id}
                                        className={cn('hover:bg-slate-50 cursor-pointer', f.estado_cartera === 'ANULADA' && 'opacity-50')}
                                        onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                                    >
                                        <td className="px-2 py-3 text-center text-slate-400">
                                            {expandedId === f.id
                                                ? <ChevronDown className="w-4 h-4" />
                                                : <ChevronRight className="w-4 h-4" />}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{f.secuencial}</td>
                                        <td className="px-4 py-3 text-slate-600">{fmtFecha(f.fecha)}</td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold">{formatMoneda(f.total)}</td>
                                        <td className="px-4 py-3 text-right font-mono text-emerald-700">{formatMoneda(f.pagado)}</td>
                                        <td className={cn('px-4 py-3 text-right font-mono font-bold', f.saldo > 0 ? 'text-amber-700' : 'text-slate-400')}>
                                            {formatMoneda(f.saldo)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-bold', BADGE[f.estado_cartera] ?? 'bg-slate-100 text-slate-600')}>
                                                {f.estado_cartera}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-xs text-slate-500">{f.estado_sri}</span>
                                        </td>
                                    </tr>
                                    {/* Detalle expandido */}
                                    {expandedId === f.id && (
                                        <tr key={f.id + '_det'}>
                                            <td colSpan={8} className="px-6 py-0 bg-slate-50">
                                                <div className="py-3 space-y-2">
                                                    {/* Pagos */}
                                                    {f.pagos.length > 0 && (
                                                        <div className="flex gap-3 flex-wrap mb-2">
                                                            {f.pagos.map((p, i) => (
                                                                <span key={i} className="text-xs px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-600">
                                                                    <span className="font-semibold uppercase">{p.metodo.replace('_', ' ')}</span>: {formatMoneda(p.valor)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {/* Productos */}
                                                    <table className="w-full text-xs border-collapse">
                                                        <thead>
                                                            <tr className="text-slate-500 border-b border-slate-200">
                                                                <th className="text-left py-1.5 font-semibold">Producto</th>
                                                                <th className="text-right py-1.5 font-semibold w-14">Cant.</th>
                                                                <th className="text-right py-1.5 font-semibold w-20">P. Unit.</th>
                                                                <th className="text-right py-1.5 font-semibold w-16">Desc.</th>
                                                                <th className="text-right py-1.5 font-semibold w-20">Subtotal</th>
                                                                <th className="text-right py-1.5 font-semibold w-16">IVA%</th>
                                                                <th className="text-right py-1.5 font-semibold w-20">IVA $</th>
                                                                <th className="text-right py-1.5 font-semibold w-20">Total</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {f.detalles.map((d, i) => (
                                                                <tr key={i} className="border-b border-slate-100 last:border-0">
                                                                    <td className="py-1.5 text-slate-700">{d.nombre_producto}</td>
                                                                    <td className="text-right py-1.5 font-mono">{d.cantidad}</td>
                                                                    <td className="text-right py-1.5 font-mono">{formatMoneda(d.precio_unitario)}</td>
                                                                    <td className="text-right py-1.5 font-mono text-slate-400">{d.descuento > 0 ? formatMoneda(d.descuento) : '—'}</td>
                                                                    <td className="text-right py-1.5 font-mono">{formatMoneda(d.subtotal)}</td>
                                                                    <td className="text-right py-1.5 font-mono">{d.iva_porcentaje}%</td>
                                                                    <td className="text-right py-1.5 font-mono">{formatMoneda(d.iva_valor)}</td>
                                                                    <td className="text-right py-1.5 font-mono font-semibold">{formatMoneda(d.total)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                        {filas.length > 0 && (
                            <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-sm">
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 text-right text-slate-600">
                                        {filas.length} factura(s)
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{formatMoneda(totales.total)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-emerald-700">{formatMoneda(totales.pagado)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-amber-700">{formatMoneda(totales.saldo)}</td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* ── Sección de impresión (oculta en pantalla) ── */}
            <div className="hidden print:block" ref={printRef}>
                <style>{`
                    @media print {
                        body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
                        .ph { text-align: center; margin-bottom: 4px; }
                        .ph h1 { font-size: 16px; font-weight: bold; margin: 0; }
                        .ph h2 { font-size: 12px; font-weight: bold; margin: 4px 0 2px; color: #333; }
                        .ph p  { font-size: 10px; margin: 1px 0; color: #555; }
                        table  { width: 100%; border-collapse: collapse; margin-top: 8px; }
                        th     { background: #f0f0f0; border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 9px; text-transform: uppercase; }
                        td     { border: 1px solid #ddd; padding: 3px 6px; font-size: 9px; vertical-align: top; }
                        .tr    { text-align: right; }
                        .tc    { text-align: center; }
                        .bold  { font-weight: bold; }
                        .tot   { background: #f0f0f0; font-weight: bold; }
                        .anulada { opacity: 0.5; }
                        .badge-CANCELADA { color: #15803d; }
                        .badge-CRÉDITO   { color: #b45309; }
                        .badge-PARCIAL   { color: #c2410c; }
                        .badge-ANULADA   { color: #dc2626; }
                        .det   { background: #fafafa; }
                        .det td { border-color: #e5e7eb; font-size: 8px; }
                    }
                `}</style>
                <div className="ph">
                    <h1>{(empresa as any)?.nombre ?? ''}</h1>
                    <h2>REPORTE DE VENTAS POR CLIENTE</h2>
                    {cliente && <p><strong>Cliente:</strong> {cliente.nombre} — {cliente.identificacion}</p>}
                    <p><strong>Período:</strong> {fmtFecha(fechaDesde)} al {fmtFecha(fechaHasta)}</p>
                    <p><strong>Facturas:</strong> {filas.length} &nbsp;|&nbsp; <strong>Total:</strong> {formatMoneda(totales.total)} &nbsp;|&nbsp; <strong>Saldo pendiente:</strong> {formatMoneda(totales.saldo)}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>No. Factura</th>
                            <th>Fecha</th>
                            <th className="tr">Total</th>
                            <th className="tr">Pagado</th>
                            <th className="tr">Saldo</th>
                            <th className="tc">Estado</th>
                            <th className="tc">SRI</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map(f => (
                            <>
                                <tr key={f.id} className={f.estado_cartera === 'ANULADA' ? 'anulada' : ''}>
                                    <td className="bold">{f.secuencial}</td>
                                    <td>{fmtFecha(f.fecha)}</td>
                                    <td className="tr">{formatMoneda(f.total)}</td>
                                    <td className="tr">{formatMoneda(f.pagado)}</td>
                                    <td className="tr bold">{f.saldo > 0 ? formatMoneda(f.saldo) : '—'}</td>
                                    <td className={`tc bold badge-${f.estado_cartera}`}>{f.estado_cartera}</td>
                                    <td className="tc">{f.estado_sri}</td>
                                </tr>
                                {f.detalles.map((d, i) => (
                                    <tr key={f.id + '_' + i} className="det">
                                        <td></td>
                                        <td colSpan={2} style={{ paddingLeft: 12 }}>↳ {d.nombre_producto}</td>
                                        <td className="tr">x{d.cantidad}</td>
                                        <td className="tr">{formatMoneda(d.precio_unitario)}</td>
                                        <td className="tr">{d.iva_porcentaje}%</td>
                                        <td className="tr bold">{formatMoneda(d.total)}</td>
                                    </tr>
                                ))}
                            </>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="tot">
                            <td colSpan={2} className="bold">TOTALES — {filas.length} factura(s)</td>
                            <td className="tr">{formatMoneda(totales.total)}</td>
                            <td className="tr">{formatMoneda(totales.pagado)}</td>
                            <td className="tr">{formatMoneda(totales.saldo)}</td>
                            <td colSpan={2}></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}
