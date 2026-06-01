// Lee OTP y email del query string ANTES de que Supabase inicialice
const _search = new URLSearchParams(window.location.search)
export const otpToken: string | null = _search.get('otp')
export const otpEmail: string | null = _search.get('email')
if (otpToken) {
    // Limpiar la URL para que el OTP no quede visible ni se reuse
    window.history.replaceState({}, document.title, window.location.pathname)
}
