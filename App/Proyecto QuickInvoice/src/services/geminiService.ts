const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string
const GEMINI_MODEL   = 'gemini-2.5-flash-lite'
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

interface GeminiPart {
    text?: string
    inline_data?: { mime_type: string; data: string }
}

export const geminiService = {
    async generateContent(parts: GeminiPart[]): Promise<string> {
        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
            }),
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error((err as any).error?.message ?? `HTTP ${res.status}`)
        }
        const data = await res.json()
        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
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
