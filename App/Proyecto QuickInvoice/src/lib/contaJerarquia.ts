// ============================================================
// Jerarquía de cuentas contables para reportes — reconstruye subtotales
// por cuenta padre a partir de los códigos de las cuentas de detalle
// (ej. las hojas "1.01.01.01" y "1.01.01.02" alimentan el subtotal de
// "1.01.01", que a su vez alimenta el de "1.01", que alimenta "1").
// No depende de cuenta_padre_id: el propio código (segmentos separados
// por punto) ya codifica el nivel y el padre — mismo criterio que usa
// PlanCuentasPage para auto-detectar la cuenta padre al escribir un
// código nuevo.
// ============================================================

export interface HojaCuenta {
    codigo: string
    nombre: string
    valores: Record<string, number>
}

export interface CuentaRef {
    codigo: string
    nombre: string
}

export interface FilaJerarquica {
    codigo: string
    nombre: string
    nivel: number
    valores: Record<string, number>
    esSubtotal: boolean
}

function compararCodigos(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const va = pa[i] ?? -1
        const vb = pb[i] ?? -1
        if (va !== vb) return va - vb
    }
    return 0
}

/**
 * Recibe las cuentas de detalle (hojas, las únicas que tienen saldo real
 * porque son las que aceptan movimientos) y arma la lista completa para
 * imprimir: cada cuenta padre aparece como fila de subtotal (suma de
 * todos sus descendientes), indentada según su nivel, seguida de sus
 * hojas. `todasLasCuentas` sirve para tomar el nombre real de las
 * cuentas padre (no tienen saldo propio en lp_saldos_cuenta, pero sí
 * existen como fila en lp_cuentas con su nombre).
 */
export function construirJerarquia(hojas: HojaCuenta[], todasLasCuentas: CuentaRef[]): FilaJerarquica[] {
    if (hojas.length === 0) return []

    const nombresPorCodigo = new Map(todasLasCuentas.map(c => [c.codigo, c.nombre]))
    const hojasPorCodigo = new Map(hojas.map(h => [h.codigo, h]))
    const campos = Array.from(new Set(hojas.flatMap(h => Object.keys(h.valores))))

    const acumulado = new Map<string, Record<string, number>>()
    for (const h of hojas) {
        const partes = h.codigo.split('.')
        for (let i = 1; i <= partes.length; i++) {
            const prefijo = partes.slice(0, i).join('.')
            const actual = acumulado.get(prefijo) ?? Object.fromEntries(campos.map(c => [c, 0]))
            for (const c of campos) actual[c] = (actual[c] ?? 0) + (h.valores[c] ?? 0)
            acumulado.set(prefijo, actual)
        }
    }

    return Array.from(acumulado.keys())
        .sort(compararCodigos)
        .map(codigo => {
            const hoja = hojasPorCodigo.get(codigo)
            const nombre = hoja?.nombre ?? nombresPorCodigo.get(codigo) ?? codigo
            return {
                codigo,
                nombre,
                nivel: codigo.split('.').length,
                valores: acumulado.get(codigo)!,
                esSubtotal: !hoja,
            }
        })
}

export interface HojaConAlterno extends HojaCuenta {
    codigoAlterno: string | null
}

export interface ResultadoAgrupacionAlterna {
    filas: FilaJerarquica[]
    sinMapear: { codigo: string; nombre: string }[]
}

/**
 * Modelo SRI / Superintendencia: a diferencia de la cuenta propia, acá
 * no existe un catálogo con nombre por cada código intermedio — solo
 * un código suelto por cuenta (codigo_sri / codigo_supe). Por eso NO
 * se arma jerarquía: se agrupan las hojas que comparten el mismo
 * código alterno en una sola fila plana, sumando sus saldos. Si alguna
 * cuenta con saldo distinto de cero no tiene código alterno asignado,
 * no se genera nada — se listan esas cuentas para que el usuario las
 * mapee primero en Plan de Cuentas (ningún saldo se reporta a medias).
 */
export function agruparPorCodigoAlterno(hojas: HojaConAlterno[]): ResultadoAgrupacionAlterna {
    const CERO = 1e-9
    const tieneValor = (v: Record<string, number>) => Object.values(v).some(n => Math.abs(n) > CERO)

    const sinMapear = hojas
        .filter(h => !h.codigoAlterno && tieneValor(h.valores))
        .map(h => ({ codigo: h.codigo, nombre: h.nombre }))
    if (sinMapear.length > 0) return { filas: [], sinMapear }

    const campos = Array.from(new Set(hojas.flatMap(h => Object.keys(h.valores))))
    const mapa = new Map<string, { nombres: Set<string>; valores: Record<string, number> }>()
    for (const h of hojas) {
        if (!h.codigoAlterno) continue
        const ex = mapa.get(h.codigoAlterno)
        if (ex) {
            ex.nombres.add(h.nombre)
            for (const c of campos) ex.valores[c] = (ex.valores[c] ?? 0) + (h.valores[c] ?? 0)
        } else {
            mapa.set(h.codigoAlterno, {
                nombres: new Set([h.nombre]),
                valores: Object.fromEntries(campos.map(c => [c, h.valores[c] ?? 0])),
            })
        }
    }

    const filas: FilaJerarquica[] = Array.from(mapa.entries())
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([codigo, v]) => ({
            codigo,
            nombre: Array.from(v.nombres).join(' / '),
            nivel: 1,
            valores: v.valores,
            esSubtotal: false,
        }))

    return { filas, sinMapear: [] }
}
