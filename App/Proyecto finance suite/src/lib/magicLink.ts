// Captura access_token Y refresh_token del hash ANTES de que Supabase inicialice
const _params = new URLSearchParams(window.location.hash.substring(1))
export const magicLinkAccessToken:  string | null = _params.get('access_token')
export const magicLinkRefreshToken: string | null = _params.get('refresh_token')
if (magicLinkAccessToken || magicLinkRefreshToken) {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
}
