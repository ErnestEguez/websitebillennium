import { supabase } from '../../lib/supabase'
import type { NovedadNomina } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

function round2(n: number): number {
    return Math.round(n * 100) / 100
}

export const novedadesNominaService = {

    async listar(empresaId: string): Promise<NovedadNomina[]> {
        const { data, error } = await nominas()
            .from('novedades')
            .select('*, empleado:empleados(nombres, apellidos), concepto:conceptos(nombre)')
            .eq('empresa_id', empresaId)
            .order('activo', { ascending: false })
            .order('created_at', { ascending: false })
        if (error) throw error
        return data as unknown as NovedadNomina[]
    },

    async crear(
        novedad: Omit<NovedadNomina, 'id' | 'n_cuotas_pagadas' | 'activo' | 'created_at' | 'updated_at' | 'empleado' | 'concepto'>
    ): Promise<NovedadNomina> {
        const { data, error } = await nominas()
            .from('novedades')
            .insert(novedad)
            .select()
            .single()
        if (error) throw error
        return data as NovedadNomina
    },

    async actualizar(id: string, campos: Partial<NovedadNomina>): Promise<NovedadNomina> {
        const { data, error } = await nominas()
            .from('novedades')
            .update({ ...campos, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as NovedadNomina
    },

    async desactivar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('novedades')
            .update({ activo: false, updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },

    async actualizarSaldo(novedad_id: string, montoAplicado: number): Promise<void> {
        const { data: nov, error: getErr } = await nominas()
            .from('novedades')
            .select('tipo_novedad, saldo_pendiente, n_cuotas_pagadas')
            .eq('id', novedad_id)
            .single()
        if (getErr || !nov) return

        if (nov.tipo_novedad !== 'prestamo_cuota' && nov.tipo_novedad !== 'prestamo_plazo') return

        const nuevoSaldo = Math.max(0, (nov.saldo_pendiente ?? 0) - montoAplicado)
        const nuevasCuotas = (nov.n_cuotas_pagadas ?? 0) + 1

        const { error } = await nominas()
            .from('novedades')
            .update({
                saldo_pendiente:  round2(nuevoSaldo),
                n_cuotas_pagadas: nuevasCuotas,
                activo:           nuevoSaldo > 0.01,
                updated_at:       new Date().toISOString(),
            })
            .eq('id', novedad_id)
        if (error) throw error
    },
}
