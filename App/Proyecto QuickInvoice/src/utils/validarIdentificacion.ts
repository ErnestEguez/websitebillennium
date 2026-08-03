// Validador de cédula/RUC ecuatoriano (algoritmo estándar del SRI —
// módulo 10 para cédula/RUC de persona natural, módulo 11 para RUC de
// sociedad privada/pública). Sin dependencias externas.

export type TipoIdentificacionValida = 'CEDULA' | 'RUC_NATURAL' | 'RUC_PRIVADA' | 'RUC_PUBLICA'

export interface ResultadoValidacion {
    ok: boolean
    tipo?: TipoIdentificacionValida
    error?: string
}

function soloDigitos(valor: string): string {
    return (valor || '').replace(/\D/g, '')
}

function provinciaValida(digitos: string): boolean {
    const provincia = parseInt(digitos.substring(0, 2), 10)
    return provincia >= 1 && provincia <= 24
}

export function validarCedula(valor: string): boolean {
    const cedula = soloDigitos(valor)
    if (cedula.length !== 10) return false
    if (!provinciaValida(cedula)) return false
    const tercerDigito = parseInt(cedula[2], 10)
    if (tercerDigito > 6) return false

    const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2]
    let suma = 0
    for (let i = 0; i < 9; i++) {
        let val = parseInt(cedula[i], 10) * coeficientes[i]
        if (val >= 10) val -= 9
        suma += val
    }
    const digitoVerificador = parseInt(cedula[9], 10)
    const decena = Math.ceil(suma / 10) * 10
    let resultado = decena - suma
    if (resultado === 10) resultado = 0
    return resultado === digitoVerificador
}

function validarRucSociedad(valor: string, tercerDigitoEsperado: number, publica: boolean): boolean {
    const ruc = soloDigitos(valor)
    if (ruc.length !== 13) return false
    if (!provinciaValida(ruc)) return false
    if (parseInt(ruc[2], 10) !== tercerDigitoEsperado) return false

    if (publica) {
        if (ruc.substring(9, 13) !== '0001') return false
        const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2]
        let suma = 0
        for (let i = 0; i < 8; i++) suma += parseInt(ruc[i], 10) * coeficientes[i]
        const residuo = suma % 11
        const digitoVerificador = residuo === 0 ? 0 : 11 - residuo
        return digitoVerificador === parseInt(ruc[8], 10)
    }

    if (ruc.substring(10, 13) !== '001') return false
    const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2]
    let suma = 0
    for (let i = 0; i < 9; i++) suma += parseInt(ruc[i], 10) * coeficientes[i]
    const residuo = suma % 11
    const digitoVerificador = residuo === 0 ? 0 : 11 - residuo
    return digitoVerificador === parseInt(ruc[9], 10)
}

export function validarRucPersonaNatural(valor: string): boolean {
    const ruc = soloDigitos(valor)
    if (ruc.length !== 13) return false
    if (ruc.substring(10, 13) !== '001') return false
    return validarCedula(ruc.substring(0, 10))
}

export function validarRucSociedadPrivada(valor: string): boolean {
    return validarRucSociedad(valor, 9, false)
}

export function validarRucSociedadPublica(valor: string): boolean {
    return validarRucSociedad(valor, 6, true)
}

// Detecta y valida cédula o cualquier tipo de RUC según la longitud.
export function validarIdentificacion(valor: string): ResultadoValidacion {
    const digitos = soloDigitos(valor)

    if (digitos.length === 10) {
        return validarCedula(digitos)
            ? { ok: true, tipo: 'CEDULA' }
            : { ok: false, error: 'Cédula inválida' }
    }

    if (digitos.length === 13) {
        if (validarRucPersonaNatural(digitos)) return { ok: true, tipo: 'RUC_NATURAL' }
        if (validarRucSociedadPrivada(digitos)) return { ok: true, tipo: 'RUC_PRIVADA' }
        if (validarRucSociedadPublica(digitos)) return { ok: true, tipo: 'RUC_PUBLICA' }
        return { ok: false, error: 'RUC inválido' }
    }

    return { ok: false, error: 'Debe tener 10 dígitos (cédula) o 13 dígitos (RUC)' }
}
