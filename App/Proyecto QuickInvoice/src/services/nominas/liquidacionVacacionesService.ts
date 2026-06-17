import { supabase } from '../../lib/supabase'

const nominas = () => supabase.schema('nominas')

// Conceptos excluidos de la base de vacaciones (Art. 69 CT Ecuador)
const EXCLUIR_VAC = new Set([
    'DEC3_MENS', 'DEC4_MENS',
    'VACACIONES', 'UTILIDADES',
    'VIATICOS', 'MOVILIZACION',
    'ANTICIPO', 'ANT_QUINCENA',
])

// Antigüedad y días de vacación generados según Art. 69 CT Ecuador
// >5 años: 1 día adicional por año excedente (máx 30 días total)
function calcAntiguedad(fechaIngreso: string, fechaRef: string) {
    const ing = new Date(fechaIngreso + 'T00:00:00')
    const ref = new Date(fechaRef    + 'T00:00:00')

    let anios = ref.getFullYear() - ing.getFullYear()
    let meses = ref.getMonth()    - ing.getMonth()
    const dias = ref.getDate()    - ing.getDate()

    if (dias  < 0) meses--
    if (meses < 0) { anios--; meses += 12 }
    if (anios < 0) { anios = 0; meses = 0 }

    const dias_base  = 15
    const dias_extra = anios > 5 ? Math.min(15, anios - 5) : 0
    const dias_vac   = dias_base + dias_extra

    return { anios, meses, dias_base, dias_extra, dias_vac }
}

export interface DatosLiquidacionVacaciones {
    empleado_id:  string
    nombres:      string
    apellidos:    string
    cedula:       string
    cargo:        string | null
    seccion:      string | null
    fecha_ingreso: string
    fecha_salida?: string | null
    anios_trabajados: number
    meses_adicionales: number
    dias_base:    number
    dias_extra:   number
    dias_generados: number
    total_percibido: number
    valor_1_24:   number
    valor_por_dia: number
    periodos_count: number
    periodos_dias_nominales: number
    dias_gozados: number
    dias_pendientes: number
    valor_vacaciones: number
}

function r2(n: number) { return Math.round(n * 100) / 100 }

