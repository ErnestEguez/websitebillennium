import { useEffect, useRef } from 'react'

/**
 * Persiste el estado de un formulario en sessionStorage.
 * - Restaura al montar (si hay borrador guardado)
 * - Guarda automáticamente en cada cambio de estado
 * - Devuelve clearDraft() para limpiar al guardar exitosamente
 *
 * @param key      Clave única por formulario (ej. 'draft_compra_inv')
 * @param getState Función que devuelve el estado actual a serializar
 * @param restore  Función que recibe el estado guardado y llama los setters
 * @param deps     Array de dependencias (mismo patrón que useEffect)
 */
export function useFormDraft<T>(
    key: string,
    getState: () => T,
    restore: (saved: T) => void,
    deps: unknown[],
): () => void {
    const restored = useRef(false)

    // Restaurar al montar — solo una vez
    useEffect(() => {
        if (restored.current) return
        restored.current = true
        try {
            const raw = sessionStorage.getItem(key)
            if (raw) restore(JSON.parse(raw) as T)
        } catch { /* borrador corrupto — ignorar */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Guardar en cada cambio de deps
    useEffect(() => {
        try { sessionStorage.setItem(key, JSON.stringify(getState())) }
        catch { /* quota exceeded u otro error — ignorar */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)

    return () => sessionStorage.removeItem(key)
}
