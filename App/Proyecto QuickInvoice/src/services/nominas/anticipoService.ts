import { supabase } from '../../lib/supabase'
import type { AnticipoNomina, AnticipoLinea } from '../../types/nominas'
import { contabilidadNominaService } from './contabilidadNominaService'
import { auditService } from '../auditoria/auditService'

const nominas = () => supabase.schema('nominas')
const round2  = (n: number) => Math.round(n * 100) / 100

async function recalcularTotales(cabIds: string[], periodoId: string): Promise<void> {
    for (const cabId of cabIds) {
        const { data: lineas } = await nominas()
            .from('rol_lineas').select('tipo, monto').eq('cabecera_id', cabId)
        const ti = round2((lineas ?? []).filter(l => l.tipo === 'ingreso').reduce((s, l) => s + l.monto, 0))
        const td = round2((lineas ?? []).filter(l => l.tipo === 'descuento').reduce((s, l) => s + l.monto, 0))
        await nominas().from('rol_cabecera')
            .update({ total_ingresos: ti, total_descuentos: td, neto: round2(ti - td), updated_at: new Date().toISOString() })
            .eq('id', cabId)
    }
    const { data: allCabs } = await nominas()
        .from('rol_cabecera').select('total_ingresos, total_descuentos, neto').eq('periodo_id', periodoId)
    const ptI = round2((allCabs ?? []).reduce((s, c) => s + (c.total_ingresos   ?? 0), 0))
    const ptD = round2((allCabs ?? []).reduce((s, c) => s + (c.total_descuentos ?? 0), 0))
    const ptN = round2((allCabs ?? []).reduce((s, c) => s + (c.neto             ?? 0), 0))
    await nominas().from('periodos')
        .update({ total_ingresos: ptI, total_descuentos: ptD, total_neto: ptN, updated_at: new Date().toISOString() })
        .eq('id', periodoId)
}

