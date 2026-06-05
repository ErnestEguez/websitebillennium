import { supabase } from '../../lib/supabaseFinance'
import { supabaseFacturacion } from '../../lib/supabase'
import type {
    Banco, CuentaBancaria, ConfiguracionEmpresa,
    Proveedor, CuentaPorPagar,
} from '../../types/finance'

// ── Bancos (catálogo global) ─────────────────────────────────

export const bancosService = {
    async listar(): Promise<Banco[]> {
        const { data, error } = await supabase
            .from('bancos')
            .select('*')
            .order('nombre')
        if (error) throw error
        return data as Banco[]
    },

    async crear(banco: Omit<Banco, 'id' | 'created_at'>): Promise<Banco> {
        const { data, error } = await supabase
            .from('bancos').insert(banco).select().single()
        if (error) throw error
        return data as Banco
    },

    async actualizar(id: string, cambios: Partial<Banco>): Promise<Banco> {
        const { data, error } = await supabase
            .from('bancos').update(cambios).eq('id', id).select().single()
        if (error) throw error
        return data as Banco
    },

    async toggleActivo(id: string, activo: boolean): Promise<void> {
        const { error } = await supabase
            .from('bancos').update({ activo }).eq('id', id)
        if (error) throw error
    },
}

// ── Cuentas Bancarias ────────────────────────────────────────

export const cuentasBancariasService = {
    async listar(empresaId: string): Promise<CuentaBancaria[]> {
        const { data, error } = await supabase
            .from('cuentas_bancarias')
            .select('*, banco:bancos(nombre, abreviatura, codigo)')
            .eq('empresa_id', empresaId)
            .order('created_at')
        if (error) throw error
        return data as CuentaBancaria[]
    },

    async obtener(id: string): Promise<CuentaBancaria> {
        const { data, error } = await supabase
            .from('cuentas_bancarias')
            .select('*, banco:bancos(nombre, abreviatura, codigo)')
            .eq('id', id)
            .single()
        if (error) throw error
        return data as CuentaBancaria
    },

    async crear(cuenta: Omit<CuentaBancaria, 'id' | 'created_at' | 'updated_at' | 'banco' | 'saldo_actual'>): Promise<CuentaBancaria> {
        const { data, error } = await supabase
            .from('cuentas_bancarias').insert(cuenta).select().single()
        if (error) throw error
        return data as CuentaBancaria
    },

    async actualizar(id: string, cambios: Partial<CuentaBancaria>): Promise<CuentaBancaria> {
        const { banco: _b, saldo_actual: _s, ...rest } = cambios as CuentaBancaria
        const { data, error } = await supabase
            .from('cuentas_bancarias')
            .update({ ...rest, updated_at: new Date().toISOString() })
            .eq('id', id).select().single()
        if (error) throw error
        return data as CuentaBancaria
    },

    async saldoActual(cuentaId: string): Promise<number> {
        const { data, error } = await supabase
            .rpc('fn_saldo_cuenta', { p_cuenta_id: cuentaId })
        if (error) throw error
        return Number(data) || 0
    },
}

// ── Configuración empresa ────────────────────────────────────

export const configuracionService = {
    async obtener(empresaId: string): Promise<ConfiguracionEmpresa | null> {
        const { data } = await supabase
            .from('configuracion_empresa')
            .select('*')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        return data as ConfiguracionEmpresa | null
    },

    async upsert(empresaId: string, cambios: Partial<ConfiguracionEmpresa>): Promise<ConfiguracionEmpresa> {
        const { data, error } = await supabase
            .from('configuracion_empresa')
            .upsert(
                { empresa_id: empresaId, ...cambios, updated_at: new Date().toISOString() },
                { onConflict: 'empresa_id' }
            )
            .select().single()
        if (error) throw error
        return data as ConfiguracionEmpresa
    },
}

// ── Proveedores (lectura desde facturacion) ──────────────────

export const proveedoresService = {
    async listar(empresaId: string): Promise<Proveedor[]> {
        const { data, error } = await supabaseFacturacion
            .from('proveedores')
            .select('id, empresa_id, ruc, nombre_empresa, nombre_encargado, correo, telefono, estado, condicion_pago')
            .eq('empresa_id', empresaId)
            .eq('estado', 'ACTIVO')
            .order('nombre_empresa')
        if (error) throw error
        return data as Proveedor[]
    },

    async buscar(empresaId: string, q: string): Promise<Proveedor[]> {
        const { data, error } = await supabaseFacturacion
            .from('proveedores')
            .select('id, empresa_id, ruc, nombre_empresa, estado, condicion_pago')
            .eq('empresa_id', empresaId)
            .or(`ruc.ilike.%${q}%,nombre_empresa.ilike.%${q}%`)
            .order('nombre_empresa')
            .limit(20)
        if (error) throw error
        return data as Proveedor[]
    },
}

// ── CxP (lectura desde facturacion) ─────────────────────────

export const cxpService = {
    async listarPendientes(empresaId: string, proveedorId?: string): Promise<CuentaPorPagar[]> {
        let q = supabaseFacturacion
            .from('cuentas_por_pagar')
            .select('*, proveedor:proveedores(nombre_empresa, ruc), compra:ingresos_stock(numero_factura, fecha_emision, tipo_compra)')
            .eq('empresa_id', empresaId)
            .in('estado', ['PENDIENTE', 'PARCIALMENTE_PAGADO'])
            .order('fecha_vencimiento')

        if (proveedorId) q = q.eq('proveedor_id', proveedorId)

        const { data, error } = await q
        if (error) throw error
        return data as CuentaPorPagar[]
    },

    async registrarPago(pago: {
        empresa_id: string
        cxp_id: string
        proveedor_id: string
        fecha_pago: string
        monto: number
        forma_pago: string
        numero_referencia?: string
    }): Promise<void> {
        const { error } = await supabaseFacturacion
            .from('pagos_proveedores')
            .insert(pago)
        if (error) throw error
    },

    async revertirPagos(empresaId: string, egresoNumero: string): Promise<void> {
        if (!egresoNumero?.trim()) throw new Error('Número de egreso inválido para reversar pagos')
        if (!empresaId?.trim())    throw new Error('Empresa inválida para reversar pagos')
        const { error } = await supabaseFacturacion
            .from('pagos_proveedores')
            .delete()
            .eq('empresa_id', empresaId)
            .eq('numero_referencia', egresoNumero)
        if (error) throw error
    },
}


