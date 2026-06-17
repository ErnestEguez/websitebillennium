import { supabase } from '../../lib/supabase'
import { parametrosNominaService } from './parametrosNominaService'

const nominas = () => supabase.schema('nominas')

// Conceptos excluidos de la base del Décimo Tercero (Art. 111 Código del Trabajo Ecuador)
const EXCLUIR_DEC3 = new Set([
    'DEC3_MENS', 'DEC4_MENS',
    'VACACIONES', 'UTILIDADES',
    'VIATICOS', 'MOVILIZACION',
    'ANTICIPO', 'ANT_QUINCENA',
])

export interface LineaLiquidacionDecimo {
    empleado_id:  string
    nombres:      string
    apellidos:    string
    seccion:      string | null
    fecha_ingreso: string
    fecha_salida?: string | null
    decimo_modo:  string
    periodos_count: number
    dias_trabajados: number
    base_calculo: number
    ya_recibido:  number
    valor_decimo: number
    valor_percibir: number
}

function r2(n: number) { return Math.round(n * 100) / 100 }

export const liquidacionDecimosService = {

    // ─── Décimo Tercero ────────────────────────────────────────────────────────
    // Período típico: 01-dic (año-1) → 30-nov (año)
    // Base: TODOS los ingresos excepto DEC4, vacaciones, utilidades, viáticos
    // Valor: base_total / 12
    async calcularDecTercero(
        empresaId:   string,
        fechaInicio: string,
        fechaFin:    string
    ): Promise<LineaLiquidacionDecimo[]> {

        const { data: periodos, error: ep } = await nominas()
            .from('periodos')
            .select('id, tipo_nomina')
            .eq('empresa_id', empresaId)
            .gte('fecha_inicio', fechaInicio)
            .lte('fecha_fin', fechaFin)
            .in('estado', ['cerrado', 'liquidado'])
        if (ep) throw ep
        if (!periodos?.length) return []

        const periodoIds = periodos.map(p => p.id)

        const { data: cabeceras, error: ec } = await nominas()
            .from('rol_cabecera')
            .select('id, empleado_id, periodo_id')
            .in('periodo_id', periodoIds)
        if (ec) throw ec
        if (!cabeceras?.length) return []

        const cabIds = cabeceras.map(c => c.id)

        const { data: lineas, error: el } = await nominas()
            .from('rol_lineas')
            .select('cabecera_id, codigo, tipo, monto')
            .in('cabecera_id', cabIds)
        if (el) throw el

        const empIds = [...new Set(cabeceras.map(c => c.empleado_id))]
        const { data: empleados, error: ee } = await nominas()
            .from('empleados')
            .select('id, nombres, apellidos, fecha_ingreso, fecha_salida, decimo_tercero_modo, seccion:secciones(nombre)')
            .in('id', empIds)
            .eq('empresa_id', empresaId)
        if (ee) throw ee

        // cabecera_id → empleado_id
        const empByCab = new Map<string, string>()
        const cabCntByEmp = new Map<string, number>()
        for (const c of (cabeceras ?? [])) {
            empByCab.set(c.id, c.empleado_id)
            cabCntByEmp.set(c.empleado_id, (cabCntByEmp.get(c.empleado_id) ?? 0) + 1)
        }

        const acc = new Map<string, { base: number; recibido: number }>()
        for (const id of empIds) acc.set(id, { base: 0, recibido: 0 })

        for (const l of (lineas ?? [])) {
            const empId = empByCab.get(l.cabecera_id)
            if (!empId) continue
            const a = acc.get(empId)!
            if (l.tipo === 'ingreso' && !EXCLUIR_DEC3.has(l.codigo)) {
                a.base += l.monto ?? 0
            }
            if (l.codigo === 'DEC3_MENS') {
                a.recibido += l.monto ?? 0
            }
        }

        return (empleados ?? [])
            .map(emp => {
                const a = acc.get(emp.id) ?? { base: 0, recibido: 0 }
                const valor_decimo  = r2(a.base / 12)
                const valor_percibir = r2(Math.max(0, valor_decimo - a.recibido))
                return {
                    empleado_id:    emp.id,
                    nombres:        emp.nombres,
                    apellidos:      emp.apellidos,
                    seccion:        (emp.seccion as any)?.nombre ?? null,
                    fecha_ingreso:  emp.fecha_ingreso,
                    fecha_salida:   emp.fecha_salida ?? null,
                    decimo_modo:    emp.decimo_tercero_modo,
                    periodos_count: cabCntByEmp.get(emp.id) ?? 0,
                    dias_trabajados: 0,
                    base_calculo:   r2(a.base),
                    ya_recibido:    r2(a.recibido),
                    valor_decimo,
                    valor_percibir,
                } as LineaLiquidacionDecimo
            })
            .sort((a, b) => {
                const sA = a.seccion ?? '', sB = b.seccion ?? ''
                return sA !== sB ? sA.localeCompare(sB) : a.apellidos.localeCompare(b.apellidos)
            })
    },

    // ─── Décimo Cuarto ─────────────────────────────────────────────────────────
    // Período Costa: 01-mar (año-1) → 28/29-feb (año), pago 15 mar
    // Período Sierra: 01-ago (año-1) → 31-jul (año), pago 15 ago
    // Valor: SBU / 360 × días_trabajados
    async calcularDecCuarto(
        empresaId:   string,
        fechaInicio: string,
        fechaFin:    string
    ): Promise<LineaLiquidacionDecimo[]> {

        const params = await parametrosNominaService.obtener(empresaId)
        const sbu = params?.sbu ?? 460

        const { data: periodos, error: ep } = await nominas()
            .from('periodos')
            .select('id, tipo_nomina')
            .eq('empresa_id', empresaId)
            .gte('fecha_inicio', fechaInicio)
            .lte('fecha_fin', fechaFin)
            .in('estado', ['cerrado', 'liquidado'])
        if (ep) throw ep
        if (!periodos?.length) return []

        const periodoIds = periodos.map(p => p.id)
        const tipoByPer  = new Map(periodos.map(p => [p.id, p.tipo_nomina as string]))

        const { data: cabeceras, error: ec } = await nominas()
            .from('rol_cabecera')
            .select('id, empleado_id, periodo_id')
            .in('periodo_id', periodoIds)
        if (ec) throw ec
        if (!cabeceras?.length) return []

        const cabIds = cabeceras.map(c => c.id)

        const { data: lineas, error: el } = await nominas()
            .from('rol_lineas')
            .select('cabecera_id, codigo, monto, horas')
            .in('cabecera_id', cabIds)
            .in('codigo', ['DIAS_FALTA', 'DEC4_MENS'])
        if (el) throw el

        const empIds = [...new Set(cabeceras.map(c => c.empleado_id))]
        const { data: empleados, error: ee } = await nominas()
            .from('empleados')
            .select('id, nombres, apellidos, fecha_ingreso, fecha_salida, decimo_cuarto_modo, seccion:secciones(nombre)')
            .in('id', empIds)
            .eq('empresa_id', empresaId)
        if (ee) throw ee

        // Calcular días base por empleado (30 o 15 por período)
        const diasBase   = new Map<string, number>()
        const empByCab   = new Map<string, string>()
        const cabCntByEmp = new Map<string, number>()
        for (const c of (cabeceras ?? [])) {
            empByCab.set(c.id, c.empleado_id)
            const base = tipoByPer.get(c.periodo_id) === 'mensual' ? 30 : 15
            diasBase.set(c.empleado_id, (diasBase.get(c.empleado_id) ?? 0) + base)
            cabCntByEmp.set(c.empleado_id, (cabCntByEmp.get(c.empleado_id) ?? 0) + 1)
        }

        // Acumular faltas y ya recibido por empleado
        const acc = new Map<string, { faltas: number; recibido: number }>()
        for (const id of empIds) acc.set(id, { faltas: 0, recibido: 0 })

        for (const l of (lineas ?? [])) {
            const empId = empByCab.get(l.cabecera_id)
            if (!empId) continue
            const a = acc.get(empId)!
            if (l.codigo === 'DIAS_FALTA') a.faltas   += l.horas ?? 0
            if (l.codigo === 'DEC4_MENS')  a.recibido += l.monto ?? 0
        }

        return (empleados ?? [])
            .map(emp => {
                const a = acc.get(emp.id) ?? { faltas: 0, recibido: 0 }
                const base = diasBase.get(emp.id) ?? 0
                const dias_trabajados = Math.max(0, base - a.faltas)
                const valor_decimo    = r2(sbu / 360 * dias_trabajados)
                const valor_percibir  = r2(Math.max(0, valor_decimo - a.recibido))
                return {
                    empleado_id:    emp.id,
                    nombres:        emp.nombres,
                    apellidos:      emp.apellidos,
                    seccion:        (emp.seccion as any)?.nombre ?? null,
                    fecha_ingreso:  emp.fecha_ingreso,
                    fecha_salida:   emp.fecha_salida ?? null,
                    decimo_modo:    emp.decimo_cuarto_modo,
                    periodos_count: cabCntByEmp.get(emp.id) ?? 0,
                    dias_trabajados,
                    base_calculo:   sbu,
                    ya_recibido:    r2(a.recibido),
                    valor_decimo,
                    valor_percibir,
                } as LineaLiquidacionDecimo
            })
            .sort((a, b) => {
                const sA = a.seccion ?? '', sB = b.seccion ?? ''
                return sA !== sB ? sA.localeCompare(sB) : a.apellidos.localeCompare(b.apellidos)
            })
    },
}
