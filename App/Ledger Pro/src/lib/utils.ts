import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

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
