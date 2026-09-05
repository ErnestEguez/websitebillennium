// Asignación de "punto de emisión" por dispositivo/navegador (Fase 2).
// Cada caja/máquina puede facturar con una serie SRI distinta sin mostrar
// un selector al cajero: el admin lo configura una vez desde Configuración.
const KEY_PREFIX = 'qi_dispositivo_punto_emision_'

// Fase 3 (terminales con nombre, tabla facturacion.terminales): el navegador
// ya no guarda el punto_emision_id directo, guarda solo el NOMBRE de la
// terminal (ej. "Caja 1") — la asignación real vive en el servidor y se
// resuelve por nombre en puntoEmisionService.resolverParaDispositivo. Esto
// permite reasignar la serie de una terminal sin tocar la máquina física, y
// que un admin vea/gestione todas las terminales desde un solo lugar.
const KEY_TERMINAL_PREFIX = 'qi_dispositivo_terminal_'

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

export function getTerminalDispositivo(empresaId: string): string | null {
    try {
        return localStorage.getItem(KEY_TERMINAL_PREFIX + empresaId)
    } catch {
        return null
    }
}

export function setTerminalDispositivo(empresaId: string, nombreTerminal: string | null): void {
    try {
        if (nombreTerminal) localStorage.setItem(KEY_TERMINAL_PREFIX + empresaId, nombreTerminal)
        else localStorage.removeItem(KEY_TERMINAL_PREFIX + empresaId)
    } catch {
        // localStorage no disponible (modo privado, etc.) — no-op
    }
}
