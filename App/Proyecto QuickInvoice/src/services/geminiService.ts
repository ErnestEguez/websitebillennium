const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string
const GEMINI_MODEL   = 'gemini-2.0-flash'
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

interface GeminiPart {
    text?: string
    inline_data?: { mime_type: string; data: string }
}

export interface ProductoOcr {
    codigo: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    descuento: number
    iva_porcentaje: number
    subtotal: number
    categoria_sugerida?: string
}

export interface FacturaOcr {
    proveedor_nombre: string
    proveedor_ruc: string
    proveedor_direccion?: string
    proveedor_telefono?: string
    proveedor_correo?: string
    proveedor_contribuyente_especial?: boolean
    estab: string
    pto_emi: string
    secuencial: string
    fecha_emision: string
    clave_acceso: string | null
    subtotal: number
    base_iva_0: number
    base_iva_15: number
    valor_iva: number
    total: number
    detalle: ProductoOcr[]
}

async function callGemini(parts: GeminiPart[], maxTokens = 1500): Promise<string> {
    const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
        }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error?.message ?? `HTTP ${res.status}`)
    }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export const geminiService = {
    async generateContent(parts: GeminiPart[]): Promise<string> {
        return callGemini(parts, 1500)
    },

    async analizarFacturaCompra(
        base64: string,
        mimeType: string,
        categorias: string[],
    ): Promise<FacturaOcr> {
        const catList = categorias.length > 0 ? categorias.join(', ') : 'General'
        const prompt = `Analiza esta factura de proveedor ecuatoriana y extrae todos sus datos.
Categorías de productos disponibles: ${catList}
Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.

{
  "proveedor_nombre": "nombre o razón social del EMISOR de la factura",
  "proveedor_ruc": "RUC del EMISOR (13 dígitos)",
  "proveedor_direccion": "dirección del emisor o null",
  "proveedor_telefono": "teléfono del emisor o null",
  "proveedor_correo": "correo electrónico del emisor o null",
  "proveedor_contribuyente_especial": false,
  "estab": "001",
  "pto_emi": "001",
  "secuencial": "000000001",
  "fecha_emision": "YYYY-MM-DD",
  "clave_acceso": "clave de acceso de 49 dígitos o null si no aparece",
  "subtotal": 0.00,
  "base_iva_0": 0.00,
  "base_iva_15": 0.00,
  "valor_iva": 0.00,
  "total": 0.00,
  "detalle": [
    {
      "codigo": "código del artículo en la factura",
      "descripcion": "descripción completa del producto",
      "cantidad": 1,
      "precio_unitario": 0.00,
      "descuento": 0.00,
      "iva_porcentaje": 15,
      "subtotal": 0.00,
      "categoria_sugerida": "la categoría más apropiada de la lista disponible"
    }
  ]
}`
        const raw = await callGemini(
            [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }],
            4000,
        )
        const json = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        return JSON.parse(json) as FacturaOcr
    },

    // Convierte una URL (signed URL o pública) a base64 + mimeType para enviar como inline_data
    async urlToBase64(url: string): Promise<{ data: string; mime_type: string }> {
        const response = await fetch(url)
        if (!response.ok) throw new Error('No se pudo descargar el archivo del CV')
        const buffer = await response.arrayBuffer()
        const bytes   = new Uint8Array(buffer)
        let binary    = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        const data      = btoa(binary)
        const ct        = response.headers.get('content-type') ?? ''
        const mime_type = ct.includes('pdf') ? 'application/pdf'
            : ct.includes('word') || url.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf'
        return { data, mime_type }
    },
}
