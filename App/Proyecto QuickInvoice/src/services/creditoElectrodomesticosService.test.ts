import { describe, it, expect } from 'vitest'
import { creditoElectrodomesticosService } from './creditoElectrodomesticosService'

// Caso 6 del requerimiento: la base de cálculo del interés. Se prueba aquí
// (no en creditoElectrodomesticosCalculo.test.ts) porque es una decisión de
// negocio del orquestador, no del motor puro — ver comentario en Fase 1.
describe('Caso 6 — base de cálculo del interés', () => {
    it('SALDO_DESPUES_ENTRADA (default recomendado): la entrada reduce la base', () => {
        const saldo = creditoElectrodomesticosService.resolverSaldoADiferir(450, 50, 'SALDO_DESPUES_ENTRADA')
        expect(saldo).toBe(400)
    })

    it('TOTAL_VENTA: la entrada NO reduce la base — se usa el total completo', () => {
        const saldo = creditoElectrodomesticosService.resolverSaldoADiferir(450, 50, 'TOTAL_VENTA')
        expect(saldo).toBe(450)
    })

    it('rechaza una entrada negativa', () => {
        expect(() => creditoElectrodomesticosService.resolverSaldoADiferir(450, -1, 'SALDO_DESPUES_ENTRADA')).toThrow()
    })

    it('rechaza una entrada mayor o igual al total (no debería crear crédito, es venta de contado)', () => {
        expect(() => creditoElectrodomesticosService.resolverSaldoADiferir(450, 450, 'SALDO_DESPUES_ENTRADA')).toThrow()
        expect(() => creditoElectrodomesticosService.resolverSaldoADiferir(450, 500, 'SALDO_DESPUES_ENTRADA')).toThrow()
    })
})

describe('simular — vista previa sin persistir', () => {
    it('reproduce el caso 4 del requerimiento end-to-end (entrada → tabla completa)', () => {
        const r = creditoElectrodomesticosService.simular({
            totalFactura: 450,
            valorEntrada: 50,
            baseCalculoInteres: 'SALDO_DESPUES_ENTRADA',
            tipoTasa: 'TASA_PERIODICA',
            tasaValor: 1.5,
            periodicidad: 'MENSUAL',
            numeroCuotas: 18,
            fechaPrimerVencimiento: '2026-10-01',
        })
        expect(r.cuotas).toHaveLength(18)
        const sumaCapital = Math.round(r.cuotas.reduce((s, c) => s + c.capital_programado, 0) * 100) / 100
        expect(sumaCapital).toBe(400) // total_factura - valor_entrada, no total_factura
        expect(r.cuotas[17].saldo_final_programado).toBe(0)
    })
})
