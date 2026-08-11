import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
    FileDown, Loader2, AlertCircle, CheckCircle, X,
    FileText, ShoppingCart, Receipt, ChevronDown, ChevronUp, Info, Ban,
} from 'lucide-react'
import { supabase as supabaseConta } from '../../../lib/supabaseContabilidad'
import { supabase } from '../../../lib/supabase'
import { useAuth as useContaAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { useAuth as useQIAuth } from '../../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'

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
    if (r.length === 13) return '01'   // RUC
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
    origen: 'nota_credito' | 'liquidacion_compra'
    tipoComprobante: string   // '04' N/C propia, '03' Liquidación de Compra
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
      <autModificado>${c.docModificado.autorizacion}</autModificado>` : ''

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
      <codSustento>${codSustento}</codSustento>
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
      <pagoExterior><pagoLocExt>01</pagoLocExt><paisEfecPago>NA</paisEfecPago><aplicConvDobTrib>NA</aplicConvDobTrib><pagExtSujRetNorLeg>NA</pagExtSujRetNorLeg></pagoExterior>${formasPagoBlock}${docModBlock}
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
  <ventas>
${ventas.map(v => {
    const tpId = tipoIdProv(v.cliente_ruc)
    const totalVta = v.base_cero + v.base_iva + v.iva
    const fpBlock = totalVta > 500 ? `\n      <formasDePago><formaPago>20</formaPago></formasDePago>` : ''
    return `    <detalleVentas>
      <tpIdCliente>${tpId}</tpIdCliente>
      <idCliente>${v.cliente_ruc}</idCliente>
      <parteRelVta>NO</parteRelVta>
      <tipoComprobante>18</tipoComprobante>
      <tipoEmision>F</tipoEmision>
      <numeroComprobantes>${v.cantidad}</numeroComprobantes>
      <baseNoGraIva>0.00</baseNoGraIva>
      <baseImponible>${f2(v.base_cero)}</baseImponible>
      <baseImpGrav>${f2(v.base_iva)}</baseImpGrav>
      <montoIva>${f2(v.iva)}</montoIva>
      <montoIce>0.00</montoIce>
      <valorRetIva>0.00</valorRetIva>
      <valorRetRenta>0.00</valorRetRenta>${fpBlock}
    </detalleVentas>`
}).join('\n')}
  </ventas>
  <ventasEstablecimiento>
    <ventaEst>
      <codEstab>001</codEstab>
      <ventasEstab>${f2(ventas.reduce((s, v) => s + v.base_cero + v.base_iva + v.iva, 0))}</ventasEstab>
      <ivaComp>${f2(ventas.reduce((s, v) => s + v.iva, 0))}</ivaComp>
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
      <autorizacion>${a.autorizacion}</autorizacion>
    </detalleAnulados>`
}).join('\n')}
  </anulados>` : ''}
</iva>`
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
    const [tabVista, setTabVista] = useState<'compras' | 'ventas' | 'retenciones' | 'anulados'>('compras')
    const [expandido, setExpandido] = useState<string | null>(null)

    const sym = empresaActiva?.moneda?.simbolo ?? '$'

    useEffect(() => {
        if (empresaActiva || empresa?.id) cargarDatos()
    }, [empresaActiva, empresa?.id, año, mes])

    async function cargarDatos() {
        setCargando(true)
        setError('')

        const mesStr = String(mes).padStart(2, '0')
        const desde = `${año}-${mesStr}-01`
        const hasta = `${año}-${mesStr}-${new Date(año, mes, 0).getDate()}`

        // Fuente 1: SRI CSV (contabilidad schema) — compras + retenciones importadas
        let sriCompras: SriComp[] = []
        let sriRetenciones: SriComp[] = []
        if (empresaActiva) {
            const [{ data: cd }, { data: rd }] = await Promise.all([
                supabaseConta.from('lp_sri_comprobantes').select('*')
                    .eq('empresa_id', empresaActiva.id).eq('año', año).eq('mes', mes)
                    .in('tipo', ['factura', 'nota_credito', 'nota_debito']).order('fecha_emision'),
                supabaseConta.from('lp_sri_comprobantes').select('*')
                    .eq('empresa_id', empresaActiva.id).eq('año', año).eq('mes', mes)
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
                .select('id, numero_factura, clave_acceso, fecha_emision, base_iva_0, base_iva_5, base_iva_15, valor_iva, total, proveedor:proveedores(ruc, nombre_empresa), retenciones:retenciones_compras(codigo_retencion, porcentaje, valor)')
                .eq('empresa_id', empresa.id)
                .eq('estado', 'ACTIVO')
                .gte('fecha_emision', desde).lte('fecha_emision', hasta)
                .order('fecha_emision')
            facCompras = (data ?? []).map((r: any) => ({
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
                codigo_retencion: r.retenciones?.[0]?.codigo_retencion ?? null,
                porcentaje_ret: r.retenciones?.[0]?.porcentaje ?? null,
                valor_retenido: r.retenciones?.reduce((s: number, ret: any) => s + (ret.valor ?? 0), 0) || null,
            }))
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
                .select('id, numero_nc, autorizacion_nc, fecha_nc, base_iva_0, base_iva_5, base_iva_15, valor_iva, total, proveedor:proveedores(ruc, nombre_empresa), compra:ingresos_stock(numero_factura, clave_acceso)')
                .eq('empresa_id', empresa.id)
                .eq('estado', 'ACTIVA')
                .gte('fecha_nc', desde).lte('fecha_nc', hasta)
                .order('fecha_nc')
            facNcProveedores = (data ?? []).map((r: any) => {
                const orig = r.compra ? parseNumero(r.compra.numero_factura ?? '') : null
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
                    docModificado: (orig && r.compra?.clave_acceso) ? {
                        tipo: '01', estab: orig.estab, ptoEmi: orig.ptoEmi, sec: orig.sec,
                        autorizacion: r.compra.clave_acceso,
                    } : undefined,
                }
            })
        }

        // Fuente 5: N/D de proveedores registradas en QuickInvoice (tipoComprobante 05 — requiere doc que modifican)
        let facNdProveedores: SriComp[] = []
        if (empresa?.id) {
            const { data } = await supabase
                .from('nd_proveedores')
                .select('id, numero_nd, numero_autorizacion, fecha_emision, base_imponible, iva, total, proveedor:proveedores(ruc, nombre_empresa), compra:ingresos_stock(numero_factura, clave_acceso)')
                .eq('empresa_id', empresa.id)
                .eq('estado', 'ACTIVA')
                .gte('fecha_emision', desde).lte('fecha_emision', hasta)
                .order('fecha_emision')
            facNdProveedores = (data ?? []).map((r: any) => {
                const orig = r.compra ? parseNumero(r.compra.numero_factura ?? '') : null
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
                    docModificado: (orig && r.compra?.clave_acceso) ? {
                        tipo: '01', estab: orig.estab, ptoEmi: orig.ptoEmi, sec: orig.sec,
                        autorizacion: r.compra.clave_acceso,
                    } : undefined,
                }
            })
        }

        // Fuente 6: Documentos propios anulados (candidatos para el checklist de <anulados>)
        // Solo lo que YA está confirmado como anulado en el sistema: N/C propias y
        // Liquidaciones de Compra (ambas las emitimos nosotros, llevan numeración SRI
        // propia). Facturas de venta anuladas no están implementadas todavía.
        let candidatosAnulados: AnuladoCandidato[] = []
        if (empresa?.id) {
            const [{ data: ncAnuladas }, { data: liqAnuladas }] = await Promise.all([
                supabase.from('notas_credito')
                    .select('id, secuencial, clave_acceso, fecha_anulacion')
                    .eq('empresa_id', empresa.id).eq('estado_sistema', 'ANULADA')
                    .gte('fecha_anulacion', desde).lte('fecha_anulacion', hasta + 'T23:59:59'),
                supabase.from('liquidaciones_compra')
                    .select('id, establecimiento, punto_emision, secuencial, clave_acceso, fecha_emision')
                    .eq('empresa_id', empresa.id).eq('estado_sri', 'ANULADO')
                    .gte('fecha_emision', desde).lte('fecha_emision', hasta),
            ])
            candidatosAnulados = [
                ...(ncAnuladas ?? []).map((r: any): AnuladoCandidato => ({
                    id: `nc-${r.id}`,
                    origen: 'nota_credito',
                    tipoComprobante: '04',
                    descripcion: `N/C propia ${r.secuencial}`,
                    numero: r.secuencial ?? '',
                    autorizacion: r.clave_acceso ?? '',
                    fecha: r.fecha_anulacion ?? '',
                })),
                ...(liqAnuladas ?? []).map((r: any): AnuladoCandidato => ({
                    id: `liq-${r.id}`,
                    origen: 'liquidacion_compra',
                    tipoComprobante: '03',
                    descripcion: `Liquidación de Compra ${r.establecimiento}-${r.punto_emision}-${r.secuencial}`,
                    numero: `${r.establecimiento}-${r.punto_emision}-${r.secuencial}`,
                    autorizacion: r.clave_acceso ?? '',
                    fecha: r.fecha_emision ?? '',
                })),
            ]
        }

        // Fuente 7: Facturación directa — ventas (agrupadas por cliente para ATS)
        let ventasAgrupadas: VentaAts[] = []
        if (empresa?.id) {
            const { data } = await supabase
                .from('comprobantes')
                .select('id, total, cliente:clientes(identificacion, nombre), comprobante_detalles(subtotal, iva_porcentaje, iva_valor)')
                .eq('empresa_id', empresa.id)
                .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59')
            const porCliente: Record<string, VentaAts> = {}
            for (const v of (data ?? []) as any[]) {
                const ruc = v.cliente?.identificacion ?? '9999999999999'
                if (!porCliente[ruc]) {
                    porCliente[ruc] = {
                        cliente_ruc: ruc,
                        cliente_nombre: v.cliente?.nombre ?? 'CONSUMIDOR FINAL',
                        base_cero: 0, base_iva: 0, iva: 0, total: 0, cantidad: 0,
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
        setAnuladosSeleccionados(new Set())  // checklist vacío en cada recarga de período
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
                        ['compras',     `Compras (${compras.length})`,                                         ShoppingCart],
                        ['ventas',      `Ventas (${ventasAts.reduce((s, v) => s + v.cantidad, 0)})`,           Receipt],
                        ['retenciones', `Retenciones (${retenciones.length})`,                                 FileText],
                        ['anulados',    `Anulados (${anuladosSeleccionados.size}/${anulados.length})`,          Ban],
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
                                                                c.tipo === 'liquidacion_compra' ? 'bg-indigo-100 text-indigo-700' :
                                                                c.tipo === 'nota_credito' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-orange-100 text-orange-700')}>
                                                                {c.tipo === 'factura' ? 'Factura' :
                                                                 c.tipo === 'liquidacion_compra' ? 'Liquid.' :
                                                                 c.tipo === 'nota_credito' ? 'N/C' : 'N/D'}
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
                            Marca solo los que quieras reportar en <code>&lt;anulados&gt;</code>. Ninguno viene
                            seleccionado por defecto — decide caso por caso antes de generar el XML.
                        </div>
                        {cargando ? (
                            <div className="py-10 text-center text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                            </div>
                        ) : anulados.length === 0 ? (
                            <div className="py-10 text-center text-slate-400">
                                <Ban className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                Sin N/C propias o Liquidaciones de Compra anuladas para este período.
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
            </div>

            {/* Nota informativa */}
            <div className="card p-4 bg-blue-50 border-blue-200 text-xs text-blue-700 flex gap-3">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                    <strong>ATS v1.31 — Información importante:</strong>
                    <ul className="mt-1 space-y-0.5 list-disc ml-4">
                        <li><strong>Compras:</strong> se combinan facturas + Liquidaciones de Compra + N/C y N/D de proveedores registradas en QuickInvoice, más lo importado desde CSV del SRI (sin duplicar).</li>
                        <li><strong>Liquidaciones de Compra:</strong> solo se incluyen las de estado <strong>AUTORIZADO</strong>. <code>tpIdProv</code> se declara 02 (cédula) o 03 (pasaporte) según el beneficiario — catálogo de compras, distinto al de ventas.</li>
                        <li><strong>N/C y N/D de proveedores:</strong> solo estado <strong>ACTIVA</strong> (las anuladas no se declaran). Incluyen el documento que modifican (<code>docModificado</code>) cuando la compra original está vinculada en el sistema.</li>
                        <li><strong>Ventas:</strong> se toman automáticamente de las facturas emitidas en QuickInvoice, agrupadas por cliente — sin cambios.</li>
                        <li>El <code>codSustento</code> se declara <strong>03</strong> para Liquidaciones y <strong>01</strong> por defecto para el resto.</li>
                        <li><strong>Anulados:</strong> pestaña con checklist (vacío por defecto) de N/C propias y Liquidaciones de Compra marcadas como anuladas en el período — tú decides cuáles entran al <code>&lt;anulados&gt;</code> del XML. Facturas de venta anuladas todavía no están disponibles porque esa función no existe aún en el sistema.</li>
                        <li>Verifica que el RUC y razón social de la empresa estén correctos en Configuración antes de declarar.</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}




