import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
    FileDown, Loader2, AlertCircle, CheckCircle, X,
    FileText, ShoppingCart, Receipt, ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../lib/utils'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface SriComp {
    id: string
    tipo: 'factura' | 'retencion' | 'nota_credito' | 'nota_debito'
    proveedor_ruc: string
    proveedor_nombre: string
    numero: string
    clave_acceso: string | null
    fecha_emision: string
    base_cero: number
    base_iva: number
    iva: number
    total: number
    codigo_retencion: string | null
    porcentaje_ret: number | null
    valor_retenido: number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

const f2 = (n: number) => n.toFixed(2)

function xmlEsc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function fmtDate(iso: string): string {
    const [y, m, d] = iso.split('-')
    return `${(d ?? '01').padStart(2, '0')}/${(m ?? '01').padStart(2, '0')}/${y ?? '2025'}`
}

function parseNumero(num: string) {
    const p = num.replace(/\s/g, '').split('-')
    if (p.length >= 3) {
        return {
            estab: p[0].padStart(3, '0'),
            ptoEmi: p[1].padStart(3, '0'),
            sec: String(parseInt(p[2], 10) || 0),
        }
    }
    return { estab: '001', ptoEmi: '001', sec: String(parseInt(num.replace(/\D/g, ''), 10) || 0) }
}

function tipoIdProv(ruc: string): string {
    const r = ruc.replace(/\D/g, '')
    if (r === '9999999999999' || r === '9999999999') return '07'  // consumidor final
    if (r.length === 13) return '01'   // RUC
    if (r.length === 10) return '05'   // Cédula
    return '06'                         // Pasaporte u otro
}

function tipoCompSRI(tipo: SriComp['tipo']): string {
    switch (tipo) {
        case 'factura':      return '01'
        case 'nota_credito': return '04'
        case 'nota_debito':  return '05'
        case 'retencion':    return '07'
        default:             return '01'
    }
}

// ── Generador XML ATS v1.31 ────────────────────────────────────────────────

