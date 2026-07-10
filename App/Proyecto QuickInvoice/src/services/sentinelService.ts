import { supabase } from '../lib/supabase'
import type { MisionMeta, MisionConPasos, MisionPaso, ProgresoMision } from '../types/sentinel'

// Catálogo de misiones: cargado una vez por sesión (~1 KB). Declaramos la forma del módulo JSON.
let _metaCache: MisionMeta[] | null = null

export async function getMisiones(): Promise<MisionMeta[]> {
    if (_metaCache) return _metaCache
    const mod = await import('../data/sentinel_misiones.json')
    _metaCache = mod.default as MisionMeta[]
    return _metaCache
}

// Mapa estático de loaders — Vite analiza cada import() en build time.
// Cast explícito porque TS infiere `accion` como string desde JSON.
const PASOS_LOADERS: Record<string, () => Promise<{ default: MisionPaso[] }>> = {
    'emitir-factura':       () => import('../data/sentinel_pasos/emitir-factura.json')      as unknown as Promise<{ default: MisionPaso[] }>,
    'configurar-clientes':  () => import('../data/sentinel_pasos/configurar-clientes.json') as unknown as Promise<{ default: MisionPaso[] }>,
    'primer-producto':      () => import('../data/sentinel_pasos/primer-producto.json')     as unknown as Promise<{ default: MisionPaso[] }>,
    'ventas-del-dia':       () => import('../data/sentinel_pasos/ventas-del-dia.json')      as unknown as Promise<{ default: MisionPaso[] }>,
    'configurar-empresa':   () => import('../data/sentinel_pasos/configurar-empresa.json')  as unknown as Promise<{ default: MisionPaso[] }>,
}

// Pasos: lazy-loaded solo cuando el usuario activa esa misión
export async function getMisionConPasos(misionId: string): Promise<MisionConPasos> {
    const loader = PASOS_LOADERS[misionId]
    if (!loader) throw new Error(`Misión desconocida: ${misionId}`)

    const [misiones, pasosMod] = await Promise.all([getMisiones(), loader()])
    const meta = misiones.find(m => m.id === misionId)
    if (!meta) throw new Error(`Meta no encontrada: ${misionId}`)

    return { ...meta, pasos: pasosMod.default }
}

// Progreso del usuario: tabla muy pequeña (1 fila por misión por usuario)
export async function getProgreso(userId: string, empresaId: string): Promise<ProgresoMision[]> {
    const { data } = await supabase
        .from('sentinel_progreso')
        .select('mision_id, completada, paso_actual')
        .eq('user_id', userId)
        .eq('empresa_id', empresaId)
    return (data ?? []) as ProgresoMision[]
}

export async function upsertProgreso(
    userId: string,
    empresaId: string,
    misionId: string,
    completada: boolean,
    pasoActual: number
): Promise<void> {
    await supabase
        .from('sentinel_progreso')
        .upsert(
            { user_id: userId, empresa_id: empresaId, mision_id: misionId, completada, paso_actual: pasoActual },
            { onConflict: 'user_id,empresa_id,mision_id' }
        )
}
