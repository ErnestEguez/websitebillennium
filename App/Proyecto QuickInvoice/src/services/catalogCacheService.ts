// Stale-while-revalidate catalog cache for clientes and productos
// TTL: clientes 15 min, productos 45 min
// All data is scoped by empresa_id

import { supabase } from '../lib/supabase'
import { offlineDb } from '../lib/offlineDb'
import { getNetworkStatus } from '../lib/networkStatus'

const TTL_CLIENTES = 15    // minutes
const TTL_PRODUCTOS = 45   // minutes

async function fetchClientes(empresaId: string): Promise<any[]> {
    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nombre', { ascending: true })
    if (error) throw error
    return data ?? []
}

async function fetchProductos(empresaId: string): Promise<any[]> {
    const { data, error } = await supabase
        .from('productos')
        .select('*, subproductos(*)')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre')
    if (error) throw error
    return data ?? []
}

function backgroundRefresh(
    store: 'catalog_clientes' | 'catalog_productos',
    fetcher: () => Promise<any[]>,
    empresaId: string,
    ttl: number
) {
    fetcher()
        .then(items => offlineDb.saveCatalog(store, items, empresaId, ttl))
        .catch(() => { /* silent — stale cache remains */ })
}

export const catalogCacheService = {

    async getClientes(empresaId: string): Promise<any[]> {
        const { items, expiresAt } = await offlineDb.getCatalog<any>('catalog_clientes', empresaId)
        const expired = !expiresAt || Date.now() > expiresAt
        const online = getNetworkStatus()

        if (items.length > 0 && !expired) {
            // Fresh cache — return immediately, no network needed
            return items
        }

        if (items.length > 0 && expired && !online) {
            // Stale cache, offline — serve stale, user sees data
            return items
        }

        if (online) {
            if (items.length > 0 && expired) {
                // Stale-while-revalidate: return stale immediately, refresh in background
                backgroundRefresh('catalog_clientes', () => fetchClientes(empresaId), empresaId, TTL_CLIENTES)
                return items
            }
            // No cache or first load — fetch synchronously and cache
            try {
                const fresh = await fetchClientes(empresaId)
                await offlineDb.saveCatalog('catalog_clientes', fresh, empresaId, TTL_CLIENTES)
                return fresh
            } catch {
                return items // fallback to whatever we have
            }
        }

        // No cache, offline
        return []
    },

    async getProductos(empresaId: string): Promise<any[]> {
        const { items, expiresAt } = await offlineDb.getCatalog<any>('catalog_productos', empresaId)
        const expired = !expiresAt || Date.now() > expiresAt
        const online = getNetworkStatus()

        if (items.length > 0 && !expired) {
            return items
        }

        if (items.length > 0 && expired && !online) {
            return items
        }

        if (online) {
            if (items.length > 0 && expired) {
                backgroundRefresh('catalog_productos', () => fetchProductos(empresaId), empresaId, TTL_PRODUCTOS)
                return items
            }
            try {
                const fresh = await fetchProductos(empresaId)
                await offlineDb.saveCatalog('catalog_productos', fresh, empresaId, TTL_PRODUCTOS)
                return fresh
            } catch {
                return items
            }
        }

        return []
    },

    // Force-refresh from Supabase and update cache (for "Forzar actualización" button)
    async forceRefreshClientes(empresaId: string): Promise<any[]> {
        const fresh = await fetchClientes(empresaId)
        await offlineDb.saveCatalog('catalog_clientes', fresh, empresaId, TTL_CLIENTES)
        return fresh
    },

    async forceRefreshProductos(empresaId: string): Promise<any[]> {
        const fresh = await fetchProductos(empresaId)
        await offlineDb.saveCatalog('catalog_productos', fresh, empresaId, TTL_PRODUCTOS)
        return fresh
    },
}
