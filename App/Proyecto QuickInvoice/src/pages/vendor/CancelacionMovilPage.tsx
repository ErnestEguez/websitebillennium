import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { HelpButton } from '../../components/help/HelpButton'
import { supabase } from '../../lib/supabase'
import { facturacionService, type Cliente, type SriConfig } from '../../services/facturacionService'
import { clienteCedulaService } from '../../services/clienteCedulaService'
import {
    creditoElectrodomesticosService,
    type CreditoElectrodomesticos,
    type MetodoPagoCredito,
} from '../../services/creditoElectrodomesticosService'
import { distribuirPagoCuotas, calcularMoraCuota, type CuotaParaCobro, type ResultadoDistribucionPago } from '../../services/creditoElectrodomesticosCobro'
import { cobradorService, type Cobrador } from '../../services/cobradorService'
import { cuentasBancariasService } from '../../services/finance/bancosService'
import type { CuentaBancaria } from '../../types/finance'
import { formatCurrency } from '../../lib/utils'
import { ArrowLeft, Search, Loader2, MapPin, User, CheckCircle2, DollarSign, Printer, MessageCircle, Mail } from 'lucide-react'

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })

const METODOS: { value: MetodoPagoCredito; label: string }[] = [
    { value: 'efectivo', label: '💵 Efectivo' },
    { value: 'transferencia', label: '🏦 Depósito' },
    { value: 'tarjeta', label: '💳 Tarjeta' },
    { value: 'otros', label: '🔄 Otros' },
]

const METODO_LABEL_PLANO: Record<MetodoPagoCredito, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Depósito / Transferencia',
    tarjeta: 'Tarjeta',
    cheque: 'Cheque',
    nota_credito: 'Nota de Crédito',
    otros: 'Otros',
}

type Paso = 'cliente' | 'credito' | 'cobro'

