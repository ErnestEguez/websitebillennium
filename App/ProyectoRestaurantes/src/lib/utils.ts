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

export function validateIdentificacion(id: string): { isValid: boolean, type: 'CEDULA' | 'RUC' | 'PASSPORT' | 'CONSUMIDOR_FINAL' | 'INVALID' } {
    const cleanId = (id || '').trim();
    if (cleanId === '9999999999999' || cleanId === '9999999999') return { isValid: true, type: 'CONSUMIDOR_FINAL' };
    if (!cleanId) return { isValid: false, type: 'INVALID' };

    if (cleanId.length === 10) return { isValid: true, type: 'CEDULA' };
    if (cleanId.length === 13) return { isValid: true, type: 'RUC' };

    return { isValid: false, type: 'INVALID' };
}
