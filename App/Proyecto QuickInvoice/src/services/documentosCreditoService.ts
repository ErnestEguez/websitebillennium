// ============================================================
// Contrato de Compra-Venta y Pagaré — llenado automático sobre las
// plantillas PDF planas (sin campos de formulario) subidas por el
// usuario en public/documentos/. Se superpone texto en coordenadas
// fijas con pdf-lib.
//
// La tabla de cuotas NUNCA usa la rejilla fija impresa en la plantilla
// (esa rejilla asume 12 cuotas y sus etiquetas "CUOTA 1/12"... son
// texto estático de la plantilla, no se pueden re-numerar) — se tapa
// por completo y se dibuja una tabla propia, del tamaño exacto del
// crédito real (3, 6, 12, 60 cuotas...), con filas más altas cuando
// hay pocas y más chicas cuando hay muchas, para que TODO quepa dentro
// de los casilleros. Si no alcanza el espacio de una página, se
// agregan páginas de continuación (solo tabla, sin repetir el resto
// del documento legal).
//
// Nunca se persiste el PDF resultante — se genera en memoria y se abre
// para imprimir, mismo criterio que el resto de documentos (RIDE,
// retención, comprobante A4 de Cancelación Oficina).
// ============================================================
import { PDFDocument, PDFName, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { supabase } from '../lib/supabase'
import type { CreditoElectrodomesticos, CuotaCredito } from './creditoElectrodomesticosService'

export interface PersonaDoc {
    nombre: string
    identificacion: string
    direccion?: string | null
}

export interface ItemFacturaDoc {
    cantidad: number
    nombre_producto: string
    producto_id: string | null
    serial: string | null
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function formatFechaDDMMYYYY(iso: string | null | undefined): string {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}

// ── Monto en letras (español, "CUATROCIENTOS CINCUENTA 50/100 USD DOLLAR") ──
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const DIEZ_A_DIECINUEVE = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function convertirGrupo(n: number): string {
    if (n === 0) return ''
    if (n === 100) return 'CIEN'
    const c = Math.floor(n / 100)
    const resto = n % 100
    let out = c > 0 ? CENTENAS[c] + ' ' : ''
    if (resto >= 10 && resto < 20) {
        out += DIEZ_A_DIECINUEVE[resto - 10]
    } else if (resto === 20) {
        out += 'VEINTE'
    } else if (resto > 20 && resto < 30) {
        out += 'VEINTI' + UNIDADES[resto - 20]
    } else {
        const d = Math.floor(resto / 10)
        const u = resto % 10
        if (d > 0) out += DECENAS[d]
        if (u > 0) out += (d > 0 ? ' Y ' : '') + UNIDADES[u]
    }
    return out.trim()
}

function numeroALetras(valorEntero: number): string {
    if (valorEntero === 0) return 'CERO'
    const millones = Math.floor(valorEntero / 1000000)
    const miles = Math.floor((valorEntero % 1000000) / 1000)
    const resto = valorEntero % 1000
    const partes: string[] = []
    if (millones > 0) partes.push(millones === 1 ? 'UN MILLON' : convertirGrupo(millones) + ' MILLONES')
    if (miles > 0) partes.push(miles === 1 ? 'MIL' : convertirGrupo(miles) + ' MIL')
    if (resto > 0) partes.push(convertirGrupo(resto))
    return partes.join(' ').trim()
}

function montoEnLetras(valor: number): string {
    const entero = Math.floor(valor)
    const centavos = Math.round((valor - entero) * 100)
    return `${numeroALetras(entero)} ${String(centavos).padStart(2, '0')}/100 USD DOLLAR`
}

// Secuencia de letras estilo Excel (A, B, ... Z, AA, AB...) — la tabla
// "Valores pagados" del Contrato puede tener más de 26 cuotas.
function letraSecuencial(i: number): string {
    let n = i
    let s = ''
    do {
        s = String.fromCharCode(65 + (n % 26)) + s
        n = Math.floor(n / 26) - 1
    } while (n >= 0)
    return s
}

async function cargarPlantilla(nombreArchivo: string): Promise<ArrayBuffer> {
    const res = await fetch(`/documentos/${nombreArchivo}`)
    if (!res.ok) throw new Error(`No se encontró la plantilla "${nombreArchivo}" en public/documentos — súbela primero.`)
    return res.arrayBuffer()
}

// Numeración atómica del pagaré — mismo RPC (FOR UPDATE) que ya usan
// Factura/Retención/Nota de Crédito, con un tipo de comprobante nuevo
// ("PAGARE_CREDITO") que no requiere cambio de esquema: secuenciales es
// JSONB por punto de emisión, admite cualquier clave. El Contrato NO
// necesita numeración propia — su "Número del Documento" es el de la
// factura (ya lo trae credito.comprobantes.secuencial).
async function obtenerNumeroPagare(empresaId: string): Promise<number> {
    const { data: principal, error: errPe } = await supabase
        .from('puntos_emision')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('es_principal', true)
        .eq('activo', true)
        .maybeSingle()
    if (errPe) throw errPe
    if (!principal) throw new Error('No hay un punto de emisión Principal configurado para numerar el pagaré.')

    const { data, error } = await supabase.rpc('qi_next_secuencial_punto', {
        p_punto_emision_id: principal.id,
        p_tipo_comprobante: 'PAGARE_CREDITO',
    })
    if (error) throw error
    return data as number
}

/** Cliente/garante con dirección — getCompleto() no trae dirección, se busca aparte. */
async function cargarPersona(clienteId: string): Promise<PersonaDoc> {
    const { data, error } = await supabase.from('clientes').select('nombre, identificacion, direccion').eq('id', clienteId).single()
    if (error) throw error
    return data as PersonaDoc
}

async function cargarItemsFactura(facturaId: string): Promise<ItemFacturaDoc[]> {
    const { data, error } = await supabase.from('comprobante_detalles').select('cantidad, nombre_producto, producto_id, serial').eq('comprobante_id', facturaId)
    if (error) throw error
    return (data ?? []) as ItemFacturaDoc[]
}

// Quita metadatos y anotaciones (ej. enlaces) heredados de la plantilla
// original — la plantilla venía de otro software y traía referencias a
// un sitio de terceros que aparecían en el navegador. Se fija una
// identidad propia y se eliminan los /Annots de cada página.
function limpiarMetadatosYEnlaces(doc: PDFDocument, tituloDocumento: string) {
    doc.setTitle(tituloDocumento)
    doc.setAuthor('Corina ERP')
    doc.setSubject('')
    doc.setKeywords([])
    doc.setProducer('billenniumsystem.com')
    doc.setCreator('Corina ERP - billenniumsystem.com')
    for (const page of doc.getPages()) {
        page.node.delete(PDFName.of('Annots'))
    }
}

function dibujar(page: PDFPage, font: PDFFont, texto: string | number | null | undefined, x: number, y: number, size: number) {
    if (texto === null || texto === undefined || texto === '') return
    page.drawText(String(texto), { x, y, size, font, color: rgb(0, 0, 0) })
}

function tapar(page: PDFPage, box: { x: number; y: number; w: number; h: number }) {
    page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, color: rgb(1, 1, 1) })
}

