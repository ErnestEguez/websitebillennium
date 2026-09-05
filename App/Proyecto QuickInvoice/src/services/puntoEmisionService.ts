import { supabase } from '../lib/supabase'
import type { PuntoEmision } from '../types/puntosEmision'
import { getPuntoEmisionDispositivo, getTerminalDispositivo } from '../lib/dispositivoPuntoEmision'
import { terminalService } from './terminalService'

export const puntoEmisionService = {

    async listar(empresaId: string): Promise<PuntoEmision[]> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('es_principal', { ascending: false })
            .order('establecimiento')
            .order('punto_emision')
        if (error) throw error
        return data as PuntoEmision[]
    },

    async listarTodas(empresaId: string): Promise<PuntoEmision[]> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('es_principal', { ascending: false })
            .order('establecimiento')
            .order('punto_emision')
        if (error) throw error
        return data as PuntoEmision[]
    },

    async obtener(id: string): Promise<PuntoEmision> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .select('*')
            .eq('id', id)
            .single()
        if (error) throw error
        return data as PuntoEmision
    },

    async getPrincipal(empresaId: string): Promise<PuntoEmision | null> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('es_principal', true)
            .eq('activo', true)
            .maybeSingle()
        // Un error de red/consulta NO es lo mismo que "no hay principal
        // configurado" — antes se trataban igual y el fallo silencioso podía
        // terminar facturando por el punto de emisión equivocado.
        if (error) throw error
        return (data as PuntoEmision) ?? null
    },

    // Punto de emisión con el que factura ESTE dispositivo. Un error de
    // conexión al consultar NO cae en silencio al "Principal" — se propaga
    // para que la factura se bloquee y se reintente, en vez de salir con el
    // punto de emisión (y por lo tanto el secuencial) equivocado.
    //
    // Orden de resolución:
    // 1. Terminal con nombre (tabla facturacion.terminales) — el navegador
    //    solo recuerda el NOMBRE de esta máquina (ej. "Caja 1"); la
    //    asignación real vive en el servidor, así un admin puede reasignar
    //    la serie de una terminal sin tocar la máquina física, y si se borra
    //    el caché del navegador basta con volver a elegir el mismo nombre.
    // 2. Asignación legada por localStorage directo (punto_emision_id) —
    //    compatibilidad con máquinas configuradas antes de que existieran
    //    las terminales con nombre, para no interrumpirlas.
    // 3. Principal de la empresa.
    async resolverParaDispositivo(empresaId: string): Promise<PuntoEmision | null> {
        const nombreTerminal = getTerminalDispositivo(empresaId)
        if (nombreTerminal) {
            const terminal = await terminalService.obtenerPorNombre(empresaId, nombreTerminal)
            if (terminal?.punto_emision_id) {
                const { data, error } = await supabase
                    .from('puntos_emision')
                    .select('*')
                    .eq('id', terminal.punto_emision_id)
                    .eq('empresa_id', empresaId)
                    .eq('activo', true)
                    .maybeSingle()
                if (error) throw error
                if (data) return data as PuntoEmision
            }
            // Terminal nombrada pero sin punto de emisión asignado (o el
            // punto ya no existe/está inactivo) — sigue con el respaldo en
            // vez de bloquear la facturación de esta máquina.
        }

        const idDispositivo = getPuntoEmisionDispositivo(empresaId)
        if (idDispositivo) {
            const { data, error } = await supabase
                .from('puntos_emision')
                .select('*')
                .eq('id', idDispositivo)
                .eq('empresa_id', empresaId)
                .eq('activo', true)
                .maybeSingle()
            if (error) throw error
            if (data) return data as PuntoEmision
        }
        return this.getPrincipal(empresaId)
    },

    // Punto de emisión asociado a una bodega (ej. para retenciones, que deben
    // salir del establecimiento donde se hizo la compra, no de "el dispositivo").
    // Si ninguno está configurado para esa bodega, cae al "Principal".
    async resolverPorBodega(empresaId: string, bodegaId: string | null | undefined): Promise<PuntoEmision | null> {
        if (bodegaId) {
            const { data } = await supabase
                .from('puntos_emision')
                .select('*')
                .eq('empresa_id', empresaId)
                .eq('bodega_id', bodegaId)
                .eq('activo', true)
                .maybeSingle()
            if (data) return data as PuntoEmision
        }
        return this.getPrincipal(empresaId)
    },

    async crear(puntoEmision: Omit<PuntoEmision, 'id' | 'created_at' | 'updated_at' | 'secuenciales'>): Promise<PuntoEmision> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .insert({ ...puntoEmision, secuenciales: {} })
            .select()
            .single()
        if (error) throw error
        return data as PuntoEmision
    },

    async actualizar(id: string, campos: Partial<PuntoEmision>): Promise<PuntoEmision> {
        const { data, error } = await supabase
            .from('puntos_emision')
            .update({ ...campos, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as PuntoEmision
    },

    async desactivar(id: string): Promise<void> {
        const { error } = await supabase
            .from('puntos_emision')
            .update({ activo: false, updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },

    // Siguiente secuencial atómico (FOR UPDATE en Postgres) para un punto de emisión + tipo de comprobante.
    async siguienteSecuencial(puntoEmisionId: string, tipoComprobante: string = 'FACTURA'): Promise<number> {
        const { data, error } = await supabase
            .rpc('qi_next_secuencial_punto', { p_punto_emision_id: puntoEmisionId, p_tipo_comprobante: tipoComprobante })
        if (error) throw error
        return data as number
    },
}
