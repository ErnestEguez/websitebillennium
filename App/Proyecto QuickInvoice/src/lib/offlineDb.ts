// IndexedDB abstraction for QuickInvoice offline support
// All records are scoped by empresa_id to prevent multi-tenant data leaks

const DB_NAME = 'quickinvoice_offline'
const DB_VERSION = 1

let _dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
    if (_dbPromise) return _dbPromise
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)

        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result

            if (!db.objectStoreNames.contains('catalog_clientes')) {
                const s = db.createObjectStore('catalog_clientes', { keyPath: '_key' })
                s.createIndex('empresa_id', 'empresa_id', { unique: false })
            }
            if (!db.objectStoreNames.contains('catalog_productos')) {
                const s = db.createObjectStore('catalog_productos', { keyPath: '_key' })
                s.createIndex('empresa_id', 'empresa_id', { unique: false })
            }
            if (!db.objectStoreNames.contains('app_cache')) {
                db.createObjectStore('app_cache', { keyPath: '_key' })
            }
            if (!db.objectStoreNames.contains('sync_queue')) {
                const s = db.createObjectStore('sync_queue', { keyPath: 'id' })
                s.createIndex('empresa_id', 'empresa_id', { unique: false })
                s.createIndex('estado', 'estado', { unique: false })
            }
        }

        req.onsuccess = () => resolve(req.result)
        req.onerror = () => {
            _dbPromise = null
            reject(req.error)
        }
    })
    return _dbPromise
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

async function idbGet<T>(store: string, key: string): Promise<T | null> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const req = tx.objectStore(store).get(key)
        req.onsuccess = () => resolve((req.result as T) ?? null)
        req.onerror = () => reject(req.error)
    })
}

async function idbPut(store: string, value: object): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(value)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

async function idbDelete(store: string, key: string): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

async function idbGetAllByIndex<T>(store: string, index: string, value: string): Promise<T[]> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const req = tx.objectStore(store).index(index).getAll(value)
        req.onsuccess = () => resolve(req.result ?? [])
        req.onerror = () => reject(req.error)
    })
}

async function idbGetAll<T>(store: string): Promise<T[]> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const req = tx.objectStore(store).getAll()
        req.onsuccess = () => resolve(req.result ?? [])
        req.onerror = () => reject(req.error)
    })
}

// ─── Catalog helpers ─────────────────────────────────────────────────────────

async function saveCatalog(
    storeName: 'catalog_clientes' | 'catalog_productos',
    items: any[],
    empresaId: string,
    ttlMinutes: number
): Promise<void> {
    const db = await openDb()
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)

        // Delete all existing records for this empresa first
        const idx = store.index('empresa_id')
        const cursorReq = idx.openKeyCursor(IDBKeyRange.only(empresaId))
        const keysToDelete: IDBValidKey[] = []

        cursorReq.onsuccess = (ev) => {
            const cursor = (ev.target as IDBRequest<IDBCursor>).result
            if (cursor) {
                keysToDelete.push(cursor.primaryKey)
                cursor.continue()
            } else {
                keysToDelete.forEach(k => store.delete(k))
                items.forEach(item =>
                    store.put({
                        ...item,
                        _key: `${empresaId}:${item.id}`,
                        empresa_id: empresaId,
                        _cache_expires_at: expiresAt,
                    })
                )
            }
        }

        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

async function getCatalog<T>(
    storeName: 'catalog_clientes' | 'catalog_productos',
    empresaId: string
): Promise<{ items: T[]; expiresAt: number | null }> {
    const raw = await idbGetAllByIndex<any>(storeName, 'empresa_id', empresaId)
    if (raw.length === 0) return { items: [], expiresAt: null }
    const expiresAt: number = raw[0]._cache_expires_at ?? null
    const items = raw.map(({ _key, _cache_expires_at, ...rest }: any) => rest as T)
    return { items, expiresAt }
}

// ─── Sync queue ───────────────────────────────────────────────────────────────

export interface SyncQueueItem {
    id: string
    empresa_id: string
    tipo: 'FACTURA_DIRECTA'
    payload: any
    estado: 'pendiente' | 'procesando' | 'error_permanente'
    intentos: number
    ultimo_error: string | null
    created_at: string
    display_cliente: string
    display_total: number
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const offlineDb = {
    // App-level cache (profile, empresa, cajaSesion)
    async getAppCache<T>(key: string): Promise<T | null> {
        const rec = await idbGet<{ _key: string; value: T }>('app_cache', key)
        return rec ? rec.value : null
    },
    async setAppCache(key: string, value: unknown): Promise<void> {
        await idbPut('app_cache', { _key: key, value })
    },

    // Catalog: stale-aware save & read
    saveCatalog,
    getCatalog,

    // Sync queue
    async addToQueue(item: Omit<SyncQueueItem, 'intentos' | 'ultimo_error'>): Promise<void> {
        await idbPut('sync_queue', { ...item, intentos: 0, ultimo_error: null })
    },
    async getQueueByEmpresa(empresaId: string): Promise<SyncQueueItem[]> {
        return idbGetAllByIndex<SyncQueueItem>('sync_queue', 'empresa_id', empresaId)
    },
    async getAllQueue(): Promise<SyncQueueItem[]> {
        return idbGetAll<SyncQueueItem>('sync_queue')
    },
    async updateQueueItem(item: SyncQueueItem): Promise<void> {
        await idbPut('sync_queue', item)
    },
    async removeFromQueue(id: string): Promise<void> {
        await idbDelete('sync_queue', id)
    },

    // Partial cleanup on sign-out: clear catalogs + app_cache for a user
    // Leaves sync_queue intact so unsynced invoices survive sign-out/sign-in
    async clearUserCache(userId: string, empresaId: string): Promise<void> {
        await idbDelete('app_cache', `profile:${userId}`)
        await idbDelete('app_cache', `empresa:${empresaId}`)
        await idbDelete('app_cache', `cajaSesion:${empresaId}`)
    },
}