function dibujarCentrado(page: PDFPage, font: PDFFont, texto: string, xCentro: number, y: number, size: number) {
    const ancho = font.widthOfTextAtSize(texto, size)
    page.drawText(texto, { x: xCentro - ancho / 2, y, size, font, color: rgb(0, 0, 0) })
}

// Reduce el tamaño de letra lo necesario para que el texto quepa en
// anchoMax — el monto en letras del Pagaré ("...la cantidad de ___")
// vive en un solo renglón angosto entre dos frases fijas de la
// plantilla, y su longitud varía según el monto (puede ser mucho más
// largo que "DOSCIENTOS CINCUENTA 00/100 USD DOLLAR").
function dibujarAjustado(page: PDFPage, font: PDFFont, texto: string, x: number, y: number, sizeMax: number, anchoMax: number) {
    let size = sizeMax
    while (size > 4.5 && font.widthOfTextAtSize(texto, size) > anchoMax) size -= 0.25
    page.drawText(texto, { x, y, size, font, color: rgb(0, 0, 0) })
}

// ── Tabla dinámica de cuotas — el corazón del ajuste pedido: nunca usa
// una rejilla fija, siempre se dimensiona al número real de cuotas que
// le toca mostrar en ESTA página. ──────────────────────────────────
interface FilaTabla { numero: string; fecha: string; valor: string }

