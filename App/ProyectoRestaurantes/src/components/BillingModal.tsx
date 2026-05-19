import { useState, useEffect, useRef } from 'react'
import { facturacionService } from '../services/facturacionService'
import { formatCurrency, cn, validateIdentificacion } from '../lib/utils'
import {
    Search,
    UserPlus,
    X,
    Save,
    CreditCard,
    User,
    Plus,
    Trash2
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useReactToPrint } from 'react-to-print'
import { InvoiceTicketPOS } from './InvoiceTicketPOS'
import { supabase } from '../lib/supabase'
import { Loader2, Search as SearchIcon, Printer, CheckCircle2 } from 'lucide-react'

interface BillingModalProps {
    isOpen: boolean
    onClose: () => void
    pedido: any // El pedido completo si ya existe
    onSuccess: (factura: any) => void
}

export function BillingModal({ isOpen, onClose, pedido, onSuccess }: BillingModalProps) {
    const { empresa, cajaSesion, profile } = useAuth()
    const [clients, setClients] = useState<any[]>([])
    const [searchClient, setSearchClient] = useState('')
    const [selectedClient, setSelectedClient] = useState<any>(null)
    const [invoicePayments, setInvoicePayments] = useState<{ metodo: string, valor: number, referencia: string }[]>([])
    const [isSavingInvoice, setIsSavingInvoice] = useState(false)
    const [isClientFormOpen, setIsClientFormOpen] = useState(false)
    const [newClient, setNewClient] = useState({
        identificacion: '',
        nombre: '',
        email: '',
        direccion: '',
        telefono: ''
    })
    const [isSearchingSRI, setIsSearchingSRI] = useState(false)
    const [facturaFinal, setFacturaFinal] = useState<any>(null)
    const printRef = useRef<HTMLDivElement>(null)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Factura_${facturaFinal?.secuencial || 'POS'}`,
    })

    // Efecto para imprimir automaticamente cuando la factura final esté lista
    useEffect(() => {
        if (facturaFinal) {
            handlePrint()
        }
    }, [facturaFinal])

    useEffect(() => {
        if (isOpen && empresa?.id) {
            loadInitialData()
        }
    }, [isOpen, empresa?.id])

    async function loadInitialData() {
        try {
            const [clientsList, consumidor] = await Promise.all([
                facturacionService.getClientes(empresa!.id),
                facturacionService.getConsumidorFinal(empresa!.id)
            ])
            setClients(clientsList)

            // LÓGICA DE AUTO-IDENTIFICACION PARA PEDIDOS DIVIDIDOS
            if (pedido?.identificacion_cliente_mesa) {
                const found = clientsList.find(c => c.identificacion === pedido.identificacion_cliente_mesa)
                if (found) {
                    setSelectedClient(found)
                } else if (pedido.nombre_cliente_mesa) {
                    // Si no existe pero tenemos datos, sugerir creación abriendo el form
                    setSelectedClient(null)
                    setIsClientFormOpen(true)
                    setNewClient({
                        identificacion: pedido.identificacion_cliente_mesa || '',
                        nombre: pedido.nombre_cliente_mesa || '',
                        email: pedido.email_cliente_mesa || '',
                        direccion: 'S/N',
                        telefono: '0000000000'
                    })
                }
            } else {
                setSelectedClient(consumidor)
            }

            if (pedido) {
                setInvoicePayments([{ metodo: 'efectivo', valor: pedido.total, referencia: '' }])
            }
        } catch (error) {
            console.error('Error loading billing data:', error)
        }
    }

    const handleAddPaymentRow = () => {
        setInvoicePayments([...invoicePayments, { metodo: 'efectivo', valor: 0, referencia: '' }])
    }

    const handleRemovePaymentRow = (index: number) => {
        setInvoicePayments(invoicePayments.filter((_, i) => i !== index))
    }

    const handlePaymentChange = (index: number, field: string, value: any) => {
        const newPayments = [...invoicePayments]
        newPayments[index] = { ...newPayments[index], [field]: value }
        setInvoicePayments(newPayments)
    }

    const totalPagado = invoicePayments.reduce((acc, p) => acc + (Number(p.valor) || 0), 0)

    const handleSaveClient = async () => {
        const id = newClient.identificacion.trim()
        const validation = validateIdentificacion(id)

        if (!validation.isValid) {
            if (!confirm(`La identificación "${id}" no tiene 10 (Cédula) ni 13 (RUC) dígitos. ¿Es un Pasaporte?`)) {
                return
            }
        }

        try {
            setIsSavingInvoice(true)
            const created = await facturacionService.createCliente({
                ...newClient,
                empresa_id: empresa!.id
            })
            setClients([...clients, created])
            setSelectedClient(created)
            setIsClientFormOpen(false)
        } catch (error) {
            alert('Error al guardar cliente')
        } finally {
            setIsSavingInvoice(false)
        }
    }

    const lookupSRI = async () => {
        const id = newClient.identificacion.trim()
        if (!id) return

        const validation = validateIdentificacion(id)
        if (!validation.isValid) {
            const isPassport = confirm(`La identificación "${id}" no tiene 10 (Cédula) ni 13 (RUC) dígitos.\n\n¿Es este un Pasaporte?`)
            if (!isPassport) {
                alert('Por favor, ingrese un documento válido (Cédula 10 dígitos o RUC 13 dígitos).')
                return
            }
        }

        try {
            setIsSearchingSRI(true)
            const { data, error } = await supabase.functions.invoke('sri-lookup', {
                body: { identificacion: id }
            })

            if (error) throw error
            const nombre = data?.nombreCompleto || data?.razonSocial
            if (nombre) {
                setNewClient(prev => ({ ...prev, nombre }))
            } else if (data?.error) {
                alert('No se encontró información para esta identificación en el SRI')
            }
        } catch (err) {
            console.error('Error lookup SRI:', err)
            alert('No se pudo consultar el SRI en este momento')
        } finally {
            setIsSearchingSRI(false)
        }
    }

    const handleExecuteInvoicing = async () => {
        if (!selectedClient) return alert('Seleccione un cliente')
        if (!cajaSesion) return alert('No hay una caja abierta para facturar')

        try {
            setIsSavingInvoice(true)
            const factura = await facturacionService.generarFacturaDesdePedido(pedido, {
                clienteId: selectedClient.id,
                pagos: invoicePayments,
                caja_sesion_id: cajaSesion.id
            })

            // Abrir el formato de ticket en una nueva ventana (comportamiento solicitado)
            window.open(`/comprobante/${factura.id}/ticket?auto=true`, '_blank')

            // Guardar para vista previa y botón de imprimir manual en caso de bloqueo de popup
            const facturaCompleta = await facturacionService.getComprobanteCompleto(factura.id)
            setFacturaFinal(facturaCompleta)
        } catch (error: any) {
            alert('Error al facturar: ' + error.message)
        } finally {
            setIsSavingInvoice(false)
        }
    }

    if (!isOpen) return null

    const filteredClients = clients.filter(c =>
        c.nombre?.toLowerCase().includes(searchClient.toLowerCase()) ||
        c.identificacion?.includes(searchClient)
    )

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl min-h-[600px] flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Panel Izquierdo: Selección de Cliente y Pagos */}
                <div className="flex-1 p-6 space-y-6 border-r border-slate-100 overflow-y-auto max-h-[90vh]">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <CreditCard className="w-6 h-6 text-primary-600" />
                            Facturación
                        </h2>
                        <button onClick={onClose} className="md:hidden p-2 hover:bg-slate-100 rounded-full">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    {/* Selector de Cliente */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-slate-700 flex justify-between items-center">
                            Datos del Cliente
                            {!isClientFormOpen && (
                                <button
                                    onClick={() => setIsClientFormOpen(true)}
                                    className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                >
                                    <UserPlus className="w-4 h-4" />
                                    Nuevo
                                </button>
                            )}
                        </label>

                        {isClientFormOpen ? (
                            <div className="bg-slate-50 p-4 rounded-xl border-2 border-primary-100 space-y-4 animate-in slide-in-from-top-2">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2 relative">
                                        <input
                                            placeholder="Identificación / RUC"
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200 pr-10"
                                            value={newClient.identificacion}
                                            onChange={(e) => setNewClient({ ...newClient, identificacion: e.target.value })}
                                            onBlur={() => {
                                                if (newClient.identificacion.length >= 10 && !newClient.nombre) {
                                                    lookupSRI()
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={lookupSRI}
                                            disabled={isSearchingSRI}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded text-primary-600"
                                            title="Buscar en SRI"
                                        >
                                            {isSearchingSRI ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            placeholder="Nombre / Razón Social"
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200"
                                            value={newClient.nombre}
                                            onChange={(e) => setNewClient({ ...newClient, nombre: e.target.value })}
                                        />
                                    </div>
                                    <input
                                        placeholder="Email"
                                        className="px-4 py-2 rounded-lg border border-slate-200"
                                        value={newClient.email}
                                        onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                                    />
                                    <input
                                        placeholder="Teléfono"
                                        className="px-4 py-2 rounded-lg border border-slate-200"
                                        value={newClient.telefono}
                                        onChange={(e) => setNewClient({ ...newClient, telefono: e.target.value })}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setIsClientFormOpen(false)}
                                        className="flex-1 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold shadow-sm"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSaveClient}
                                        className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold shadow-md shadow-primary-200"
                                    >
                                        Guardar Cliente
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por identificación o nombre..."
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                        value={searchClient}
                                        onChange={(e) => setSearchClient(e.target.value)}
                                    />
                                </div>

                                {searchClient && (
                                    <div className="absolute z-10 w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                                        {filteredClients.map(client => (
                                            <button
                                                key={client.id}
                                                className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0"
                                                onClick={() => {
                                                    setSelectedClient(client)
                                                    setSearchClient('')
                                                }}
                                            >
                                                <div>
                                                    <p className="font-bold text-slate-900">{client.nombre}</p>
                                                    <p className="text-xs text-slate-500">{client.identificacion}</p>
                                                </div>
                                                <User className="w-4 h-4 text-slate-400" />
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {selectedClient && (
                                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Cliente Seleccionado</p>
                                            <p className="font-black text-emerald-900">{selectedClient.nombre}</p>
                                            <p className="text-xs text-emerald-700">{selectedClient.identificacion}</p>
                                        </div>
                                        <button onClick={() => setSelectedClient(null)} className="text-emerald-400 hover:text-emerald-600">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Medios de Pago */}
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-bold text-slate-700">Formas de Pago</label>
                            <button
                                onClick={handleAddPaymentRow}
                                className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm font-bold"
                            >
                                <Plus className="w-4 h-4" />
                                Agregar Pago
                            </button>
                        </div>

                        <div className="space-y-3">
                            {invoicePayments.map((p, i) => (
                                <div key={i} className="flex gap-2 items-start animate-in fade-in slide-in-from-left-2 transition-all">
                                    <select
                                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                        value={p.metodo}
                                        onChange={(e) => handlePaymentChange(i, 'metodo', e.target.value)}
                                    >
                                        <option value="efectivo">Efectivo</option>
                                        <option value="tarjeta">Tarjeta</option>
                                        <option value="transferencia">Transferencia</option>
                                        <option value="otros">Otros</option>
                                    </select>
                                    <div className="flex-1 relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                        <input
                                            type="number"
                                            className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                            value={p.valor}
                                            onChange={(e) => handlePaymentChange(i, 'valor', e.target.value)}
                                        />
                                    </div>
                                    <button
                                        onClick={() => handleRemovePaymentRow(i)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Panel Derecho: Resumen y Acción */}
                <div className="w-full md:w-80 bg-slate-50 p-6 flex flex-col justify-between">
                    <div className="space-y-6">
                        <div className="hidden md:flex justify-between items-center bg-white p-2 rounded-xl mb-4 border border-slate-100">
                            <h3 className="font-black text-slate-700 text-sm">RESUMEN DE CUENTA</h3>
                            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500">Subtotal</span>
                                <span className="font-bold text-slate-700">{formatCurrency(pedido.total / 1.15)}</span>
                            </div>
                            <div className="flex justify-between items-center font-bold">
                                <span className="text-slate-500">IVA (15%)</span>
                                <span className="text-slate-700">{formatCurrency(pedido.total - (pedido.total / 1.15))}</span>
                            </div>
                            <div className="pt-4 border-t-2 border-slate-200/50 flex justify-between items-center">
                                <span className="text-slate-900 font-black">TOTAL</span>
                                <span className="text-2xl font-black text-primary-600">{formatCurrency(pedido.total)}</span>
                            </div>
                        </div>

                        <div className="space-y-3 pt-6">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Recibido</span>
                                <span className="font-bold text-emerald-600">{formatCurrency(totalPagado)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Pendiente</span>
                                <span className={cn(
                                    "font-black",
                                    Math.abs(totalPagado - pedido.total) < 0.01 ? "text-emerald-600" : "text-amber-600"
                                )}>
                                    {formatCurrency(pedido.total - totalPagado)}
                                </span>
                            </div>

                            {totalPagado > pedido.total && (
                                <div className="p-3 bg-primary-50 rounded-xl border border-primary-100 animate-bounce mt-4">
                                    <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest text-center">Cambio a Entregar</p>
                                    <p className="text-xl font-black text-primary-700 text-center">{formatCurrency(totalPagado - pedido.total)}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3 mt-8">
                        {profile?.rol !== 'mesero' ? (
                            <button
                                onClick={handleExecuteInvoicing}
                                disabled={isSavingInvoice || Math.abs(totalPagado - pedido.total) > 0.01 && totalPagado < pedido.total}
                                className="w-full bg-primary-600 text-white rounded-xl py-4 font-bold hover:bg-primary-700 shadow-xl shadow-primary-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
                            >
                                {isSavingInvoice ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Procesando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-5 h-5" />
                                        Generar Factura
                                    </>
                                )}
                            </button>
                        ) : (
                            <div className="w-full bg-slate-100 text-slate-500 rounded-xl px-4 py-4 text-xs font-bold flex items-center justify-center text-center">
                                Solo personal de caja puede emitir facturas
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="w-full py-3 text-slate-500 font-bold hover:text-slate-700"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>

            {/* Vista de Éxito y Previsualización de Impresión */}
            {facturaFinal && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[60] overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-8 animate-in zoom-in-95 duration-300">
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900">¡Factura Generada!</h2>
                            <p className="text-slate-500">El comprobante <strong>{facturaFinal.secuencial}</strong> se ha procesado con éxito.</p>
                        </div>

                        <div className="bg-slate-50 rounded-2xl p-6 flex flex-col items-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Previsualización de Ticket</p>
                            <div className="bg-white shadow-lg p-4 rounded border border-slate-100 max-h-96 overflow-y-auto w-full max-w-[80mm] mx-auto scale-90 origin-top">
                                <InvoiceTicketPOS ref={printRef} factura={facturaFinal} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={handlePrint}
                                className="flex items-center justify-center gap-2 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all"
                            >
                                <Printer className="w-5 h-5" />
                                Re-imprimir
                            </button>
                            <button
                                onClick={() => {
                                    onSuccess(facturaFinal)
                                    onClose()
                                }}
                                className="bg-primary-600 text-white py-4 rounded-2xl font-bold hover:bg-primary-700 shadow-xl shadow-primary-200 transition-all"
                            >
                                Finalizar Cobro
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 text-center italic">
                            Si la ventana de impresión no se abrió automáticamente, use el botón "Re-imprimir".
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
