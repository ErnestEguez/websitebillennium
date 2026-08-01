import { supabase } from '../../lib/supabase'
import type { Finiquito, CausaTerminacion, EstadoFiniquito } from '../../types/nominas'
import { contabilidadNominaService } from './contabilidadNominaService'
import { auditService } from '../auditoria/auditService'

const nominas = () => supabase.schema('nominas')
const r2 = (n: number) => Math.round(n * 100) / 100

export interface CalcFiniquitoParams {
    fechaIngreso: string
    fechaSalida: string
    causaTerminacion: CausaTerminacion
    ultimoSueldo: number
    mejorSueldo: number
    diasPendientes: number
    diasVacGeneradas: number
    diasVacGozadas: number
    hExtPend: number
    otrosIngresos: number
    vDecimo3: number
    vDecimo4: number
    vFondosReserva: number
    dIess: number
    dPrestamosEmpresa: number
    dPrestamosIESS: number
    dAnticipos: number
    dOtros: number
}

export interface ResultadoCalc {
    aniosCompletos: number
    vSueldoPendiente: number
    vHorasExtras: number
    vVacaciones: number
    diasVacPendientes: number
    vDecimo3: number
    vDecimo4: number
    vFondosReserva: number
    vBonifDesahucio: number
    vIndemnizacion: number
    vOtrosIngresos: number
    totalIngresos: number
    totalDescuentos: number
    netoAPagar: number
}

