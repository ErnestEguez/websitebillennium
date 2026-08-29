import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
    FileDown, Loader2, AlertCircle, CheckCircle, X,
    FileText, ShoppingCart, Receipt, ChevronDown, ChevronUp, Info, Ban,
    FileMinus, FilePlus, ClipboardList, Printer, Search,
} from 'lucide-react'
import { HelpButton } from '../../../components/help/HelpButton'
import { supabase as supabaseConta } from '../../../lib/supabaseContabilidad'
import { supabase } from '../../../lib/supabase'
import { useAuth as useContaAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { useAuth as useQIAuth } from '../../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'
import { imprimirReporte, generarTablaHtml } from '../../../lib/printUtils'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface DocModificado {
    tipo: string   // tipoComprobante del documento que la N/C o N/D modifica (normalmente '01')
    estab: string
    ptoEmi: string
    sec: string
    autorizacion: string
}

interface SriComp {
    id: string
    tipo: 'factura' | 'retencion' | 'nota_credito' | 'nota_debito' | 'liquidacion_compra'
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
    // Retención de IVA a proveedores (distinta de la Fuente de arriba) — NO va en
    // <air>, va en el bloque valRetBien10/valRetServ20/valorRetBienes/etc de
    // <detalleCompras>. Solo 30/70/100% mapeados por ahora (10/20/50% sin caso
    // confirmado, quedan en 0.00); ver generarXmlAts.
    iva_ret_pct?: number | null
    iva_ret_valor?: number | null
    // Solo Liquidación de Compra: tpIdProv real (CEDULA/PASAPORTE) — el beneficiario
    // no necesariamente tiene RUC, así que no se puede inferir solo por longitud.
    tpIdProvOverride?: string
    codSustentoOverride?: string
    // Solo N/C y N/D de proveedores: documento que modifican (obligatorio en ATS para tipoComprobante 04/05)
    docModificado?: DocModificado
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

// tpIdCliente (VENTAS) — catálogo SRI: 04 RUC, 05 Cédula, 06 Pasaporte, 07 Consumidor final
function tipoIdProv(ruc: string): string {
    const r = ruc.replace(/\D/g, '')
    if (r === '9999999999999' || r === '9999999999') return '07'  // consumidor final
    if (r.length === 13) return '04'   // RUC — catálogo de VENTAS usa 04, no 01 (ese es el de compras)
    if (r.length === 10) return '05'   // Cédula
    return '06'                         // Pasaporte u otro
}

// tpIdProv (COMPRAS) — catálogo SRI distinto al de ventas: 01 RUC, 02 Cédula, 03 Pasaporte.
// Confirmado contra ATS real: proveedor con cédula (10 dígitos) declarado como '02', no '05'.
function tipoIdProvCompra(ruc: string): string {
    const r = ruc.replace(/\D/g, '')
    if (r.length === 13) return '01'   // RUC
    if (r.length === 10) return '02'   // Cédula
    return '03'                         // Pasaporte u otro
}

function tipoCompSRI(tipo: SriComp['tipo']): string {
    switch (tipo) {
        case 'factura':             return '01'
        case 'liquidacion_compra':  return '03'
        case 'nota_credito':        return '04'
        case 'nota_debito':         return '05'
        case 'retencion':           return '07'
        default:                    return '01'
    }
}

// Documento propio (emitido por nosotros) anulado — candidato para <anulados>.
// El contador decide caso por caso cuáles reportar (checklist vacío por defecto).
interface AnuladoCandidato {
    id: string
    origen: 'factura'
    tipoComprobante: string   // '01' Factura anulada — único tipo declarado en <anulados>
    descripcion: string
    numero: string            // "est-pto-sec"
    autorizacion: string
    fecha: string
}

// ── Generador XML ATS v1.31 ────────────────────────────────────────────────

interface VentaAts {
    cliente_ruc: string
    cliente_nombre: string
    base_cero: number
    base_iva: number
    iva: number
    total: number
    cantidad: number
    valor_ret_iva: number
    valor_ret_renta: number
}

function generarXmlAts(params: {
    ruc: string
    razonSocial: string
    año: number
    mes: number
    compras: SriComp[]
    ventas: VentaAts[]
    anulados: AnuladoCandidato[]
}): string {
    const { ruc, razonSocial, año, mes, compras, ventas, anulados } = params

    const mesStr = String(mes).padStart(2, '0')

    const xmlCompras = compras.map(c => {
        const { estab, ptoEmi, sec } = parseNumero(c.numero)
        const tpId         = c.tpIdProvOverride ?? tipoIdProvCompra(c.proveedor_ruc)
        const tipoComp     = tipoCompSRI(c.tipo)
        const codSustento  = c.codSustentoOverride ?? '01'
        const autorizacion = c.clave_acceso ?? '0000000000000000000000000000000000000000000000000'
        const fechaReg     = fmtDate(c.fecha_emision)
        const fechaEmi     = fmtDate(c.fecha_emision)

        // N/C y N/D deben declarar el documento que modifican (ATS lo exige para tipoComprobante 04/05)
        const docModBlock = c.docModificado ? `
      <docModificado>${c.docModificado.tipo}</docModificado>
      <estabModificado>${c.docModificado.estab}</estabModificado>
      <ptoEmiModificado>${c.docModificado.ptoEmi}</ptoEmiModificado>
      <secModificado>${c.docModificado.sec.padStart(9, '0')}</secModificado>
      <autModificado>${xmlEsc(c.docModificado.autorizacion)}</autModificado>` : ''

        const hasRet = !!(c.codigo_retencion && (c.valor_retenido ?? 0) > 0)

        const airBlock = hasRet ? `
      <air>
        <detalleAir>
          <codRetAir>${xmlEsc(c.codigo_retencion ?? '')}</codRetAir>
          <baseImpAir>${f2(c.base_iva > 0 ? c.base_iva : c.base_cero)}</baseImpAir>
          <porcentajeAir>${f2(c.porcentaje_ret ?? 0)}</porcentajeAir>
          <valRetAir>${f2(c.valor_retenido ?? 0)}</valRetAir>
        </detalleAir>
      </air>` : ''

        // Retención de IVA a proveedores — NUNCA va en <air> (eso es solo Fuente).
        // Va acá, en detalleCompras. Solo 30/70/100% mapeados por ahora (confirmado
        // con el usuario): 30%→bienes, 70%/100%→servicios. 10/20/50% sin caso
        // confirmado todavía, quedan en 0.00.
        let valRetBien10 = 0, valorRetBienes = 0
        let valRetServ20 = 0, valRetServ50 = 0, valorRetServicios = 0, valRetServ100 = 0
        const ivaPct = c.iva_ret_pct ?? 0
        const ivaValor = c.iva_ret_valor ?? 0
        if (ivaValor > 0) {
            if (ivaPct === 30) { valRetBien10 = ivaValor; valorRetBienes = ivaValor }
            else if (ivaPct === 70) { valRetServ20 = ivaValor; valorRetServicios = ivaValor }
            else if (ivaPct === 100) { valRetServ100 = ivaValor; valorRetServicios = ivaValor }
        }

        // SRI ATS v1.31: formasDePago requerido cuando bases + IVA + ICE > USD 500 (periodos >= 2013/01)
        const totalConIva = c.base_cero + c.base_iva + c.iva
        const formasPagoBlock = totalConIva > 500
            ? `\n      <formasDePago><formaPago>20</formaPago></formasDePago>`
            : ''

        return `    <detalleCompras>
      <codSustento>${codSustento}</codSustento>
      <tpIdProv>${tpId}</tpIdProv>
      <idProv>${xmlEsc(c.proveedor_ruc)}</idProv>
      <tipoComprobante>${tipoComp}</tipoComprobante>
      <parteRel>NO</parteRel>
      <fechaRegistro>${fechaReg}</fechaRegistro>
      <establecimiento>${estab}</establecimiento>
      <puntoEmision>${ptoEmi}</puntoEmision>
      <secuencial>${sec}</secuencial>
      <fechaEmision>${fechaEmi}</fechaEmision>
      <autorizacion>${xmlEsc(autorizacion)}</autorizacion>
      <baseNoGraIva>0.00</baseNoGraIva>
      <baseImponible>${f2(c.base_cero)}</baseImponible>
      <baseImpGrav>${f2(c.base_iva)}</baseImpGrav>
      <baseImpExe>0.00</baseImpExe>
      <montoIce>0.00</montoIce>
      <montoIva>${f2(c.iva)}</montoIva>
      <valRetBien10>${f2(valRetBien10)}</valRetBien10>
      <valRetServ20>${f2(valRetServ20)}</valRetServ20>
      <valorRetBienes>${f2(valorRetBienes)}</valorRetBienes>
      <valRetServ50>${f2(valRetServ50)}</valRetServ50>
      <valorRetServicios>${f2(valorRetServicios)}</valorRetServicios>
      <valRetServ100>${f2(valRetServ100)}</valRetServ100>
      <valorRetencionNc>0.00</valorRetencionNc>
      <totbasesImpReemb>0.00</totbasesImpReemb>
      <pagoExterior><pagoLocExt>01</pagoLocExt><paisEfecPago>NA</paisEfecPago><aplicConvDobTrib>NA</aplicConvDobTrib><pagExtSujRetNorLeg>NA</pagExtSujRetNorLeg></pagoExterior>${formasPagoBlock}${airBlock}${docModBlock}
    </detalleCompras>`
    }).join('\n')

    // totalVentas y ventasEstab (más abajo) son la suma de ventas SIN IVA
    // (bases). Incluir el IVA ahí rompe la validación cruzada del DIMM
    // contra la sumatoria real de detalleVentas.
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<iva>
  <TipoIDInformante>R</TipoIDInformante>
  <IdInformante>${ruc}</IdInformante>
  <razonSocial>${xmlEsc(razonSocial)}</razonSocial>
  <Anio>${año}</Anio>
  <Mes>${mesStr}</Mes>
  <numEstabRuc>001</numEstabRuc>
  <totalVentas>${f2(ventas.reduce((s, v) => s + v.base_cero + v.base_iva, 0))}</totalVentas>
  <codigoOperativo>IVA</codigoOperativo>
  <compras>
${xmlCompras}
  </compras>
  <ventas>
${ventas.map(v => {
    const tpId = tipoIdProv(v.cliente_ruc)
    // A partir de junio-2016 las formas de cobro son obligatorias en TODAS
    // las ventas del ATS, sin importar el monto (a diferencia de compras,
    // que sigue condicionado a > USD 500).
    const fpBlock = `\n      <formasDePago><formaPago>01</formaPago></formasDePago>`
    // parteRelVtas solo se declara si tpIdCliente es 04/05/06 — NUNCA para
    // 07 (consumidor final), el DIMM lo rechaza si viene presente ahí.
    const parteRelBlock = tpId !== '07' ? `\n      <parteRelVtas>NO</parteRelVtas>` : ''
    return `    <detalleVentas>
      <tpIdCliente>${tpId}</tpIdCliente>
      <idCliente>${xmlEsc(v.cliente_ruc)}</idCliente>${parteRelBlock}
      <tipoComprobante>18</tipoComprobante>
      <tipoEmision>F</tipoEmision>
      <numeroComprobantes>${v.cantidad}</numeroComprobantes>
      <baseNoGraIva>0.00</baseNoGraIva>
      <baseImponible>${f2(v.base_cero)}</baseImponible>
      <baseImpGrav>${f2(v.base_iva)}</baseImpGrav>
      <montoIva>${f2(v.iva)}</montoIva>
      <montoIce>0.00</montoIce>
      <valorRetIva>${f2(v.valor_ret_iva)}</valorRetIva>
      <valorRetRenta>${f2(v.valor_ret_renta)}</valorRetRenta>${fpBlock}
    </detalleVentas>`
}).join('\n')}
  </ventas>
  <ventasEstablecimiento>
    <ventaEst>
      <codEstab>001</codEstab>
      <ventasEstab>${f2(ventas.reduce((s, v) => s + v.base_cero + v.base_iva, 0))}</ventasEstab>
      <ivaComp>0.00</ivaComp>
    </ventaEst>
  </ventasEstablecimiento>${anulados.length > 0 ? `
  <anulados>
${anulados.map(a => {
    const { estab, ptoEmi, sec } = parseNumero(a.numero)
    const secPad = sec.padStart(9, '0')
    return `    <detalleAnulados>
      <tipoComprobante>${a.tipoComprobante}</tipoComprobante>
      <establecimiento>${estab}</establecimiento>
      <puntoEmision>${ptoEmi}</puntoEmision>
      <secuencialInicio>${secPad}</secuencialInicio>
      <secuencialFin>${secPad}</secuencialFin>
      <autorizacion>${xmlEsc(a.autorizacion)}</autorizacion>
    </detalleAnulados>`
}).join('\n')}
  </anulados>` : ''}
</iva>`
}

// ── Tabla reutilizable de compras/liquidaciones/N-C/N-D (una por pestaña) ──

function TablaComprasATS({ titulo, rows, sym, cargando, EmptyIcon, emptyMsg }: {
    titulo: string
    rows: SriComp[]
    sym: string
    cargando: boolean
    EmptyIcon: React.ElementType
    emptyMsg: React.ReactNode
}) {
    const [expandido, setExpandido] = useState<string | null>(null)

    const tot = {
        base0:  rows.reduce((s, c) => s + c.base_cero, 0),
        baseGr: rows.reduce((s, c) => s + c.base_iva,  0),
        iva:    rows.reduce((s, c) => s + c.iva,        0),
        total:  rows.reduce((s, c) => s + c.total,      0),
    }

    return (
        <div className="card overflow-hidden">
            <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm">{titulo}</div>
            {cargando ? (
                <div className="py-10 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                </div>
            ) : rows.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                    <EmptyIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {emptyMsg}
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
                            {rows.map(c => {
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
                                                    c.tipo === 'liquidacion_compra' ? 'bg-indigo-100 text-indigo-700' :
                                                    c.tipo === 'nota_credito' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-orange-100 text-orange-700')}>
                                                    {c.tipo === 'factura' ? 'Factura' :
                                                     c.tipo === 'liquidacion_compra' ? 'Liquid.' :
                                                     c.tipo === 'nota_credito' ? 'N/C' : 'N/D'}
                                                </span>
                                                {(c.tipo === 'nota_credito' || c.tipo === 'nota_debito') && !c.docModificado && (
                                                    <span title="Falta el documento que modifica — el ATS la va a rechazar. Ábrela y completa el documento modificado."
                                                        className="ml-1 text-xs font-bold text-red-600">⚠</span>
                                                )}
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
                                                        <div><span className="text-slate-400">tpIdProv:</span> {c.tpIdProvOverride ?? tipoIdProvCompra(c.proveedor_ruc)}</div>
                                                        <div><span className="text-slate-400">tipoComp:</span> {tipoCompSRI(c.tipo)}</div>
                                                        <div><span className="text-slate-400">codSustento:</span> {c.codSustentoOverride ?? '01'}</div>
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
                                                        {c.docModificado && (
                                                            <div className="col-span-3">
                                                                <span className="text-slate-400">docModificado:</span>{' '}
                                                                {c.docModificado.tipo} {c.docModificado.estab}-{c.docModificado.ptoEmi}-{c.docModificado.sec}
                                                            </div>
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
                                <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(tot.base0, sym)}</td>
                                <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(tot.baseGr, sym)}</td>
                                <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(tot.iva, sym)}</td>
                                <td className="py-2.5 px-3 text-right">{formatMoneda(tot.total, sym)}</td>
                                <td />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    )
}

// ── Componente ─────────────────────────────────────────────────────────────

export function AtsPage() {
    const { empresaActiva } = useContaAuth()
    const { empresa } = useQIAuth() as any
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
    const [ventasAts, setVentasAts]     = useState<VentaAts[]>([])
    const [anulados, setAnulados]       = useState<AnuladoCandidato[]>([])
    // Checklist vacío por defecto — el contador decide caso por caso cuáles reportar.
    const [anuladosSeleccionados, setAnuladosSeleccionados] = useState<Set<string>>(new Set())
    const [cargando, setCargando]       = useState(false)
    const [error, setError]             = useState('')
    const [ok, setOk]                   = useState('')

    const [excluirVentas, setExcluirVentas] = useState(false)
    const [tabVista, setTabVista] = useState<'compras' | 'nc' | 'nd' | 'ventas' | 'retenciones' | 'anulados' | 'resumen'>('compras')

    const sym = empresaActiva?.moneda?.simbolo ?? '$'

    // Sin auto-carga: el usuario elige año/mes y presiona "Buscar" — un
    // período con mucha data puede tardar, no tiene sentido dispararlo solo
    // por cambiar el selector o por entrar a la pantalla.
    const [yaBuscado, setYaBuscado] = useState(false)

    async function cargarDatos() {
        setYaBuscado(true)
        setCargando(true)
        setError('')

        const mesStr = String(mes).padStart(2, '0')
        const desde = `${año}-${mesStr}-01`
        const hasta = `${año}-${mesStr}-${new Date(año, mes, 0).getDate()}`

        // Fuente 1: SRI CSV (contabilidad schema) — compras + retenciones importadas.
        // Se filtra por fecha_emision (fecha real del documento), igual que el
        // resto de fuentes de este mismo período y que Consulta de Compras —
        // NO por las columnas año/mes de la tabla, que reflejan el período que
        // estaba seleccionado en Integración SRI al momento de importar el CSV
        // (puede no coincidir con la fecha real si se importó bajo el período
        // equivocado) y causaban que apareciera data de otro mes.
        let sriCompras: SriComp[] = []
        let sriRetenciones: SriComp[] = []
        if (empresaActiva) {
            const [{ data: cd }, { data: rd }] = await Promise.all([
                supabaseConta.from('lp_sri_comprobantes').select('*')
                    .eq('empresa_id', empresaActiva.id).gte('fecha_emision', desde).lte('fecha_emision', hasta)
                    .in('tipo', ['factura', 'nota_credito', 'nota_debito']).order('fecha_emision'),
                supabaseConta.from('lp_sri_comprobantes').select('*')
                    .eq('empresa_id', empresaActiva.id).gte('fecha_emision', desde).lte('fecha_emision', hasta)
                    .eq('tipo', 'retencion').order('fecha_emision'),
            ])
            sriCompras = (cd ?? []) as SriComp[]
            sriRetenciones = (rd ?? []) as SriComp[]
        }

        // Fuente 2: Facturación directa — compras manuales
        let facCompras: SriComp[] = []
        if (empresa?.id) {
            const { data } = await supabase
                .from('ingresos_stock')
                .select('id, numero_factura, clave_acceso, fecha_emision, base_iva_0, base_iva_5, base_iva_15, valor_iva, total, proveedor:proveedores(ruc, nombre_empresa), retenciones:retenciones_compras(tipo, codigo_retencion, porcentaje, valor)')
                .eq('empresa_id', empresa.id)
                .eq('estado', 'ACTIVO')
                .gte('fecha_emision', desde).lte('fecha_emision', hasta)
                .order('fecha_emision')
            facCompras = (data ?? []).map((r: any) => {
                // <air>/<codRetAir> del ATS es EXCLUSIVO de retención en la Fuente
                // (Renta) — el DIMM rechaza códigos de retención de IVA ahí (ej.
                // código "1"). Si la compra tiene ambas retenciones, se toma solo
                // la de tipo FUENTE para este bloque; la de IVA sigue existiendo
                // en retenciones_compras para el 104, solo no va en <air>.
                const retFuente = (r.retenciones ?? []).find((ret: any) => ret.tipo === 'FUENTE')
                const valorFuente = (r.retenciones ?? [])
                    .filter((ret: any) => ret.tipo === 'FUENTE')
                    .reduce((s: number, ret: any) => s + (ret.valor ?? 0), 0)
                // Retención de IVA a proveedores — NO va en <air>, va en el bloque
                // valRetBien10/valRetServ20/etc (ver generarXmlAts).
                const retIva = (r.retenciones ?? []).find((ret: any) => ret.tipo === 'IVA')
                const valorIva = (r.retenciones ?? [])
                    .filter((ret: any) => ret.tipo === 'IVA')
                    .reduce((s: number, ret: any) => s + (ret.valor ?? 0), 0)
                return {
                    id: r.id,
                    tipo: 'factura' as const,
                    proveedor_ruc: r.proveedor?.ruc ?? '',
                    proveedor_nombre: r.proveedor?.nombre_empresa ?? '',
                    numero: r.numero_factura ?? '',
                    clave_acceso: r.clave_acceso,
                    fecha_emision: r.fecha_emision,
                    base_cero: r.base_iva_0 ?? 0,
                    base_iva: (r.base_iva_5 ?? 0) + (r.base_iva_15 ?? 0),
                    iva: r.valor_iva ?? 0,
                    total: r.total ?? 0,
                    codigo_retencion: retFuente?.codigo_retencion ?? null,
                    porcentaje_ret: retFuente?.porcentaje ?? null,
                    valor_retenido: valorFuente || null,
                    iva_ret_pct: retIva?.porcentaje ?? null,
                    iva_ret_valor: valorIva || null,
                }
            })
        }

        // Fuente 3: Facturación directa — Liquidaciones de Compra (emitidas por nosotros, tipoComprobante 03)
        let facLiquidaciones: SriComp[] = []
        if (empresa?.id) {
            const { data } = await supabase
                .from('liquidaciones_compra')
                .select('id, establecimiento, punto_emision, secuencial, clave_acceso, fecha_emision, base_iva_0, base_iva_15, valor_iva, total, beneficiario_tipo_id, beneficiario_identificacion, beneficiario_nombre')
                .eq('empresa_id', empresa.id)
                .eq('estado_sri', 'AUTORIZADO')
                .gte('fecha_emision', desde).lte('fecha_emision', hasta)
                .order('fecha_emision')
            facLiquidaciones = (data ?? []).map((r: any) => ({
                id: r.id,
                tipo: 'liquidacion_compra' as const,
                proveedor_ruc: r.beneficiario_identificacion ?? '',
                proveedor_nombre: r.beneficiario_nombre ?? '',
                numero: `${r.establecimiento}-${r.punto_emision}-${r.secuencial}`,
                clave_acceso: r.clave_acceso,
                fecha_emision: r.fecha_emision,
                base_cero: r.base_iva_0 ?? 0,
                base_iva: r.base_iva_15 ?? 0,
                iva: r.valor_iva ?? 0,
                total: r.total ?? 0,
                codigo_retencion: null,
                porcentaje_ret: null,
                valor_retenido: null,
                tpIdProvOverride: r.beneficiario_tipo_id === 'PASAPORTE' ? '03' : '02',
                codSustentoOverride: '03',
            }))
        }

        // Fuente 4: N/C de proveedores registradas en QuickInvoice (tipoComprobante 04 — requiere doc que modifican)
        let facNcProveedores: SriComp[] = []
        if (empresa?.id) {
            const { data } = await supabase
                .from('notas_credito_proveedores')
                .select('id, numero_nc, autorizacion_nc, fecha_nc, base_iva_0, base_iva_5, base_iva_15, valor_iva, total, proveedor:proveedores(ruc, nombre_empresa), compra:ingresos_stock(numero_factura, clave_acceso), doc_mod_tipo, doc_mod_establecimiento, doc_mod_punto_emision, doc_mod_secuencial, doc_mod_autorizacion')
                .eq('empresa_id', empresa.id)
                .eq('estado', 'ACTIVA')
                .gte('fecha_nc', desde).lte('fecha_nc', hasta)
                .order('fecha_nc')
            facNcProveedores = (data ?? []).map((r: any) => {
                const orig = r.compra ? parseNumero(r.compra.numero_factura ?? '') : null
                const docModificado = (orig && r.compra?.clave_acceso)
                    ? { tipo: '01', estab: orig.estab, ptoEmi: orig.ptoEmi, sec: orig.sec, autorizacion: r.compra.clave_acceso }
                    : (r.doc_mod_establecimiento && r.doc_mod_secuencial && r.doc_mod_autorizacion)
                        ? { tipo: r.doc_mod_tipo ?? '01', estab: r.doc_mod_establecimiento, ptoEmi: r.doc_mod_punto_emision ?? '001', sec: r.doc_mod_secuencial, autorizacion: r.doc_mod_autorizacion }
                        : undefined
                return {
                    id: r.id,
                    tipo: 'nota_credito' as const,
                    proveedor_ruc: r.proveedor?.ruc ?? '',
                    proveedor_nombre: r.proveedor?.nombre_empresa ?? '',
                    numero: r.numero_nc ?? '',
                    clave_acceso: r.autorizacion_nc,
                    fecha_emision: r.fecha_nc,
                    base_cero: r.base_iva_0 ?? 0,
                    base_iva: (r.base_iva_5 ?? 0) + (r.base_iva_15 ?? 0),
                    iva: r.valor_iva ?? 0,
                    total: r.total ?? 0,
                    codigo_retencion: null,
                    porcentaje_ret: null,
                    valor_retenido: null,
                    docModificado,
                }
            })
        }

        // Fuente 5: N/D de proveedores registradas en QuickInvoice (tipoComprobante 05 — requiere doc que modifican)
        let facNdProveedores: SriComp[] = []
        if (empresa?.id) {
            const { data } = await supabase
                .from('nd_proveedores')
                .select('id, numero_nd, numero_autorizacion, fecha_emision, base_imponible, iva, total, proveedor:proveedores(ruc, nombre_empresa), compra:ingresos_stock(numero_factura, clave_acceso), doc_mod_tipo, doc_mod_establecimiento, doc_mod_punto_emision, doc_mod_secuencial, doc_mod_autorizacion')
                .eq('empresa_id', empresa.id)
                .eq('estado', 'ACTIVA')
                .gte('fecha_emision', desde).lte('fecha_emision', hasta)
                .order('fecha_emision')
            facNdProveedores = (data ?? []).map((r: any) => {
                const orig = r.compra ? parseNumero(r.compra.numero_factura ?? '') : null
                const docModificado = (orig && r.compra?.clave_acceso)
                    ? { tipo: '01', estab: orig.estab, ptoEmi: orig.ptoEmi, sec: orig.sec, autorizacion: r.compra.clave_acceso }
                    : (r.doc_mod_establecimiento && r.doc_mod_secuencial && r.doc_mod_autorizacion)
                        ? { tipo: r.doc_mod_tipo ?? '01', estab: r.doc_mod_establecimiento, ptoEmi: r.doc_mod_punto_emision ?? '001', sec: r.doc_mod_secuencial, autorizacion: r.doc_mod_autorizacion }
                        : undefined
                return {
                    id: r.id,
                    tipo: 'nota_debito' as const,
                    proveedor_ruc: r.proveedor?.ruc ?? '',
                    proveedor_nombre: r.proveedor?.nombre_empresa ?? '',
                    numero: r.numero_nd ?? '',
                    clave_acceso: r.numero_autorizacion,
                    fecha_emision: r.fecha_emision,
                    base_cero: 0,
                    base_iva: r.base_imponible ?? 0,
                    iva: r.iva ?? 0,
                    total: r.total ?? 0,
                    codigo_retencion: null,
                    porcentaje_ret: null,
                    valor_retenido: null,
                    docModificado,
                }
            })
        }

        // Fuente 6: Facturas de venta anuladas (candidatos para el checklist de <anulados>)
        // El ATS solo declara acá facturas anuladas (tipoComprobante 01) — N/C y
        // Liquidaciones de Compra anuladas NO van en este bloque.
        let candidatosAnulados: AnuladoCandidato[] = []
        if (empresa?.id) {
            const { data: facturasAnuladas } = await supabase
                .from('comprobantes')
                .select('id, secuencial, clave_acceso, fecha_anulacion, created_at')
                .eq('empresa_id', empresa.id)
                .eq('tipo_comprobante', 'FACTURA')
                .eq('estado_sistema', 'ANULADA')
                .gte('fecha_anulacion', desde).lte('fecha_anulacion', hasta + 'T23:59:59')
            candidatosAnulados = (facturasAnuladas ?? []).map((r: any): AnuladoCandidato => ({
                id: `fac-${r.id}`,
                origen: 'factura',
                tipoComprobante: '01',
                descripcion: `Factura ${r.secuencial}`,
                numero: r.secuencial ?? '',
                autorizacion: r.clave_acceso ?? '',
                fecha: r.fecha_anulacion ?? r.created_at ?? '',
            }))
        }

        // Fuente 7: Facturación directa — ventas (agrupadas por cliente para ATS)
        // Excluye ANULADA — esas se declaran aparte en <anulados>, no como venta.
        let ventasAgrupadas: VentaAts[] = []
        if (empresa?.id) {
            const { data } = await supabase
                .from('comprobantes')
                .select('id, total, cliente:clientes(identificacion, nombre), comprobante_detalles(subtotal, iva_porcentaje, iva_valor)')
                .eq('empresa_id', empresa.id)
                .neq('estado_sistema', 'ANULADA')
                .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59')
            const porCliente: Record<string, VentaAts> = {}
            for (const v of (data ?? []) as any[]) {
                const ruc = v.cliente?.identificacion ?? '9999999999999'
                if (!porCliente[ruc]) {
                    porCliente[ruc] = {
                        cliente_ruc: ruc,
                        cliente_nombre: v.cliente?.nombre ?? 'CONSUMIDOR FINAL',
                        base_cero: 0, base_iva: 0, iva: 0, total: 0, cantidad: 0,
                        valor_ret_iva: 0, valor_ret_renta: 0,
                    }
                }
                const c = porCliente[ruc]
                for (const d of (v.comprobante_detalles ?? [])) {
                    if ((d.iva_porcentaje ?? 0) === 0) c.base_cero += d.subtotal ?? 0
                    else c.base_iva += d.subtotal ?? 0
                    c.iva += d.iva_valor ?? 0
                }
                c.total += v.total ?? 0
                c.cantidad += 1
            }

            // Retenciones que los clientes le hicieron a esta empresa en el período
            // (al facturar + posteriores + cartera), acumuladas por RUC — van en
            // <valorRetIva>/<valorRetRenta> de cada <detalleVentas>. Las de tarjeta
            // (RECAP banco) NO entran acá — no se declaran en el ATS, solo en el 104.
            const { data: retVentas } = await supabase
                .from('retenciones_ventas')
                .select('tipo, valor, cliente:clientes(identificacion)')
                .eq('empresa_id', empresa.id)
                .eq('estado', 'ACTIVO')
                .gte('fecha_emision', desde.slice(0, 10)).lte('fecha_emision', hasta.slice(0, 10))
            for (const r of (retVentas ?? []) as any[]) {
                const ruc = r.cliente?.identificacion
                if (!ruc || !porCliente[ruc]) continue
                if (r.tipo === 'IVA') porCliente[ruc].valor_ret_iva += Number(r.valor) || 0
                else porCliente[ruc].valor_ret_renta += Number(r.valor) || 0
            }

            ventasAgrupadas = Object.values(porCliente)
        }

        // Merge compras: SRI (CSV) + facturación directa (facturas, liquidaciones, N/C, N/D), deduplicar por numero+ruc
        const sriKeys = new Set(sriCompras.map(c => `${c.numero}|${c.proveedor_ruc}`))
        const noDup = (c: SriComp) => !sriKeys.has(`${c.numero}|${c.proveedor_ruc}`)
        const todasCompras = [
            ...sriCompras,
            ...facCompras.filter(noDup),
            ...facLiquidaciones.filter(noDup),
            ...facNcProveedores.filter(noDup),
            ...facNdProveedores.filter(noDup),
        ]

        setCompras(todasCompras)
        setRetenciones(sriRetenciones)
        setVentasAts(ventasAgrupadas)
        setAnulados(candidatosAnulados)
        // Preseleccionadas por defecto: una factura anulada en el período casi
        // siempre debe declararse. El usuario puede destildar la que no quiera
        // reportar antes de generar el XML.
        setAnuladosSeleccionados(new Set(candidatosAnulados.map(a => a.id)))
        setCargando(false)
    }

    function toggleAnulado(id: string) {
        setAnuladosSeleccionados(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    function descargarXml() {
        if (compras.length === 0 && ventasAts.length === 0) {
            setError('No hay comprobantes para el período seleccionado.')
            return
        }

        const rucDeclarante = empresaActiva?.ruc ?? empresa?.ruc ?? '9999999999999'
        const razon = empresaActiva?.razon_social ?? empresaActiva?.nombre ?? empresa?.nombre ?? ''

        const ventasParaXml = excluirVentas ? [] : ventasAts
        const anuladosParaXml = anulados.filter(a => anuladosSeleccionados.has(a.id))

        const xml = generarXmlAts({
            ruc: rucDeclarante,
            razonSocial: razon,
            año,
            mes,
            compras,
            ventas: ventasParaXml,
            anulados: anuladosParaXml,
        })

        const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ATS_${rucDeclarante}_${año}${String(mes).padStart(2, '0')}.xml`
        a.click()
        URL.revokeObjectURL(url)
        setOk(`ATS generado: ${compras.length} compra(s)${excluirVentas ? ' (ventas excluidas)' : `, ${ventasAts.reduce((s, v) => s + v.cantidad, 0)} venta(s)`}${anuladosParaXml.length > 0 ? `, ${anuladosParaXml.length} anulado(s)` : ''}`)
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

    // Compras se divide en 3 pestañas: facturas/liquidaciones, N/C proveedores, N/D proveedores
    const comprasFacturas = compras.filter(c => c.tipo === 'factura' || c.tipo === 'liquidacion_compra')
    const comprasNC = compras.filter(c => c.tipo === 'nota_credito')
    const comprasND = compras.filter(c => c.tipo === 'nota_debito')

    // ── Talón Resumen ──────────────────────────────────────────────────────
    const LABEL_TIPO_COMP: Record<string, string> = {
        '01': 'Facturas', '03': 'Liquidaciones de Compra', '04': 'Notas de Crédito', '05': 'Notas de Débito',
    }
    const resumenComprasPorTipo = Object.entries(
        compras.reduce((acc, c) => {
            const cod = tipoCompSRI(c.tipo)
            if (!acc[cod]) acc[cod] = { cod, cantidad: 0, base0: 0, baseGr: 0, iva: 0, total: 0 }
            acc[cod].cantidad += 1
            acc[cod].base0 += c.base_cero
            acc[cod].baseGr += c.base_iva
            acc[cod].iva += c.iva
            acc[cod].total += c.total
            return acc
        }, {} as Record<string, { cod: string; cantidad: number; base0: number; baseGr: number; iva: number; total: number }>)
    ).map(([, v]) => v).sort((a, b) => a.cod.localeCompare(b.cod))

    // Total del Talón Resumen de Compras: Facturas/Liquidaciones (01/03) menos
    // N/C (04) más N/D (05) — igual que el propio talón del SRI, NO una suma
    // ciega de todo (una N/C reduce lo comprado, una N/D lo aumenta).
    const totComprasTalon = resumenComprasPorTipo.reduce((acc, r) => {
        const signo = r.cod === '04' ? -1 : 1
        acc.base0 += r.base0 * signo
        acc.baseGr += r.baseGr * signo
        acc.iva += r.iva * signo
        acc.total += r.total * signo
        return acc
    }, { base0: 0, baseGr: 0, iva: 0, total: 0 })

    const anuladosMarcados = anulados.filter(a => anuladosSeleccionados.has(a.id))

    // Retenciones que ESTA empresa efectuó a proveedores (Fuente, del bloque <air>) — agrupadas por código.
    const resumenRetFuente = Object.entries(
        compras.filter(c => c.codigo_retencion && (c.valor_retenido ?? 0) > 0).reduce((acc, c) => {
            const cod = c.codigo_retencion!
            if (!acc[cod]) acc[cod] = { cod, base: 0, pct: c.porcentaje_ret ?? 0, valor: 0, cantidad: 0 }
            acc[cod].base += (c.base_iva > 0 ? c.base_iva : c.base_cero)
            acc[cod].valor += c.valor_retenido ?? 0
            acc[cod].cantidad += 1
            return acc
        }, {} as Record<string, { cod: string; base: number; pct: number; valor: number; cantidad: number }>)
    ).map(([, v]) => v).sort((a, b) => a.cod.localeCompare(b.cod))
    const totRetFuenteEfectuada = resumenRetFuente.reduce((s, r) => s + r.valor, 0)

    // Retenciones que los CLIENTES le efectuaron a esta empresa en el período (IVA + Renta), del punto 6.
    const totRetIvaSufrida = ventasAts.reduce((s, v) => s + v.valor_ret_iva, 0)
    const totRetRentaSufrida = ventasAts.reduce((s, v) => s + v.valor_ret_renta, 0)

    function imprimirResumenTalon() {
        const razon = empresaActiva?.razon_social ?? empresaActiva?.nombre ?? empresa?.nombre ?? ''
        const rucDecl = empresaActiva?.ruc ?? empresa?.ruc ?? ''

        const htmlCompras = generarTablaHtml(
            [
                { label: 'Tipo Comprobante', key: 'tipo' },
                { label: 'Cant.', key: 'cant', align: 'center' },
                { label: 'Base 0%', key: 'base0', align: 'right' },
                { label: 'Base Grav.', key: 'baseGr', align: 'right' },
                { label: 'IVA', key: 'iva', align: 'right' },
                { label: 'Total', key: 'total', align: 'right' },
            ],
            resumenComprasPorTipo.map(r => ({
                tipo: LABEL_TIPO_COMP[r.cod] ?? `Tipo ${r.cod}`, cant: r.cantidad,
                base0: formatMoneda(r.base0, sym), baseGr: formatMoneda(r.baseGr, sym),
                iva: formatMoneda(r.iva, sym), total: formatMoneda(r.total, sym),
            })),
            {
                tipo: 'TOTALES', cant: resumenComprasPorTipo.reduce((s, r) => s + r.cantidad, 0),
                base0: formatMoneda(totComprasTalon.base0, sym), baseGr: formatMoneda(totComprasTalon.baseGr, sym),
                iva: formatMoneda(totComprasTalon.iva, sym), total: formatMoneda(totComprasTalon.total, sym),
            }
        )

        const htmlVentas = generarTablaHtml(
            [
                { label: 'Tipo Comprobante', key: 'tipo' },
                { label: 'Cant.', key: 'cant', align: 'center' },
                { label: 'Base 0%', key: 'base0', align: 'right' },
                { label: 'Base Grav.', key: 'baseGr', align: 'right' },
                { label: 'IVA', key: 'iva', align: 'right' },
                { label: 'Total', key: 'total', align: 'right' },
            ],
            ventasAts.length === 0 ? [] : [{
                tipo: 'Facturas', cant: ventasAts.reduce((s, v) => s + v.cantidad, 0),
                base0: formatMoneda(ventasAts.reduce((s, v) => s + v.base_cero, 0), sym),
                baseGr: formatMoneda(ventasAts.reduce((s, v) => s + v.base_iva, 0), sym),
                iva: formatMoneda(ventasAts.reduce((s, v) => s + v.iva, 0), sym),
                total: formatMoneda(ventasAts.reduce((s, v) => s + v.base_cero + v.base_iva + v.iva, 0), sym),
            }]
        )

        const htmlAnulados = generarTablaHtml(
            [
                { label: 'Documento', key: 'doc' },
                { label: 'ATS TP', key: 'tp', align: 'center' },
                { label: 'Fecha', key: 'fecha' },
            ],
            anuladosMarcados.map(a => ({ doc: a.descripcion, tp: a.tipoComprobante, fecha: a.fecha }))
        )

        const htmlRetFuente = generarTablaHtml(
            [
                { label: 'Código', key: 'cod' },
                { label: 'Cant.', key: 'cant', align: 'center' },
                { label: 'Base', key: 'base', align: 'right' },
                { label: '%', key: 'pct', align: 'right' },
                { label: 'Valor Retenido', key: 'valor', align: 'right' },
            ],
            resumenRetFuente.map(r => ({
                cod: r.cod, cant: r.cantidad, base: formatMoneda(r.base, sym), pct: `${r.pct}%`, valor: formatMoneda(r.valor, sym),
            })),
            { cod: 'TOTAL', cant: '', base: '', pct: '', valor: formatMoneda(totRetFuenteEfectuada, sym) }
        )

        const htmlRetSufridas = generarTablaHtml(
            [
                { label: 'Concepto', key: 'concepto' },
                { label: 'Valor', key: 'valor', align: 'right' },
            ],
            [
                { concepto: 'Retención de IVA', valor: formatMoneda(totRetIvaSufrida, sym) },
                { concepto: 'Retención de Renta', valor: formatMoneda(totRetRentaSufrida, sym) },
            ],
            { concepto: 'TOTAL', valor: formatMoneda(totRetIvaSufrida + totRetRentaSufrida, sym) }
        )

        imprimirReporte({
            empresa: { nombre: razon, ruc: rucDecl },
            titulo: 'Talón Resumen — ATS',
            periodo: `${mesNombre(mes)} ${año}`,
            html: `<h3 style="font-size:11px;text-transform:uppercase;color:#1e3a5f;border-bottom:1px solid #1e3a5f;padding-bottom:4px;margin-bottom:8px">Resumen de Compras</h3>${htmlCompras}`,
            subtablas: [
                { titulo: 'Resumen de Ventas', html: htmlVentas },
                { titulo: 'Comprobantes Anulados', html: anuladosMarcados.length > 0 ? htmlAnulados : '<p style="color:#888">Sin comprobantes anulados marcados para declarar en este período.</p>' },
                { titulo: 'Resumen de Retenciones — Agente de Retención (efectuadas a proveedores, solo Fuente)', html: resumenRetFuente.length > 0 ? htmlRetFuente : '<p style="color:#888">Sin retenciones efectuadas en el período.</p>' },
                { titulo: 'Resumen de Retenciones que le efectuaron en el período (clientes)', html: htmlRetSufridas },
            ],
        })
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
                <HelpButton pageKey="ats" />
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
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700 pb-1">
                        <input
                            type="checkbox"
                            checked={excluirVentas}
                            onChange={e => setExcluirVentas(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-primary-600"
                        />
                        Excluir ventas del ATS
                    </label>
                    <div className="flex-1" />
                    <button
                        onClick={cargarDatos}
                        disabled={cargando}
                        className="btn btn-secondary gap-2"
                    >
                        {cargando
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Search className="w-4 h-4" />
                        }
                        Buscar
                    </button>
                    <button
                        onClick={descargarXml}
                        disabled={cargando || (compras.length === 0 && retenciones.length === 0 && ventasAts.length === 0)}
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

            {!yaBuscado && (
                <div className="card p-12 text-center text-slate-400">
                    <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-slate-500">Selecciona el año y mes, y haz clic en <strong>Buscar</strong> para cargar los datos del período.</p>
                </div>
            )}

            {yaBuscado && <>
            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Compras',                   value: compras.length,                                        color: 'text-blue-600',   bg: 'bg-blue-50',   icon: ShoppingCart },
                    { label: 'Ventas (facturas)',          value: ventasAts.reduce((s, v) => s + v.cantidad, 0),         color: 'text-emerald-600',bg: 'bg-emerald-50',icon: Receipt },
                    { label: 'Retenciones Recibidas',     value: retenciones.length,                                    color: 'text-purple-600', bg: 'bg-purple-50', icon: FileText },
                    { label: 'Total Compras (IVA incl.)', value: formatMoneda(totCompras.total, sym),                   color: 'text-slate-800',  bg: 'bg-slate-50',  icon: FileDown },
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
                        ['compras',     `Compras (${comprasFacturas.length})`,                                  ShoppingCart],
                        ['nc',          `N/C Proveedores (${comprasNC.length})`,                                 FileMinus],
                        ['nd',          `N/D Proveedores (${comprasND.length})`,                                 FilePlus],
                        ['ventas',      `Ventas (${ventasAts.reduce((s, v) => s + v.cantidad, 0)})`,           Receipt],
                        ['retenciones', `Retenciones (${retenciones.length})`,                                 FileText],
                        ['anulados',    `Anulados (${anuladosSeleccionados.size}/${anulados.length})`,          Ban],
                        ['resumen',     'Talón Resumen',                                                        ClipboardList],
                    ] as const).map(([id, label, Icon]) => (
                        <button key={id} type="button" onClick={() => setTabVista(id)}
                            className={cn('flex items-center gap-2 px-5 py-2.5 border-l border-slate-200 first:border-l-0',
                                tabVista === id ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                            <Icon className="w-4 h-4" /> {label}
                        </button>
                    ))}
                </div>

                {/* ── Tabla COMPRAS (facturas + Liquidaciones de Compra) ── */}
                {tabVista === 'compras' && (
                    <TablaComprasATS
                        titulo={`Compras del período — ${mesNombre(mes)} ${año}`}
                        rows={comprasFacturas}
                        sym={sym}
                        cargando={cargando}
                        EmptyIcon={ShoppingCart}
                        emptyMsg={<>Sin facturas ni liquidaciones de compra para este período.<br /><span className="text-xs">Importa el CSV del SRI en Integración SRI.</span></>}
                    />
                )}

                {/* ── Tabla N/C DE PROVEEDORES ── */}
                {tabVista === 'nc' && (
                    <TablaComprasATS
                        titulo={`N/C de Proveedores — ${mesNombre(mes)} ${año}`}
                        rows={comprasNC}
                        sym={sym}
                        cargando={cargando}
                        EmptyIcon={FileMinus}
                        emptyMsg="Sin notas de crédito de proveedores para este período."
                    />
                )}

                {/* ── Tabla N/D DE PROVEEDORES ── */}
                {tabVista === 'nd' && (
                    <TablaComprasATS
                        titulo={`N/D de Proveedores — ${mesNombre(mes)} ${año}`}
                        rows={comprasND}
                        sym={sym}
                        cargando={cargando}
                        EmptyIcon={FilePlus}
                        emptyMsg="Sin notas de débito de proveedores para este período."
                    />
                )}

                {/* ── Tabla VENTAS ── */}
                {tabVista === 'ventas' && (
                    <div className="card overflow-hidden">
                        <div className="bg-emerald-700 px-5 py-3 text-white font-bold text-sm">
                            Ventas del período — {mesNombre(mes)} {año} (agrupadas por cliente)
                        </div>
                        {cargando ? (
                            <div className="py-10 text-center text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                            </div>
                        ) : ventasAts.length === 0 ? (
                            <div className="py-10 text-center text-slate-400">
                                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                Sin facturas de venta para este período.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-3 text-left">Cliente</th>
                                            <th className="py-2 px-3 text-center">Facturas</th>
                                            <th className="py-2 px-3 text-right">Base 0%</th>
                                            <th className="py-2 px-3 text-right">Base Grav.</th>
                                            <th className="py-2 px-3 text-right">IVA</th>
                                            <th className="py-2 px-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ventasAts.map(v => (
                                            <tr key={v.cliente_ruc} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2 px-3">
                                                    <div className="font-medium text-slate-700 text-xs">{v.cliente_nombre}</div>
                                                    <div className="text-slate-400 text-xs font-mono">{v.cliente_ruc}</div>
                                                </td>
                                                <td className="py-2 px-3 text-center font-semibold text-xs">{v.cantidad}</td>
                                                <td className="py-2 px-3 text-right text-xs">{v.base_cero > 0 ? formatMoneda(v.base_cero, sym) : '—'}</td>
                                                <td className="py-2 px-3 text-right text-xs">{v.base_iva > 0 ? formatMoneda(v.base_iva, sym) : '—'}</td>
                                                <td className="py-2 px-3 text-right text-xs">{v.iva > 0 ? formatMoneda(v.iva, sym) : '—'}</td>
                                                <td className="py-2 px-3 text-right font-semibold text-xs">{formatMoneda(v.total, sym)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 font-semibold text-sm">
                                            <td className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase">Totales</td>
                                            <td className="py-2.5 px-3 text-center text-xs">{ventasAts.reduce((s, v) => s + v.cantidad, 0)}</td>
                                            <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(ventasAts.reduce((s, v) => s + v.base_cero, 0), sym)}</td>
                                            <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(ventasAts.reduce((s, v) => s + v.base_iva, 0), sym)}</td>
                                            <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(ventasAts.reduce((s, v) => s + v.iva, 0), sym)}</td>
                                            <td className="py-2.5 px-3 text-right">{formatMoneda(ventasAts.reduce((s, v) => s + v.total, 0), sym)}</td>
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

                {/* ── Tabla ANULADOS (checklist) ── */}
                {tabVista === 'anulados' && (
                    <div className="card overflow-hidden">
                        <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm">
                            Documentos propios anulados — {mesNombre(mes)} {año}
                        </div>
                        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                            Vienen todas preseleccionadas para reportar en <code>&lt;anulados&gt;</code>.
                            Destilda la que no quieras incluir antes de generar el XML.
                        </div>
                        {cargando ? (
                            <div className="py-10 text-center text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                            </div>
                        ) : anulados.length === 0 ? (
                            <div className="py-10 text-center text-slate-400">
                                <Ban className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                Sin facturas anuladas para este período.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-3 w-10" />
                                            <th className="py-2 px-3 text-left">Documento</th>
                                            <th className="py-2 px-3 text-left">Fecha</th>
                                            <th className="py-2 px-3 text-center">ATS TP</th>
                                            <th className="py-2 px-3 text-left">Autorización</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {anulados.map(a => (
                                            <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2 px-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={anuladosSeleccionados.has(a.id)}
                                                        onChange={() => toggleAnulado(a.id)}
                                                        className="w-4 h-4 rounded border-slate-300 text-primary-600"
                                                    />
                                                </td>
                                                <td className="py-2 px-3 text-xs font-medium text-slate-700">{a.descripcion}</td>
                                                <td className="py-2 px-3 text-xs text-slate-500">{a.fecha}</td>
                                                <td className="py-2 px-3 text-center">
                                                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                                        {a.tipoComprobante}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 font-mono text-xs text-slate-500 break-all">{a.autorizacion || '(sin autorización)'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TALÓN RESUMEN ── */}
                {tabVista === 'resumen' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-500">
                                Replica el resumen que genera el propio SRI al declarar el ATS. Solo consulta — no se envía nada, es para verificar antes de generar el XML.
                            </p>
                            <button onClick={imprimirResumenTalon} className="btn btn-secondary gap-2 shrink-0 ml-4">
                                <Printer className="w-4 h-4" /> Imprimir / PDF
                            </button>
                        </div>

                        <div className="card p-5 text-center border-b-2 border-slate-800">
                            <p className="font-bold text-slate-900">{empresaActiva?.razon_social ?? empresaActiva?.nombre ?? empresa?.nombre ?? ''}</p>
                            <p className="text-xs text-slate-500 font-mono">RUC: {empresaActiva?.ruc ?? empresa?.ruc ?? '—'}</p>
                            <p className="text-sm font-semibold text-slate-700 mt-1">Talón Resumen — Anexo Transaccional Simplificado</p>
                            <p className="text-xs text-slate-500">Período: {mesNombre(mes)} {año} — Generado: {new Date().toLocaleDateString('es-EC')}</p>
                        </div>

                        {/* Compras */}
                        <div className="card overflow-hidden">
                            <div className="bg-slate-700 px-5 py-2.5 text-white font-bold text-sm">Resumen de Compras</div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-3 text-left">Tipo Comprobante</th>
                                            <th className="py-2 px-3 text-center">Cant.</th>
                                            <th className="py-2 px-3 text-right">Base 0%</th>
                                            <th className="py-2 px-3 text-right">Base Grav.</th>
                                            <th className="py-2 px-3 text-right">IVA</th>
                                            <th className="py-2 px-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resumenComprasPorTipo.length === 0 ? (
                                            <tr><td colSpan={6} className="py-4 text-center text-slate-400">Sin compras en el período.</td></tr>
                                        ) : resumenComprasPorTipo.map(r => (
                                            <tr key={r.cod} className="border-b border-slate-100">
                                                <td className="py-2 px-3">{LABEL_TIPO_COMP[r.cod] ?? `Tipo ${r.cod}`}</td>
                                                <td className="py-2 px-3 text-center">{r.cantidad}</td>
                                                <td className="py-2 px-3 text-right">{formatMoneda(r.base0, sym)}</td>
                                                <td className="py-2 px-3 text-right">{formatMoneda(r.baseGr, sym)}</td>
                                                <td className="py-2 px-3 text-right">{formatMoneda(r.iva, sym)}</td>
                                                <td className="py-2 px-3 text-right font-semibold">{formatMoneda(r.total, sym)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 font-semibold">
                                            <td className="py-2 px-3 text-right uppercase text-slate-500" colSpan={2}>Totales</td>
                                            <td className="py-2 px-3 text-right">{formatMoneda(totComprasTalon.base0, sym)}</td>
                                            <td className="py-2 px-3 text-right">{formatMoneda(totComprasTalon.baseGr, sym)}</td>
                                            <td className="py-2 px-3 text-right">{formatMoneda(totComprasTalon.iva, sym)}</td>
                                            <td className="py-2 px-3 text-right">{formatMoneda(totComprasTalon.total, sym)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            <p className="px-5 py-2 text-[11px] text-slate-400 border-t border-slate-100">
                                Totales = Facturas/Liquidaciones − N/C + N/D (igual que el Talón Resumen del SRI).
                            </p>
                        </div>

                        {/* Ventas */}
                        <div className="card overflow-hidden">
                            <div className="bg-emerald-700 px-5 py-2.5 text-white font-bold text-sm">Resumen de Ventas</div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-3 text-left">Tipo Comprobante</th>
                                            <th className="py-2 px-3 text-center">Cant.</th>
                                            <th className="py-2 px-3 text-right">Base 0%</th>
                                            <th className="py-2 px-3 text-right">Base Grav.</th>
                                            <th className="py-2 px-3 text-right">IVA</th>
                                            <th className="py-2 px-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ventasAts.length === 0 ? (
                                            <tr><td colSpan={6} className="py-4 text-center text-slate-400">Sin ventas en el período.</td></tr>
                                        ) : (
                                            <tr className="border-b border-slate-100">
                                                <td className="py-2 px-3">Facturas</td>
                                                <td className="py-2 px-3 text-center">{ventasAts.reduce((s, v) => s + v.cantidad, 0)}</td>
                                                <td className="py-2 px-3 text-right">{formatMoneda(ventasAts.reduce((s, v) => s + v.base_cero, 0), sym)}</td>
                                                <td className="py-2 px-3 text-right">{formatMoneda(ventasAts.reduce((s, v) => s + v.base_iva, 0), sym)}</td>
                                                <td className="py-2 px-3 text-right">{formatMoneda(ventasAts.reduce((s, v) => s + v.iva, 0), sym)}</td>
                                                <td className="py-2 px-3 text-right font-semibold">{formatMoneda(ventasAts.reduce((s, v) => s + v.base_cero + v.base_iva + v.iva, 0), sym)}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Anulados */}
                        <div className="card overflow-hidden">
                            <div className="bg-slate-700 px-5 py-2.5 text-white font-bold text-sm">Comprobantes Anulados</div>
                            {anuladosMarcados.length === 0 ? (
                                <div className="py-4 text-center text-xs text-slate-400">Sin comprobantes anulados marcados para declarar en este período.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 border-b text-slate-500 uppercase tracking-wide">
                                                <th className="py-2 px-3 text-left">Documento</th>
                                                <th className="py-2 px-3 text-center">ATS TP</th>
                                                <th className="py-2 px-3 text-left">Fecha</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {anuladosMarcados.map(a => (
                                                <tr key={a.id} className="border-b border-slate-100">
                                                    <td className="py-2 px-3">{a.descripcion}</td>
                                                    <td className="py-2 px-3 text-center font-mono">{a.tipoComprobante}</td>
                                                    <td className="py-2 px-3">{a.fecha}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Resumen de Retenciones — Agente de Retención */}
                        <div className="card overflow-hidden">
                            <div className="bg-purple-700 px-5 py-2.5 text-white font-bold text-sm">Resumen de Retenciones — Agente de Retención (efectuadas a proveedores)</div>
                            <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                                Solo retención en la Fuente (Renta) — la retención de IVA a proveedores va aparte, en el bloque valRetBien10/valRetServ20/valRetServ100 de cada compra (solo 30/70/100% mapeados por ahora; 10/20/50% quedan en 0.00 sin caso confirmado).
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-3 text-left">Código</th>
                                            <th className="py-2 px-3 text-center">Cant.</th>
                                            <th className="py-2 px-3 text-right">Base</th>
                                            <th className="py-2 px-3 text-right">%</th>
                                            <th className="py-2 px-3 text-right">Valor Retenido</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resumenRetFuente.length === 0 ? (
                                            <tr><td colSpan={5} className="py-4 text-center text-slate-400">Sin retenciones efectuadas en el período.</td></tr>
                                        ) : resumenRetFuente.map(r => (
                                            <tr key={r.cod} className="border-b border-slate-100">
                                                <td className="py-2 px-3 font-mono">{r.cod}</td>
                                                <td className="py-2 px-3 text-center">{r.cantidad}</td>
                                                <td className="py-2 px-3 text-right">{formatMoneda(r.base, sym)}</td>
                                                <td className="py-2 px-3 text-right">{r.pct}%</td>
                                                <td className="py-2 px-3 text-right font-semibold">{formatMoneda(r.valor, sym)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 font-semibold">
                                            <td colSpan={4} className="py-2 px-3 text-right uppercase text-slate-500">Total retenido</td>
                                            <td className="py-2 px-3 text-right">{formatMoneda(totRetFuenteEfectuada, sym)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* Resumen de Retenciones que le efectuaron en el período */}
                        <div className="card overflow-hidden">
                            <div className="bg-purple-700 px-5 py-2.5 text-white font-bold text-sm">Resumen de Retenciones que le efectuaron en el período (clientes)</div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-3 text-left">Concepto</th>
                                            <th className="py-2 px-3 text-right">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3">Retención de IVA</td>
                                            <td className="py-2 px-3 text-right">{formatMoneda(totRetIvaSufrida, sym)}</td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3">Retención de Renta</td>
                                            <td className="py-2 px-3 text-right">{formatMoneda(totRetRentaSufrida, sym)}</td>
                                        </tr>
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 font-semibold">
                                            <td className="py-2 px-3 text-right uppercase text-slate-500">Total</td>
                                            <td className="py-2 px-3 text-right">{formatMoneda(totRetIvaSufrida + totRetRentaSufrida, sym)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </>}

            {/* Nota informativa */}
            <div className="card p-4 bg-blue-50 border-blue-200 text-xs text-blue-700 flex gap-3">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                    <strong>ATS v1.31 — Información importante:</strong>
                    <ul className="mt-1 space-y-0.5 list-disc ml-4">
                        <li><strong>Compras:</strong> se combinan facturas + Liquidaciones de Compra + N/C y N/D de proveedores registradas en Corina ERP, más lo importado desde CSV del SRI (sin duplicar).</li>
                        <li><strong>Liquidaciones de Compra:</strong> solo se incluyen las de estado <strong>AUTORIZADO</strong>. <code>tpIdProv</code> se declara 02 (cédula) o 03 (pasaporte) según el beneficiario — catálogo de compras, distinto al de ventas.</li>
                        <li><strong>N/C y N/D de proveedores:</strong> solo estado <strong>ACTIVA</strong> (las anuladas no se declaran). Incluyen el documento que modifican (<code>docModificado</code>) cuando la compra original está vinculada en el sistema.</li>
                        <li><strong>Ventas:</strong> se toman automáticamente de las facturas emitidas en Corina ERP, agrupadas por cliente — sin cambios.</li>
                        <li>El <code>codSustento</code> se declara <strong>03</strong> para Liquidaciones y <strong>01</strong> por defecto para el resto.</li>
                        <li><strong>Anulados:</strong> pestaña con checklist (preseleccionado por defecto) de facturas de venta marcadas como anuladas en el período — destilda las que no quieras incluir en el <code>&lt;anulados&gt;</code> del XML. Las facturas anuladas se excluyen automáticamente del total de Ventas para no declararlas dos veces.</li>
                        <li>Verifica que el RUC y razón social de la empresa estén correctos en Configuración antes de declarar.</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}