function generarXmlAts(params: {
    ruc: string
    razonSocial: string
    año: number
    mes: number
    compras: SriComp[]
}): string {
    const { ruc, razonSocial, año, mes, compras } = params

    const mesStr = String(mes).padStart(2, '0')

    const xmlCompras = compras.map(c => {
        const { estab, ptoEmi, sec } = parseNumero(c.numero)
        const tpId         = tipoIdProv(c.proveedor_ruc)
        const tipoComp     = tipoCompSRI(c.tipo)
        const autorizacion = c.clave_acceso ?? '0000000000000000000000000000000000000000000000000'
        const fechaReg     = fmtDate(c.fecha_emision)
        const fechaEmi     = fmtDate(c.fecha_emision)

        const hasRet = !!(c.codigo_retencion && (c.valor_retenido ?? 0) > 0)

        const airBlock = hasRet ? `
      <air>
        <detalleAir>
          <codRetAir>${c.codigo_retencion}</codRetAir>
          <baseImpAir>${f2(c.base_iva > 0 ? c.base_iva : c.base_cero)}</baseImpAir>
          <porcentajeAir>${f2(c.porcentaje_ret ?? 0)}</porcentajeAir>
          <valRetAir>${f2(c.valor_retenido ?? 0)}</valRetAir>
        </detalleAir>
      </air>` : ''

        // SRI ATS v1.31: formasDePago requerido cuando bases + IVA + ICE > USD 500 (periodos >= 2013/01)
        const totalConIva = c.base_cero + c.base_iva + c.iva
        const formasPagoBlock = totalConIva > 500
            ? `\n      <formasDePago><formaPago>20</formaPago></formasDePago>`
            : ''

        return `    <detalleCompras>
      <codSustento>01</codSustento>
      <tpIdProv>${tpId}</tpIdProv>
      <idProv>${c.proveedor_ruc}</idProv>
      <tipoComprobante>${tipoComp}</tipoComprobante>
      <parteRel>NO</parteRel>
      <fechaRegistro>${fechaReg}</fechaRegistro>
      <establecimiento>${estab}</establecimiento>
      <puntoEmision>${ptoEmi}</puntoEmision>
      <secuencial>${sec}</secuencial>
      <fechaEmision>${fechaEmi}</fechaEmision>
      <autorizacion>${autorizacion}</autorizacion>
      <baseNoGraIva>0.00</baseNoGraIva>
      <baseImponible>${f2(c.base_cero)}</baseImponible>
      <baseImpGrav>${f2(c.base_iva)}</baseImpGrav>
      <baseImpExe>0.00</baseImpExe>
      <montoIce>0.00</montoIce>
      <montoIva>${f2(c.iva)}</montoIva>
      <valRetBien10>0.00</valRetBien10>
      <valRetServ20>0.00</valRetServ20>
      <valorRetBienes>0.00</valorRetBienes>
      <valRetServ50>0.00</valRetServ50>
      <valorRetServicios>0.00</valorRetServicios>
      <valRetServ100>0.00</valRetServ100>
      <valorRetencionNc>0.00</valorRetencionNc>
      <totbasesImpReemb>0.00</totbasesImpReemb>${airBlock}
      <pagoExterior><pagoLocExt>01</pagoLocExt><paisEfecPago>NA</paisEfecPago><aplicConvDobTrib>NA</aplicConvDobTrib><pagExtSujRetNorLeg>NA</pagExtSujRetNorLeg></pagoExterior>${formasPagoBlock}
    </detalleCompras>`
    }).join('\n')

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<iva>
  <TipoIDInformante>R</TipoIDInformante>
  <IdInformante>${ruc}</IdInformante>
  <razonSocial>${xmlEsc(razonSocial)}</razonSocial>
  <Anio>${año}</Anio>
  <Mes>${mesStr}</Mes>
  <numEstabRuc>001</numEstabRuc>
  <totalVentas>0.00</totalVentas>
  <codigoOperativo>IVA</codigoOperativo>
  <compras>
${xmlCompras}
  </compras>
  <ventas></ventas>
  <ventasEstablecimiento>
    <ventaEst>
      <codEstab>001</codEstab>
      <ventasEstab>0.00</ventasEstab>
      <ivaComp>0.00</ivaComp>
    </ventaEst>
  </ventasEstablecimiento>
</iva>`
}

// ── Componente ─────────────────────────────────────────────────────────────

export function AtsPage() {
    const { empresaActiva } = useAuth()
    const [searchParams] = useSearchParams()

    const [año, setAño] = useState(() => {
        const p = searchParams.get('año')
        return p ? parseInt(p, 10) : new Date().getFullYear()
    })
    const [mes, setMes] = useState(() => {
        const p = searchParams.get('mes')
        return p ? parseInt(p, 10) : new Date().getMonth() + 1
    })

    const [compras, setCompras]         = useState<SriComp[]>([])
    const [retenciones, setRetenciones] = useState<SriComp[]>([])
    const [cargando, setCargando]       = useState(false)
    const [error, setError]             = useState('')
    const [ok, setOk]                   = useState('')

    const [tabVista, setTabVista] = useState<'compras' | 'retenciones'>('compras')
    const [expandido, setExpandido] = useState<string | null>(null)

    const sym = empresaActiva?.moneda?.simbolo ?? '$'

    useEffect(() => {
        if (empresaActiva) cargarDatos()
    }, [empresaActiva, año, mes])

    async function cargarDatos() {
        if (!empresaActiva) return
        setCargando(true)
        setError('')

        const [{ data: compData, error: e1 }, { data: retData, error: e2 }] = await Promise.all([
            supabase.from('lp_sri_comprobantes')
                .select('*')
                .eq('empresa_id', empresaActiva.id)
                .eq('año', año)
                .eq('mes', mes)
                .in('tipo', ['factura', 'nota_credito', 'nota_debito'])
                .order('fecha_emision'),
            supabase.from('lp_sri_comprobantes')
                .select('*')
                .eq('empresa_id', empresaActiva.id)
                .eq('año', año)
                .eq('mes', mes)
                .eq('tipo', 'retencion')
                .order('fecha_emision'),
        ])

        if (e1 || e2) setError((e1 ?? e2)?.message ?? 'Error al cargar datos')
        setCompras((compData ?? []) as SriComp[])
        setRetenciones((retData ?? []) as SriComp[])
        setCargando(false)
    }

    function descargarXml() {
        if (!empresaActiva) return
        if (compras.length === 0) {
            setError('No hay comprobantes de compra para el período seleccionado. Importa los comprobantes del SRI primero.')
            return
        }

        const xml = generarXmlAts({
            ruc: empresaActiva.ruc ?? '9999999999999',
            razonSocial: empresaActiva.razon_social ?? empresaActiva.nombre,
            año,
            mes,
            compras,
        })

        const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ATS_${empresaActiva.ruc ?? 'RUC'}_${año}${String(mes).padStart(2, '0')}.xml`
        a.click()
        URL.revokeObjectURL(url)
        setOk(`ATS generado: ${compras.length} comprobante(s) de compra`)
    }

    // ── Totales ────────────────────────────────────────────────────────────

    const totCompras = {
        base0:  compras.reduce((s, c) => s + c.base_cero, 0),
        baseGr: compras.reduce((s, c) => s + c.base_iva,  0),
        iva:    compras.reduce((s, c) => s + c.iva,        0),
        total:  compras.reduce((s, c) => s + c.total,      0),
    }
    const totRet = {
        valor: retenciones.reduce((s, r) => s + (r.valor_retenido ?? 0), 0),
    }

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="space-y-5 max-w-6xl">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">ATS — Anexo Transaccional Simplificado</h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        Genera el XML para declaración mensual ante el SRI (versión 1.31)
                    </p>
                </div>
            </div>

            {/* Alertas */}
            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}
            {ok && (
                <div className="card px-5 py-3 bg-green-50 border-green-200 text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> {ok}
                    <button onClick={() => setOk('')} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Filtros + botón generar */}
            <div className="card p-5">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="label">Año</label>
                        <select className="input" value={año} onChange={e => setAño(+e.target.value)}>
                            {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label">Mes</label>
                        <select className="input" value={mes} onChange={e => setMes(+e.target.value)}>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{mesNombre(m)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1" />
                    <button
                        onClick={descargarXml}
                        disabled={cargando || (compras.length === 0 && retenciones.length === 0)}
                        className="btn btn-primary gap-2 px-6"
                    >
                        {cargando
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <FileDown className="w-4 h-4" />
                        }
                        Generar y descargar ATS XML
                    </button>
                </div>

                {/* Info empresa */}
                {empresaActiva?.ruc && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        Declarante: <strong className="text-slate-700">{empresaActiva.razon_social ?? empresaActiva.nombre}</strong>
                        — RUC: <span className="font-mono">{empresaActiva.ruc}</span>
                        — Período: <strong>{mesNombre(mes)} {año}</strong>
                    </div>
                )}
                {!empresaActiva?.ruc && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-amber-600">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        Esta empresa no tiene RUC configurado. Edítala en Configuración para que el ATS salga correcto.
                    </div>
                )}
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Compras / Facturas',       value: compras.filter(c => c.tipo === 'factura').length,      color: 'text-blue-600',   bg: 'bg-blue-50',   icon: ShoppingCart },
                    { label: 'NC / ND Recibidas',         value: compras.filter(c => c.tipo !== 'factura').length,      color: 'text-orange-600', bg: 'bg-orange-50', icon: FileText },
                    { label: 'Retenciones Recibidas',     value: retenciones.length,                                    color: 'text-purple-600', bg: 'bg-purple-50', icon: Receipt },
                    { label: 'Total Compras (IVA incl.)', value: formatMoneda(totCompras.total, sym),                   color: 'text-emerald-600',bg: 'bg-emerald-50',icon: FileDown },
                ].map(({ label, value, color, bg, icon: Icon }) => (
                    <div key={label} className="card p-4">
                        <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                            <Icon className={`w-5 h-5 ${color}`} />
                        </div>
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Tabs detalle */}
            <div>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm w-fit mb-4">
                    {([
                        ['compras',     `Compras (${compras.length})`,           ShoppingCart],
                        ['retenciones', `Retenciones (${retenciones.length})`,   Receipt],
                    ] as const).map(([id, label, Icon]) => (
                        <button key={id} type="button" onClick={() => setTabVista(id)}
                            className={cn('flex items-center gap-2 px-5 py-2.5 border-l border-slate-200 first:border-l-0',
                                tabVista === id ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                            <Icon className="w-4 h-4" /> {label}
                        </button>
                    ))}
                </div>

                {/* ── Tabla COMPRAS ── */}
                {tabVista === 'compras' && (
                    <div className="card overflow-hidden">
                        <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm">
                            Compras del período — {mesNombre(mes)} {año}
                        </div>
                        {cargando ? (
                            <div className="py-10 text-center text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                            </div>
                        ) : compras.length === 0 ? (
                            <div className="py-10 text-center text-slate-400">
                                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                Sin comprobantes de compra para este período.
                                <br />
                                <span className="text-xs">Importa el CSV del SRI en Integración SRI.</span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-2 w-8" />
                                            <th className="py-2 px-3 text-left">Tipo</th>
                                            <th className="py-2 px-3 text-left">Proveedor</th>
                                            <th className="py-2 px-3 text-left">Número</th>
                                            <th className="py-2 px-3 text-left">Fecha</th>
                                            <th className="py-2 px-3 text-right">Base 0%</th>
                                            <th className="py-2 px-3 text-right">Base Grav.</th>
                                            <th className="py-2 px-3 text-right">IVA</th>
                                            <th className="py-2 px-3 text-right">Total</th>
                                            <th className="py-2 px-3 text-center">ATS TP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {compras.map(c => {
                                            const isExp = expandido === c.id
                                            const { estab, ptoEmi, sec } = parseNumero(c.numero)
                                            return (
                                                <>
                                                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                        <td className="py-2 px-2">
                                                            <button onClick={() => setExpandido(isExp ? null : c.id)}
                                                                className="text-slate-400 hover:text-slate-600">
                                                                {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                            </button>
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                                                                c.tipo === 'factura' ? 'bg-blue-100 text-blue-700' :
                                                                c.tipo === 'nota_credito' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-orange-100 text-orange-700')}>
                                                                {c.tipo === 'factura' ? 'Factura' : c.tipo === 'nota_credito' ? 'N/C' : 'N/D'}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            <div className="font-medium text-slate-700 text-xs">{c.proveedor_nombre}</div>
                                                            <div className="text-slate-400 text-xs font-mono">{c.proveedor_ruc}</div>
                                                        </td>
                                                        <td className="py-2 px-3 font-mono text-xs text-slate-600">{c.numero}</td>
                                                        <td className="py-2 px-3 text-xs text-slate-500">{c.fecha_emision}</td>
                                                        <td className="py-2 px-3 text-right text-xs">{c.base_cero > 0 ? formatMoneda(c.base_cero, sym) : '—'}</td>
                                                        <td className="py-2 px-3 text-right text-xs">{c.base_iva > 0 ? formatMoneda(c.base_iva, sym) : '—'}</td>
                                                        <td className="py-2 px-3 text-right text-xs">{c.iva > 0 ? formatMoneda(c.iva, sym) : '—'}</td>
                                                        <td className="py-2 px-3 text-right font-semibold text-xs">{formatMoneda(c.total, sym)}</td>
                                                        <td className="py-2 px-3 text-center">
                                                            <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                                                {tipoCompSRI(c.tipo)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                    {isExp && (
                                                        <tr key={`${c.id}-det`} className="bg-slate-50 border-b border-slate-100">
                                                            <td colSpan={10} className="px-8 py-3">
                                                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Detalle ATS generado</p>
                                                                <div className="grid grid-cols-3 gap-2 text-xs font-mono text-slate-600">
                                                                    <div><span className="text-slate-400">Estab:</span> {estab}</div>
                                                                    <div><span className="text-slate-400">Pto Emisión:</span> {ptoEmi}</div>
                                                                    <div><span className="text-slate-400">Secuencial:</span> {sec}</div>
                                                                    <div><span className="text-slate-400">tpIdProv:</span> {tipoIdProv(c.proveedor_ruc)}</div>
                                                                    <div><span className="text-slate-400">tipoComp:</span> {tipoCompSRI(c.tipo)}</div>
                                                                    <div><span className="text-slate-400">codSustento:</span> 01</div>
                                                                    <div><span className="text-slate-400">baseImponible:</span> {f2(c.base_cero)}</div>
                                                                    <div><span className="text-slate-400">baseImpGrav:</span> {f2(c.base_iva)}</div>
                                                                    <div><span className="text-slate-400">montoIva:</span> {f2(c.iva)}</div>
                                                                    {c.codigo_retencion && (
                                                                        <>
                                                                            <div><span className="text-slate-400">codRetAir:</span> {c.codigo_retencion}</div>
                                                                            <div><span className="text-slate-400">porcentajeAir:</span> {c.porcentaje_ret}%</div>
                                                                            <div><span className="text-slate-400">valRetAir:</span> {f2(c.valor_retenido ?? 0)}</div>
                                                                        </>
                                                                    )}
                                                                    <div className="col-span-3">
                                                                        <span className="text-slate-400">autorizacion:</span>{' '}
                                                                        <span className="break-all">{c.clave_acceso ?? '(sin clave de acceso)'}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 font-semibold text-sm">
                                            <td colSpan={5} className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase">Totales</td>
                                            <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totCompras.base0, sym)}</td>
                                            <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totCompras.baseGr, sym)}</td>
                                            <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totCompras.iva, sym)}</td>
                                            <td className="py-2.5 px-3 text-right">{formatMoneda(totCompras.total, sym)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Tabla RETENCIONES ── */}
                {tabVista === 'retenciones' && (
                    <div className="card overflow-hidden">
                        <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm">
                            Retenciones recibidas — {mesNombre(mes)} {año}
                        </div>
                        {cargando ? (
                            <div className="py-10 text-center text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                            </div>
                        ) : retenciones.length === 0 ? (
                            <div className="py-10 text-center text-slate-400">
                                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                Sin retenciones para este período.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-3 text-left">Retentor (Cliente)</th>
                                            <th className="py-2 px-3 text-left">Número</th>
                                            <th className="py-2 px-3 text-left">Fecha</th>
                                            <th className="py-2 px-3 text-left">Cód. Ret.</th>
                                            <th className="py-2 px-3 text-right">Base</th>
                                            <th className="py-2 px-3 text-right">%</th>
                                            <th className="py-2 px-3 text-right">Valor Retenido</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {retenciones.map(r => (
                                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2 px-3">
                                                    <div className="font-medium text-slate-700 text-xs">{r.proveedor_nombre}</div>
                                                    <div className="text-slate-400 text-xs font-mono">{r.proveedor_ruc}</div>
                                                </td>
                                                <td className="py-2 px-3 font-mono text-xs text-slate-600">{r.numero}</td>
                                                <td className="py-2 px-3 text-xs text-slate-500">{r.fecha_emision}</td>
                                                <td className="py-2 px-3">
                                                    <span className="text-xs font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                                        {r.codigo_retencion ?? '—'}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">{formatMoneda(r.base_iva > 0 ? r.base_iva : r.base_cero, sym)}</td>
                                                <td className="py-2 px-3 text-right text-xs">{r.porcentaje_ret ?? 0}%</td>
                                                <td className="py-2 px-3 text-right font-semibold text-xs">{formatMoneda(r.valor_retenido ?? 0, sym)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 font-semibold text-sm">
                                            <td colSpan={6} className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase">Total retenido</td>
                                            <td className="py-2.5 px-3 text-right">{formatMoneda(totRet.valor, sym)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Nota informativa */}
            <div className="card p-4 bg-blue-50 border-blue-200 text-xs text-blue-700 flex gap-3">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                    <strong>ATS v1.31 — Información importante:</strong>
                    <ul className="mt-1 space-y-0.5 list-disc ml-4">
                        <li>Las compras se toman de los CSV importados desde el SRI (Integración SRI).</li>
                        <li>Las <strong>ventas</strong> se agregarán automáticamente cuando conectes QuickInvoice (Integración QI).</li>
                        <li>El <code>codSustento</code> se declara como <strong>01</strong> por defecto. Para ajustarlo por tipo de gasto, usa las Reglas de Mapeo en Integración SRI.</li>
                        <li>Verifica que el RUC y razón social de la empresa estén correctos en Configuración antes de declarar.</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
