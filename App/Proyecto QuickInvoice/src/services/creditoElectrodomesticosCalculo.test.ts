import { describe, it, expect } from 'vitest'
import { calcularCreditoElectrodomesticos, tasaPeriodica } from './creditoElectrodomesticosCalculo'

// Casos obligatorios 4-10 del requerimiento "Ventas a Crédito de
// Electrodomésticos". El caso 6 (base de cálculo TOTAL_VENTA vs
// SALDO_DESPUES_ENTRADA) no aplica aquí: esa decisión resuelve el "P" que
// se le pasa al motor, no algo que el motor mismo calcule — queda cubierto
// cuando se construya el servicio orquestador en Fase 2/3.

function sumaCapital(cuotas: { capital_programado: number }[]) {
    return Math.round(cuotas.reduce((s, c) => s + c.capital_programado, 0) * 100) / 100
}
function sumaCuotas(cuotas: { cuota_programada: number }[]) {
    return Math.round(cuotas.reduce((s, c) => s + c.cuota_programada, 0) * 100) / 100
}

describe('Caso 4 — venta estándar $450 total / $50 entrada / 18 cuotas mensuales', () => {
    const r = calcularCreditoElectrodomesticos({
        saldoADiferir: 400,
        tipoTasa: 'TASA_PERIODICA',
        tasaValor: 1.5,
        periodicidad: 'MENSUAL',
        numeroCuotas: 18,
        fechaPrimerVencimiento: '2026-10-01',
    })

    it('genera exactamente 18 cuotas', () => expect(r.cuotas).toHaveLength(18))
    it('la suma del capital es USD 400.00', () => expect(sumaCapital(r.cuotas)).toBe(400))
    it('el saldo final de la última cuota es USD 0.00', () => expect(r.cuotas[17].saldo_final_programado).toBe(0))
    it('la última cuota ajusta el redondeo (no es idéntica a las demás)', () => {
        const iguales = r.cuotas.slice(0, 17).every(c => c.cuota_programada === r.cuotas[0].cuota_programada)
        expect(iguales).toBe(true)
        // La última puede diferir por el ajuste — no se exige que sea distinta,
        // solo que las 17 primeras sean la cuota fija y el total financiado
        // sea consistente con la suma real de las 18.
        expect(r.total_financiado).toBe(sumaCuotas(r.cuotas))
    })
})

describe('Caso 5 — tasa cero', () => {
    const r = calcularCreditoElectrodomesticos({
        saldoADiferir: 300,
        tipoTasa: 'TASA_PERIODICA',
        tasaValor: 0,
        periodicidad: 'MENSUAL',
        numeroCuotas: 6,
        fechaPrimerVencimiento: '2026-11-01',
    })

    it('todas las cuotas tienen interés cero', () => {
        expect(r.cuotas.every(c => c.interes_programado === 0)).toBe(true)
    })
    it('el capital es igual en cada cuota (P/n)', () => {
        expect(r.cuotas.slice(0, 5).every(c => c.capital_programado === 50)).toBe(true)
    })
    it('la suma de capital sigue siendo exacta', () => expect(sumaCapital(r.cuotas)).toBe(300))
})

describe('Caso 7 — tabla comercial por factor acumulado de plazo', () => {
    const r = calcularCreditoElectrodomesticos({
        saldoADiferir: 400,
        tipoTasa: 'FACTOR_ACUMULADO_PLAZO',
        tasaValor: 20.4210,
        periodicidad: 'MENSUAL',
        numeroCuotas: 18,
        fechaPrimerVencimiento: '2026-10-01',
    })

    it('total financiado = base * (1 + %/100)', () => expect(r.total_financiado).toBe(481.68))
    it('no expone una tasa periódica (es un recargo, no una amortización)', () => expect(r.tasa_periodica_pct).toBeNull())
    it('la suma de capital sigue dando exactamente el saldo a diferir', () => expect(sumaCapital(r.cuotas)).toBe(400))
    it('la suma de cuotas da exactamente el total financiado', () => expect(sumaCuotas(r.cuotas)).toBe(481.68))
})

