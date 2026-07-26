import { ShieldCheck, Mail, MapPin, Building2 } from 'lucide-react'
import type { PoliticaPrivacidadContenido } from '../../types/lopdp'

interface Props {
    contenido:         PoliticaPrivacidadContenido
    numeroVersion?:    number
    fechaPublicacion?: string
    esVistaPrevia?:    boolean
}

// Render puro compartido entre la vista previa interna (/lopdp/politica-privacidad)
// y la página pública (/p/:slug) — un solo lugar que define cómo se ve el
// documento, para que la vista previa sea fiel a lo que verá el público.
export function PoliticaPrivacidadDocumento({ contenido, numeroVersion, fechaPublicacion, esVistaPrevia }: Props) {
    const c = contenido

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {esVistaPrevia && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-4 py-2 rounded-xl text-center">
                    Vista previa — así se vería la página pública si publicas ahora. Esto todavía no está publicado.
                </div>
            )}

            <div className="card p-6 space-y-1 border-l-4 border-l-primary-600">
                <p className="text-xs font-bold uppercase tracking-widest text-primary-600">Responsable del tratamiento</p>
                <h1 className="text-2xl font-black text-slate-900">{c.razon_social || c.nombre_comercial}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 pt-1">
                    {c.ruc && <span>RUC: {c.ruc}</span>}
                    {c.direccion && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {c.direccion}</span>}
                </div>
            </div>

            <div className="card p-6 space-y-2">
                <h2 className="font-bold text-slate-900">Finalidades del tratamiento de datos</h2>
                {c.finalidades_tratamiento?.length ? (
                    <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                        {c.finalidades_tratamiento.map(f => <li key={f}>{f}</li>)}
                    </ul>
                ) : <p className="text-sm text-slate-400 italic">Sin finalidades registradas.</p>}
            </div>

            <div className="card p-6 space-y-2">
                <h2 className="font-bold text-slate-900">Plazo de conservación</h2>
                <p className="text-sm text-slate-600">{c.plazo_conservacion || 'No especificado.'}</p>
            </div>

            <div className="card p-6 space-y-2">
                <h2 className="font-bold text-slate-900">Delegado de Protección de Datos (DPD)</h2>
                {c.tiene_dpd ? (
                    <p className="text-sm text-slate-600">{c.dpd_nombre} — {c.dpd_contacto}</p>
                ) : (
                    <p className="text-sm text-slate-400 italic">Esta empresa no ha designado un DPD.</p>
                )}
            </div>

            <div className="card p-6 space-y-3">
                <h2 className="font-bold text-slate-900">Encargados de tratamiento</h2>
                <p className="text-xs text-slate-500">Terceros que procesan datos en nombre del responsable, bajo sus instrucciones:</p>
                <div className="space-y-2">
                    {c.encargados_terceros?.map((e, i) => (
                        <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl px-4 py-3">
                            {e.fijo
                                ? <ShieldCheck className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />
                                : <Building2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
                            <div>
                                <p className="text-sm font-semibold text-slate-700">{e.nombre}</p>
                                <p className="text-xs text-slate-500">{e.tipo}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-slate-400 pt-1">
                    QuickInvoice / Billennium System actúa únicamente como encargado de tratamiento (proveedor de la plataforma tecnológica) — nunca como responsable de los datos aquí descritos.
                </p>
            </div>

            <div className="card p-6 space-y-2">
                <h2 className="font-bold text-slate-900">Ejercer tus derechos (ARCO-POL)</h2>
                <p className="text-sm text-slate-600">
                    Para ejercer tus derechos de acceso, rectificación, cancelación, oposición, portabilidad o limitación sobre tus datos personales, escribe a:
                </p>
                {c.email_arco_pol && (
                    <p className="text-sm font-semibold text-primary-700 flex items-center gap-1.5">
                        <Mail className="w-4 h-4" /> {c.email_arco_pol}
                    </p>
                )}
                {c.email_contacto && c.email_contacto !== c.email_arco_pol && (
                    <p className="text-xs text-slate-500">Contacto general: {c.email_contacto}</p>
                )}
            </div>

            {(numeroVersion || fechaPublicacion) && (
                <p className="text-center text-xs text-slate-400 pt-2">
                    Versión {numeroVersion ?? '—'}
                    {fechaPublicacion && ` — vigente desde ${new Date(fechaPublicacion).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })}`}
                </p>
            )}
        </div>
    )
}
