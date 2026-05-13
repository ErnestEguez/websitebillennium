// Singleton network status with real connectivity verification
// Uses navigator.onLine as fast indicator + Supabase ping to confirm real WAN access

type Listener = (online: boolean) => void

let _isOnline = navigator.onLine
const _listeners = new Set<Listener>()

function notify(online: boolean) {
    _isOnline = online
    _listeners.forEach(fn => fn(online))
}

async function pingSupabase(): Promise<boolean> {
    try {
        const url = import.meta.env.VITE_SUPABASE_URL as string
        if (!url) return false
        // Any HTTP response (200, 400, 401…) means we can reach the server.
        // Only a network-level error (TypeError) means we're truly offline.
        await fetch(`${url}/rest/v1/`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(4000),
        })
        return true
    } catch {
        return false
    }
}

// No startup ping — trust navigator.onLine for initial state.
// A false startup ping was overriding a valid online state.

window.addEventListener('online', () => {
    // Verify real WAN access before announcing we're back online
    pingSupabase().then(real => notify(real))
})

window.addEventListener('offline', () => {
    notify(false)
})

// ─── Public API ───────────────────────────────────────────────────────────────

export function getNetworkStatus(): boolean {
    return _isOnline
}

export function subscribeNetworkStatus(fn: Listener): () => void {
    _listeners.add(fn)
    return () => _listeners.delete(fn)
}

// Returns a Promise that resolves when real connectivity is confirmed
export function waitForConnectivity(): Promise<void> {
    if (_isOnline) return Promise.resolve()
    return new Promise(resolve => {
        const unsub = subscribeNetworkStatus(online => {
            if (online) { unsub(); resolve() }
        })
    })
}

// ─── React hook ──────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'

export function useNetworkStatus(): { isOnline: boolean } {
    const [isOnline, setIsOnline] = useState(_isOnline)

    useEffect(() => {
        return subscribeNetworkStatus(setIsOnline)
    }, [])

    return { isOnline }
}
