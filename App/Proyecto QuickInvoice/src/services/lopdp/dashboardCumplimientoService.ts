import { supabase } from '../../lib/supabase'
import type { DashboardCumplimiento } from '../../types/lopdp'

const lopdp = () => supabase.schema('lopdp')

export const dashboardCumplimientoService = {
    // Una sola llamada de red: la función RPC combina RAT, solicitudes,
    // encargados, brechas y política de privacidad server-side, en vez
    // de hacer ~6 consultas separadas desde el cliente.
    async obtenerResumen(empresaId: string): Promise<DashboardCumplimiento> {
        const { data, error } = await lopdp().rpc('dashboard_cumplimiento', { p_empresa_id: empresaId })
        if (error) throw error
        return data as DashboardCumplimiento
    },
}
