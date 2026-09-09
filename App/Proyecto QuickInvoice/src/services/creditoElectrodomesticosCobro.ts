// ============================================================
// Cancelación Oficina — distribución de un cobro entre varias cuotas
// ============================================================
// Función pura, mismo espíritu que creditoElectrodomesticosCalculo.ts:
// no toca Supabase. Recibe las cuotas con deuda (ya traídas por el
// caller) y un monto total a cobrar, y decide cómo se reparte —
// mora → interés → capital, cuota más antigua primero, cascada al
// sobrante hacia la siguiente cuota — sin decidir CUÁLES cuotas están
// incluidas (eso lo decide el caller/UI).
//
// Fechas en "YYYY-MM-DD" con aritmética manual (mismo motivo que en
// creditoElectrodomesticosCalculo.ts: evitar el corrimiento de zona
// horaria de `new Date('YYYY-MM-DD')`).
// ============================================================

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function diasEntre(fechaA: string, fechaB: string): number {
    const [ay, am, ad] = fechaA.split('-').map(Number)
    const [by, bm, bd] = fechaB.split('-').map(Number)
    const a = Date.UTC(ay, am - 1, ad)
    const b = Date.UTC(by, bm - 1, bd)
    return Math.round((b - a) / 86400000)
}

export interface CuotaParaCobro {
    id: string
    numeroCuota: number
    fechaVencimiento: string
    capitalProgramado: number
    interesProgramado: number
    capitalPagado: number
    interesPagado: number
}

export interface AplicacionPagoCuota {
    cuotaId: string
    numeroCuota: number
    diasVencidos: number
    moraCalculada: number
    moraAplicada: number
    interesAplicado: number
    capitalAplicado: number
    totalAplicado: number
    quedaSaldoEnCuota: boolean
}

export interface ResultadoDistribucionPago {
    aplicaciones: AplicacionPagoCuota[]
    montoAsignado: number
    /** > 0 si el monto ingresado superó toda la deuda de las cuotas recibidas — el caller decide qué hacer (rechazar, o incluir más cuotas). */
    montoSobrante: number
}

/**
 * Mora de UNA cuota a la fecha `fechaHoy`. tasaMoraMensualPct es % MENSUAL
 * (ej. 3 = 3% mensual), prorrateado por día vencido tras la gracia:
 *   mora = saldo_pendiente_cuota × (tasa/100) × dias_vencidos_efectivos / 30
 * saldo_pendiente_cuota = (capital+interés programados) - (capital+interés
 * ya pagados) — la mora no se cobra sobre mora ya generada (no capitaliza).
 */
export function calcularMoraCuota(
    cuota: Pick<CuotaParaCobro, 'fechaVencimiento' | 'capitalProgramado' | 'interesProgramado' | 'capitalPagado' | 'interesPagado'>,
    fechaHoy: string,
    tasaMoraMensualPct: number,
    diasGraciaMora: number,
): { diasVencidos: number; mora: number } {
    const diasTranscurridos = diasEntre(cuota.fechaVencimiento, fechaHoy)
    const diasVencidos = Math.max(0, diasTranscurridos - diasGraciaMora)
    if (diasVencidos === 0 || tasaMoraMensualPct <= 0) return { diasVencidos, mora: 0 }

    const saldoPendiente = Math.max(0,
        (cuota.capitalProgramado + cuota.interesProgramado) - (cuota.capitalPagado + cuota.interesPagado)
    )
    const mora = r2(saldoPendiente * (tasaMoraMensualPct / 100) * (diasVencidos / 30))
    return { diasVencidos, mora }
}

/**
 * Reparte `montoTotal` entre `cuotas` (se procesan en el orden en que
 * vienen — el caller debe pasarlas ya ordenadas por numeroCuota ascendente,
 * la más antigua primero) — dentro de cada cuota: mora → interés → capital.
 * Si el monto no alcanza para toda una cuota, se aplica parcial y se
 * detiene ahí (permite pagos menores a una cuota completa). Si sobra
 * después de cubrir TODAS las cuotas recibidas, el sobrante se informa en
 * `montoSobrante` — no se inventa a qué aplicarlo.
 */
export function distribuirPagoCuotas(
    cuotas: CuotaParaCobro[],
    montoTotal: number,
    fechaHoy: string,
    tasaMoraMensualPct: number,
    diasGraciaMora: number,
): ResultadoDistribucionPago {
    if (montoTotal <= 0) throw new Error('El monto a cobrar debe ser mayor a cero')

    let restante = r2(montoTotal)
    const aplicaciones: AplicacionPagoCuota[] = []

    for (const cuota of cuotas) {
        if (restante <= 0) break

        const { diasVencidos, mora: moraCalculada } = calcularMoraCuota(cuota, fechaHoy, tasaMoraMensualPct, diasGraciaMora)
        const interesPendiente = Math.max(0, r2(cuota.interesProgramado - cuota.interesPagado))
        const capitalPendiente = Math.max(0, r2(cuota.capitalProgramado - cuota.capitalPagado))

        if (moraCalculada <= 0 && interesPendiente <= 0 && capitalPendiente <= 0) continue // cuota ya saldada

        let moraAplicada = 0, interesAplicado = 0, capitalAplicado = 0

        moraAplicada = r2(Math.min(restante, moraCalculada))
        restante = r2(restante - moraAplicada)

        if (restante > 0) {
            interesAplicado = r2(Math.min(restante, interesPendiente))
            restante = r2(restante - interesAplicado)
        }
        if (restante > 0) {
            capitalAplicado = r2(Math.min(restante, capitalPendiente))
            restante = r2(restante - capitalAplicado)
        }

        const totalAplicado = r2(moraAplicada + interesAplicado + capitalAplicado)
        if (totalAplicado <= 0) continue

        const quedaSaldoEnCuota = r2((moraCalculada - moraAplicada) + (interesPendiente - interesAplicado) + (capitalPendiente - capitalAplicado)) > 0

        aplicaciones.push({
            cuotaId: cuota.id,
            numeroCuota: cuota.numeroCuota,
            diasVencidos,
            moraCalculada,
            moraAplicada,
            interesAplicado,
            capitalAplicado,
            totalAplicado,
            quedaSaldoEnCuota,
        })
    }

    const montoAsignado = r2(aplicaciones.reduce((s, a) => s + a.totalAplicado, 0))
    return { aplicaciones, montoAsignado, montoSobrante: r2(restante) }
}
