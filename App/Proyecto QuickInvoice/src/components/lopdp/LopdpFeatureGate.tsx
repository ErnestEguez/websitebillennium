import { ShieldOff } from 'lucide-react'
import { useLopdpEnabled } from '../../hooks/useLopdpEnabled'

interface Props {
    children: React.ReactNode
}

// Protege /lopdp/* aunque se entre por URL directa: si la empresa no tiene
// el flag lopdp_enabled activo (tabla lopdp.empresas_config), no muestra el
// módulo. El RLS de la base de datos ya bloquea los datos igual, esto es
// solo para dar un mensaje claro en vez de una pantalla en blanco/error.
export function LopdpFeatureGate({ children }: Props) {
    const { enabled, loading } = useLopdpEnabled()

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (!enabled) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                <ShieldOff className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">Este módulo no está habilitado para tu empresa.</p>
                <p className="text-slate-400 text-sm mt-1">Contacta a Billennium si necesitas activarlo.</p>
            </div>
        )
    }

    return <>{children}</>
}
