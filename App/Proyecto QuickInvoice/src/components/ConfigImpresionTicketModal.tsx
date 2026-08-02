import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { X, Printer, Save, Loader2, Receipt } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { auditService } from '../services/auditoria/auditService'
import { IMPRESION_POS_DEFAULTS, type SriConfig } from '../services/facturacionService'
import { InvoiceTicketPOS } from './InvoiceTicketPOS'

interface ConfigImpresionTicketModalProps {
    empresaId: string
    empresaNombre: string
    onClose: () => void
}

// Factura de muestra — solo para la vista previa, nunca se guarda ni se envía a ningún lado.
function facturaMuestra(empresaNombre: string, config: SriConfig['impresion_pos']) {
    return {
        secuencial: '001-001-000000123',
        created_at: new Date().toISOString(),
        total: 24.64,
        autorizacion_numero: '1234567890123456789012345678901234567890123456789',
        clave_acceso: '1234567890123456789012345678901234567890123456789',
        ambiente: 'PRUEBAS',
        empresas: { nombre: empresaNombre, ruc: '1790000000001', direccion: 'Av. Ejemplo 123', logo_url: null, config_sri: { impresion_pos: config } },
        clientes: { nombre: 'Cliente de Prueba', identificacion: '9999999999' },
        comprobante_detalles: [
            { id: '1', nombre_producto: 'Producto de ejemplo A', cantidad: 2, subtotal: 10.00, iva_porcentaje: 15, iva_valor: 1.50 },
            { id: '2', nombre_producto: 'Producto de ejemplo B', cantidad: 1, subtotal: 12.14, iva_porcentaje: 15, iva_valor: 1.82 },
        ],
        comprobante_pagos: [
            { metodo_pago: 'efectivo', valor: 24.64, referencia: null },
        ],
    }
}

export function ConfigImpresionTicketModal({ empresaId, empresaNombre, onClose }: ConfigImpresionTicketModalProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [configSriActual, setConfigSriActual] = useState<Record<string, any>>({})
    const [config, setConfig] = useState<Required<NonNullable<SriConfig['impresion_pos']>>>(IMPRESION_POS_DEFAULTS)

    const printRef = useRef<HTMLDivElement>(null)
    const handlePrintPrueba = useReactToPrint({ contentRef: printRef })

    useEffect(() => {
        (async () => {
            setLoading(true)
            const { data } = await supabase.from('empresas').select('config_sri').eq('id', empresaId).single()
            const configSri = data?.config_sri || {}
            setConfigSriActual(configSri)
            setConfig({ ...IMPRESION_POS_DEFAULTS, ...(configSri.impresion_pos || {}) })
            setLoading(false)
        })()
    }, [empresaId])

    async function handleGuardar() {
        setSaving(true)
        try {
            const nuevoConfigSri = { ...configSriActual, impresion_pos: config }
            const { error } = await supabase.from('empresas').update({ config_sri: nuevoConfigSri }).eq('id', empresaId)
            if (error) throw error

            auditService.logEvent({
                empresaId,
                modulo: 'configuracion',
                accion: 'actualizar',
                entidad: 'empresa',
                entidadId: empresaId,
                resumen: `Cambio de configuración de impresión de ticket POS — ${empresaNombre}`,
                detalle: config,
                nivel: 'compliance',
            })

            alert('Configuración de impresión guardada correctamente')
            onClose()
        } catch (e: any) {
            alert(`Error al guardar: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    const muestra = facturaMuestra(empresaNombre, config)

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-6 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-primary-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Configurar impresión de ticket (80mm)</h2>
                            <p className="text-xs text-slate-500">{empresaNombre}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin inline mr-2" />Cargando configuración...
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                        {/* Formulario */}
                        <div className="space-y-4">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Ajustes</p>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Ancho de papel</label>
                                <select
                                    value={config.ancho_papel_mm}
                                    onChange={e => setConfig({ ...config, ancho_papel_mm: Number(e.target.value) })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                >
                                    <option value={80}>80mm</option>
                                    <option value={58}>58mm</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                                    Margen horizontal ({config.margen_horizontal_mm}mm por lado)
                                </label>
                                <input
                                    type="range" min={0} max={10} step={1}
                                    value={config.margen_horizontal_mm}
                                    onChange={e => setConfig({ ...config, margen_horizontal_mm: Number(e.target.value) })}
                                    className="w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                                    Escala ({config.escala_pct}%)
                                </label>
                                <input
                                    type="range" min={80} max={120} step={1}
                                    value={config.escala_pct}
                                    onChange={e => setConfig({ ...config, escala_pct: Number(e.target.value) })}
                                    className="w-full"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">Solo afecta la impresión (Chrome), no la vista previa en pantalla.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                                    Líneas de avance al final ({config.lineas_avance_final})
                                </label>
                                <input
                                    type="range" min={0} max={8} step={1}
                                    value={config.lineas_avance_final}
                                    onChange={e => setConfig({ ...config, lineas_avance_final: Number(e.target.value) })}
                                    className="w-full"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">Útil si la impresora corta el ticket antes de terminar.</p>
                            </div>

                            <button
                                onClick={() => handlePrintPrueba()}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                            >
                                <Printer className="w-4 h-4" /> Imprimir prueba
                            </button>
                        </div>

                        {/* Vista previa */}
                        <div className="bg-slate-50 rounded-2xl p-6 flex flex-col items-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Vista previa</p>
                            <div className="bg-white shadow-lg p-4 rounded border border-slate-100 max-h-[420px] overflow-y-auto w-full max-w-[80mm] mx-auto">
                                <InvoiceTicketPOS ref={printRef} factura={muestra} configOverride={config} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-600 font-semibold hover:bg-slate-100">
                        Cancelar
                    </button>
                    <button
                        onClick={handleGuardar}
                        disabled={saving || loading}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    )
}
