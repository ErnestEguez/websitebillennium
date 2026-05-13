import { useRef, useState, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useAuth } from '../contexts/AuthContext';
import { cajaService, type ResumenCierre } from '../services/cajaService';
import { formatCurrency } from '../lib/utils';
import { X, Lock, Printer, AlertTriangle } from 'lucide-react';
import { CierreCajaTicket } from './CierreCajaTicket';

interface CierreCajaModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function CierreCajaModal({ isOpen, onClose, onSuccess }: CierreCajaModalProps) {
    const { empresa, user, cajaSesion } = useAuth();
    const [loading, setLoading] = useState(false);
    const [totales, setTotales] = useState<ResumenCierre | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Referencia para impresión
    const ticketRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        contentRef: ticketRef,
        documentTitle: `Cierre_Caja_${cajaSesion?.id}`,
        onAfterPrint: () => {
            // Forzar logout o recarga para limpiar estado despues de imprimir
            window.location.reload();
        }
    });

    useEffect(() => {
        if (isOpen && cajaSesion) {
            calculateTotals();
        }
    }, [isOpen, cajaSesion]);

    const calculateTotals = async () => {
        try {
            setLoading(true);
            setError(null);
            if (cajaSesion?.id) {
                const results = await cajaService.calcularTotalesSesion(cajaSesion.id);
                setTotales(results);
            }
        } catch (err: any) {
            console.error('Error calculando totales:', err);
            setError('No se pudieron calcular los totales. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    const handleCerrarCaja = async () => {
        if (!cajaSesion?.id || !totales) return;

        if (!window.confirm('¿Está seguro de cerrar su caja? Esta acción no se puede deshacer.')) {
            return;
        }

        try {
            setLoading(true);
            await cajaService.cerrarCaja(cajaSesion.id, totales);



            // Hack para imprimir ticket de cierre
            // Idealmente navegaríamos a una vista de impresión o generaríamos PDF
            // alert('Caja Cerrada Correctamente. Se generará el reporte.');

            if (handlePrint) {
                handlePrint();
            }

            if (onSuccess) onSuccess();
        } catch (err: any) {
            console.error('Error cerrando caja:', err);
            setError(err.message || 'Error al cerrar la caja');
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    if (!cajaSesion) {
        return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full text-center">
                    <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-900">No tienes caja abierta</h3>
                    <p className="text-slate-500 mt-2">No hay una sesión activa para cerrar. ¿Deseas abrir una ahora?</p>
                    <div className="flex gap-2 mt-4">
                        <button onClick={onClose} className="flex-1 py-2 bg-slate-100 rounded-lg font-bold">Cancelar</button>
                        <button
                            onClick={async () => {
                                try {
                                    if (empresa && user) {
                                        await cajaService.abrirCaja(empresa.id, user.id);
                                        window.location.reload();
                                    }
                                } catch (e: any) {
                                    alert(e.message);
                                }
                            }}
                            className="flex-1 py-2 bg-primary-600 text-white rounded-lg font-bold hover:bg-primary-700"
                        >
                            Abrir Caja
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                            <Lock className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Cierre de Caja</h2>
                            <p className="text-xs text-slate-500">Sesión iniciada: {new Date(cajaSesion.fecha_apertura).toLocaleTimeString()}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {loading && !totales ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                        </div>
                    ) : totales ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                                    <span className="text-sm font-medium text-slate-600">Efectivo</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(totales.total_efectivo)}</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                                    <span className="text-sm font-medium text-slate-600">Tarjetas</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(totales.total_tarjetas)}</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                                    <span className="text-sm font-medium text-slate-600">Transferencias</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(totales.total_transferencia)}</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                                    <span className="text-sm font-medium text-slate-600">Otros</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(totales.total_otros)}</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                                <span className="text-lg font-black text-slate-800">TOTAL RECAUDADO</span>
                                <span className="text-xl font-black text-primary-600">
                                    {formatCurrency(
                                        totales.total_efectivo +
                                        totales.total_tarjetas +
                                        totales.total_transferencia +
                                        totales.total_otros
                                    )}
                                </span>
                            </div>
                        </div>
                    ) : null}

                    <div className="pt-4 text-xs text-slate-400 text-center">
                        Al cerrar la caja, se generará un reporte y se cerrará su sesión actual.
                        No podrá volver a facturar hasta abrir un nuevo turno.
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCerrarCaja}
                        disabled={loading || !totales}
                        className="flex-2 bg-red-600 text-white rounded-xl px-6 py-3 font-bold hover:bg-red-700 shadow-xl shadow-red-200 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                    >
                        {loading ? 'Procesando...' : (
                            <>
                                <Printer className="w-4 h-4" />
                                Cerrar e Imprimir
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Componente oculto para impresión */}
            <div className="hidden">
                {cajaSesion && totales && empresa && (
                    <CierreCajaTicket
                        ref={ticketRef}
                        datos={{
                            empresa: {
                                nombre: empresa.nombre || 'Mi Empresa',
                                direccion: (empresa as any).direccion || '',
                                ruc: (empresa as any).ruc || ''
                            },
                            usuario: {
                                nombre: user?.email || 'Cajero', // Idealmente usar profile.nombre
                                rol: 'Cajero'
                            },
                            sesion: {
                                ...cajaSesion,
                                fecha_cierre: new Date().toISOString() // Simulamos cierre para el ticket
                            },
                            totales_calculados: totales
                        }}
                    />
                )}
            </div>
        </div>
    );
}
