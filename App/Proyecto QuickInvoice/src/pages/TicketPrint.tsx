import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { facturacionService } from '../services/facturacionService'
import { politicaPrivacidadService } from '../services/lopdp/politicaPrivacidadService'
import { puntoEmisionService } from '../services/puntoEmisionService'
import { Printer, ChevronLeft } from 'lucide-react'
import { InvoiceTicketPOS } from '../components/InvoiceTicketPOS'

export function TicketPrint() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [factura, setFactura] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    // Copias configuradas para el punto de emisión de ESTE dispositivo (la
    // impresora física que va a sacar la reimpresión), no la del punto que
    // originalmente emitió la factura.
    const [copiasDispositivo, setCopiasDispositivo] = useState<number | null>(null)
    // LOPDP Fase 4: opcional, nunca bloquea la impresión del ticket.
    const [avisoLopdp, setAvisoLopdp] = useState<string | null>(null)

    useEffect(() => {
        if (id) loadFactura()
    }, [id])

    useEffect(() => {
        const empresaId = factura?.empresas?.id
        if (!empresaId) return
        puntoEmisionService.resolverParaDispositivo(empresaId)
            .then(pe => setCopiasDispositivo(pe?.copias_pos_factura ?? 1))
            .catch(() => setCopiasDispositivo(1))
    }, [factura?.empresas?.id])

    useEffect(() => {
        const empresaId = factura?.empresas?.id
        if (!empresaId) return
        let cancelled = false
        politicaPrivacidadService.obtener(empresaId)
            .then(cfg => {
                if (cancelled || !cfg?.slug || !cfg.aviso_lopdp_corto) return
                const url = `${window.location.origin}/p/${cfg.slug}`
                setAvisoLopdp(`${cfg.aviso_lopdp_corto} ${url}`)
            })
            .catch(() => {})
        return () => { cancelled = true }
    }, [factura?.empresas?.id])

    async function loadFactura() {
        try {
            setLoading(true)
            const data = await facturacionService.getComprobanteCompleto(id!)
            setFactura(data)
        } catch (error) {
            console.error('Error loading ticket:', error)
        } finally {
            setLoading(false)
        }
    }

    // Auto-imprimir (?auto=true) — espera a que se resuelvan las copias del
    // punto de emisión de este dispositivo, para no imprimir de menos/más
    // por una carrera contra ese fetch.
    useEffect(() => {
        if (searchParams.get('auto') !== 'true' || !factura || copiasDispositivo === null) return
        const t = setTimeout(() => window.print(), 800)
        return () => clearTimeout(t)
    }, [factura, copiasDispositivo, searchParams])

    const montoUrl  = parseFloat(searchParams.get('monto')  || '0')
    const vueltoUrl = parseFloat(searchParams.get('vuelto') || '0')

    if (loading) return <div className="p-12 text-center animate-pulse">Generando Ticket...</div>
    if (!factura) return <div className="p-12 text-center text-red-500">No se encontró el comprobante.</div>

    // Copias configuradas para el punto de emisión de este dispositivo — un
    // solo window.print() imprime todas de corrido, separadas por un corte
    // de página para que la impresora térmica las corte entre copia y copia.
    const copias = Math.max(1, copiasDispositivo ?? 1)

    return (
        <div className="min-h-screen bg-slate-100 pb-12 print:bg-white print:pb-0">
            {/* Toolbar */}
            <div className="max-w-[80mm] mx-auto pt-6 px-4 flex justify-between items-center print:hidden mb-6">
                <button onClick={() => navigate(-1)} className="text-slate-600 font-medium flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" /> Volver
                </button>
                <button onClick={() => window.print()} className="bg-primary-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg">
                    <Printer className="w-4 h-4" /> Imprimir {copias > 1 ? `(${copias} copias)` : ''}
                </button>
            </div>

            {Array.from({ length: copias }).map((_, i) => (
                <div key={i} className={i < copias - 1 ? 'break-after-page' : ''}>
                    <InvoiceTicketPOS
                        factura={factura}
                        montoRecibido={montoUrl > 0 ? montoUrl : undefined}
                        vuelto={montoUrl > 0 ? vueltoUrl : undefined}
                        avisoLopdp={avisoLopdp}
                    />
                </div>
            ))}
        </div>
    )
}