function calcularDistribucion(nFilas: number, grupos: number, altoDisponible: number, altoHeader: number, filaMin: number, filaMax: number) {
    const filasPorGrupoNecesarias = Math.max(1, Math.ceil(nFilas / grupos))
    const filasQueCabenAlMinimo = Math.max(1, Math.floor((altoDisponible - altoHeader) / filaMin))
    const filasPorGrupo = Math.min(filasPorGrupoNecesarias, filasQueCabenAlMinimo)
    const altoFila = Math.max(filaMin, Math.min(filaMax, (altoDisponible - altoHeader) / filasPorGrupo))
    const capacidad = filasPorGrupo * grupos
    return { filasPorGrupo, altoFila, capacidad }
}

function dibujarTablaCuotas(
    page: PDFPage, font: PDFFont, fontBold: PDFFont,
    filas: FilaTabla[],
    box: { x: number; yTop: number; width: number; height: number },
    opciones: { grupos: number; etiquetaCol1: string },
): number {
    // Devuelve cuántas filas realmente dibujó (puede ser menos que
    // filas.length si ni siquiera al tamaño mínimo caben todas).
    const { grupos, etiquetaCol1 } = opciones
    const altoHeader = 12
    const { filasPorGrupo, altoFila, capacidad } = calcularDistribucion(filas.length, grupos, box.height, altoHeader, 7, 15)
    const aMostrar = Math.min(filas.length, capacidad)
    const fontSize = Math.max(5.5, Math.min(8, altoFila - 2.5))
    const anchoGrupo = box.width / grupos

    for (let g = 0; g < grupos; g++) {
        const gx = box.x + g * anchoGrupo
        const colNumero = anchoGrupo * 0.14
        const colFecha = anchoGrupo * 0.46

        // Encabezado del grupo
        page.drawRectangle({ x: gx, y: box.yTop - altoHeader, width: anchoGrupo, height: altoHeader, borderColor: rgb(0, 0, 0), borderWidth: 0.6 })
        dibujar(page, fontBold, etiquetaCol1, gx + 2, box.yTop - altoHeader + 3, Math.min(7, fontSize))
        dibujar(page, fontBold, 'Fecha', gx + colNumero + 2, box.yTop - altoHeader + 3, Math.min(7, fontSize))
        dibujar(page, fontBold, 'Valor', gx + colNumero + colFecha + 2, box.yTop - altoHeader + 3, Math.min(7, fontSize))
        page.drawLine({ start: { x: gx + colNumero, y: box.yTop }, end: { x: gx + colNumero, y: box.yTop - altoHeader }, thickness: 0.6, color: rgb(0, 0, 0) })
        page.drawLine({ start: { x: gx + colNumero + colFecha, y: box.yTop }, end: { x: gx + colNumero + colFecha, y: box.yTop - altoHeader }, thickness: 0.6, color: rgb(0, 0, 0) })

        for (let r = 0; r < filasPorGrupo; r++) {
            const idx = g * filasPorGrupo + r
            const yTopFila = box.yTop - altoHeader - r * altoFila
            const yBotFila = yTopFila - altoFila
            page.drawRectangle({ x: gx, y: yBotFila, width: anchoGrupo, height: altoFila, borderColor: rgb(0, 0, 0), borderWidth: 0.5 })
            page.drawLine({ start: { x: gx + colNumero, y: yTopFila }, end: { x: gx + colNumero, y: yBotFila }, thickness: 0.5, color: rgb(0, 0, 0) })
            page.drawLine({ start: { x: gx + colNumero + colFecha, y: yTopFila }, end: { x: gx + colNumero + colFecha, y: yBotFila }, thickness: 0.5, color: rgb(0, 0, 0) })
            if (idx < aMostrar) {
                const f = filas[idx]
                dibujar(page, font, f.numero, gx + 2, yBotFila + 2, fontSize)
                dibujar(page, font, f.fecha, gx + colNumero + 2, yBotFila + 2, fontSize)
                dibujar(page, font, f.valor, gx + colNumero + colFecha + 2, yBotFila + 2, fontSize)
            }
        }
    }
    return aMostrar
}

