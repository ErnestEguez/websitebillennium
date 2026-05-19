import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { sriService } from '../services/sriService'
import { facturacionService } from '../services/facturacionService'
import type { SriConfig } from '../services/facturacionService'
import type { Comprobante } from '../services/sriService'
import { supabase } from '../lib/supabase'
import { formatCurrency, cn } from '../lib/utils'
import {
    FileText,
    Send,
    CheckCircle2,
    XCircle,
    Clock,
    Search,
    Settings2,
    X,
    Save,
    Shield,
    Key,
    RotateCw,
    Printer,
    Mail
} from 'lucide-react'
import { format } from 'date-fns'

import { useAuth } from '../contexts/AuthContext'

export function InvoicingPage() {
    const { empresa } = useAuth()
    const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
    const [sriConfig, setSriConfig] = useState<Partial<SriConfig>>({})
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [showDiagnostic, setShowDiagnostic] = useState(false)
    const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA')) // YYYY-MM-DD

    useEffect(() => {
        if (empresa?.id) {
            loadData()
        }
    }, [empresa?.id, selectedDate])

    async function loadData() {
        try {
            setLoading(true)
            const [docsData, configData] = await Promise.all([
                sriService.getComprobantes(empresa!.id, selectedDate),
                facturacionService.getSriConfig(empresa!.id)
            ])
            setComprobantes(docsData)
            setSriConfig(configData)
        } catch (error) {
            console.error('Error loading invoicing data:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSaveConfig(e: React.FormEvent) {
        e.preventDefault()
        try {
            setLoading(true)

            let firmaUrl = sriConfig.firma_url || null
            if (selectedFile) {
                try {
                    firmaUrl = await sriService.uploadFirma(empresa!.id, selectedFile)
                } catch (uploadError: any) {
                    console.error('Error uploading signature:', uploadError)
                    alert(`Error al subir la firma: ${uploadError.message || 'Verifique que el bucket "firmas_electronicas" exista.'}`)
                    return
                }
            }

            await facturacionService.updateSriConfig(empresa!.id, {
                ...sriConfig,
                firma_url: firmaUrl,
                firma_path: firmaUrl // La Edge Function usa firma_path
            })

            setIsConfigModalOpen(false)
            alert('Configuración SRI actualizada correctamente')
            loadData()
        } catch (error) {
            console.error('Error updating SRI config:', error)
            alert('Error al actualizar la configuración')
        } finally {
            setLoading(false)
        }
    }

    const filtered = comprobantes.filter(c =>
        c.secuencial.includes(search) ||
        c.cliente_nombre.toLowerCase().includes(search.toLowerCase())
    )

    const statusIcons = {
        PENDIENTE: <Clock className="w-4 h-4 text-slate-400" />,
        ENVIADO: <Send className="w-4 h-4 text-orange-500" />,
        AUTORIZADO: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        RECHAZADO: <XCircle className="w-4 h-4 text-red-500" />
    }

    const statusColors = {
        PENDIENTE: "bg-slate-100 text-slate-600",
        ENVIADO: "bg-orange-100 text-orange-700",
        AUTORIZADO: "bg-emerald-100 text-emerald-700",
        RECHAZADO: "bg-red-100 text-red-700"
    }

    if (loading) return <div className="p-12 text-center text-slate-500">Cargando facturación...</div>

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Facturación Electrónica</h1>
                    <p className="text-slate-500">Gestión de documentos autorizados por el SRI</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsConfigModalOpen(true)}
                        className="btn bg-white border border-slate-200 text-slate-600 gap-2 hover:bg-slate-50 transition-colors"
                    >
                        <Settings2 className="w-4 h-4" />
                        Configurar SRI
                    </button>
                    <button
                        onClick={() => setShowDiagnostic(!showDiagnostic)}
                        className={cn(
                            "btn gap-2 transition-all",
                            showDiagnostic ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-primary-300 hover:text-primary-600 shadow-sm"
                        )}
                    >
                        {showDiagnostic ? <XCircle className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        {showDiagnostic ? 'Ocultar Diagnóstico' : 'Panel Técnico'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Autorizados', count: comprobantes.filter(c => c.estado_sri === 'AUTORIZADO').length, color: 'text-emerald-600' },
                    { label: 'Pendientes', count: comprobantes.filter(c => c.estado_sri === 'PENDIENTE').length, color: 'text-slate-600' },
                    { label: 'Enviados', count: comprobantes.filter(c => c.estado_sri === 'ENVIADO').length, color: 'text-orange-600' },
                    { label: 'Rechazados', count: comprobantes.filter(c => c.estado_sri === 'RECHAZADO').length, color: 'text-red-600' },
                ].map((stat) => (
                    <div key={stat.label} className="card p-4 transition-all hover:shadow-md">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                        <p className={cn("text-2xl font-black mt-1", stat.color)}>{stat.count}</p>
                    </div>
                ))}
            </div>

            <div className="card shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 bg-white">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por secuencial o cliente..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase">Fecha:</span>
                        <input
                            type="date"
                            className="px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                <th className="px-6 py-4">Secuencial</th>
                                <th className="px-6 py-4">Cliente</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4 text-right">Total</th>
                                <th className="px-6 py-4 text-center">Estado SRI</th>
                                <th className="px-6 py-4">Observaciones / Error</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {filtered.map((doc) => (
                                <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4 font-mono text-sm font-bold text-slate-900">
                                        {doc.secuencial}
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-medium text-slate-900 line-clamp-1">{doc.cliente_nombre}</p>
                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">{doc.tipo_comprobante}</p>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                                        {format(new Date(doc.fecha), 'dd/MM/yyyy HH:mm')}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                                        {formatCurrency(doc.total)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex flex-col">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium w-fit flex items-center gap-1 ${statusColors[doc.estado_sri as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}`}>
                                                {statusIcons[doc.estado_sri as keyof typeof statusIcons] || <Clock className="w-3 h-3" />}
                                                {doc.estado_sri}
                                            </span>
                                            {doc.autorizacion_numero && (
                                                <span className="text-[9px] text-gray-500 mt-1 font-mono break-all max-w-[150px]">
                                                    {doc.autorizacion_numero}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {doc.observaciones_sri ? (
                                            <p className={`text-[11px] max-w-md leading-snug ${doc.estado_sri === 'AUTORIZADO' ? 'text-green-600' : 'text-red-500'}`} title={doc.observaciones_sri}>
                                                {doc.observaciones_sri}
                                            </p>
                                        ) : (
                                            <span className="text-gray-400 text-[11px]">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {doc.estado_sri !== 'AUTORIZADO' && (
                                                <button
                                                    onClick={async () => {
                                                        setLoading(true);
                                                        try {
                                                            const { data, error } = await (supabase as any).functions.invoke('sri-signer', {
                                                                body: { comprobante_id: doc.id }
                                                            });
                                                            if (error) throw error;
                                                            if (data.authorized) {
                                                                alert('¡Factura AUTORIZADA correctamente!');
                                                            } else if (data.estado_sri === 'ENVIADO') {
                                                                alert('El SRI aún está procesando el documento. Intente consultar el estado en unos minutos.');
                                                            } else {
                                                                alert('Aún no autorizado: ' + (data.message || 'Sin mensaje'));
                                                            }
                                                        } catch (e: any) {
                                                            alert('Error de conexión: ' + e.message);
                                                        } finally {
                                                            setLoading(false);
                                                            loadData();
                                                        }
                                                    }}
                                                    title="Reintentar / Consultar SRI"
                                                    className="p-2 hover:bg-orange-50 rounded-lg text-orange-600 transition-colors"
                                                >
                                                    <RotateCw className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await navigator.clipboard.writeText(doc.clave_acceso || '');
                                                        const newState = await sriService.consultarEstadoComprobante(doc.id);
                                                        loadData();

                                                        // Abrir portal directamente (como pidió el usuario)
                                                        window.open('https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/publico/consultas/consultaComprobanteLibre.jsf', '_blank');

                                                        alert(`Clave de acceso copiada al portapapeles.\nEstado actualizado: ${newState}`);
                                                    } catch (e: any) {
                                                        alert('Error: ' + e.message);
                                                    }
                                                }}
                                                title="Ir a Portal SRI Oficial / Copiar Clave"
                                                className="p-2 hover:bg-primary-50 rounded-lg text-primary-600 transition-colors"
                                            >
                                                <Search className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => sriService.descargarXml(doc.id, doc.secuencial)}
                                                title="Descargar XML"
                                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600 transition-colors"
                                            >
                                                <Key className="w-4 h-4" />
                                            </button>
                                            <Link to={`/comprobante/${doc.id}/print`} title="Ver RIDE PDF" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600 transition-colors">
                                                <FileText className="w-4 h-4" />
                                            </Link>
                                            <Link to={`/comprobante/${doc.id}/ticket?auto=true`} title="Imprimir Ticket" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600 transition-colors">
                                                <Printer className="w-4 h-4" />
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* PANEL DE DIAGNÓSTICO (Oculto por defecto) */}
            {showDiagnostic && (
                <div className="card bg-slate-900 text-slate-300 border-2 border-primary-500/50 p-6 animate-in fade-in slide-in-from-top-4 duration-300">
                    <h3 className="text-xs font-black text-white mb-4 flex items-center gap-2 uppercase tracking-widest">
                        <Shield className="w-4 h-4 text-primary-400" />
                        Panel de Diagnóstico - Datos en Base de Datos
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[11px] font-mono">
                        <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-white/5">
                            <div className="flex justify-between border-b border-white/5 pb-1">
                                <span className="text-slate-500">Ruta Firma (firma_path):</span>
                                <span className="text-primary-400">{sriConfig.firma_path || 'VACIO'}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-1">
                                <span className="text-slate-500">Ambiente Activo:</span>
                                <span className={sriConfig.ambiente === 'PRODUCCION' ? 'text-emerald-400' : 'text-blue-400'}>{sriConfig.ambiente || 'PRUEBAS'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Establecimiento:</span>
                                <span className="text-white">{sriConfig.establecimiento || '---'}</span>
                            </div>
                        </div>
                        <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-white/5">
                            <div className="flex justify-between border-b border-white/5 pb-1">
                                <span className="text-slate-500">Password en DB:</span>
                                <span className="text-emerald-400 font-bold">{sriConfig.firma_password || 'VACÍO'}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-1">
                                <span className="text-slate-500">ID Empresa:</span>
                                <span className="text-slate-400 truncate ml-4" title={empresa?.id}>{empresa?.id}</span>
                            </div>
                            <p className="text-[9px] text-slate-500 italic mt-2">
                                * El SRI reportó firma inválida. Esto suele ser por contraseña incorrecta o archivo de tipo equivocado.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE CONFIGURACIÓN RESTAURADO COMPLETAMENTE */}
            {isConfigModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary-100 text-primary-600 rounded-lg">
                                    <Settings2 className="w-5 h-5" />
                                </div>
                                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Configuración SRI</h2>
                            </div>
                            <button onClick={() => setIsConfigModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveConfig} className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Ambiente</label>
                                    <select
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none font-bold text-sm bg-slate-50"
                                        value={sriConfig.ambiente}
                                        onChange={e => setSriConfig({ ...sriConfig, ambiente: e.target.value as any })}
                                    >
                                        <option value="PRUEBAS">PRUEBAS (Modo Test)</option>
                                        <option value="PRODUCCION">PRODUCCIÓN (SRI Real)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Obligado Contabilidad</label>
                                    <select
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none font-bold text-sm bg-slate-50"
                                        value={sriConfig.obligado_contabilidad || 'NO'}
                                        onChange={e => setSriConfig(prev => ({ ...prev, obligado_contabilidad: e.target.value as 'SI' | 'NO' }))}
                                    >
                                        <option value="NO">NO</option>
                                        <option value="SI">SI</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Secuencial Inicio</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm font-mono"
                                        value={sriConfig.secuencial_inicio || ''}
                                        onChange={e => setSriConfig({ ...sriConfig, secuencial_inicio: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Establecimiento (3 dígitos)</label>
                                    <input
                                        type="text"
                                        maxLength={3}
                                        placeholder="001"
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm font-mono"
                                        value={sriConfig.establecimiento || ''}
                                        onChange={e => setSriConfig({ ...sriConfig, establecimiento: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Punto Emisión (3 dígitos)</label>
                                    <input
                                        type="text"
                                        maxLength={3}
                                        placeholder="001"
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm font-mono"
                                        value={sriConfig.punto_emision || ''}
                                        onChange={e => setSriConfig({ ...sriConfig, punto_emision: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <Key className="w-4 h-4 text-emerald-500" />
                                    Firma Electrónica (.p12)
                                </h3>
                                <div className="space-y-4">
                                    {sriConfig.firma_path && (
                                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-700 text-xs font-bold flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Firma configurada actualmente
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept=".p12"
                                        onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                                        className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
                                    />
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Contraseña de la Firma</label>
                                        <input
                                            type="password"
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                            value={sriConfig.firma_password || ''}
                                            onChange={e => setSriConfig({ ...sriConfig, firma_password: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-blue-500" />
                                    Servidor de Correo (Notificaciones)
                                </h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Servidor SMTP</label>
                                        <input
                                            type="text"
                                            placeholder="smtp.resend.com"
                                            className="w-full px-3 py-2 rounded border border-slate-200 text-xs outline-none"
                                            value={sriConfig.mail_host || ''}
                                            onChange={e => setSriConfig({ ...sriConfig, mail_host: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Puerto</label>
                                        <input
                                            type="number"
                                            placeholder="587"
                                            className="w-full px-3 py-2 rounded border border-slate-200 text-xs outline-none"
                                            value={sriConfig.mail_port || 587}
                                            onChange={e => setSriConfig({ ...sriConfig, mail_port: parseInt(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Usuario / Email</label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 rounded border border-slate-200 text-xs outline-none"
                                            value={sriConfig.mail_user || ''}
                                            onChange={e => setSriConfig({ ...sriConfig, mail_user: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Password SMTP</label>
                                        <input
                                            type="password"
                                            className="w-full px-3 py-2 rounded border border-slate-200 text-xs outline-none"
                                            value={sriConfig.mail_pass || ''}
                                            onChange={e => setSriConfig({ ...sriConfig, mail_pass: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 flex gap-4 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsConfigModalOpen(false)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-colors"
                                >
                                    Cerrar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-primary-600 text-white rounded-xl px-4 py-3 font-black text-xs uppercase tracking-widest hover:bg-primary-700 shadow-xl shadow-primary-200 flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <Save className="w-4 h-4" />
                                    Guardar Cambios
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
