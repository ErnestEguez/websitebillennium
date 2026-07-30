import { supabase } from '../lib/supabase'

// Intervalo entre verificaciones silenciosas de "¿sigo siendo la sesión
// activa?". Configurable acá, sin tocar la lógica del mecanismo.
export const SESSION_CHECK_INTERVAL_MS = 30 * 60 * 1000

const SESSION_ID_KEY_PREFIX = 'qi_session_id_'

// Identifica ESTE navegador/login. Se genera una sola vez por login real
// (evento SIGNED_IN) y se reutiliza mientras dure la sesión — recargar la
// página NO genera uno nuevo. Vive en localStorage bajo una key propia
// (no "sb-*"), así la limpieza que ya hace signOut() la borra sola.
function sessionIdKey(userId: string): string {
    return SESSION_ID_KEY_PREFIX + userId
}

function crearSessionId(userId: string): string {
    const sessionId = crypto.randomUUID()
    try { localStorage.setItem(sessionIdKey(userId), sessionId) } catch { /* localStorage no disponible */ }
    return sessionId
}

// Devuelve el session_id existente o crea uno si no hay (caso borde: la
// sesión de Supabase se restauró pero por algún motivo no había uno).
function obtenerOCrearSessionId(userId: string): string {
    try {
        const existente = localStorage.getItem(sessionIdKey(userId))
        if (existente) return existente
    } catch { /* localStorage no disponible */ }
    return crearSessionId(userId)
}

async function sha256Hex(texto: string): Promise<string> {
    const bytes = new TextEncoder().encode(texto)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Resumen legible del user agent para mostrarle al admin_plataforma en el
// log de sesiones (ej. "Chrome en Windows") — no pretende ser exhaustivo.
function resumirUserAgent(): string {
    const ua = navigator.userAgent
    let navegador = 'Navegador desconocido'
    if (ua.includes('Edg/')) navegador = 'Edge'
    else if (ua.includes('Chrome/')) navegador = 'Chrome'
    else if (ua.includes('Firefox/')) navegador = 'Firefox'
    else if (ua.includes('Safari/')) navegador = 'Safari'

    let so = 'SO desconocido'
    if (ua.includes('Windows')) so = 'Windows'
    else if (ua.includes('Mac OS')) so = 'macOS'
    else if (ua.includes('Android')) so = 'Android'
    else if (ua.includes('iPhone') || ua.includes('iPad')) so = 'iOS'
    else if (ua.includes('Linux')) so = 'Linux'

    return `${navegador} en ${so}`
}

export const sesionUnicaService = {
    SESSION_CHECK_INTERVAL_MS,

    // Sin fila = mecanismo deshabilitado (comportamiento por defecto, no requiere seed)
    async isEnabled(empresaId: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('sesion_unica_config')
            .select('enabled')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        if (error) throw error
        return !!data?.enabled
    },

    // Registra/asegura la sesión activa GLOBAL del usuario (una sola fila
    // por user_id en todo el sistema — empresaId es solo metadata de
    // auditoría, no forma parte de la unicidad).
    // - esLoginNuevo=true (evento SIGNED_IN real): genera un session_id
    //   NUEVO, lo que desplaza cualquier sesión previa del mismo usuario
    //   en cualquier empresa.
    // - esLoginNuevo=false (cambio de empresa vía selectEmpresa, o carga
    //   normal cuando el mecanismo ya estaba activo): reutiliza el
    //   session_id ya existente de este navegador — no es un login nuevo,
    //   así que no debe desplazar nada.
    async registrarSesion(userId: string, empresaId: string, esLoginNuevo: boolean): Promise<void> {
        const sessionId = esLoginNuevo ? crearSessionId(userId) : obtenerOCrearSessionId(userId)
        const tokenHash = await sha256Hex(sessionId)
        const { data, error } = await supabase.rpc('registrar_sesion', {
            p_token_hash: tokenHash,
            p_dispositivo: resumirUserAgent(),
            p_empresa_id: empresaId,
        })
        if (error) throw error
        if (data?.ok === false) throw new Error(data.error || 'No se pudo registrar la sesión')
    },

    // Se llama cada SESSION_CHECK_INTERVAL_MS: recalcula el hash del
    // session_id ya guardado (determinístico) y confirma que sigue siendo
    // el activo, sin importar la empresa activa en ese momento. true =
    // vigente, false = fue desplazada por otro login.
    async verificarSesionVigente(userId: string): Promise<boolean> {
        const sessionId = obtenerOCrearSessionId(userId)
        const tokenHash = await sha256Hex(sessionId)
        const { data, error } = await supabase.rpc('verificar_sesion', {
            p_token_hash: tokenHash,
        })
        if (error) throw error
        return data !== false
    },

    // Logout manual: archiva la fila en historial_sesiones y borra la
    // sesión activa. Se llama ANTES de supabase.auth.signOut().
    async cerrarSesion(motivo: 'logout_manual' | 'admin' = 'logout_manual'): Promise<void> {
        const { error } = await supabase.rpc('cerrar_sesion', {
            p_motivo: motivo,
        })
        if (error) throw error
    },
}