// ── Anexo de tabla de amortización — la tabla completa NUNCA va partida
// dentro del cuerpo del documento (se veía mal separada a la mitad). En su
// lugar, donde iba la tabla se deja una remisión ("Ver Anexo...") y la
// tabla completa se dibuja al final, en página(s) nueva(s) propias — tantas
// como haga falta según el número real de cuotas (3, 12, 60...). No
// requiere tocar la plantilla: son páginas en blanco agregadas por
// pdf-lib, no parte del PDF original subido.
function dibujarAnexoAmortizacion(
    doc: PDFDocument, font: PDFFont, fontBold: PDFFont,
    filas: FilaTabla[], titulo: string,
    opciones: { grupos: number; etiquetaCol1: string },
) {
    let restante = filas
    let pagina = 1
    while (restante.length > 0) {
        const page = doc.addPage([595.28, 841.89])
        const tituloPagina = pagina === 1 ? titulo : `${titulo} (continuación, página ${pagina})`
        dibujarCentrado(page, fontBold, tituloPagina, 297.64, 800, 11)
        const box = { x: 24, yTop: 770, width: 547, height: 730 }
        const mostradas = dibujarTablaCuotas(page, font, fontBold, restante, box, opciones)
        restante = restante.slice(mostradas)
        pagina++
    }
}

// ── Anexo de artículos — el recuadro fijo de la plantilla (página 1)
// solo tiene espacio real para 3 filas sin invadir el texto de la
// cláusula QUINTA (medido con PyMuPDF). Si la venta tiene más de 3
// artículos (frecuente con Combos, que se descomponen en varias líneas),
// el detalle completo se imprime aquí en vez de perderse — mismo
// criterio de "nunca truncar" ya aplicado a la tabla de cuotas.
interface FilaItem { cantidad: string; descripcion: string; serial: string }

function dibujarTablaItems(page: PDFPage, font: PDFFont, fontBold: PDFFont, filas: FilaItem[], box: { x: number; yTop: number; width: number; height: number }): number {
    const altoHeader = 14
    const altoFila = 16
    const filasQueCaben = Math.max(1, Math.floor((box.height - altoHeader) / altoFila))
    const aMostrar = Math.min(filas.length, filasQueCaben)
    const colCantidad = box.width * 0.10
    const colDescripcion = box.width * 0.62

    page.drawRectangle({ x: box.x, y: box.yTop - altoHeader, width: box.width, height: altoHeader, borderColor: rgb(0, 0, 0), borderWidth: 0.6 })
    dibujar(page, fontBold, 'Cant.', box.x + 3, box.yTop - altoHeader + 4, 8)
    dibujar(page, fontBold, 'Descripción', box.x + colCantidad + 3, box.yTop - altoHeader + 4, 8)
    dibujar(page, fontBold, 'Serie', box.x + colCantidad + colDescripcion + 3, box.yTop - altoHeader + 4, 8)
    page.drawLine({ start: { x: box.x + colCantidad, y: box.yTop }, end: { x: box.x + colCantidad, y: box.yTop - altoHeader }, thickness: 0.6, color: rgb(0, 0, 0) })
    page.drawLine({ start: { x: box.x + colCantidad + colDescripcion, y: box.yTop }, end: { x: box.x + colCantidad + colDescripcion, y: box.yTop - altoHeader }, thickness: 0.6, color: rgb(0, 0, 0) })

    for (let r = 0; r < aMostrar; r++) {
        const yTopFila = box.yTop - altoHeader - r * altoFila
        const yBotFila = yTopFila - altoFila
        page.drawRectangle({ x: box.x, y: yBotFila, width: box.width, height: altoFila, borderColor: rgb(0, 0, 0), borderWidth: 0.4 })
        page.drawLine({ start: { x: box.x + colCantidad, y: yTopFila }, end: { x: box.x + colCantidad, y: yBotFila }, thickness: 0.4, color: rgb(0, 0, 0) })
        page.drawLine({ start: { x: box.x + colCantidad + colDescripcion, y: yTopFila }, end: { x: box.x + colCantidad + colDescripcion, y: yBotFila }, thickness: 0.4, color: rgb(0, 0, 0) })
        const f = filas[r]
        dibujar(page, font, f.cantidad, box.x + 3, yBotFila + 4, 8)
        dibujar(page, font, f.descripcion.slice(0, 75), box.x + colCantidad + 3, yBotFila + 4, 8)
        if (f.serial) dibujar(page, font, f.serial.slice(0, 40), box.x + colCantidad + colDescripcion + 3, yBotFila + 4, 7)
    }
    return aMostrar
}