export const liquidacionVacacionesService = {

    // ─── Calcula la liquidación de vacaciones para TODOS los empleados ─────────
    // Solo incluye empleados que tienen al menos un período cerrado/liquidado
    // en el rango indicado.
    // diasGozados se aplica igual a todos (valor general por período).
    async calcularTodos(
        empresaId:   string,
        fechaInicio: string,
        fechaFin:    string,
        diasGozados: number
    ): Promise<DatosLiquidacionVacaciones[]> {

        // 1. Empleados activos
        const { data: empleados, error: ee } = await nominas()
            .from('empleados')
            .select('id, nombres, apellidos, cedula, fecha_ingreso, fecha_salida, cargo:cargos(nombre), seccion:secciones(nombre)')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
        if (ee) throw ee
        if (!empleados?.length) return []

        // 2. Períodos cerrados/liquidados en el rango
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

        // 3. Cabeceras de esos períodos
        const { data: cabeceras, error: ec } = await nominas()
            .from('rol_cabecera')
            .select('id, empleado_id, periodo_id')
            .in('periodo_id', periodoIds)
        if (ec) throw ec

        // Mapas de acceso rápido
        const empByCab     = new Map<string, string>()
        const cabsByEmp    = new Map<string, string[]>()
        const diasNomByEmp = new Map<string, number>()

        for (const c of (cabeceras ?? [])) {
            empByCab.set(c.id, c.empleado_id)
            const arr = cabsByEmp.get(c.empleado_id) ?? []
            arr.push(c.id)
            cabsByEmp.set(c.empleado_id, arr)
            const tipo = tipoByPer.get(c.periodo_id) ?? 'mensual'
            diasNomByEmp.set(c.empleado_id, (diasNomByEmp.get(c.empleado_id) ?? 0) + (tipo === 'mensual' ? 30 : 15))
        }

        // 4. Líneas de ingreso (solo conceptos que entran en base vacacional)
        const cabIds = (cabeceras ?? []).map(c => c.id)
        const totalByEmp = new Map<string, number>()

        if (cabIds.length > 0) {
            const { data: lineas, error: el } = await nominas()
                .from('rol_lineas')
                .select('cabecera_id, codigo, tipo, monto')
                .in('cabecera_id', cabIds)
            if (el) throw el

            for (const l of (lineas ?? [])) {
                const empId = empByCab.get(l.cabecera_id)
                if (!empId) continue
                if (l.tipo === 'ingreso' && !EXCLUIR_VAC.has(l.codigo)) {
                    totalByEmp.set(empId, (totalByEmp.get(empId) ?? 0) + (l.monto ?? 0))
                }
            }
        }

        // 5. Construir resultado por empleado
        const result: DatosLiquidacionVacaciones[] = []

        for (const emp of empleados) {
            const cabs = cabsByEmp.get(emp.id)
            if (!cabs?.length) continue // sin nóminas en el rango → omitir

            const total_percibido  = r2(totalByEmp.get(emp.id) ?? 0)
            const { anios, meses, dias_base, dias_extra, dias_vac } = calcAntiguedad(emp.fecha_ingreso, fechaFin)

            // Fórmula 1/24: total_remuneraciones / 24 = valor de los 15 días
            const valor_1_24      = r2(total_percibido / 24)
            // Valor diario: total / 360 (= 1/24 / 15, equivalente)
            const valor_por_dia   = r2(total_percibido / 360)
            const dias_pendientes = Math.max(0, dias_vac - diasGozados)
            const valor_vacaciones = r2(valor_por_dia * dias_pendientes)

            result.push({
                empleado_id:  emp.id,
                nombres:      emp.nombres,
                apellidos:    emp.apellidos,
                cedula:       emp.cedula,
                cargo:        (emp.cargo as any)?.nombre ?? null,
                seccion:      (emp.seccion as any)?.nombre ?? null,
                fecha_ingreso: emp.fecha_ingreso,
                fecha_salida:  emp.fecha_salida ?? null,
                anios_trabajados:     anios,
                meses_adicionales:    meses,
                dias_base,
                dias_extra,
                dias_generados:       dias_vac,
                total_percibido,
                valor_1_24,
                valor_por_dia,
                periodos_count:          cabs.length,
                periodos_dias_nominales: diasNomByEmp.get(emp.id) ?? 0,
                dias_gozados:    diasGozados,
                dias_pendientes,
                valor_vacaciones,
            })
        }

        return result.sort((a, b) => {
            const sA = a.seccion ?? '', sB = b.seccion ?? ''
            return sA !== sB ? sA.localeCompare(sB) : a.apellidos.localeCompare(b.apellidos)
        })
    },

    // ─── Lista de empleados activos (para el selector) ─────────────────────────
    async getEmpleados(empresaId: string): Promise<{ id: string; nombres: string; apellidos: string; cedula: string }[]> {
        const { data, error } = await nominas()
            .from('empleados')
            .select('id, nombres, apellidos, cedula')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('apellidos')
        if (error) throw error
        return (data ?? []) as { id: string; nombres: string; apellidos: string; cedula: string }[]
    },

    // ─── Cálculo individual para UN empleado ───────────────────────────────────
    async calcularUno(
        empresaId:   string,
        empleadoId:  string,
        fechaInicio: string,
        fechaFin:    string,
        diasGozados: number
    ): Promise<DatosLiquidacionVacaciones | null> {

        // Datos del empleado
        const { data: emp, error: ee } = await nominas()
            .from('empleados')
            .select('id, nombres, apellidos, cedula, fecha_ingreso, fecha_salida, cargo:cargos(nombre), seccion:secciones(nombre)')
            .eq('id', empleadoId)
            .single()
        if (ee) throw ee
        if (!emp) return null

        // Períodos cerrados/liquidados en el rango
        const { data: periodos, error: ep } = await nominas()
            .from('periodos')
            .select('id, tipo_nomina')
            .eq('empresa_id', empresaId)
            .gte('fecha_inicio', fechaInicio)
            .lte('fecha_fin', fechaFin)
            .in('estado', ['cerrado', 'liquidado'])
        if (ep) throw ep

        const periodoIds  = (periodos ?? []).map(p => p.id)
        const tipoByPer   = new Map((periodos ?? []).map(p => [p.id, p.tipo_nomina as string]))

        // Cabeceras del empleado en esos períodos
        const { data: cabeceras, error: ec } = await nominas()
            .from('rol_cabecera')
            .select('id, periodo_id')
            .eq('empleado_id', empleadoId)
            .in('periodo_id', periodoIds.length ? periodoIds : ['__none__'])
        if (ec) throw ec

        const cabIds = (cabeceras ?? []).map(c => c.id)
        let total_percibido = 0
        let diasNominales   = 0

        for (const c of (cabeceras ?? [])) {
            const tipo = tipoByPer.get(c.periodo_id) ?? 'mensual'
            diasNominales += tipo === 'mensual' ? 30 : 15
        }

        if (cabIds.length > 0) {
            const { data: lineas, error: el } = await nominas()
                .from('rol_lineas')
                .select('cabecera_id, codigo, tipo, monto')
                .in('cabecera_id', cabIds)
            if (el) throw el

            for (const l of (lineas ?? [])) {
                if (l.tipo === 'ingreso' && !EXCLUIR_VAC.has(l.codigo)) {
                    total_percibido += l.monto ?? 0
                }
            }
        }

        total_percibido = r2(total_percibido)
        const { anios, meses, dias_base, dias_extra, dias_vac } = calcAntiguedad(emp.fecha_ingreso, fechaFin)
        const valor_1_24       = r2(total_percibido / 24)
        const valor_por_dia    = r2(total_percibido / 360)
        const dias_pendientes  = Math.max(0, dias_vac - diasGozados)
        const valor_vacaciones = r2(valor_por_dia * dias_pendientes)

        return {
            empleado_id:  emp.id,
            nombres:      emp.nombres,
            apellidos:    emp.apellidos,
            cedula:       emp.cedula,
            cargo:        (emp.cargo as any)?.nombre ?? null,
            seccion:      (emp.seccion as any)?.nombre ?? null,
            fecha_ingreso: emp.fecha_ingreso,
            fecha_salida:  emp.fecha_salida ?? null,
            anios_trabajados:     anios,
            meses_adicionales:    meses,
            dias_base,
            dias_extra,
            dias_generados:       dias_vac,
            total_percibido,
            valor_1_24,
            valor_por_dia,
            periodos_count:          cabIds.length,
            periodos_dias_nominales: diasNominales,
            dias_gozados:    diasGozados,
            dias_pendientes,
            valor_vacaciones,
        }
    },
}
