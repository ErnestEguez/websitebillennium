import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatMoneda(n: number, sym = '$') {
    return `${sym}${n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatFecha(s: string) {
    return new Date(s + 'T12:00:00').toLocaleDateString('es-EC', {
        day: '2-digit', month: 'short', year: 'numeric',
    })
}

export function mesNombre(m: number) {
    return ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m]
}