function dibujarAnexoArticulos(doc: PDFDocument, font: PDFFont, fontBold: PDFFont, filas: FilaItem[], titulo: string) {
    let restante = filas
    let pagina = 1
    while (restante.length > 0) {
        const page = doc.addPage([595.28, 841.89])
        const tituloPagina = pagina === 1 ? titulo : `${titulo} (continuación, página ${pagina})`
        dibujarCentrado(page, fontBold, tituloPagina, 297.64, 800, 11)
        const box = { x: 24, yTop: 770, width: 547, height: 730 }
        const mostradas = dibujarTablaItems(page, font, fontBold, restante, box)
        restante = restante.slice(mostradas)
        pagina++
    }
}

// ── Coordenadas (puntos PDF, origen abajo-izquierda, A4 595x842) ──────
// Medidas con PyMuPDF (texto real + posiciones) sobre las plantillas
// entregadas el 2026-09-13 — versión sin la rejilla de cuotas impresa
// (el usuario la quitó de la plantilla y dejó su propia remisión al
// Anexo: "Los Valores a pagar se anexan..." en el Contrato, "Anexo de
// cuadro de amortización, en la siguiente página" en el Pagaré — texto
// fijo de la plantilla, NO se dibuja ni se tapa nada ahí).

const COORD_CONTRATO = {
    p1: {
        cliente: [165, 723.2, 9] as const,
        direccion: [97, 709.7, 8] as const,
        numeroDocumento: [410, 694.7, 8] as const,
        fechaCompra: [136, 682.7, 8] as const,
        vencimiento: [356, 681.2, 8] as const,
        valorDocumento: [151, 696.2, 8] as const,
        cuotaInicial: [111, 669.2, 8] as const,
        // Fila "OBSERVACION: Durante __ [Plazo en cuotas: __] cuotas abona
        // cada dias: __" — plazoCuotas es un campo aparte ("Plazo en
        // cuotas:") que la plantilla intercala en medio de esa misma frase.
        obsCuotas: [165, 656.4, 9] as const,
        plazoCuotas: [289, 656.4, 8] as const,
        obsDias: [470, 656.4, 9] as const,
        itemsInicioY: 572,
        itemsColCantidad: 42,
        itemsColDescripcion: 162,
        itemsColSerie: 446,
        itemsLineHeight: 15,
        // Medido con PyMuPDF sobre la plantilla real: el bloque de artículos
        // tiene espacio libre entre el encabezado de la tabla (Cantidad /
        // Descripción / Serie) y el inicio del siguiente párrafo de la
        // cláusula QUINTA — cabe hasta 3 filas sin invadirlo; una 4ta fila
        // ya se encima con ese texto. Si hay más de 3 artículos, el resto
        // se lista completo en su propio anexo (ver dibujarAnexoArticulos)
        // en vez de truncarse — mismo criterio que la tabla de cuotas.
        itemsMax: 3,
        fechaImpresion: [496, 778.6, 7] as const,
        horaImpresion: [489, 764.9, 7] as const,
        // C.I. Comprador/Garante/Vendedor — antes vivían en una página 2
        // aparte; en la plantilla nueva todo el documento (clausulas,
        // firmas, C.I.) quedó en una sola página.
        ciComprador: [110, 118.9, 8] as const,
        ciGarante: [291, 118.9, 8] as const,
        ciVendedor: [461, 118.9, 8] as const,
    },
}

