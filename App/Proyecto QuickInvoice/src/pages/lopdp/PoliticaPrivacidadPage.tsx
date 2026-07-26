import { useEffect, useRef, useState } from 'react'
import { Globe, Save, Eye, Upload, X, ExternalLink, History } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { politicaPrivacidadService } from '../../services/lopdp/politicaPrivacidadService'
import {
    ENCARGADO_QUICKINVOICE, FINALIDADES_SUGERIDAS,
    type PoliticaPrivacidad, type PoliticaPrivacidadContenido, type PoliticaPrivacidadVersion,
} from '../../types/lopdp'
import { MultiSelectChips } from '../../components/lopdp/MultiSelectChips'
import { EncargadosTercerosEditor } from '../../components/lopdp/EncargadosTercerosEditor'
import { PoliticaPrivacidadDocumento } from '../../components/lopdp/PoliticaPrivacidadDocumento'
import { HelpButton } from '../../components/help/HelpButton'

const VACIO: Partial<PoliticaPrivacidad> = {
    finalidades_tratamiento: [],
    tiene_dpd: false,
    encargados_terceros: [ENCARGADO_QUICKINVOICE],
}

const PORTAL_PUBLICO_BASE = window.location.origin

export function PoliticaPrivacidadPage() {
    const { empresa, user } = useAuth()
    const [datosEmpresa, setDatosEmpresa] = useState<{ nombre: string; ruc: string; razon_social: string | null; direccion: string | null } | null>(null)
    const [config, setConfig] = useState<Partial<PoliticaPrivacidad>>(VACIO)
    const [versiones, setVersiones] = useState<PoliticaPrivacidadVersion[]>([])
    const [loading, setLoading] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [publicando, setPublicando] = useState(false)
    const [vistaPrevia, setVistaPrevia] = useState(false)
    const [verHistorial, setVerHistorial] = useState<PoliticaPrivacidadVersion | null>(null)
    const [mensaje, setMensaje] = useState('')

    const mountedRef = useRef(true)
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        let cancelled = false
        setLoading(true)
        Promise.all([
            politicaPrivacidadService.obtener(eid),
            politicaPrivacidadService.listarVersiones(eid),
            supabase.from('empresas').select('nombre, ruc, razon_social, direccion').eq('id', eid).single(),
        ]).then(([cfg, vers, { data: emp }]) => {
            if (cancelled || !mountedRef.current) return
            if (cfg) setConfig(cfg)
            setVersiones(vers)
            setDatosEmpresa(emp as any)
        }).catch(() => {})
          .finally(() => { if (!cancelled && mountedRef.current) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id])

    const set = <K extends keyof PoliticaPrivacidad>(campo: K, val: PoliticaPrivacidad[K]) =>
        setConfig(prev => ({ ...prev, [campo]: val }))

    async function handleGuardar() {
        if (!empresa?.id || !user?.id) return
        setMensaje('')
        if (!config.email_arco_pol?.trim()) {
            setMensaje('El email para ejercer derechos ARCO-POL es obligatorio.')
            return
        }
        try {
            setGuardando(true)
            const guardado = await politicaPrivacidadService.guardar(empresa.id, config, user.id)
            setConfig(guardado)
            setMensaje('Borrador guardado. Esto todavía no está publicado públicamente.')
        } catch (e: any) {
            setMensaje('Error: ' + e.message)
        } finally {
            setGuardando(false)
        }
    }

    async function handlePublicar() {
        if (!empresa?.id || !user?.id || !config.slug) return
        if (!confirm('¿Publicar esta política de privacidad? Quedará visible públicamente de inmediato en la URL pública, y esta versión no podrá editarse ni borrarse después.')) return
        try {
            setPublicando(true)
            await politicaPrivacidadService.publicar(empresa.id, user.id)
            const vers = await politicaPrivacidadService.listarVersiones(empresa.id)
            setVersiones(vers)
            setVistaPrevia(false)
            setMensaje('¡Publicado! Ya está visible en la URL pública.')
        } catch (e: any) {
            setMensaje('Error al publicar: ' + e.message)
        } finally {
            setPublicando(false)
        }
    }

    const contenidoVistaPrevia: PoliticaPrivacidadContenido = {
        razon_social:             datosEmpresa?.razon_social || datosEmpresa?.nombre || '',
        nombre_comercial:         datosEmpresa?.nombre || '',
        ruc:                      datosEmpresa?.ruc || '',
        direccion:                datosEmpresa?.direccion,
        finalidades_tratamiento:  config.finalidades_tratamiento ?? [],
        plazo_conservacion:       config.plazo_conservacion,
        tiene_dpd:                !!config.tiene_dpd,
        dpd_nombre:               config.dpd_nombre,
        dpd_contacto:             config.dpd_contacto,
        encargados_terceros:      config.encargados_terceros ?? [ENCARGADO_QUICKINVOICE],
        email_contacto:           config.email_contacto,
        email_arco_pol:           config.email_arco_pol ?? '',
    }

    const urlPublica = config.slug ? `${PORTAL_PUBLICO_BASE}/p/${config.slug}` : null

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-slate-400">
            Cargando política de privacidad...
        </div>
    )

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Política de Privacidad Pública</h1>
                    <p className="text-slate-500 text-sm">Art. 10 LOPDP — transparencia frente a tus clientes, empleados y proveedores</p>
                </div>
                <HelpButton pageKey="lopdp-politica-privacidad" />
            </div>

            {urlPublica && (
                <div className="card p-4 flex items-center justify-between gap-3 bg-primary-50 border-primary-100">
                    <div className="flex items-center gap-2 min-w-0">
                        <Globe className="w-4 h-4 text-primary-600 shrink-0" />
                        <a href={urlPublica} target="_blank" rel="noreferrer" className="text-sm text-primary-700 font-medium truncate hover:underline">
                            {urlPublica}
                        </a>
                    </div>
                    <a href={urlPublica} target="_blank" rel="noreferrer" className="btn btn-secondary text-xs py-1.5 px-3 shrink-0 flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5" /> Abrir
                    </a>
                </div>
            )}

            {/* Datos de la empresa (solo lectura, ya existen en Configuración) */}
            <div className="card p-5 space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Responsable del tratamiento (desde Configuración)</p>
                <p className="font-semibold text-slate-800">{datosEmpresa?.razon_social || datosEmpresa?.nombre}</p>
                <p className="text-sm text-slate-500">RUC: {datosEmpresa?.ruc} {datosEmpresa?.direccion ? `· ${datosEmpresa.direccion}` : ''}</p>
            </div>

            {/* Formulario */}
            <div className="card p-6 space-y-4">
                <MultiSelectChips
                    label="Finalidades del tratamiento"
                    value={config.finalidades_tratamiento ?? []}
                    onChange={v => set('finalidades_tratamiento', v)}
                    sugerencias={FINALIDADES_SUGERIDAS}
                />

                <div>
                    <label className="label">Plazo de conservación</label>
                    <textarea className="input" rows={2} value={config.plazo_conservacion ?? ''}
                        onChange={e => set('plazo_conservacion', e.target.value)}
                        placeholder="Ej. Mientras exista relación comercial, y 7 años más por obligación tributaria" />
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary-600"
                            checked={!!config.tiene_dpd}
                            onChange={e => set('tiene_dpd', e.target.checked)} />
                        <span className="text-sm font-medium text-slate-700">¿Tiene un Delegado de Protección de Datos (DPD) designado?</span>
                    </label>
                    {config.tiene_dpd && (
                        <div className="grid grid-cols-2 gap-3">
                            <input className="input" placeholder="Nombre del DPD" value={config.dpd_nombre ?? ''}
                                onChange={e => set('dpd_nombre', e.target.value)} />
                            <input className="input" placeholder="Contacto del DPD (email/teléfono)" value={config.dpd_contacto ?? ''}
                                onChange={e => set('dpd_contacto', e.target.value)} />
                        </div>
                    )}
                </div>

                <div className="pt-2 border-t border-slate-100">
                    <EncargadosTercerosEditor
                        value={config.encargados_terceros ?? [ENCARGADO_QUICKINVOICE]}
                        onChange={v => set('encargados_terceros', v)}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div>
                        <label className="label">Email para ejercer ARCO-POL <span className="text-red-500">*</span></label>
                        <input className="input" type="email" value={config.email_arco_pol ?? ''}
                            onChange={e => set('email_arco_pol', e.target.value)}
                            placeholder="datos@tuempresa.com" />
                    </div>
                    <div>
                        <label className="label">Email de contacto general</label>
                        <input className="input" type="email" value={config.email_contacto ?? ''}
                            onChange={e => set('email_contacto', e.target.value)}
                            placeholder="Opcional, si es distinto al de arriba" />
                    </div>
                </div>

                {mensaje && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{mensaje}</p>}

                <div className="flex flex-wrap gap-3 justify-end pt-2">
                    <button onClick={() => setVistaPrevia(true)} className="btn btn-secondary flex items-center gap-2">
                        <Eye className="w-4 h-4" /> Vista previa
                    </button>
                    <button onClick={handleGuardar} disabled={guardando} className="btn btn-secondary flex items-center gap-2">
                        <Save className="w-4 h-4" /> {guardando ? 'Guardando...' : 'Guardar borrador'}
                    </button>
                    <button onClick={handlePublicar} disabled={publicando || !config.email_arco_pol} className="btn btn-primary flex items-center gap-2">
                        <Upload className="w-4 h-4" /> {publicando ? 'Publicando...' : 'Publicar'}
                    </button>
                </div>
            </div>

            {/* Historial de versiones (solo lectura) */}
            <div className="card p-6 space-y-3">
                <h2 className="font-bold text-slate-900 flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-400" /> Historial de versiones publicadas
                </h2>
                {versiones.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">Aún no has publicado ninguna versión.</p>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {versiones.map(v => (
                            <div key={v.id} className="flex items-center justify-between py-2.5 text-sm">
                                <div>
                                    <span className="font-semibold text-slate-700">Versión {v.numero_version}</span>
                                    <span className="text-slate-400 ml-2">{new Date(v.fecha_publicacion).toLocaleString('es-EC', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <button onClick={() => setVerHistorial(v)} className="text-primary-600 hover:underline text-xs font-medium">
                                    Ver contenido
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal: vista previa del borrador */}
            {vistaPrevia && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
                        <div className="flex items-center justify-between p-4 border-b border-slate-100">
                            <span className="font-bold text-slate-900">Vista previa</span>
                            <button onClick={() => setVistaPrevia(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <div className="p-6">
                            <PoliticaPrivacidadDocumento contenido={contenidoVistaPrevia} esVistaPrevia />
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: ver contenido de una versión histórica */}
            {verHistorial && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
                        <div className="flex items-center justify-between p-4 border-b border-slate-100">
                            <span className="font-bold text-slate-900">Versión {verHistorial.numero_version} (histórico, solo lectura)</span>
                            <button onClick={() => setVerHistorial(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <div className="p-6">
                            <PoliticaPrivacidadDocumento
                                contenido={verHistorial.contenido}
                                numeroVersion={verHistorial.numero_version}
                                fechaPublicacion={verHistorial.fecha_publicacion}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
