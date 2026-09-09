import { describe, it, expect } from 'vitest'
import { calcularMoraCuota, distribuirPagoCuotas, type CuotaParaCobro } from './creditoElectrodomesticosCobro'

function cuota(over: Partial<CuotaParaCobro> = {}): CuotaParaCobro {
    return {
        id: 'c1', numeroCuota: 1, fechaVencimiento: '2026-08-01',
        capitalProgramado: 100, interesProgramado: 10,
        capitalPagado: 0, interesPagado: 0,
        ...over,
    }
}

describe('calcularMoraCuota', () => {
    it('sin días vencidos (dentro de gracia) no genera mora', () => {
        const r = calcularMoraCuota(cuota(), '2026-08-02', 3, 5)
        expect(r.diasVencidos).toBe(0)
        expect(r.mora).toBe(0)
    })

    it('tasa mensual prorrateada por día: 10 días vencidos, 3% mensual sobre saldo 110', () => {
        // 110 * 0.03 * (10/30) = 1.10
        const r = calcularMoraCuota(cuota(), '2026-08-11', 3, 0)
        expect(r.diasVencidos).toBe(10)
        expect(r.mora).toBe(1.1)
    })

    it('resta los días de gracia antes de calcular', () => {
        // 15 días transcurridos - 5 de gracia = 10 días efectivos → misma mora que el caso anterior
        const r = calcularMoraCuota(cuota(), '2026-08-16', 3, 5)
        expect(r.diasVencidos).toBe(10)
        expect(r.mora).toBe(1.1)
    })

    it('la mora se calcula sobre el saldo pendiente real, no sobre el total programado', () => {
        // saldo pendiente = (100+10) - (100+10 pagados hasta capital 50) → aquí capital ya pagado 100, interés 10 → saldo 0
        const r = calcularMoraCuota(cuota({ capitalPagado: 100, interesPagado: 10 }), '2026-08-11', 3, 0)
        expect(r.mora).toBe(0)
    })
})

describe('distribuirPagoCuotas', () => {
    it('paga mora, luego interés, luego capital, en ese orden dentro de una cuota', () => {
        // saldo cuota = 110, mora a 10 días/3% = 1.10 → total exigible = 111.10
        // Se paga solo 5: 1.10 mora + 3.90 interés (de 10 pendientes) + 0 capital
        const r = distribuirPagoCuotas([cuota()], 5, '2026-08-11', 3, 0)
        expect(r.aplicaciones).toHaveLength(1)
        const a = r.aplicaciones[0]
        expect(a.moraAplicada).toBe(1.1)
        expect(a.interesAplicado).toBe(3.9)
        expect(a.capitalAplicado).toBe(0)
        expect(a.quedaSaldoEnCuota).toBe(true)
        expect(r.montoSobrante).toBe(0)
    })

    it('permite un pago menor a una cuota completa (parcial) sin error', () => {
        const r = distribuirPagoCuotas([cuota()], 20, '2026-08-01', 0, 0)
        expect(r.montoAsignado).toBe(20)
        expect(r.aplicaciones[0].capitalAplicado + r.aplicaciones[0].interesAplicado).toBe(20)
    })

    it('cascada: si sobra después de saldar una cuota, pasa a la siguiente', () => {
        const cuotas = [
            cuota({ id: 'c1', numeroCuota: 1, capitalProgramado: 50, interesProgramado: 0 }),
            cuota({ id: 'c2', numeroCuota: 2, capitalProgramado: 50, interesProgramado: 0, fechaVencimiento: '2026-09-01' }),
        ]
        // Sin mora (tasa 0) para aislar la cascada: 70 cubre la cuota 1 completa (50) y dejan 20 en la cuota 2.
        const r = distribuirPagoCuotas(cuotas, 70, '2026-08-01', 0, 0)
        expect(r.aplicaciones).toHaveLength(2)
        expect(r.aplicaciones[0].totalAplicado).toBe(50)
        expect(r.aplicaciones[0].quedaSaldoEnCuota).toBe(false)
        expect(r.aplicaciones[1].totalAplicado).toBe(20)
        expect(r.aplicaciones[1].quedaSaldoEnCuota).toBe(true)
        expect(r.montoAsignado).toBe(70)
        expect(r.montoSobrante).toBe(0)
    })

    it('informa el sobrante si el monto supera toda la deuda de las cuotas recibidas', () => {
        const r = distribuirPagoCuotas([cuota({ capitalProgramado: 50, interesProgramado: 0 })], 80, '2026-08-01', 0, 0)
        expect(r.montoAsignado).toBe(50)
        expect(r.montoSobrante).toBe(30)
    })

    it('salta cuotas ya saldadas sin generarles una aplicación', () => {
        const cuotas = [
            cuota({ id: 'c1', numeroCuota: 1, capitalProgramado: 50, interesProgramado: 0, capitalPagado: 50 }),
            cuota({ id: 'c2', numeroCuota: 2, capitalProgramado: 50, interesProgramado: 0, fechaVencimiento: '2026-09-01' }),
        ]
        const r = distribuirPagoCuotas(cuotas, 50, '2026-08-01', 0, 0)
        expect(r.aplicaciones).toHaveLength(1)
        expect(r.aplicaciones[0].cuotaId).toBe('c2')
    })

    it('rechaza monto <= 0', () => {
        expect(() => distribuirPagoCuotas([cuota()], 0, '2026-08-01', 0, 0)).toThrow()
    })
})