export const anticipoService = {

    async obtenerPorPeriodo(empresaId: string, periodoId: string): Promise<AnticipoNomina | null> {
        const { data } = await nominas()
            .from('anticipos').select('*')
            .eq('empresa_id', empresaId).eq('periodo_id', periodoId)
            .maybeSingle()
        return data
    },

    async crear(empresaId: string, periodoId: string, nombre: string): Promise<AnticipoNomina> {
        const { data, error } = await nominas()
            .from('anticipos')
            .insert({ empresa_id: empresaId, periodo_id: periodoId, nombre, estado: 'borrador' })
            .select().single()
        if (error) throw error
        return data
    },

    async obtenerLineas(anticipoId: string): Promise<AnticipoLinea[]> {
        const { data, error } = await nominas()
            .from('anticipo_lineas')
            .select('*, empleado:empleados(nombres, apellidos, sueldo_base)')
            .eq('anticipo_id', anticipoId)
            .order('created_at')
        if (error) throw error
        return (data ?? []) as unknown as AnticipoLinea[]
    },

    async generarLineas(
        anticipoId:        string,
        empresaId:         string,
        defaultPorcentaje = 40
    ): Promise<AnticipoLinea[]> {
        // Load active employees with their personal anticipo settings from the master
        const { data: emps } = await nominas()
            .from('empleados').select('id, sueldo_base, anticipo_tipo, anticipo_valor')
            .eq('empresa_id', empresaId).eq('activo', true)
        if (!emps?.length) return []

        // Wipe existing lines
        await nominas().from('anticipo_lineas').delete().eq('anticipo_id', anticipoId)

        const lineas = emps.map(emp => {
            let tipo_calculo: 'porcentaje' | 'fijo'
            let porcentaje: number
            let monto: number

            if (emp.anticipo_tipo === 'fijo' && emp.anticipo_valor != null) {
                tipo_calculo = 'fijo'
                porcentaje   = 0
                monto        = round2(emp.anticipo_valor)
            } else {
                tipo_calculo = 'porcentaje'
                porcentaje   = (emp.anticipo_tipo === 'porcentaje' && emp.anticipo_valor != null)
                    ? emp.anticipo_valor
                    : defaultPorcentaje
                monto = round2(emp.sueldo_base * porcentaje / 100)
            }

            return {
                anticipo_id:    anticipoId,
                empresa_id:     empresaId,
                empleado_id:    emp.id,
                tipo_calculo,
                porcentaje,
                monto_anticipo: monto,
                desc1_nombre:   null,
                desc1_monto:    0,
                desc2_nombre:   null,
                desc2_monto:    0,
                neto:           monto,
            }
        })

        const { data, error } = await nominas()
            .from('anticipo_lineas').insert(lineas)
            .select('*, empleado:empleados(nombres, apellidos, sueldo_base)')
        if (error) throw error
        return (data ?? []) as unknown as AnticipoLinea[]
    },

    async guardarLineas(lineas: AnticipoLinea[]): Promise<void> {
        for (const l of lineas) {
            const { error } = await nominas().from('anticipo_lineas')
                .update({
                    tipo_calculo:   l.tipo_calculo,
                    porcentaje:     l.porcentaje,
                    monto_anticipo: l.monto_anticipo,
                    desc1_nombre:   l.desc1_nombre,
                    desc1_monto:    l.desc1_monto ?? 0,
                    desc2_nombre:   l.desc2_nombre,
                    desc2_monto:    l.desc2_monto ?? 0,
                    neto:           l.neto,
                    updated_at:     new Date().toISOString(),
                })
                .eq('id', l.id)
            if (error) throw error
        }
    },

    async liquidarDefinitivo(anticipoId: string): Promise<void> {
        const { data: anticipo } = await nominas()
            .from('anticipos').select('empresa_id, periodo_id').eq('id', anticipoId).single()
        if (!anticipo) throw new Error('Anticipo no encontrado')
        const { empresa_id: empresaId, periodo_id: periodoId } = anticipo

        const { error } = await nominas().from('anticipos')
            .update({ estado: 'liquidado', updated_at: new Date().toISOString() })
            .eq('id', anticipoId)
        if (error) throw error

        // Asiento contable — se registra siempre al liquidar, independiente de si existe el rol
        contabilidadNominaService.postearAnticipo(anticipoId, empresaId)
            .catch(e => console.error('[nomContab] hook anticipo falló:', e))

        auditService.logEvent({
            empresaId,
            modulo: 'nomina',
            accion: 'liquidar',
            entidad: 'anticipo_nomina',
            entidadId: anticipoId,
            resumen: `Liquidación definitiva de anticipo de nómina`,
            nivel: 'sensible',
        })

        // If the monthly rol already exists, insert ANTICIPO lines into it
        const { data: cabeceras } = await nominas()
            .from('rol_cabecera').select('id, empleado_id').eq('periodo_id', periodoId)
        if (!cabeceras?.length) return

        const { data: antLineas } = await nominas()
            .from('anticipo_lineas').select('id, empleado_id, monto_anticipo')
            .eq('anticipo_id', anticipoId)
        if (!antLineas?.length) return

        const cabMap = new Map(cabeceras.map(c => [c.empleado_id, c.id]))
        const nuevasLineas: any[] = []
        const cabsAfectadas: string[] = []

        for (const linea of antLineas) {
            if ((linea.monto_anticipo ?? 0) <= 0) continue
            const cabId = cabMap.get(linea.empleado_id)
            if (!cabId) continue

            const { data: existing } = await nominas()
                .from('rol_lineas').select('id')
                .eq('cabecera_id', cabId).eq('anticipo_linea_id', linea.id)
                .maybeSingle()
            if (existing) continue

            nuevasLineas.push({
                cabecera_id:       cabId,
                empresa_id:        empresaId,
                codigo:            'ANTICIPO',
                nombre:            'Anticipo de Quincena',
                tipo:              'descuento',
                monto:             linea.monto_anticipo,
                es_calculado:      true,
                orden:             21,
                horas:             null,
                novedad_id:        null,
                anticipo_linea_id: linea.id,
            })
            cabsAfectadas.push(cabId)
        }

        if (!nuevasLineas.length) return
        const { error: insErr } = await nominas().from('rol_lineas').insert(nuevasLineas)
        if (insErr) throw insErr
        await recalcularTotales(cabsAfectadas, periodoId)
    },

    async deshacerLiquidacion(anticipoId: string): Promise<void> {
        const { data: anticipo } = await nominas()
            .from('anticipos').select('empresa_id, periodo_id').eq('id', anticipoId).single()
        if (!anticipo) throw new Error('Anticipo no encontrado')

        const { data: lineas } = await nominas()
            .from('anticipo_lineas').select('id').eq('anticipo_id', anticipoId)
        const lineaIds = (lineas ?? []).map(l => l.id)

        if (lineaIds.length > 0) {
            const { data: rolLineas } = await nominas()
                .from('rol_lineas').select('cabecera_id').in('anticipo_linea_id', lineaIds)
            const cabsAfectadas = [...new Set((rolLineas ?? []).map(l => l.cabecera_id))]

            await nominas().from('rol_lineas').delete().in('anticipo_linea_id', lineaIds)

            if (cabsAfectadas.length > 0) {
                await recalcularTotales(cabsAfectadas, anticipo.periodo_id)
            }
        }

        await nominas().from('anticipos')
            .update({ estado: 'borrador', updated_at: new Date().toISOString() })
            .eq('id', anticipoId)

        // Anular asiento contable — no bloqueante
        contabilidadNominaService.anularAnticipo(anticipoId, anticipo.empresa_id).catch(() => {})

        auditService.logEvent({
            empresaId: anticipo.empresa_id,
            modulo: 'nomina',
            accion: 'reversar',
            entidad: 'anticipo_nomina',
            entidadId: anticipoId,
            resumen: `Reversión de liquidación de anticipo de nómina`,
            nivel: 'sensible',
        })
    },
}