function esc(s: string | null | undefined): string {
    if (!s) return ''
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function n2(n: number): string { return n.toFixed(2) }

interface DatosUltimoCobro {
    empresa: { nombre: string; ruc: string; logo_url?: string | null }
    clienteNombre: string
    clienteIdentificacion: string
    clienteTelefono: string | null
    facturaSecuencial: string
    cobradorNombre: string
    reciboInterno: number
    reciboExterno: string | null
    fecha: string
    metodoPago: MetodoPagoCredito
    aplicaciones: { numeroCuota: number; moraAplicada: number; interesAplicado: number; capitalAplicado: number; totalAplicado: number }[]
    montoCobrado: number
    saldoRestante: number
}

// Texto plano para WhatsApp (wa.me solo soporta texto pre-llenado, no
// adjuntos) — se usa como respaldo cuando el navegador no soporta Web
// Share API con archivos (navigator.share con files).
function construirTextoWhatsApp(d: DatosUltimoCobro): string {
    const fecha = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-EC')
    const lineasCuotas = d.aplicaciones
        .map(a => `  • Cuota #${a.numeroCuota}: ${formatCurrency(a.totalAplicado)}`)
        .join('\n')
    return [
        `*${d.empresa.nombre}*`,
        `RECIBO DE COBRO N.º ${d.reciboInterno}`,
        `Fecha: ${fecha}`,
        '',
        `Cliente: ${d.clienteNombre}`,
        `Factura: ${d.facturaSecuencial}`,
        `Cobrador: ${d.cobradorNombre}`,
        '',
        'Cuotas aplicadas:',
        lineasCuotas || '  (ninguna)',
        '',
        `*TOTAL COBRADO: ${formatCurrency(d.montoCobrado)}*`,
        `Saldo restante: ${formatCurrency(d.saldoRestante)}`,
    ].join('\n')
}

// Convierte un teléfono local ecuatoriano (ej. "0991234567") a formato
// internacional para wa.me (ej. "593991234567") — si ya viene con +593 o
// con otro formato reconocible, lo deja tal cual (solo dígitos).
function telefonoWhatsApp(telefono: string | null | undefined): string {
    if (!telefono) return ''
    const digitos = telefono.replace(/\D/g, '')
    if (digitos.startsWith('593')) return digitos
    if (digitos.startsWith('0')) return '593' + digitos.slice(1)
    return digitos
}

function construirHtmlCorreoCobroMovil(d: DatosUltimoCobro): string {
    const fecha = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-EC')
    const filas = d.aplicaciones.map(a => `
        <tr>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:12px">#${a.numeroCuota}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:12px;color:#dc2626">${a.moraAplicada > 0 ? formatCurrency(a.moraAplicada) : '—'}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:12px">${formatCurrency(a.interesAplicado)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:12px">${formatCurrency(a.capitalAplicado)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:12px;font-weight:700">${formatCurrency(a.totalAplicado)}</td>
        </tr>`).join('')

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.14);">
<tr><td style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:20px 28px;text-align:center">
  <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">${esc(d.empresa.nombre)}</p>
  <p style="margin:2px 0 0;color:rgba(255,255,255,0.85);font-size:11px;">RUC: ${esc(d.empresa.ruc)}</p>
</td></tr>
<tr><td style="padding:20px 28px 8px;text-align:center">
  <p style="margin:0;color:#111827;font-size:17px;font-weight:700;">Cobro registrado vía Cobros Móvil</p>
  <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Recibo N.º ${d.reciboInterno} · ${fecha}</p>
</td></tr>
<tr><td style="padding:8px 28px;color:#374151;font-size:13px;">
  <b>Cliente:</b> ${esc(d.clienteNombre)} (${esc(d.clienteIdentificacion)})<br>
  <b>Factura:</b> ${esc(d.facturaSecuencial)}<br>
  <b>Cobrador:</b> ${esc(d.cobradorNombre)}<br>
  <b>Forma de pago:</b> ${esc(METODO_LABEL_PLANO[d.metodoPago])}
</td></tr>
<tr><td style="padding:12px 28px;">
  <table width="100%" style="border-collapse:collapse;">
    <tr>
      <th style="text-align:center;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Cuota</th>
      <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Mora</th>
      <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Interés</th>
      <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Capital</th>
      <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Total</th>
    </tr>
    ${filas || '<tr><td colspan="5" style="color:#9ca3af;font-size:12px;padding:8px 4px">Sin cuotas aplicadas</td></tr>'}
  </table>
</td></tr>
<tr><td style="padding:16px 28px;background:#f0fdf4;border-top:2px solid #d1fae5;">
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    <tr><td style="padding:4px 0;color:#374151">Saldo restante</td><td style="padding:4px 0;text-align:right">${formatCurrency(d.saldoRestante)}</td></tr>
    <tr><td style="padding:4px 0;color:#374151;font-weight:700">TOTAL COBRADO</td><td style="padding:4px 0;text-align:right;font-weight:700">${formatCurrency(d.montoCobrado)}</td></tr>
  </table>
</td></tr>
<tr><td style="background:#065f46;padding:14px 28px;text-align:center;">
  <p style="margin:0;color:rgba(255,255,255,0.55);font-size:10px;">Corina ERP · Notificación automática de cobranza móvil</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

// Ticket térmico de cobro — mismo patrón que generarHtml80mm en ProformaPage
// (Courier New, @page margin:0, body centrado con mx-auto para que la
// impresora térmica no corte el borde izquierdo), parametrizado a 56 o 80mm
// porque un cobrador en terreno puede traer cualquiera de las dos.
function generarTicketCobroMovil(d: DatosUltimoCobro, anchoMm: 56 | 80): string {
    const margen = 3
    const anchoContenido = anchoMm - margen * 2
    const fecha = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-EC')
    const filas = d.aplicaciones.map(a => `
        <tr>
          <td class="c">${a.numeroCuota}</td>
          <td class="r">${a.moraAplicada > 0 ? n2(a.moraAplicada) : '—'}</td>
          <td class="r">${n2(a.interesAplicado)}</td>
          <td class="r">${n2(a.capitalAplicado)}</td>
          <td class="r b">${n2(a.totalAplicado)}</td>
        </tr>`).join('')

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo ${d.reciboInterno}</title>
<style>
  @page{margin:0;size:${anchoMm}mm auto}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;font-size:7pt;font-weight:bold;color:#000;width:${anchoContenido}mm;margin:0 auto;padding:0}
  .c{text-align:center}
  .r{text-align:right}
  .b{font-weight:bold}
  .emp{font-size:8.5pt;font-weight:900;text-align:center}
  .sep{border:none;border-top:1px dashed #000;margin:4px 0}
  table{width:100%;border-collapse:collapse}
  td,th{vertical-align:top}
  th{border-bottom:1px dashed #000;padding:0 1px 2px;font-size:6.5pt;text-align:left}
  th.c{text-align:center}
  th.r{text-align:right}
  .tot-lbl{width:60%}
  .tot-val{width:40%;text-align:right;font-weight:bold}
  .gran-total td{border-top:1px solid #000;padding-top:3px;font-size:8.5pt;font-weight:900}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="emp">${esc(d.empresa.nombre)}</div>
<div class="c" style="font-size:6.5pt">RUC: ${esc(d.empresa.ruc)}</div>
<hr class="sep">
<div class="c b" style="font-size:8pt">RECIBO DE COBRO</div>
<div class="c b" style="font-size:7pt">N.º ${d.reciboInterno}</div>
${d.reciboExterno ? `<div class="c" style="font-size:6.5pt">Externo: ${esc(d.reciboExterno)}</div>` : ''}
<div class="c" style="font-size:6.5pt">Fecha: ${fecha}</div>
<hr class="sep">
<div><span class="b">Cliente:</span> ${esc(d.clienteNombre)}</div>
<div><span class="b">RUC/CI:</span> ${esc(d.clienteIdentificacion)}</div>
<div><span class="b">Factura:</span> ${esc(d.facturaSecuencial)}</div>
<div><span class="b">Cobrador:</span> ${esc(d.cobradorNombre)}</div>
<div><span class="b">Forma pago:</span> ${esc(METODO_LABEL_PLANO[d.metodoPago])}</div>
<hr class="sep">
<table>
  <thead>
    <tr>
      <th class="c">Cuota</th>
      <th class="r">Mora</th>
      <th class="r">Int.</th>
      <th class="r">Cap.</th>
      <th class="r">Total</th>
    </tr>
  </thead>
  <tbody>
    ${filas || '<tr><td colspan="5" style="text-align:center">Sin cuotas aplicadas</td></tr>'}
  </tbody>
</table>
<hr class="sep">
<table>
  <tr><td class="tot-lbl">Saldo restante</td><td class="tot-val">$${n2(d.saldoRestante)}</td></tr>
  <tr class="gran-total"><td class="tot-lbl">TOTAL COBRADO</td><td class="tot-val">$${n2(d.montoCobrado)}</td></tr>
</table>
<hr class="sep">
<div class="c" style="font-size:6.5pt">Recibo interno — Corina ERP</div>
<div class="c" style="font-size:6.5pt">${new Date().toLocaleDateString('es-EC')}</div>
<p>&nbsp;</p>
</body>
</html>`
}

function imprimirTicketCobroMovil(d: DatosUltimoCobro, anchoMm: 56 | 80) {
    const html = generarTicketCobroMovil(d, anchoMm)
    const win = window.open('', '_blank', 'width=500,height=700')
    if (win) {
        win.document.write(html)
        win.document.close()
        win.focus()
        setTimeout(() => { win.print() }, 450)
    }
}

export function CancelacionMovilPage() {
    const { empresa } = useAuth()
    const [paso, setPaso] = useState<Paso>('cliente')

    // config_sri (mail_cc para la notificación interna de cada cobro) — no
    // viene en el contexto de auth, se carga aparte igual que en ProformaPage.
    const [configSri, setConfigSri] = useState<SriConfig | undefined>(undefined)
    useEffect(() => {
        if (!empresa?.id) return
        supabase.from('empresas').select('config_sri').eq('id', empresa.id).single()
            .then(({ data }) => { if (data) setConfigSri((data as any).config_sri) })
    }, [empresa?.id])

    // Paso 1: cliente
    const [busqueda, setBusqueda] = useState('')
    const [clientesConDeuda, setClientesConDeuda] = useState<{ id: string; nombre: string; identificacion: string; saldoTotal: number }[]>([])
    const [buscando, setBuscando] = useState(false)

    useEffect(() => {
        if (!busqueda.trim() || !empresa?.id) { setClientesConDeuda([]); return }
        const t = setTimeout(async () => {
            setBuscando(true)
            try {
                const r = await creditoElectrodomesticosService.buscarClientesConDeuda(empresa.id, busqueda.trim())
                setClientesConDeuda(r)
            } catch (e: any) {
                console.error('Error buscando clientes con deuda:', e)
                setClientesConDeuda([])
            } finally { setBuscando(false) }
        }, 300)
        return () => clearTimeout(t)
    }, [busqueda, empresa?.id])

    // Paso 2: créditos del cliente
    const [creditos, setCreditos] = useState<CreditoElectrodomesticos[]>([])
    const [cargandoCreditos, setCargandoCreditos] = useState(false)

    async function elegirCliente(id: string) {
        setPaso('credito')
        setCargandoCreditos(true)
        try {
            const r = await creditoElectrodomesticosService.listarCreditosConDeudaPorCliente(empresa!.id, id)
            setCreditos(r)
            if (r.length === 1) elegirCredito(r[0].id)
        } finally { setCargandoCreditos(false) }
    }

    // Paso 3: cobro
    const [credito, setCredito] = useState<CreditoElectrodomesticos | null>(null)
    const [clienteFull, setClienteFull] = useState<Cliente | null>(null)
    const [cedulaUrls, setCedulaUrls] = useState<{ 1?: string; 2?: string }>({})
    const [cargandoDetalle, setCargandoDetalle] = useState(false)
    const [cobradores, setCobradores] = useState<Cobrador[]>([])
    const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
    const [capturandoGeo, setCapturandoGeo] = useState(false)

    async function elegirCredito(id: string) {
        setCargandoDetalle(true)
        try {
            const completo = await creditoElectrodomesticosService.getCompleto(id)
            const [cobs, cts, clienteRow] = await Promise.all([
                cobradorService.getCobradoresActivos(empresa!.id),
                cuentasBancariasService.listar(empresa!.id).catch(() => []),
                supabase.from('clientes').select('*').eq('id', completo.cliente_id).single(),
            ])
            setCredito(completo)
            setCobradores(cobs)
            setCuentas(cts)
            const cliente = (clienteRow.data as Cliente) ?? null
            setClienteFull(cliente)
            const urls: { 1?: string; 2?: string } = {}
            if (cliente?.cedula_imagen1_path) urls[1] = await clienteCedulaService.urlFirmada(cliente.cedula_imagen1_path).catch(() => undefined)
            if (cliente?.cedula_imagen2_path) urls[2] = await clienteCedulaService.urlFirmada(cliente.cedula_imagen2_path).catch(() => undefined)
            setCedulaUrls(urls)
            setPaso('cobro')
        } finally { setCargandoDetalle(false) }
    }

    async function handleCapturarUbicacion() {
        if (!clienteFull?.id) return
        if (!navigator.geolocation) { alert('Este dispositivo/navegador no soporta geolocalización.'); return }
        setCapturandoGeo(true)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const geo_latitud = pos.coords.latitude
                    const geo_longitud = pos.coords.longitude
                    const geo_capturada_at = new Date().toISOString()
                    await facturacionService.updateCliente(clienteFull.id, { geo_latitud, geo_longitud, geo_capturada_at })
                    setClienteFull(prev => prev ? { ...prev, geo_latitud, geo_longitud, geo_capturada_at } : prev)
                } catch (e: any) {
                    alert('Error al guardar la ubicación: ' + e.message)
                } finally {
                    setCapturandoGeo(false)
                }
            },
            (err) => {
                alert('No se pudo obtener la ubicación: ' + err.message)
                setCapturandoGeo(false)
            },
            { enableHighAccuracy: true, timeout: 15000 }
        )
    }

    const cuotasParaCobro: CuotaParaCobro[] = (credito?.cuotas || [])
        .filter(c => c.estado !== 'PAGADA' && c.estado !== 'ANULADA')
        .sort((a, b) => a.numero_cuota - b.numero_cuota)
        .map(c => ({
            id: c.id,
            numeroCuota: c.numero_cuota,
            fechaVencimiento: c.fecha_vencimiento,
            capitalProgramado: c.capital_programado,
            interesProgramado: c.interes_programado,
            capitalPagado: c.capital_pagado,
            interesPagado: c.interes_pagado,
        }))

    const [montoCobrar, setMontoCobrar] = useState(0)
    const [metodoPago, setMetodoPago] = useState<MetodoPagoCredito>('efectivo')
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')
    const [reciboExterno, setReciboExterno] = useState('')
    const [cambiandoCobrador, setCambiandoCobrador] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [reciboConfirmado, setReciboConfirmado] = useState<number | null>(null)
    const [ultimoCobro, setUltimoCobro] = useState<DatosUltimoCobro | null>(null)
    const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false)
    const reciboVisualRef = useRef<HTMLDivElement>(null)

    const previa: ResultadoDistribucionPago | null = credito && montoCobrar > 0
        ? distribuirPagoCuotas(cuotasParaCobro, montoCobrar, HOY, 0, 0)
        : null

    async function handleCambiarCobrador(nuevoCobradorId: string) {
        if (!credito) return
        setCambiandoCobrador(true)
        try {
            await creditoElectrodomesticosService.cambiarCobrador(credito.id, empresa!.id, nuevoCobradorId)
            setCredito({ ...credito, cobrador_id: nuevoCobradorId, cobradores: cobradores.find(c => c.id === nuevoCobradorId) as any })
        } catch (e: any) {
            alert('Error al cambiar el cobrador: ' + e.message)
        } finally {
            setCambiandoCobrador(false)
        }
    }

    async function handleRegistrarCobro() {
        if (!credito) return
        if (montoCobrar <= 0) { alert('Ingresa el monto a cobrar'); return }
        if (metodoPago === 'transferencia' && !cuentaBancariaId) { alert('Selecciona la cuenta bancaria del depósito'); return }
        try {
            setGuardando(true)
            const r = await creditoElectrodomesticosService.registrarCobroMultiple({
                empresaId: empresa!.id,
                creditoId: credito.id,
                cuotas: cuotasParaCobro,
                montoTotal: montoCobrar,
                fechaHoy: HOY,
                metodoPago,
                cuentaBancariaId: metodoPago === 'transferencia' ? cuentaBancariaId : null,
                reciboExterno: reciboExterno || null,
            })
            setReciboConfirmado(r.reciboInterno)
            const actualizado = await creditoElectrodomesticosService.getCompleto(credito.id)
            setCredito(actualizado)
            const datosCobro: DatosUltimoCobro = {
                empresa: { nombre: empresa!.nombre, ruc: empresa!.ruc, logo_url: empresa!.logo_url },
                clienteNombre: actualizado.clientes?.nombre ?? '',
                clienteIdentificacion: actualizado.clientes?.identificacion ?? '',
                clienteTelefono: clienteFull?.telefono ?? null,
                facturaSecuencial: actualizado.comprobantes?.secuencial ?? '',
                cobradorNombre: actualizado.cobradores?.nombres ?? '',
                reciboInterno: r.reciboInterno,
                reciboExterno: reciboExterno || null,
                fecha: HOY,
                metodoPago,
                aplicaciones: r.distribucion.aplicaciones,
                montoCobrado: montoCobrar,
                saldoRestante: actualizado.saldo_pendiente,
            }
            setUltimoCobro(datosCobro)
            setMontoCobrar(0)

            // Notificación interna: cada cobro hecho por esta vía se envía al
            // correo configurado como copia en Configuración SRI → Servidor de
            // correo — sin bloquear la UI, y sin avisar si falla (secundario).
            if (configSri?.mail_cc) {
                supabase.functions.invoke('enviar-reporte-interno', {
                    body: {
                        empresa_id: empresa!.id,
                        destinatario: configSri.mail_cc,
                        asunto: `Cobro móvil registrado — recibo #${r.reciboInterno}`,
                        html: construirHtmlCorreoCobroMovil(datosCobro),
                    },
                }).catch(e => console.error('Error notificando cobro móvil por correo:', e))
            }
        } catch (e: any) {
            alert('Error al registrar el cobro: ' + e.message)
        } finally {
            setGuardando(false)
        }
    }

    // Envía el ticket al cliente por WhatsApp: intenta compartir la imagen
    // del recibo (Web Share API con archivos — soportado en navegadores
    // móviles modernos); si el dispositivo no lo soporta, cae a un enlace
    // wa.me con el mismo contenido en texto (wa.me no acepta adjuntos).
    async function handleEnviarWhatsApp() {
        if (!ultimoCobro) return
        setEnviandoWhatsApp(true)
        try {
            const telefono = telefonoWhatsApp(ultimoCobro.clienteTelefono)
            let imagenCompartida = false

            if (reciboVisualRef.current && navigator.canShare) {
                try {
                    const html2canvas = (await import('html2canvas')).default
                    const canvas = await html2canvas(reciboVisualRef.current, { backgroundColor: '#ffffff', scale: 2 })
                    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
                    if (blob) {
                        const file = new File([blob], `recibo_${ultimoCobro.reciboInterno}.png`, { type: 'image/png' })
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                files: [file],
                                title: `Recibo de cobro #${ultimoCobro.reciboInterno}`,
                                text: `Recibo de cobro #${ultimoCobro.reciboInterno} — ${ultimoCobro.empresa.nombre}`,
                            })
                            imagenCompartida = true
                        }
                    }
                } catch (e: any) {
                    if (e?.name !== 'AbortError') console.error('Error compartiendo imagen del recibo:', e)
                    else imagenCompartida = true // el usuario canceló el share sheet, no es un error
                }
            }

            if (!imagenCompartida) {
                const texto = construirTextoWhatsApp(ultimoCobro)
                const url = telefono
                    ? `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`
                    : `https://wa.me/?text=${encodeURIComponent(texto)}`
                window.open(url, '_blank')
            }
        } finally {
            setEnviandoWhatsApp(false)
        }
    }

    function reiniciar() {
        setPaso('cliente')
        setCredito(null)
        setClienteFull(null)
        setCedulaUrls({})
        setBusqueda('')
        setClientesConDeuda([])
        setCreditos([])
        setReciboConfirmado(null)
        setUltimoCobro(null)
        setMontoCobrar(0)
    }

    return (
        <div className="max-w-md mx-auto space-y-4 pb-8">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <DollarSign className="w-6 h-6 text-primary-600" /> Cobros Móvil
                </h1>
                <HelpButton pageKey="cancelacion-movil" />
            </div>

            {paso !== 'cliente' && (
                <button onClick={reiniciar} className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <ArrowLeft className="w-4 h-4" /> Buscar otro cliente
                </button>
            )}

            {/* Paso 1: cliente */}
            {paso === 'cliente' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                    <h2 className="font-bold text-slate-900 text-sm">Buscar cliente con deuda</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            placeholder="Nombre o cédula…"
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            className="w-full pl-10 pr-4 py-3.5 text-base rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-400"
                        />
                        {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-300" />}
                    </div>
                    {clientesConDeuda.length > 0 && (
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-50">
                            {clientesConDeuda.map(c => (
                                <button key={c.id} onClick={() => elegirCliente(c.id)}
                                    className="w-full text-left px-4 py-3.5 active:bg-slate-100 flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-slate-900">{c.nombre}</p>
                                        <p className="text-xs text-slate-400">{c.identificacion}</p>
                                    </div>
                                    <p className="font-black text-primary-700">{formatCurrency(c.saldoTotal)}</p>
                                </button>
                            ))}
                        </div>
                    )}
                    {busqueda.trim() && !buscando && clientesConDeuda.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-6">Sin clientes con deuda pendiente que coincidan.</p>
                    )}
                </div>
            )}

            {/* Paso 2: créditos del cliente */}
            {paso === 'credito' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                    <h2 className="font-bold text-slate-900 text-sm">Créditos con saldo pendiente</h2>
                    {cargandoCreditos ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                    ) : (
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-50">
                            {creditos.map(c => (
                                <button key={c.id} onClick={() => elegirCredito(c.id)}
                                    className="w-full text-left px-4 py-3.5 active:bg-slate-100 flex items-center justify-between">
                                    <div>
                                        <p className="font-mono text-xs text-slate-400">{c.comprobantes?.secuencial}</p>
                                        <p className="text-sm text-slate-600">Cobrador: {c.cobradores?.nombres}</p>
                                    </div>
                                    <p className="font-black text-primary-700">{formatCurrency(c.saldo_pendiente)}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Paso 3: cobro */}
            {paso === 'cobro' && credito && (
                cargandoDetalle ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                ) : (
                <div className="space-y-4">
                    {/* Cliente + foto de cédula */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <div className="flex gap-3">
                            <div className="w-20 h-20 shrink-0 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
                                {cedulaUrls[1]
                                    ? <img src={cedulaUrls[1]} alt="Cédula" className="w-full h-full object-cover" />
                                    : <User className="w-8 h-8 text-slate-300" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-900 leading-tight">{credito.clientes?.nombre}</p>
                                <p className="text-xs text-slate-400">{credito.clientes?.identificacion}</p>
                                <p className="text-xs text-slate-400 font-mono mt-0.5">Factura {credito.comprobantes?.secuencial}</p>
                                {clienteFull?.direccion && <p className="text-xs text-slate-500 mt-1">{clienteFull.direccion}</p>}
                            </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                            <div className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0">
                                <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                {clienteFull?.geo_latitud != null ? (
                                    <a href={`https://www.google.com/maps?q=${clienteFull.geo_latitud},${clienteFull.geo_longitud}`}
                                        target="_blank" rel="noopener noreferrer" className="text-primary-600 font-semibold underline truncate">
                                        Ver ubicación guardada
                                    </a>
                                ) : (
                                    <span className="text-slate-400">Sin ubicación capturada</span>
                                )}
                            </div>
                            <button type="button" onClick={handleCapturarUbicacion} disabled={capturandoGeo}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold disabled:opacity-50">
                                {capturandoGeo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                                {clienteFull?.geo_latitud != null ? 'Actualizar' : 'Capturar aquí'}
                            </button>
                        </div>
                    </div>

                    {/* Cobrador */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cobrador</label>
                        <select
                            value={credito.cobrador_id}
                            disabled={cambiandoCobrador}
                            onChange={e => handleCambiarCobrador(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500">
                            {cobradores.map(c => <option key={c.id} value={c.id}>{c.nombres}</option>)}
                        </select>
                    </div>

                    {/* Cuotas (compacto) */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <h2 className="font-bold text-slate-900 text-sm mb-2">Cuotas pendientes</h2>
                        <div className="space-y-1.5">
                            {cuotasParaCobro.map(c => {
                                const mora = calcularMoraCuota(c, HOY, 0, 0)
                                const aplicacion = previa?.aplicaciones.find(a => a.cuotaId === c.id)
                                const saldo = Math.max(0, (c.capitalProgramado + c.interesProgramado) - (c.capitalPagado + c.interesPagado))
                                return (
                                    <div key={c.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${aplicacion ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                                        <div>
                                            <span className="font-bold">#{c.numeroCuota}</span>
                                            <span className="text-slate-400 text-xs ml-2">{c.fechaVencimiento}</span>
                                            {mora.diasVencidos > 0 && <span className="text-red-500 text-xs ml-2">{mora.diasVencidos}d venc.</span>}
                                        </div>
                                        <span className="font-bold">{formatCurrency(saldo)}</span>
                                    </div>
                                )
                            })}
                        </div>
                        {previa && previa.montoSobrante > 0 && (
                            <p className="text-xs text-red-600 font-bold mt-2">⚠ Sobran {formatCurrency(previa.montoSobrante)} — reduce el valor.</p>
                        )}
                    </div>

                    {/* Cobro */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto a cobrar</label>
                            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={montoCobrar || ''}
                                onChange={e => setMontoCobrar(parseFloat(e.target.value) || 0)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-right font-black text-2xl" />
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                            {METODOS.map(m => (
                                <button key={m.value} type="button" onClick={() => setMetodoPago(m.value)}
                                    className={`py-2.5 rounded-lg text-xs font-bold border ${metodoPago === m.value ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        {metodoPago === 'transferencia' && (
                            <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                                <option value="">— Cuenta bancaria —</option>
                                {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>)}
                            </select>
                        )}

                        <input value={reciboExterno} onChange={e => setReciboExterno(e.target.value)}
                            placeholder="N° recibo externo (opcional)"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm" />

                        <button onClick={handleRegistrarCobro} disabled={guardando || montoCobrar <= 0}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-xl font-bold text-base hover:bg-emerald-700 disabled:opacity-40">
                            {guardando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                            Cobrar {montoCobrar > 0 ? formatCurrency(montoCobrar) : ''}
                        </button>

                        {reciboConfirmado != null && ultimoCobro && (
                            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-center space-y-3">
                                <div>
                                    <p className="text-xs text-primary-600 uppercase tracking-widest font-bold">Recibo interno</p>
                                    <p className="text-2xl font-black text-primary-700">#{reciboConfirmado}</p>
                                    <p className="text-xs text-primary-500 mt-1">Saldo restante: {formatCurrency(credito.saldo_pendiente)}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => imprimirTicketCobroMovil(ultimoCobro, 56)}
                                        className="flex items-center justify-center gap-1.5 py-2.5 bg-white border border-primary-300 text-primary-700 rounded-lg text-xs font-bold">
                                        <Printer className="w-3.5 h-3.5" /> Ticket 56mm
                                    </button>
                                    <button type="button" onClick={() => imprimirTicketCobroMovil(ultimoCobro, 80)}
                                        className="flex items-center justify-center gap-1.5 py-2.5 bg-white border border-primary-300 text-primary-700 rounded-lg text-xs font-bold">
                                        <Printer className="w-3.5 h-3.5" /> Ticket 80mm
                                    </button>
                                </div>
                                <button type="button" onClick={handleEnviarWhatsApp} disabled={enviandoWhatsApp}
                                    className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-[#25D366] text-white rounded-lg text-xs font-bold disabled:opacity-50">
                                    {enviandoWhatsApp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                                    Enviar recibo por WhatsApp
                                </button>
                                {configSri?.mail_cc && (
                                    <p className="text-[10px] text-primary-500 flex items-center justify-center gap-1">
                                        <Mail className="w-3 h-3" /> Notificado a {configSri.mail_cc}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                )
            )}

            {/* Nodo oculto — html2canvas lo captura para compartir el recibo
                como imagen por WhatsApp; nunca visible en pantalla. */}
            {ultimoCobro && (
                <div className="fixed -left-[9999px] top-0" aria-hidden="true">
                    <div ref={reciboVisualRef} className="w-[380px] bg-white p-6 font-sans">
                        <p className="text-center text-lg font-black text-emerald-700">{ultimoCobro.empresa.nombre}</p>
                        <p className="text-center text-xs text-slate-500 mb-3">RUC: {ultimoCobro.empresa.ruc}</p>
                        <div className="border-t-2 border-emerald-600 pt-3 text-center mb-3">
                            <p className="text-sm font-black text-emerald-700 tracking-widest">RECIBO DE COBRO</p>
                            <p className="text-lg font-mono font-bold text-slate-900">N.º {ultimoCobro.reciboInterno}</p>
                            <p className="text-xs text-slate-500">{new Date(ultimoCobro.fecha + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-3 text-xs space-y-1 mb-3">
                            <p><span className="text-slate-500">Cliente:</span> <span className="font-bold text-slate-900">{ultimoCobro.clienteNombre}</span></p>
                            <p><span className="text-slate-500">Factura:</span> <span className="font-bold text-slate-900">{ultimoCobro.facturaSecuencial}</span></p>
                            <p><span className="text-slate-500">Cobrador:</span> <span className="font-bold text-slate-900">{ultimoCobro.cobradorNombre}</span></p>
                            <p><span className="text-slate-500">Forma de pago:</span> <span className="font-bold text-slate-900">{METODO_LABEL_PLANO[ultimoCobro.metodoPago]}</span></p>
                        </div>
                        <table className="w-full text-xs mb-3">
                            <thead>
                                <tr className="border-b border-emerald-200 text-slate-400">
                                    <th className="text-left py-1">Cuota</th>
                                    <th className="text-right py-1">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ultimoCobro.aplicaciones.map(a => (
                                    <tr key={a.numeroCuota} className="border-b border-emerald-50">
                                        <td className="py-1">#{a.numeroCuota}</td>
                                        <td className="text-right py-1 font-bold">{formatCurrency(a.totalAplicado)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="border-t border-emerald-200 pt-2 text-sm">
                            <div className="flex justify-between text-slate-500"><span>Saldo restante</span><span>{formatCurrency(ultimoCobro.saldoRestante)}</span></div>
                            <div className="flex justify-between text-emerald-700 font-black text-base mt-1"><span>TOTAL COBRADO</span><span>{formatCurrency(ultimoCobro.montoCobrado)}</span></div>
                        </div>
                        <p className="text-center text-[10px] text-slate-400 mt-4">Corina ERP</p>
                    </div>
                </div>
            )}
        </div>
    )
}
