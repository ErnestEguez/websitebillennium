import { supabase } from '../../lib/supabase'
import type { RolCabecera, RolLinea, Empleado, ConceptoNomina } from '../../types/nominas'
import { parametrosNominaService } from './parametrosNominaService'

const nominas = () => supabase.schema('nominas')

function round2(n: number): number {
    return Math.round(n * 100) / 100
}

function diffMeses(fechaIngreso: string, hasta: Date): number {
    const d = new Date(fechaIngreso)
    return (hasta.getFullYear() - d.getFullYear()) * 12 + (hasta.getMonth() - d.getMonth())
}

export const rolNominaService = {

    async listarCabeceras(periodoId: string): Promise<RolCabecera[]> {
        const { data, error } = await nominas()
            .from('rol_cabecera')
            .select('*, empleado:empleados(nombres, apellidos, cargo:cargos(nombre))')
            .eq('periodo_id', periodoId)
            .order('created_at')
        if (error) throw error
        return data as unknown as RolCabecera[]
    },

    async listarLineas(cabeceraId: string): Promise<RolLinea[]> {
        const { data, error } = await nominas()
            .from('rol_lineas')
            .select('*, concepto:conceptos(afecta_iess)')
            .eq('cabecera_id', cabeceraId)
            .order('orden')
        if (error) throw error
        return data as unknown as RolLinea[]
    },

    async actualizarLineas(
        cabecera: RolCabecera,
        lineas: RolLinea[],
        periodoId: string
    ): Promise<void> {
        // 1. Upsert de todas las líneas (incluyendo horas y novedad_id)
        const rows = lineas.map(l => ({
            id:           l.id,
            cabecera_id:  l.cabecera_id,
            empresa_id:   l.empresa_id,
            concepto_id:  l.concepto_id ?? null,
            codigo:       l.codigo,
            nombre:       l.nombre,
            tipo:         l.tipo,
            monto:        l.monto,
            es_calculado: l.es_calculado,
            orden:        l.orden,
            horas:        l.horas ?? null,
            novedad_id:   l.novedad_id ?? null,
        }))
        const { error: lineasError } = await nominas().from('rol_lineas').upsert(rows)
        if (lineasError) throw lineasError

        // 2. Recalcular totales de la cabecera
        const total_ingresos   = round2(lineas.filter(l => l.tipo === 'ingreso').reduce((s, l) => s + l.monto, 0))
        const total_descuentos = round2(lineas.filter(l => l.tipo === 'descuento').reduce((s, l) => s + l.monto, 0))
        const neto = round2(total_ingresos - total_descuentos)
        const { error: cabError } = await nominas()
            .from('rol_cabecera')
            .update({ total_ingresos, total_descuentos, neto, updated_at: new Date().toISOString() })
            .eq('id', cabecera.id)
        if (cabError) throw cabError

        // 3. Recalcular totales del período
        const { data: cabs, error: cabsError } = await nominas()
            .from('rol_cabecera')
            .select('total_ingresos, total_descuentos, neto')
            .eq('periodo_id', periodoId)
        if (cabsError) throw cabsError
        const ptI = round2((cabs ?? []).reduce((s, c) => s + (c.total_ingresos   ?? 0), 0))
        const ptD = round2((cabs ?? []).reduce((s, c) => s + (c.total_descuentos ?? 0), 0))
        const ptN = round2((cabs ?? []).reduce((s, c) => s + (c.neto             ?? 0), 0))
        const { error: perError } = await nominas()
            .from('periodos')
            .update({ total_ingresos: ptI, total_descuentos: ptD, total_neto: ptN, updated_at: new Date().toISOString() })
            .eq('id', periodoId)
        if (perError) throw perError
    },

    async agregarLinea(cabeceraId: string, empresaId: string, concepto: ConceptoNomina): Promise<RolLinea> {
        const { data, error } = await nominas()
            .from('rol_lineas')
            .insert({
                cabecera_id:  cabeceraId,
                empresa_id:   empresaId,
                concepto_id:  concepto.id,
                codigo:       concepto.codigo,
                nombre:       concepto.nombre,
                tipo:         concepto.tipo,
                monto:        0,
                es_calculado: false,
                orden:        concepto.orden,
                horas:        null,
                novedad_id:   null,
            })
            .select('*, concepto:conceptos(afecta_iess)')
            .single()
        if (error) throw error
        return data as unknown as RolLinea
    },

    async eliminarLinea(lineaId: string): Promise<void> {
        const { error } = await nominas().from('rol_lineas').delete().eq('id', lineaId)
        if (error) throw error
    },

    async liquidarPeriodo(periodoId: string): Promise<void> {
        // 1. Marcar el período como liquidado
        const { error } = await nominas()
            .from('periodos')
            .update({ estado: 'liquidado', updated_at: new Date().toISOString() })
            .eq('id', periodoId)
        if (error) throw error

        // 2. Obtener IDs de cabeceras del período
        const { data: cabs } = await nominas()
            .from('rol_cabecera')
            .select('id')
            .eq('periodo_id', periodoId)
        const cabIds = (cabs ?? []).map(c => c.id)
        if (cabIds.length === 0) return

        // 3. Obtener lineas con novedad_id y monto > 0
        const { data: lineasNov } = await nominas()
            .from('rol_lineas')
            .select('novedad_id, monto')
            .in('cabecera_id', cabIds)
            .not('novedad_id', 'is', null)
            .gt('monto', 0)

        // 4. Actualizar saldos de préstamos y resetear descuentos variables
        for (const linea of (lineasNov ?? [])) {
            if (!linea.novedad_id) continue

            const { data: nov } = await nominas()
                .from('novedades')
                .select('tipo_novedad, saldo_pendiente, n_cuotas_pagadas')
                .eq('id', linea.novedad_id)
                .single()
            if (!nov) continue

            if (nov.tipo_novedad === 'prestamo_cuota' || nov.tipo_novedad === 'prestamo_plazo') {
                const nuevoSaldo   = Math.max(0, (nov.saldo_pendiente ?? 0) - linea.monto)
                const nuevasCuotas = (nov.n_cuotas_pagadas ?? 0) + 1
                await nominas()
                    .from('novedades')
                    .update({
                        saldo_pendiente:  round2(nuevoSaldo),
                        n_cuotas_pagadas: nuevasCuotas,
                        activo:           nuevoSaldo > 0.01,
                        updated_at:       new Date().toISOString(),
                    })
                    .eq('id', linea.novedad_id)
            } else if (nov.tipo_novedad === 'descuento_variable') {
                // Borrar el monto para que el siguiente mes se vuelva a ingresar
                await nominas()
                    .from('novedades')
                    .update({ monto_fijo: null, updated_at: new Date().toISOString() })
                    .eq('id', linea.novedad_id)
            }
        }
    },

    async generarRol(periodoId: string, empresaId: string): Promise<void> {
        // Verificar que no existe rol previo
        const { count } = await nominas()
            .from('rol_cabecera')
            .select('id', { count: 'exact', head: true })
            .eq('periodo_id', periodoId)
        if ((count ?? 0) > 0) {
            throw new Error('Este período ya tiene un rol generado. Edita las líneas individuales para ajustar valores.')
        }

        // Cargar período
        const { data: periodo, error: perError } = await nominas()
            .from('periodos').select('*').eq('id', periodoId).single()
        if (perError || !periodo) throw perError ?? new Error('Período no encontrado')
        const factor = periodo.tipo_nomina === 'quincenal' ? 0.5 : 1.0

        // Verificar que no hay períodos anteriores con rol generado sin liquidar
        const { data: perPrevios } = await nominas()
            .from('periodos')
            .select('id, nombre, estado')
            .eq('empresa_id', empresaId)
            .neq('id', periodoId)
            .lt('fecha_fin', periodo.fecha_fin)
            .in('estado', ['borrador', 'cerrado'])
            .order('fecha_fin', { ascending: false })
            .limit(5)
        for (const prev of (perPrevios ?? [])) {
            const { count: cntPrev } = await nominas()
                .from('rol_cabecera')
                .select('id', { count: 'exact', head: true })
                .eq('periodo_id', prev.id)
            if ((cntPrev ?? 0) > 0) {
                throw new Error(
                    `El período "${prev.nombre}" tiene un rol generado sin liquidar. Realiza la Liquidación Definitiva antes de generar el siguiente rol.`
                )
            }
        }

        // Cargar parámetros
        const params = await parametrosNominaService.obtener(empresaId)
        const sbu           = params?.sbu                      ?? 460
        const iess_pct      = params?.aporte_personal_iess_pct ?? 9.45
        const fondo_res_pct = params?.fondo_reserva_pct        ?? 8.33

        // Cargar empleados activos
        const { data: empleados, error: empError } = await nominas()
            .from('empleados').select('*').eq('empresa_id', empresaId).eq('activo', true)
        if (empError) throw empError
        if (!empleados?.length) throw new Error('No hay empleados activos para generar el rol.')

        // Cargar conceptos activos
        const { data: conceptos, error: conError } = await nominas()
            .from('conceptos').select('*').eq('empresa_id', empresaId).eq('activo', true).order('orden')
        if (conError) throw conError
        const conceptoMap   = new Map<string, ConceptoNomina>()
        const conceptoIdMap = new Map<string, ConceptoNomina>()
        ;(conceptos ?? []).forEach(c => {
            conceptoMap.set(c.codigo, c as ConceptoNomina)
            conceptoIdMap.set(c.id, c as ConceptoNomina)
        })

        // Cargar novedades activas con fecha_inicio <= fecha_fin del período
        const { data: novedades, error: novError } = await nominas()
            .from('novedades')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .lte('fecha_inicio', periodo.fecha_fin)
        if (novError) throw novError

        // Agrupar novedades por empleado_id
        const novedadesMap = new Map<string, typeof novedades[0][]>()
        for (const nov of (novedades ?? [])) {
            const list = novedadesMap.get(nov.empleado_id) ?? []
            list.push(nov)
            novedadesMap.set(nov.empleado_id, list)
        }

        const ESPECIALES = new Set(['SUELDO', 'IESS_PERS', 'DEC3_MENS', 'DEC4_MENS', 'FONDO_RES'])
        const hoy = new Date()

        type LinRow = {
            codigo: string; nombre: string; tipo: string; monto: number
            es_calculado: boolean; orden: number; concepto_id: string | null
            horas: number | null; novedad_id: string | null
        }
        type CabRow = {
            periodo_id: string; empleado_id: string; empresa_id: string; sueldo_base: number
            total_ingresos: number; total_descuentos: number; neto: number
        }

        const cabRows: CabRow[] = []
        const linPorEmp: LinRow[][] = []

        for (const emp of (empleados as unknown as Empleado[])) {
            const sueldo_periodo = round2(emp.sueldo_base * factor)
            const lineas: LinRow[] = []

            // SUELDO
            const sueldoC = conceptoMap.get('SUELDO')
            lineas.push({ codigo: 'SUELDO', nombre: sueldoC?.nombre ?? 'Sueldo Base', tipo: 'ingreso', monto: sueldo_periodo, es_calculado: true, orden: sueldoC?.orden ?? 1, concepto_id: sueldoC?.id ?? null, horas: null, novedad_id: null })

            // DEC3_MENS
            if (emp.decimo_tercero_modo === 'mensualizado') {
                const c = conceptoMap.get('DEC3_MENS')
                if (c) lineas.push({ codigo: c.codigo, nombre: c.nombre, tipo: 'ingreso', monto: round2(emp.sueldo_base / 12 * factor), es_calculado: true, orden: c.orden, concepto_id: c.id, horas: null, novedad_id: null })
            }

            // DEC4_MENS
            if (emp.decimo_cuarto_modo === 'mensualizado') {
                const c = conceptoMap.get('DEC4_MENS')
                if (c) lineas.push({ codigo: c.codigo, nombre: c.nombre, tipo: 'ingreso', monto: round2(sbu / 12 * factor), es_calculado: true, orden: c.orden, concepto_id: c.id, horas: null, novedad_id: null })
            }

            // FONDO_RES — solo si antigüedad >= 13 meses
            if (emp.fondo_reserva_modo === 'mensual' && diffMeses(emp.fecha_ingreso, hoy) >= 13) {
                const c = conceptoMap.get('FONDO_RES')
                if (c) lineas.push({ codigo: c.codigo, nombre: c.nombre, tipo: 'ingreso', monto: round2(sueldo_periodo * fondo_res_pct / 100), es_calculado: true, orden: c.orden, concepto_id: c.id, horas: null, novedad_id: null })
            }

            // Otros aplica_siempre=true (no especiales)
            for (const c of (conceptos ?? []) as ConceptoNomina[]) {
                if (c.aplica_siempre && !ESPECIALES.has(c.codigo)) {
                    lineas.push({ codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, monto: 0, es_calculado: false, orden: c.orden, concepto_id: c.id, horas: null, novedad_id: null })
                }
            }

            // Base IESS = suma de ingresos con afecta_iess
            const baseIess = lineas
                .filter(l => l.tipo === 'ingreso')
                .reduce((s, l) => s + ((conceptoMap.get(l.codigo)?.afecta_iess ?? false) ? l.monto : 0), 0)

            // IESS_PERS
            if (emp.afiliado_iess) {
                const c = conceptoMap.get('IESS_PERS')
                lineas.push({ codigo: 'IESS_PERS', nombre: c?.nombre ?? 'Aporte Personal IESS', tipo: 'descuento', monto: round2(baseIess * iess_pct / 100), es_calculado: true, orden: c?.orden ?? 50, concepto_id: c?.id ?? null, horas: null, novedad_id: null })
            }

            // Novedades del empleado (descuentos recurrentes / préstamos)
            const novsEmp = novedadesMap.get(emp.id) ?? []
            for (const nov of novsEmp) {
                let monto = 0
                let es_calc = false

                if (nov.tipo_novedad === 'descuento_fijo') {
                    monto   = nov.monto_fijo ?? 0
                    es_calc = true
                } else if (nov.tipo_novedad === 'prestamo_cuota') {
                    if ((nov.saldo_pendiente ?? 0) <= 0.01) continue
                    monto   = round2(Math.min(nov.monto_fijo ?? 0, nov.saldo_pendiente ?? 0))
                    es_calc = true
                } else if (nov.tipo_novedad === 'prestamo_plazo') {
                    if ((nov.n_cuotas_pagadas ?? 0) >= (nov.n_meses ?? 0)) continue
                    const cuota = round2((nov.saldo_inicial ?? 0) / Math.max(nov.n_meses ?? 1, 1))
                    monto   = round2(Math.min(cuota, nov.saldo_pendiente ?? cuota))
                    es_calc = true
                } else {
                    // descuento_variable: usar el monto guardado en la novedad (usuario lo actualiza cada mes)
                    monto   = round2(nov.monto_fijo ?? 0)
                    es_calc = false
                }

                const cOrden = nov.concepto_id ? (conceptoIdMap.get(nov.concepto_id)?.orden ?? 80) : 80
                lineas.push({
                    codigo:       nov.codigo,
                    nombre:       nov.nombre,
                    tipo:         'descuento',
                    monto:        round2(monto),
                    es_calculado: es_calc,
                    orden:        cOrden,
                    concepto_id:  nov.concepto_id ?? null,
                    horas:        null,
                    novedad_id:   nov.id,
                })
            }

            lineas.sort((a, b) => a.orden - b.orden)

            const total_ingresos   = round2(lineas.filter(l => l.tipo === 'ingreso').reduce((s, l) => s + l.monto, 0))
            const total_descuentos = round2(lineas.filter(l => l.tipo === 'descuento').reduce((s, l) => s + l.monto, 0))
            const neto = round2(total_ingresos - total_descuentos)

            cabRows.push({ periodo_id: periodoId, empleado_id: emp.id, empresa_id: empresaId, sueldo_base: emp.sueldo_base, total_ingresos, total_descuentos, neto })
            linPorEmp.push(lineas)
        }

        // Insertar cabeceras y obtener IDs
        const { data: cabsIns, error: cabInsError } = await nominas()
            .from('rol_cabecera').insert(cabRows).select('id, empleado_id')
        if (cabInsError) throw cabInsError

        const cabMap = new Map<string, string>()
        ;(cabsIns ?? []).forEach(c => cabMap.set(c.empleado_id, c.id))

        // Insertar todas las líneas
        const todasLineas: any[] = []
        for (let i = 0; i < (empleados as unknown as Empleado[]).length; i++) {
            const emp = empleados[i] as unknown as Empleado
            const cabeceraId = cabMap.get(emp.id)
            for (const l of linPorEmp[i]) {
                todasLineas.push({ ...l, cabecera_id: cabeceraId, empresa_id: empresaId })
            }
        }
        const { error: linInsError } = await nominas().from('rol_lineas').insert(todasLineas)
        if (linInsError) throw linInsError

        // Actualizar totales del período
        const ptI = round2(cabRows.reduce((s, c) => s + c.total_ingresos,   0))
        const ptD = round2(cabRows.reduce((s, c) => s + c.total_descuentos, 0))
        const ptN = round2(cabRows.reduce((s, c) => s + c.neto,             0))
        const { error: perUpdError } = await nominas()
            .from('periodos')
            .update({ total_ingresos: ptI, total_descuentos: ptD, total_neto: ptN, updated_at: new Date().toISOString() })
            .eq('id', periodoId)
        if (perUpdError) throw perUpdError
    },

    // Agrega las novedades activas que aún no están en un rol ya generado.
    // Retorna el número de líneas nuevas insertadas.
    async sincronizarNovedades(periodoId: string, empresaId: string): Promise<number> {
        const { data: periodo } = await nominas()
            .from('periodos').select('fecha_fin').eq('id', periodoId).single()
        if (!periodo) return 0

        const { data: cabs } = await nominas()
            .from('rol_cabecera').select('id, empleado_id').eq('periodo_id', periodoId)
        if (!cabs?.length) return 0

        const { data: novedades } = await nominas()
            .from('novedades').select('*')
            .eq('empresa_id', empresaId).eq('activo', true).lte('fecha_inicio', periodo.fecha_fin)

        const novedadesMap = new Map<string, any[]>()
        for (const nov of (novedades ?? [])) {
            const list = novedadesMap.get(nov.empleado_id) ?? []
            list.push(nov)
            novedadesMap.set(nov.empleado_id, list)
        }

        // Novedades ya vinculadas en este rol
        const cabIds = cabs.map(c => c.id)
        const { data: lineasExist } = await nominas()
            .from('rol_lineas').select('cabecera_id, novedad_id')
            .in('cabecera_id', cabIds).not('novedad_id', 'is', null)

        const aplicadas = new Set<string>()
        for (const l of (lineasExist ?? [])) {
            if (l.novedad_id) aplicadas.add(`${l.cabecera_id}:${l.novedad_id}`)
        }

        // Orden de conceptos
        const { data: conceptos } = await nominas()
            .from('conceptos').select('id, orden').eq('empresa_id', empresaId).eq('activo', true)
        const conceptoOrden = new Map<string, number>()
        for (const c of (conceptos ?? [])) conceptoOrden.set(c.id, c.orden)

        const nuevasLineas: any[] = []
        for (const cab of cabs) {
            const novsEmp = novedadesMap.get(cab.empleado_id) ?? []
            for (const nov of novsEmp) {
                if (aplicadas.has(`${cab.id}:${nov.id}`)) continue

                let monto = 0
                let es_calc = false

                if (nov.tipo_novedad === 'descuento_fijo') {
                    monto = nov.monto_fijo ?? 0; es_calc = true
                } else if (nov.tipo_novedad === 'descuento_variable') {
                    monto = round2(nov.monto_fijo ?? 0); es_calc = false
                } else if (nov.tipo_novedad === 'prestamo_cuota') {
                    if ((nov.saldo_pendiente ?? 0) <= 0.01) continue
                    monto = round2(Math.min(nov.monto_fijo ?? 0, nov.saldo_pendiente ?? 0)); es_calc = true
                } else if (nov.tipo_novedad === 'prestamo_plazo') {
                    if ((nov.n_cuotas_pagadas ?? 0) >= (nov.n_meses ?? 0)) continue
                    const cuota = round2((nov.saldo_inicial ?? 0) / Math.max(nov.n_meses ?? 1, 1))
                    monto = round2(Math.min(cuota, nov.saldo_pendiente ?? cuota)); es_calc = true
                }

                nuevasLineas.push({
                    cabecera_id:  cab.id,
                    empresa_id:   empresaId,
                    concepto_id:  nov.concepto_id ?? null,
                    codigo:       nov.codigo,
                    nombre:       nov.nombre,
                    tipo:         'descuento',
                    monto:        round2(monto),
                    es_calculado: es_calc,
                    orden:        nov.concepto_id ? (conceptoOrden.get(nov.concepto_id) ?? 80) : 80,
                    horas:        null,
                    novedad_id:   nov.id,
                })
            }
        }

        if (!nuevasLineas.length) return 0

        const { error: insErr } = await nominas().from('rol_lineas').insert(nuevasLineas)
        if (insErr) throw insErr

        // Recalcular totales de cabeceras afectadas
        const cabsAfectadas = [...new Set(nuevasLineas.map(l => l.cabecera_id))]
        for (const cabId of cabsAfectadas) {
            const { data: lineas } = await nominas()
                .from('rol_lineas').select('tipo, monto').eq('cabecera_id', cabId)
            const ti = round2((lineas ?? []).filter(l => l.tipo === 'ingreso').reduce((s, l) => s + l.monto, 0))
            const td = round2((lineas ?? []).filter(l => l.tipo === 'descuento').reduce((s, l) => s + l.monto, 0))
            await nominas().from('rol_cabecera')
                .update({ total_ingresos: ti, total_descuentos: td, neto: round2(ti - td), updated_at: new Date().toISOString() })
                .eq('id', cabId)
        }

        // Recalcular totales del período
        const { data: allCabs } = await nominas()
            .from('rol_cabecera').select('total_ingresos, total_descuentos, neto').eq('periodo_id', periodoId)
        const ptI = round2((allCabs ?? []).reduce((s, c) => s + (c.total_ingresos ?? 0), 0))
        const ptD = round2((allCabs ?? []).reduce((s, c) => s + (c.total_descuentos ?? 0), 0))
        const ptN = round2((allCabs ?? []).reduce((s, c) => s + (c.neto ?? 0), 0))
        await nominas().from('periodos')
            .update({ total_ingresos: ptI, total_descuentos: ptD, total_neto: ptN, updated_at: new Date().toISOString() })
            .eq('id', periodoId)

        return nuevasLineas.length
    },
}
