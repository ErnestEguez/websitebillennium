// Orchestrates synchronization of the offline queue when connectivity is restored
// Runs sequentially (no parallel processing) to avoid secuencial race conditions

import { useEffect, useRef } from 'react'
import { subscribeNetworkStatus, getNetworkStatus } from '../lib/networkStatus'
import { offlineDb, type SyncQueueItem } from '../lib/offlineDb'
import { facturaDirectaService } from '../services/facturaDirectaService'
import { supabase } from '../lib/supabase'

const MAX_INTENTOS = 3
const PROCESANDO_STALE_MS = 5 * 60 * 1000 // 5 min — reset stuck "procesando" items

async function processQueue() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return // No auth — skip until user logs in

    const all = await offlineDb.getAllQueue()

    // Reset items stuck in "procesando" from a previous crashed session
    const now = Date.now()
    for (const item of all) {
        if (
            item.estado === 'procesando' &&
            new Date(item.created_at).getTime() < now - PROCESANDO_STALE_MS
        ) {
            await offlineDb.updateQueueItem({ ...item, estado: 'pendiente' })
        }
    }

    const pending = all.filter(i => i.estado === 'pendiente')
    if (pending.length === 0) return

    console.log(`[OfflineSync] Processing ${pending.length} pending items`)

    for (const item of pending) {
        if (!getNetworkStatus()) {
            console.log('[OfflineSync] Lost connectivity mid-sync, aborting')
            break
        }

        await offlineDb.updateQueueItem({ ...item, estado: 'procesando' })

        try {
            await syncItem(item)
            await offlineDb.removeFromQueue(item.id)
            console.log(`[OfflineSync] Item ${item.id} synced successfully`)
        } catch (err: any) {
            const intentos = item.intentos + 1
            const estado: SyncQueueItem['estado'] =
                intentos >= MAX_INTENTOS ? 'error_permanente' : 'pendiente'
            await offlineDb.updateQueueItem({
                ...item,
                estado,
                intentos,
                ultimo_error: err?.message ?? 'Error desconocido',
            })
            console.error(`[OfflineSync] Item ${item.id} failed (intento ${intentos}):`, err?.message)
        }
    }
}

async function syncItem(item: SyncQueueItem) {
    if (item.tipo === 'FACTURA_DIRECTA') {
        await facturaDirectaService.generarFacturaDirecta(item.payload)
        return
    }
    throw new Error(`Tipo de sincronización desconocido: ${item.tipo}`)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflineSync() {
    const isSyncing = useRef(false)

    const runSync = async () => {
        if (isSyncing.current || !getNetworkStatus()) return
        isSyncing.current = true
        try {
            await processQueue()
        } finally {
            isSyncing.current = false
        }
    }

    useEffect(() => {
        // Run on mount if already online (app started with connectivity)
        runSync()

        // Run on each reconnection
        const unsub = subscribeNetworkStatus(online => {
            if (online) runSync()
        })

        return unsub
    }, [])
}
