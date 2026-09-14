// ============================================================
// Motor de cálculo — Ventas a Crédito de Electrodomésticos
// ============================================================
// Función pura: no toca Supabase, no conoce React, no persiste nada.
// Recibe el saldo a diferir YA calculado por el caller (según
// config_credito_electrodomesticos.base_calculo_interes — esa decisión
// de negocio vive fuera de aquí) y devuelve la tabla de amortización
// completa, determinística: mismos parámetros → misma tabla siempre.
//
// Fechas como texto "YYYY-MM-DD" con aritmética manual de calendario
// (nunca new Date('YYYY-MM-DD') ni date-fns sobre esos strings) — evita
// el corrimiento de un día por zona horaria que ya mordió a otras partes
// de este proyecto (ver comentario en InvoiceTicketPOS.tsx). Ecuador no
// usa horario de verano, así que ni siquiera hace falta más que esto.
// ============================================================

export type Periodicidad = 'DIARIA' | 'SEMANAL' | 'MENSUAL'
export type TipoTasa = 'TASA_PERIODICA' | 'TASA_ANUAL_NOMINAL' | 'TASA_EFECTIVA_ANUAL' | 'FACTOR_ACUMULADO_PLAZO'

export interface CuotaCalculada {
    numero_cuota: number
    fecha_vencimiento: string
    saldo_inicial: number
    capital_programado: number
    interes_programado: number
    cuota_programada: number
    saldo_final_programado: number
}

export interface ResultadoAmortizacion {
    // null solo en modo FACTOR_ACUMULADO_PLAZO — ahí no existe una tasa
    // periódica real, es un recargo comercial acumulado (ver tipo_valor
    // en tasas_credito_electrodomesticos).
    tasa_periodica_pct: number | null
    total_intereses: number
    total_financiado: number
    valor_cuota_referencial: number
    cuotas: CuotaCalculada[]
}

