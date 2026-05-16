import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatMoneda(n: number, sym = '$') {
    return `${sym}${n.toFixed(2)}`
}
