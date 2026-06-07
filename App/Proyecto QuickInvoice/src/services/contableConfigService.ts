import { supabase } from '../lib/supabase'
import { supabaseContabilidad } from '../lib/supabaseContabilidad'
import { contabilidadService } from './contabilidadService'

export interface ConfigContable {
    id?: string
    empresa_id: string
    contabilidad_en_linea: boolean
}

export interface MapeoContable {
    id?: string
    empresa_id: string
    proceso: string
    concepto: string
    cuenta_id: string | null
    cuenta_codigo: string | null
    cuenta_nombre: string | null
}

export interface CuentaLP {
    id: string
    codigo: string
    nombre: string
    tipo: string
}

export const contableConfigService = {

    async getConfig(empresaId: string): Promise<ConfigContable | null> {
        const { data } = await supabase
            .from('config_contable')
            .select('*')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        return data
    },

    async saveConfig(empresaId: string, contabilidadEnLinea: boolean): Promise<void> {
        const { error } = await supabase
            .from('config_contable')
            .upsert(
                { empresa_id: empresaId, contabilidad_en_linea: contabilidadEnLinea, updated_at: new Date().toISOString() },
                { onConflict: 'empresa_id' }
            )
        if (error) throw error
    },

    async getMapeos(empresaId: string): Promise<MapeoContable[]> {
        const { data, error } = await supabase
            .from('config_contable_mapeo')
            .select('*')
            .eq('empresa_id', empresaId)
        if (error) throw error
        return data || []
    },

    async saveMapeos(empresaId: string, mapeos: Array<{ proceso: string; concepto: string; cuenta_id: string | null; cuenta_codigo: string | null; cuenta_nombre: string | null }>): Promise<void> {
        if (mapeos.length === 0) return
        const rows = mapeos.map(m => ({
            empresa_id: empresaId,
            proceso: m.proceso,
            concepto: m.concepto,
            cuenta_id: m.cuenta_id || null,
            cuenta_codigo: m.cuenta_codigo || null,
            cuenta_nombre: m.cuenta_nombre || null,
            updated_at: new Date().toISOString(),
        }))
        const { error } = await supabase
            .from('config_contable_mapeo')
            .upsert(rows, { onConflict: 'empresa_id,proceso,concepto' })
        if (error) throw error
    },

    async getCuentas(portalRuc?: string): Promise<CuentaLP[]> {
        // Strategy 1: via contabilidadService (now uses contabilidad schema)
        try {
            const result = await contabilidadService.listarCuentas(portalRuc)
            if (result.length > 0) return result
        } catch {
            // fallthrough
        }
        // Strategy 2: query lp_usuarios_empresa → lp_cuentas directly (contabilidad schema)
        try {
            const db = supabaseContabilidad as any
            const { data: memberships } = await db
                .from('lp_usuarios_empresa')
                .select('empresa_id, empresa:lp_empresas(id, ruc)')
                .eq('activo', true)
            const lista: Array<{ empresa_id: string; empresa: { id: string; ruc?: string | null } }> = memberships ?? []
            if (!lista.length) return []
            let empresaId = lista[0].empresa_id
            if (portalRuc) {
                const match = lista.find(m => m.empresa?.ruc === portalRuc)
                if (match) empresaId = match.empresa_id
            }
            const { data } = await db
                .from('lp_cuentas')
                .select('id, codigo, nombre, tipo')
                .eq('empresa_id', empresaId)
                .eq('acepta_movimientos', true)
                .order('codigo')
            return (data ?? []) as CuentaLP[]
        } catch {
            return []
        }
    },

    // Util: obtiene el mapeo como objeto plano { 'PROCESO:CONCEPTO': MapeoContable }
    async getMapeoAsMap(empresaId: string): Promise<Record<string, MapeoContable>> {
        const rows = await contableConfigService.getMapeos(empresaId)
        const map: Record<string, MapeoContable> = {}
        for (const r of rows) map[`${r.proceso}:${r.concepto}`] = r
        return map
    },
}
