// Lee y guarda refresh_token del hash ANTES de que cualquier cliente Supabase inicialice
const _params = new URLSearchParams(window.location.hash.substring(1))
export const magicLinkRefreshToken: string | null = _params.get('refresh_token')
if (magicLinkRefreshToken) {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
}