const COORD_PAGARE = {
    ruc: [455, 753.5, 9] as const,
    // "PAGARE A LA ORDEN No." ya no trae un "0000" impreso al lado —
    // el número va directo, sin necesidad de tapar nada primero.
    numero: [404, 733.7, 13] as const,
    detalle: [93, 689.6, 8] as const,
    // "...la cantidad de ___" — una sola línea, cabe el monto en letras.
    montoLetras: [425, 702.5, 7] as const,
    // "...valor antes mencionado en nn cuotas..." — "nn" es texto fijo de
    // la plantilla (placeholder), se tapa y se escribe el número real.
    numeroCuotasBox: { x: 416, y: 660, w: 14, h: 11 },
    numeroCuotas: [418, 662, 8] as const,
    saldoPorCancelar: [164, 630.2, 8] as const,
    // "hoy __ de __ del __" — la plantilla ya imprime "hoy/de/del" fijos
    // con un hueco después de cada uno; solo se llenan los 3 huecos.
    fechaFirmaDia: [296, 328.7, 8] as const,
    fechaFirmaMes: [322, 328.7, 8] as const,
    fechaFirmaAnio: [393, 328.7, 8] as const,
    // "DEUDOR....." / "R.U.C./C.I....." — los "Box" tapan los puntos de la
    // línea de firma antes de escribir encima (si no, quedan tachando el
    // texto). "GARANTE:" no lleva puntos, esa no necesita tapado.
    deudorNombreBox: { x: 79, y: 262, w: 133, h: 11 },
    deudorNombre: [85, 264.8, 9] as const,
    deudorCiBox: { x: 92, y: 249, w: 116, h: 11 },
    deudorCi: [105, 252.0, 9] as const,
    garanteNombre: [95, 92.5, 9] as const,
    garanteCiBox: { x: 92, y: 64, w: 116, h: 11 },
    garanteCi: [105, 66.8, 9] as const,
}

