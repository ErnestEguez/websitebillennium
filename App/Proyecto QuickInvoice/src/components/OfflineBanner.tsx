import { useState, useEffect } from 'react'
import { useNetworkStatus } from '../lib/networkStatus'
import { offlineDb, type SyncQueueItem } from '../lib/offlineDb'
import { useAuth } from '../contexts/AuthContext'
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react'

export function OfflineBanner() {
    const { isOnline } = useNetworkStatus()
    const { empresa } = useAuth()
    const [queue, setQueue] = useState<SyncQueueItem[]>([])

    useEffect(() => {
        if (!empresa?.id) return
        offlineDb.getQueueByEmpresa(empresa.id).then(setQueue).catch(() => {})
    }, [empresa?.id, isOnline])

    const pendientes = queue.filter(i => i.estado === 'pendiente' || i.estado === 'procesando')
    const errores = queue.filter(i => i.estado === 'error_permanente')

    // Nothing to show when online and queue is clean
    if (isOnline && pendientes.length === 0 && errores.length === 0) return null

    if (!isOnline) {
        return (
            <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-bold shadow-lg">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>
                    Sin conexión · Modo offline
                    {pendientes.length > 0 && ` · ${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''} de sincronizar`}
                </span>
            </div>
        )
    }

    if (isOnline && pendientes.length > 0) {
        return (
            <div className="fixed top-0 left-0 right-0 z-[100] bg-blue-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-bold shadow-lg">
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span>Sincronizando {pendientes.length} factura{pendientes.length !== 1 ? 's' : ''} offline...</span>
            </div>
        )
    }

    if (errores.length > 0) {
        return (
            <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-bold shadow-lg">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errores.length} factura{errores.length !== 1 ? 's' : ''} offline con error — revise Facturación</span>
            </div>
        )
    }

    return null
}
