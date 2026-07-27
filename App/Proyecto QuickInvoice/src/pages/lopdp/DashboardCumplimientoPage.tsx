import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    ShieldCheck, UserCog, Building2, AlertOctagon, Globe,
    AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { dashboardCumplimientoService } from '../../services/lopdp/dashboardCumplimientoService'
import { LOPDP_POLITICA_DESACTUALIZADA_MESES, type DashboardCumplimiento } from '../../types/lopdp'
import { HelpButton } from '../../components/help/HelpButton'

type EstadoPolitica = 'nunca_publicada' | 'desactualizada' | 'publicada'

function estadoPolitica(ultimaPublicacion: string | null): EstadoPolitica {
    if (!ultimaPublicacion) return 'nunca_publicada'
    const limite = new Date()
    limite.setMonth(limite.getMonth() - LOPDP_POLITICA_DESACTUALIZADA_MESES)
    return new Date(ultimaPublicacion) < limite ? 'desactualizada' : 'publicada'
}

interface TileProps {
    icon: React.ElementType
    color: string
    titulo: string
    valor: string
    detalle: string
    alerta?: boolean
    onClick?: () => void
}

function Tile({ icon: Icon, color, titulo, valor, detalle, alerta, onClick }: TileProps) {
    return (
        <button onClick={onClick} className={`card p-5 text-left w-full transition-shadow hover:shadow-md ${alerta ? 'border-amber-200 bg-amber-50/40' : ''}`}>
            <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                    <Icon className="w-5 h-5" />
                </div>
                {alerta && <AlertTriangle className="w-4 h-4 text-amber-500" />}
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-3">{valor}</p>
            <p className="text-sm font-semibold text-slate-700">{titulo}</p>
            <p className="text-xs text-slate-500 mt-0.5">{detalle}</p>
        </button>
    )
}

export function DashboardCumplimientoPage() {
    const { empresa } = useAuth()
    const navigate = useNavigate()
    const [resumen, setResumen] = useState<DashboardCumplimiento | null>(null)
    const [loading, setLoading] = useState(true)

    const mountedRef = useRef(true)
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        let cancelled = false
        setLoading(true)
        dashboardCumplimientoService.obtenerResumen(eid)
            .then(data => { if (!cancelled && mountedRef.current) setResumen(data) })
            .catch(() => {})
            .finally(() => { if (!cancelled && mountedRef.current) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id])

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-slate-400">
            Cargando panel de cumplimiento...
        </div>
    )

    if (!resumen) return (
        <div className="text-center py-16 text-slate-400">
            No se pudo cargar el panel de cumplimiento.
        </div>
    )

    const ratPct = resumen.rat.total > 0 ? Math.round((resumen.rat.completas / resumen.rat.total) * 100) : 0
    const estPol = estadoPolitica(resumen.politica_ultima_publicacion)
    const politicaLabel: Record<EstadoPolitica, string> = {
        nunca_publicada: 'Nunca publicada',
        desactualizada: `Desactualizada (+${LOPDP_POLITICA_DESACTUALIZADA_MESES} meses)`,
        publicada: 'Publicada y vigente',
    }
    const politicaDetalle = resumen.politica_ultima_publicacion
        ? `Última publicación: ${new Date(resumen.politica_ultima_publicacion).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })}`
        : 'Configúrala en la sección Política de Privacidad'

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Panel de Cumplimiento LOPDP</h1>
                    <p className="text-slate-500 text-sm">Vista consolidada del estado de cumplimiento de tu empresa</p>
                </div>
                <HelpButton pageKey="lopdp-dashboard" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <Tile
                    icon={ShieldCheck} color="bg-emerald-100 text-emerald-600"
                    titulo="Registro de Actividades (RAT)"
                    valor={`${ratPct}%`}
                    detalle={`${resumen.rat.completas} de ${resumen.rat.total} actividades completas`}
                    alerta={ratPct < 100 && resumen.rat.total > 0}
                    onClick={() => navigate('/lopdp/rat')}
                />
                <Tile
                    icon={UserCog} color="bg-blue-100 text-blue-600"
                    titulo="Solicitudes ARCO-POL"
                    valor={String(resumen.solicitudes.abiertas)}
                    detalle={`${resumen.solicitudes.por_vencer} por vencer · ${resumen.solicitudes.vencidas} vencidas`}
                    alerta={resumen.solicitudes.por_vencer > 0 || resumen.solicitudes.vencidas > 0}
                    onClick={() => navigate('/lopdp/solicitudes')}
                />
                <Tile
                    icon={Building2} color="bg-violet-100 text-violet-600"
                    titulo="Encargados de Tratamiento"
                    valor={String(resumen.encargados.sin_contrato_vigente)}
                    detalle={`sin contrato/DPA vigente de ${resumen.encargados.total} registrados`}
                    alerta={resumen.encargados.sin_contrato_vigente > 0}
                    onClick={() => navigate('/lopdp/encargados')}
                />
                <Tile
                    icon={AlertOctagon} color="bg-red-100 text-red-600"
                    titulo="Brechas de Seguridad"
                    valor={String(resumen.brechas.abiertas)}
                    detalle={`abiertas · ${resumen.brechas.vencidas} vencidas sin notificar`}
                    alerta={resumen.brechas.abiertas > 0 || resumen.brechas.vencidas > 0}
                    onClick={() => navigate('/lopdp/brechas')}
                />
                <Tile
                    icon={Globe} color={estPol === 'publicada' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}
                    titulo="Política de Privacidad"
                    valor={politicaLabel[estPol]}
                    detalle={politicaDetalle}
                    alerta={estPol !== 'publicada'}
                    onClick={() => navigate('/lopdp/politica-privacidad')}
                />
            </div>

            <div className="card p-5 flex items-start gap-3 bg-slate-50">
                {resumen.solicitudes.vencidas === 0 && resumen.brechas.vencidas === 0 && resumen.encargados.sin_contrato_vigente === 0 && estPol === 'publicada' && ratPct === 100 ? (
                    <><CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" /><p className="text-sm text-slate-600">Todo al día — sin pendientes críticos de cumplimiento LOPDP en este momento.</p></>
                ) : (
                    <><Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" /><p className="text-sm text-slate-600">Revisa las tarjetas marcadas en ámbar — tienen algo que requiere tu atención.</p></>
                )}
            </div>
        </div>
    )
}
