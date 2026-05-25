import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Building2, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://websitebillennium-k4qc-ernesteguezs-projects.vercel.app'

function SinEmpresasAsignadas() {
    const { signOut, user } = useAuth()
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Building2 className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Sin empresas asignadas</h2>
            <p className="text-slate-500 max-w-sm mb-2">
                Tu usuario no tiene acceso a ninguna empresa en Ledger Pro.
            </p>
            <p className="text-slate-400 text-sm mb-6">
                Contacta al administrador para que te asigne las empresas que debes gestionar.
            </p>
            {user?.email && (
                <p className="text-xs text-slate-400 mb-6">
                    Sesión activa: <span className="font-medium">{user.email}</span>
                </p>
            )}
            <button
                onClick={signOut}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
            >
                <LogOut className="w-4 h-4" />
                Volver al portal
            </button>
        </div>
    )
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading, empresaActiva, empresas } = useAuth()
    const location = useLocation()

    if (loading) return null

    if (!user) {
        window.location.replace(PORTAL_URL)
        return null
    }

    // Usuario autenticado pero sin empresas asignadas en LP
    if (empresas.length === 0) {
        return <SinEmpresasAsignadas />
    }

    // Usuario con empresas pero sin haber elegido una todavía → selector
    if (!empresaActiva && location.pathname !== '/seleccionar-empresa') {
        return <Navigate to="/seleccionar-empresa" replace />
    }

    return <>{children}</>
}