function calcAnios(fechaIngreso: string, fechaSalida: string): number {
    const ini = new Date(fechaIngreso)
    const fin = new Date(fechaSalida)
    return Math.floor((fin.getTime() - ini.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

function bonifDesahucio(causa: CausaTerminacion, sueldo: number, anios: number): number {
    if (!['desahucio_trabajador', 'acuerdo_partes'].includes(causa)) return 0
    return r2(sueldo * 0.25 * anios)
}

function indemnizacion(causa: CausaTerminacion, mejorSueldo: number, anios: number): number {
    if (causa !== 'despido_intempestivo') return 0
    return r2(mejorSueldo * (anios < 3 ? 3 : anios))
}

export const finiquitoService = {

    calcular(p: CalcFiniquitoParams): ResultadoCalc {
        const anios = calcAnios(p.fechaIngreso, p.fechaSalida)
        const diasVacPend = Math.max(0, p.diasVacGeneradas - p.diasVacGozadas)

        const vSueldoPendiente = r2((p.ultimoSueldo / 30) * p.diasPendientes)
        const vHorasExtras     = r2(p.hExtPend)
        const vVacaciones      = r2((p.ultimoSueldo / 24) * diasVacPend)
        const vBonif           = bonifDesahucio(p.causaTerminacion, p.ultimoSueldo, anios)
        const vIndem           = indemnizacion(p.causaTerminacion, p.mejorSueldo, anios)
        const vOtros           = r2(p.otrosIngresos)

        const totalIngresos = r2(
            vSueldoPendiente + vHorasExtras + vVacaciones +
            p.vDecimo3 + p.vDecimo4 + p.vFondosReserva +
            vBonif + vIndem + vOtros
        )
        const totalDescuentos = r2(
            p.dIess + p.dPrestamosEmpresa + p.dPrestamosIESS + p.dAnticipos + p.dOtros
        )

        return {
            aniosCompletos: anios,
            vSueldoPendiente, vHorasExtras, vVacaciones,
            diasVacPendientes: diasVacPend,
            vDecimo3: r2(p.vDecimo3), vDecimo4: r2(p.vDecimo4),
            vFondosReserva: r2(p.vFondosReserva),
            vBonifDesahucio: vBonif, vIndemnizacion: vIndem, vOtrosIngresos: vOtros,
            totalIngresos, totalDescuentos,
            netoAPagar: r2(totalIngresos - totalDescuentos),
        }
    },

    // Período D13/D14 Ecuador: agosto 1 – julio 31
    estimarDecimo3(ultimoSueldo: number, fechaSalida: string, fechaIngreso: string): number {
        const fin = new Date(fechaSalida)
        const ini = new Date(fechaIngreso)
        const year = fin.getMonth() >= 7 ? fin.getFullYear() : fin.getFullYear() - 1
        const startPeriodo = new Date(year, 7, 1)
        const desde = ini > startPeriodo ? ini : startPeriodo
        const meses = Math.max(0,
            (fin.getFullYear() - desde.getFullYear()) * 12 +
            (fin.getMonth() - desde.getMonth()) + 1
        )
        return r2(ultimoSueldo / 12 * Math.min(meses, 12))
    },

    estimarDecimo4(sbu: number, fechaSalida: string, fechaIngreso: string): number {
        const fin = new Date(fechaSalida)
        const ini = new Date(fechaIngreso)
        const year = fin.getMonth() >= 7 ? fin.getFullYear() : fin.getFullYear() - 1
        const startPeriodo = new Date(year, 7, 1)
        const desde = ini > startPeriodo ? ini : startPeriodo
        const meses = Math.max(0,
            (fin.getFullYear() - desde.getFullYear()) * 12 +
            (fin.getMonth() - desde.getMonth()) + 1
        )
        return r2(sbu / 12 * Math.min(meses, 12))
    },

    diasVacacionesGeneradas(fechaIngreso: string, fechaSalida: string): number {
        const ini = new Date(fechaIngreso)
        const fin = new Date(fechaSalida)
        const diffDias = (fin.getTime() - ini.getTime()) / (1000 * 60 * 60 * 24)
        return Math.floor(diffDias / 365 * 15 * 100) / 100
    },

    async listar(empresaId: string): Promise<Finiquito[]> {
        const { data, error } = await nominas()
            .from('finiquitos')
            .select('*, empleado:empleados(nombres, apellidos, cedula)')
            .eq('empresa_id', empresaId)
            .order('fecha_salida', { ascending: false })
        if (error) throw error
        return (data ?? []) as Finiquito[]
    },

    async crear(f: Partial<Finiquito>): Promise<Finiquito> {
        const { data, error } = await nominas()
            .from('finiquitos')
            .insert(f)
            .select('*, empleado:empleados(nombres, apellidos, cedula)')
            .single()
        if (error) throw error

        const empleadoNombre = (data as any)?.empleado ? `${(data as any).empleado.nombres} ${(data as any).empleado.apellidos}` : undefined
        if (f.empresa_id) {
            auditService.logEvent({
                empresaId: f.empresa_id,
                modulo: 'nomina',
                accion: 'crear',
                entidad: 'finiquito',
                entidadId: (data as any).id,
                resumen: `Finiquito creado${empleadoNombre ? ` — ${empleadoNombre}` : ''}`,
                nivel: 'sensible',
            })
        }
        return data as Finiquito
    },

    async actualizar(id: string, f: Partial<Finiquito>): Promise<void> {
        const { error } = await nominas()
            .from('finiquitos')
            .update(f)
            .eq('id', id)
        if (error) throw error
    },

    async cambiarEstado(id: string, estado: EstadoFiniquito, empresaId: string, extras?: { fecha_pago?: string }): Promise<void> {
        const { error } = await nominas()
            .from('finiquitos')
            .update({ estado, ...extras })
            .eq('id', id)
        if (error) throw error

        if (estado === 'pagado') {
            contabilidadNominaService.postearFiniquito(id, empresaId).catch(() => {})
            auditService.logEvent({
                empresaId,
                modulo: 'nomina',
                accion: 'liquidar',
                entidad: 'finiquito',
                entidadId: id,
                resumen: `Pago de finiquito registrado`,
                nivel: 'sensible',
            })
        }
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('finiquitos')
            .delete()
            .eq('id', id)
        if (error) throw error
    },
}
