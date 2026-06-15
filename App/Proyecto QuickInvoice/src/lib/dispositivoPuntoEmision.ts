// Asignación de "punto de emisión" por dispositivo/navegador (Fase 2).
// Cada caja/máquina puede facturar con una serie SRI distinta sin mostrar
// un selector al cajero: el admin lo configura una vez desde Configuración.
const KEY_PREFIX = 'qi_dispositivo_punto_emision_'

export function getPuntoEmisionDispositivo(empresaId: string): string | null {
    try {
        return localStorage.getItem(KEY_PREFIX + empresaId)
    } catch {
        return null
    }
}

export function setPuntoEmisionDispositivo(empresaId: string, puntoEmisionId: string | null): void {
    try {
        if (puntoEmisionId) localStorage.setItem(KEY_PREFIX + empresaId, puntoEmisionId)
        else localStorage.removeItem(KEY_PREFIX + empresaId)
    } catch {
        // localStorage no disponible (modo privado, etc.) — no-op
    }
}
