// Extrae el mensaje real de un error de supabase.functions.invoke(). Cuando
// la Edge Function responde con un status no-2xx, error.message SIEMPRE es
// el genérico "Edge Function returned a non-2xx status code" — el mensaje
// real (ej. un error de Gemini, cuota agotada, o un flag desactivado) va en
// el cuerpo JSON de la respuesta, accesible solo vía error.context (un
// Response) que hay que leer aparte.
export async function mensajeErrorFuncion(error: any, fallback = 'Error al llamar a la función'): Promise<string> {
    if (!error) return fallback
    const context = error.context
    if (context && typeof context.json === 'function') {
        try {
            const body = await context.json()
            if (body?.error) return body.error
        } catch { /* el cuerpo no era JSON */ }
    }
    return error.message ?? fallback
}