export interface ParametrosCredito {
    /** Capital a financiar — YA resuelto por el caller según base_calculo_interes. */
    saldoADiferir: number
    tipoTasa: TipoTasa
    /** Porcentaje tal como se digita (1.5 = 1.5%, 20.4210 = 20.4210%). */
    tasaValor: number
    periodicidad: Periodicidad
    numeroCuotas: number
    fechaPrimerVencimiento: string
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ── Fechas — aritmética de calendario pura, sin objetos Date ──────────────

interface FechaYMD { y: number; m: number; d: number }

function parseYMD(fecha: string): FechaYMD {
    const [y, m, d] = fecha.split('-').map(Number)
    return { y, m, d }
}

function formatYMD({ y, m, d }: FechaYMD): string {
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Días del mes `m` (1-12) del año `y`, vía Date.UTC (sin zona horaria local). */
function diasDelMes(y: number, m: number): number {
    return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function sumarDias(fecha: FechaYMD, dias: number): FechaYMD {
    const base = Date.UTC(fecha.y, fecha.m - 1, fecha.d)
    const resultado = new Date(base + dias * 86400000)
    return { y: resultado.getUTCFullYear(), m: resultado.getUTCMonth() + 1, d: resultado.getUTCDate() }
}

/** Suma meses conservando el día; si el mes destino no tiene ese día, usa su último día. */
function sumarMeses(fecha: FechaYMD, meses: number): FechaYMD {
    const totalMeses = (fecha.m - 1) + meses
    const y = fecha.y + Math.floor(totalMeses / 12)
    const m = (((totalMeses % 12) + 12) % 12) + 1
    const d = Math.min(fecha.d, diasDelMes(y, m))
    return { y, m, d }
}

function fechaVencimientoCuota(fechaPrimerVencimiento: string, periodicidad: Periodicidad, numeroCuota: number): string {
    const primera = parseYMD(fechaPrimerVencimiento)
    const offset = numeroCuota - 1
    if (offset === 0) return formatYMD(primera)
    if (periodicidad === 'DIARIA')  return formatYMD(sumarDias(primera, offset))
    if (periodicidad === 'SEMANAL') return formatYMD(sumarDias(primera, offset * 7))
    return formatYMD(sumarMeses(primera, offset))
}

// ── Conversión de tasa a periódica ─────────────────────────────────────────

const PERIODOS_POR_ANIO: Record<Periodicidad, number> = {
    DIARIA: 360,   // convención bancaria de año comercial de 360 días
    SEMANAL: 52,
    MENSUAL: 12,
}

/**
 * Tasa periódica efectiva (fracción, no %) coherente con la periodicidad de
 * las cuotas. FACTOR_ACUMULADO_PLAZO no pasa por aquí — no es una tasa de
 * amortización, es un recargo fijo (ver calcularCreditoElectrodomesticos).
 */
export function tasaPeriodica(tipoTasa: Exclude<TipoTasa, 'FACTOR_ACUMULADO_PLAZO'>, tasaValor: number, periodicidad: Periodicidad): number {
    const n = PERIODOS_POR_ANIO[periodicidad]
    const tasaAnual = tasaValor / 100
    switch (tipoTasa) {
        case 'TASA_PERIODICA':       return tasaAnual
        case 'TASA_ANUAL_NOMINAL':   return tasaAnual / n
        case 'TASA_EFECTIVA_ANUAL':  return Math.pow(1 + tasaAnual, 1 / n) - 1
    }
}

// ── Motor principal ─────────────────────────────────────────────────────────

export function calcularCreditoElectrodomesticos(params: ParametrosCredito): ResultadoAmortizacion {
    const { saldoADiferir: P, tipoTasa, tasaValor, periodicidad, numeroCuotas: n, fechaPrimerVencimiento } = params

    if (P <= 0)  throw new Error('El saldo a diferir debe ser mayor a cero')
    if (n <= 0)  throw new Error('El número de cuotas debe ser mayor a cero')

    // ── Caso especial: recargo comercial acumulado por plazo (punto 7 del
    // requerimiento). No hay tasa periódica ni desglose de interés por
    // cuota real — el recargo se reparte informativamente solo para que la
    // tabla muestre algo coherente; el dato que manda es el recargo total.
    if (tipoTasa === 'FACTOR_ACUMULADO_PLAZO') {
        const totalFinanciado = r2(P * (1 + tasaValor / 100))
        const recargoTotal = r2(totalFinanciado - P)
        // Capital y recargo se reparten en partes iguales entre las n cuotas
        // (no hay saldo insoluto que amortizar, es un recargo fijo) — la
        // última cuota absorbe el residuo de redondeo de ambos, para que
        // capital sume exactamente P y recargo sume exactamente recargoTotal.
        const capitalPorCuota = r2(P / n)
        const interesPorCuota = r2(recargoTotal / n)
        const cuotas: CuotaCalculada[] = []
        let saldoInicial = P
        let capitalAcumulado = 0
        let interesAcumulado = 0
        for (let k = 1; k <= n; k++) {
            const esUltima = k === n
            const capital = esUltima ? r2(P - capitalAcumulado) : capitalPorCuota
            const interes = esUltima ? r2(recargoTotal - interesAcumulado) : interesPorCuota
            const cuotaTotal = r2(capital + interes)
            const saldoFinal = esUltima ? 0 : r2(saldoInicial - capital)
            cuotas.push({
                numero_cuota: k,
                fecha_vencimiento: fechaVencimientoCuota(fechaPrimerVencimiento, periodicidad, k),
                saldo_inicial: r2(saldoInicial),
                capital_programado: capital,
                interes_programado: interes,
                cuota_programada: cuotaTotal,
                saldo_final_programado: saldoFinal,
            })
            capitalAcumulado = r2(capitalAcumulado + capital)
            interesAcumulado = r2(interesAcumulado + interes)
            saldoInicial = saldoFinal
        }
        return {
            tasa_periodica_pct: null,
            total_intereses: recargoTotal,
            total_financiado: totalFinanciado,
            valor_cuota_referencial: r2(totalFinanciado / n),
            cuotas,
        }
    }

    // ── Sistema francés (cuota fija) — incluye tasa 0% como caso particular ──
    const i = tasaPeriodica(tipoTasa, tasaValor, periodicidad)
    const cuotaFija = i === 0
        ? r2(P / n)
        : r2(P * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1))

    const cuotas: CuotaCalculada[] = []
    let saldoInicial = P
    let totalIntereses = 0
    let totalCuotas = 0

    for (let k = 1; k <= n; k++) {
        const esUltima = k === n
        const interes = r2(saldoInicial * i)
        // Última cuota: el capital absorbe TODO el saldo restante (nunca la
        // cuota fija tal cual) — así saldo_final siempre da exactamente 0.00
        // sin importar cuánto haya arrastrado el redondeo de las anteriores.
        const capital = esUltima ? r2(saldoInicial) : r2(cuotaFija - interes)
        const cuotaTotal = r2(capital + interes)
        const saldoFinal = esUltima ? 0 : r2(saldoInicial - capital)

        cuotas.push({
            numero_cuota: k,
            fecha_vencimiento: fechaVencimientoCuota(fechaPrimerVencimiento, periodicidad, k),
            saldo_inicial: r2(saldoInicial),
            capital_programado: capital,
            interes_programado: interes,
            cuota_programada: cuotaTotal,
            saldo_final_programado: saldoFinal,
        })

        totalIntereses = r2(totalIntereses + interes)
        totalCuotas = r2(totalCuotas + cuotaTotal)
        saldoInicial = saldoFinal
    }

    return {
        tasa_periodica_pct: r2(i * 100 * 10000) / 10000, // hasta 4 decimales, sin perder precisión de tasas finas
        total_intereses: totalIntereses,
        total_financiado: totalCuotas,
        valor_cuota_referencial: cuotaFija,
        cuotas,
    }
}