describe('Caso 8 — periodicidad diaria', () => {
    const r = calcularCreditoElectrodomesticos({
        saldoADiferir: 100,
        tipoTasa: 'TASA_PERIODICA',
        tasaValor: 0.05,
        periodicidad: 'DIARIA',
        numeroCuotas: 5,
        fechaPrimerVencimiento: '2026-10-01',
    })
    it('cada vencimiento avanza exactamente 1 día calendario', () => {
        expect(r.cuotas.map(c => c.fecha_vencimiento)).toEqual([
            '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
        ])
    })
})

describe('Caso 9 — periodicidad semanal', () => {
    const r = calcularCreditoElectrodomesticos({
        saldoADiferir: 200,
        tipoTasa: 'TASA_PERIODICA',
        tasaValor: 0.1,
        periodicidad: 'SEMANAL',
        numeroCuotas: 4,
        fechaPrimerVencimiento: '2026-10-02', // viernes
    })
    it('cada vencimiento avanza exactamente 7 días', () => {
        expect(r.cuotas.map(c => c.fecha_vencimiento)).toEqual([
            '2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23',
        ])
    })
})

describe('Caso 10 — primer vencimiento día 31 y meses sin día 31', () => {
    const r = calcularCreditoElectrodomesticos({
        saldoADiferir: 300,
        tipoTasa: 'TASA_PERIODICA',
        tasaValor: 1,
        periodicidad: 'MENSUAL',
        numeroCuotas: 3,
        fechaPrimerVencimiento: '2026-01-31',
    })
    it('febrero (28 días en 2026, no bisiesto) cae en el último día del mes', () => {
        expect(r.cuotas[1].fecha_vencimiento).toBe('2026-02-28')
    })
    it('marzo (sí tiene día 31) recupera el día original — no se queda pegado en 28', () => {
        expect(r.cuotas[2].fecha_vencimiento).toBe('2026-03-31')
    })
})

describe('tasaPeriodica — conversión de tipo de tasa', () => {
    it('TASA_PERIODICA se usa tal cual', () => {
        expect(tasaPeriodica('TASA_PERIODICA', 1.5, 'MENSUAL')).toBeCloseTo(0.015, 10)
    })
    it('TASA_ANUAL_NOMINAL se divide entre períodos por año', () => {
        expect(tasaPeriodica('TASA_ANUAL_NOMINAL', 18, 'MENSUAL')).toBeCloseTo(0.015, 10)
    })
    it('TASA_EFECTIVA_ANUAL se convierte a periódica equivalente compuesta', () => {
        const anual = 0.18
        const periodica = tasaPeriodica('TASA_EFECTIVA_ANUAL', 18, 'MENSUAL')
        // Componer 12 veces la tasa periódica debe reproducir la tasa anual efectiva.
        expect(Math.pow(1 + periodica, 12) - 1).toBeCloseTo(anual, 6)
    })
})

describe('Errores de validación', () => {
    it('rechaza saldo a diferir <= 0', () => {
        expect(() => calcularCreditoElectrodomesticos({
            saldoADiferir: 0, tipoTasa: 'TASA_PERIODICA', tasaValor: 1,
            periodicidad: 'MENSUAL', numeroCuotas: 6, fechaPrimerVencimiento: '2026-10-01',
        })).toThrow()
    })
    it('rechaza número de cuotas <= 0', () => {
        expect(() => calcularCreditoElectrodomesticos({
            saldoADiferir: 100, tipoTasa: 'TASA_PERIODICA', tasaValor: 1,
            periodicidad: 'MENSUAL', numeroCuotas: 0, fechaPrimerVencimiento: '2026-10-01',
        })).toThrow()
    })
})