export const documentosCreditoService = {

    /** Genera el Contrato ya llenado con los datos del crédito — nunca se persiste, solo bytes en memoria. */
    async generarContrato(credito: CreditoElectrodomesticos, empresa: { nombre: string; ruc: string }): Promise<Uint8Array> {
        const [plantillaBytes, cliente, garante, items] = await Promise.all([
            cargarPlantilla('Contrato_Plantilla.pdf'),
            cargarPersona(credito.cliente_id),
            credito.garante_cliente_id ? cargarPersona(credito.garante_cliente_id) : Promise.resolve(null),
            cargarItemsFactura(credito.factura_id),
        ])

        const doc = await PDFDocument.load(plantillaBytes)
        const font = await doc.embedFont(StandardFonts.Helvetica)
        const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
        const C = COORD_CONTRATO

        // La plantilla nueva (2026-09-13) trae TODO el contrato — clausulas,
        // firmas y C.I. — en una sola página; la segunda página que trae el
        // archivo (confirmada vacía visualmente) es un residuo del Word de
        // origen. Si la plantilla vuelve a traer contenido real ahí, hay
        // que quitar esta línea.
        if (doc.getPageCount() > 1) doc.removePage(1)
        const [p1] = doc.getPages()

        const ahora = new Date()
        dibujar(p1, font, ahora.toLocaleDateString('es-EC'), ...C.p1.fechaImpresion)
        dibujar(p1, font, ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }), ...C.p1.horaImpresion)

        dibujar(p1, font, cliente.nombre, ...C.p1.cliente)
        dibujar(p1, font, cliente.direccion, ...C.p1.direccion)
        dibujar(p1, font, credito.comprobantes?.secuencial, ...C.p1.numeroDocumento)
        dibujar(p1, font, formatFechaDDMMYYYY(credito.fecha_venta), ...C.p1.fechaCompra)
        dibujar(p1, font, formatFechaDDMMYYYY(credito.fecha_ultimo_vencimiento), ...C.p1.vencimiento)
        dibujar(p1, font, credito.numero_cuotas, ...C.p1.plazoCuotas)
        dibujar(p1, font, `$${Number(credito.total_factura).toFixed(2)}`, ...C.p1.valorDocumento)
        dibujar(p1, font, `$${Number(credito.valor_entrada).toFixed(2)}`, ...C.p1.cuotaInicial)
        dibujar(p1, font, credito.numero_cuotas, ...C.p1.obsCuotas)
        const diasPeriodo = credito.periodicidad === 'DIARIA' ? 1 : credito.periodicidad === 'SEMANAL' ? 7 : 30
        dibujar(p1, font, diasPeriodo, ...C.p1.obsDias)

        items.slice(0, C.p1.itemsMax).forEach((it, i) => {
            const y = C.p1.itemsInicioY - i * C.p1.itemsLineHeight
            dibujar(p1, font, it.cantidad, C.p1.itemsColCantidad, y, 8)
            dibujar(p1, font, it.nombre_producto?.slice(0, 55), C.p1.itemsColDescripcion, y, 8)
            if (it.serial) dibujar(p1, font, it.serial.slice(0, 30), C.p1.itemsColSerie, y, 7)
        })

        dibujar(p1, font, cliente.identificacion, ...C.p1.ciComprador)
        if (garante) dibujar(p1, font, garante.identificacion, ...C.p1.ciGarante)
        dibujar(p1, font, empresa.ruc, ...C.p1.ciVendedor)

        // Si hubo más artículos de los que caben en el recuadro fijo de la
        // página 1 (ej. una venta con varios Combos, cada uno se
        // descompone en varias líneas), el detalle completo se imprime en
        // su propio anexo — nunca se pierde el resto silenciosamente.
        if (items.length > C.p1.itemsMax) {
            dibujarAnexoArticulos(
                doc, font, fontBold,
                items.map(it => ({ cantidad: String(it.cantidad), descripcion: it.nombre_producto ?? '', serial: it.serial ?? '' })),
                `ANEXO — DETALLE DE ARTÍCULOS — CONTRATO No. ${credito.comprobantes?.secuencial ?? ''}`,
            )
        }

        // La tabla de cuotas completa va solo en el Anexo, al final — la
        // plantilla ya trae su propia remisión impresa ("Los Valores a
        // pagar se anexan..."), no hay nada que tapar ni redactar aquí.
        const cuotasOrdenadas = (credito.cuotas ?? []).slice().sort((a, b) => a.numero_cuota - b.numero_cuota)
        const filasContrato: FilaTabla[] = cuotasOrdenadas.map((c, i) => ({
            numero: letraSecuencial(i),
            fecha: formatFechaDDMMYYYY(c.fecha_vencimiento),
            valor: Number(c.cuota_programada).toFixed(2),
        }))

        dibujarAnexoAmortizacion(
            doc, font, fontBold, filasContrato,
            `ANEXO — TABLA DE AMORTIZACIÓN — CONTRATO No. ${credito.comprobantes?.secuencial ?? ''}`,
            { grupos: 4, etiquetaCol1: 'Letra' },
        )

        limpiarMetadatosYEnlaces(doc, `Contrato de Credito ${credito.comprobantes?.secuencial ?? ''}`)

        return doc.save()
    },

    /**
     * Genera el Pagaré ya llenado. La rejilla de cuotas de la plantilla
     * (fija a 12, con etiquetas "CUOTA 1/12"..."12/12" impresas) se tapa
     * SIEMPRE y se reemplaza por una tabla propia del tamaño real del
     * crédito (3, 6, 12, 60 cuotas...) — con filas más altas si hay pocas
     * y más chicas si hay muchas. Si no caben todas en la página legal
     * (poca frecuencia — créditos largos a semanas), el resto se imprime
     * en páginas de continuación (solo tabla, sin repetir el texto legal).
     * pagare_numero se reserva UNA vez (RPC atómico) y se reutiliza en
     * reimpresiones — nunca se regenera para el mismo crédito.
     *
     * La plantilla nueva (2026-09-13) trae todo el pagaré — incluida la
     * parte de AVAL/GARANTE que antes era una página 2 aparte — en una
     * sola página, con su propia remisión impresa al Anexo ("Anexo de
     * cuadro de amortización, en la siguiente página").
     */
    async generarPagare(credito: CreditoElectrodomesticos, empresa: { nombre: string; ruc: string }, empresaId: string): Promise<{ bytes: Uint8Array; numeroPagare: string }> {
        const [plantillaBytes, cliente, garante] = await Promise.all([
            cargarPlantilla('Pagare_Plantilla.pdf'),
            cargarPersona(credito.cliente_id),
            credito.garante_cliente_id ? cargarPersona(credito.garante_cliente_id) : Promise.resolve(null),
        ])

        let numRaw = credito.pagare_numero
        if (!numRaw) {
            const n = await obtenerNumeroPagare(empresaId)
            numRaw = String(n).padStart(6, '0')
            const { error } = await supabase.from('creditos_electrodomesticos').update({ pagare_numero: numRaw }).eq('id', credito.id)
            if (error) throw error
        }
        const numeroPagare = numRaw

        const template = await PDFDocument.load(plantillaBytes)
        const cuotas: CuotaCredito[] = (credito.cuotas ?? []).slice().sort((a, b) => a.numero_cuota - b.numero_cuota)
        const filas: FilaTabla[] = cuotas.map(c => ({
            numero: String(c.numero_cuota),
            fecha: formatFechaDDMMYYYY(c.fecha_vencimiento),
            valor: Number(c.cuota_programada).toFixed(2),
        }))
        const totalFinanciado = Number(credito.total_financiado)

        const out = await PDFDocument.create()
        const font = await out.embedFont(StandardFonts.Helvetica)
        const fontBold = await out.embedFont(StandardFonts.HelveticaBold)
        const P = COORD_PAGARE
        const [anio, mes, dia] = (credito.fecha_venta || '').split('-')

        const [pagina1] = await out.copyPages(template, [0])
        out.addPage(pagina1)

        dibujar(pagina1, font, empresa.ruc, ...P.ruc)
        dibujar(pagina1, fontBold, numeroPagare, ...P.numero)
        dibujar(pagina1, font, 'Compra de electrodomésticos a crédito', ...P.detalle)
        // Un solo renglón angosto entre dos frases fijas — el tamaño se
        // ajusta solo para que el monto en letras nunca se salga de margen.
        dibujarAjustado(pagina1, font, montoEnLetras(totalFinanciado), P.montoLetras[0], P.montoLetras[1], P.montoLetras[2], 122)

        tapar(pagina1, P.numeroCuotasBox)
        dibujar(pagina1, font, credito.numero_cuotas, ...P.numeroCuotas)

        dibujar(pagina1, font, `$${totalFinanciado.toFixed(2)}`, ...P.saldoPorCancelar)

        if (dia && mes && anio) {
            dibujar(pagina1, font, dia, ...P.fechaFirmaDia)
            dibujar(pagina1, font, MESES[Number(mes) - 1], ...P.fechaFirmaMes)
            dibujar(pagina1, font, anio, ...P.fechaFirmaAnio)
        }

        // "DEUDOR....." / "R.U.C./C.I....." — los puntos de la línea de
        // firma quedan tachando el texto si se escribe encima sin taparlos.
        tapar(pagina1, P.deudorNombreBox)
        dibujar(pagina1, font, cliente.nombre, ...P.deudorNombre)
        tapar(pagina1, P.deudorCiBox)
        dibujar(pagina1, font, cliente.identificacion, ...P.deudorCi)
        if (garante) {
            // "GARANTE:" no trae puntos (es solo la etiqueta) — el nombre va
            // directo. Su "R.U.C./C.I....." sí los trae, igual que el deudor.
            dibujar(pagina1, font, garante.nombre, ...P.garanteNombre)
            tapar(pagina1, P.garanteCiBox)
            dibujar(pagina1, font, garante.identificacion, ...P.garanteCi)
        }

        // Anexo — tabla de amortización completa, al final del documento.
        dibujarAnexoAmortizacion(
            out, font, fontBold, filas,
            `ANEXO — TABLA DE AMORTIZACIÓN — PAGARÉ No. ${numeroPagare}`,
            { grupos: 3, etiquetaCol1: 'Cuota' },
        )

        limpiarMetadatosYEnlaces(out, `Pagare ${numeroPagare}`)

        return { bytes: await out.save(), numeroPagare }
    },
}

function abrirPdfParaImprimir(bytes: Uint8Array, nombreArchivo: string) {
    // Deliberadamente NO se dispara print() automático: en documentos de
    // varias páginas, llamarlo antes de que el visor termine de cargar
    // puede mandar a imprimir solo la página que alcanzó a renderizar. El
    // propio visor de PDF del navegador ya trae su botón de imprimir, con
    // selección de impresora incluida — el usuario lo usa cuando el
    // documento ya esté totalmente cargado en pantalla.
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) {
        // Popup bloqueado — al menos ofrecer la descarga.
        const a = document.createElement('a')
        a.href = url
        a.download = nombreArchivo
        a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export { abrirPdfParaImprimir }
