import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string | null | undefined) {
    const value = Number(amount)
    if (isNaN(value)) return '$0.00'

    return new Intl.NumberFormat('es-EC', {
        style: 'currency',
        currency: 'USD',
    }).format(value)
}

// ── Utilidades LedgerPro ──────────────────────────────────────
export function formatMoneda(valor: number, simbolo = '$', decimales = 2): string {
    return `${simbolo} ${valor.toLocaleString('es-EC', {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
    })}`
}

export function formatFecha(fecha: string | Date): string {
    const d = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function mesNombre(mes: number): string {
    return new Date(2000, mes - 1, 1).toLocaleString('es-EC', { month: 'long' })
}

export function validateIdentificacion(id: string): { isValid: boolean, type: 'CEDULA' | 'RUC' | 'PASSPORT' | 'CONSUMIDOR_FINAL' | 'INVALID' } {
    const cleanId = (id || '').trim();
    if (cleanId === '9999999999999' || cleanId === '9999999999') return { isValid: true, type: 'CONSUMIDOR_FINAL' };
    if (!cleanId) return { isValid: false, type: 'INVALID' };

    if (cleanId.length === 10) return { isValid: true, type: 'CEDULA' };
    if (cleanId.length === 13) return { isValid: true, type: 'RUC' };

    return { isValid: false, type: 'INVALID' };
}
