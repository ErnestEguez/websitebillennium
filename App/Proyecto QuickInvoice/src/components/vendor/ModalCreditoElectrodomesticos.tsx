import { useState, useEffect, useMemo } from 'react'
import { X, ChevronRight, ChevronLeft, Search, UserPlus, Loader2, Calculator, CheckCircle2, AlertTriangle } from 'lucide-react'
import { HelpButton } from '../help/HelpButton'
import { supabase } from '../../lib/supabase'
import { facturacionService, type Cliente } from '../../services/facturacionService'
import { cobradorService, type Cobrador } from '../../services/cobradorService'
import {
    creditoElectrodomesticosService,
    CONFIG_CREDITO_DEFAULTS,
    type ConfigCreditoElectrodomesticos,
    type BaseCalculoInteres,
} from '../../services/creditoElectrodomesticosService'
import type { Periodicidad, TipoTasa, ResultadoAmortizacion } from '../../services/creditoElectrodomesticosCalculo'
import { formatCurrency } from '../../lib/utils'

// ============================================================
// Wizard de Crédito Electrodomésticos — modal secundario, NO forma parte
// de FacturaDirectaPage.tsx (Decisión 1 de arquitectura, Fase 0): recibe
// cliente/total ya armados como props de solo lectura, hace su propio
// flujo de 4 pasos internamente, y solo devuelve el resultado al padre.
// Factura no aprende nada nuevo sobre amortización.
// ============================================================

export interface CreditoElectroConfirmado {
    garanteClienteId: string | null
    cobradorId: string
    valorEntrada: number
    metodoEntrada: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque'
    baseCalculoInteres: BaseCalculoInteres
    tipoTasa: TipoTasa
    tasaValor: number
    periodicidad: Periodicidad
    numeroCuotas: number
    fechaPrimerVencimiento: string
    resultado: ResultadoAmortizacion
    observaciones: string
}

interface Props {
    empresaId: string
    totalFactura: number
    onCancel: () => void
    onConfirm: (r: CreditoElectroConfirmado) => void
}

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
const PASOS = ['Garante', 'Cobrador', 'Cálculo', 'Resumen'] as const

const TIPO_TASA_LABELS: Record<TipoTasa, string> = {
    TASA_PERIODICA: 'Tasa periódica (coherente con la periodicidad elegida)',
    TASA_ANUAL_NOMINAL: 'Tasa nominal anual',
    TASA_EFECTIVA_ANUAL: 'Tasa efectiva anual',
    FACTOR_ACUMULADO_PLAZO: 'Factor/recargo comercial por plazo (no es una tasa de amortización)',
}

const METODOS_ENTRADA = [
    { value: 'efectivo', label: '💵 Efectivo' },
    { value: 'transferencia', label: '🏦 Transferencia' },
    { value: 'tarjeta', label: '💳 Tarjeta' },
    { value: 'cheque', label: '✏️ Cheque' },
] as const

export function ModalCreditoElectrodomesticos({ empresaId, totalFactura, onCancel, onConfirm }: Props) {
    const [paso, setPaso] = useState(0)
    const [config, setConfig] = useState<ConfigCreditoElectrodomesticos>({ empresa_id: empresaId, ...CONFIG_CREDITO_DEFAULTS })
    const [cargandoConfig, setCargandoConfig] = useState(true)

    useEffect(() => {
        creditoElectrodomesticosService.getConfig(empresaId)
            .then(setConfig)
            .catch(e => console.error('[ModalCreditoElectrodomesticos] No se pudo cargar config_credito_electrodomesticos, uso valores por defecto:', e))
            .finally(() => setCargandoConfig(false))
    }, [empresaId])

    // ── Paso 1: Garante ──────────────────────────────────────────────────
    const [garante, setGarante] = useState<Cliente | null>(null)
    const [searchGarante, setSearchGarante] = useState('')
    const [resultadosGarante, setResultadosGarante] = useState<Cliente[]>([])
    const [buscandoGarante, setBuscandoGarante] = useState(false)
    const [creandoGarante, setCreandoGarante] = useState(false)
    const [nuevoGarante, setNuevoGarante] = useState({ identificacion: '', nombre: '', direccion: '', telefono: '', email: '' })

    useEffect(() => {
        if (!searchGarante.trim() || garante) { setResultadosGarante([]); return }
        const t = setTimeout(async () => {
            setBuscandoGarante(true)
            const q = '%' + searchGarante.trim() + '%'
            const { data } = await supabase
                .from('clientes')
                .select('id, empresa_id, identificacion, nombre, email, direccion, telefono')
                .eq('empresa_id', empresaId)
                .eq('activo', true)
                .or(`nombre.ilike.${q},identificacion.ilike.${q}`)
                .order('nombre')
                .limit(20)
            setResultadosGarante((data ?? []) as Cliente[])
            setBuscandoGarante(false)
        }, 300)
        return () => clearTimeout(t)
    }, [searchGarante, garante, empresaId])

    async function guardarNuevoGarante() {
        if (!nuevoGarante.identificacion.trim() || !nuevoGarante.nombre.trim()) {
            alert('Identificación y nombres son obligatorios')
            return
        }
        try {
            const creado = await facturacionService.createCliente({
                empresa_id: empresaId,
                identificacion: nuevoGarante.identificacion.trim(),
                nombre: nuevoGarante.nombre.trim(),
                direccion: nuevoGarante.direccion.trim(),
                telefono: nuevoGarante.telefono.trim(),
                email: nuevoGarante.email.trim(),
                activo: true,
            })
            setGarante(creado)
            setCreandoGarante(false)
        } catch (e: any) {
            alert('Error al crear el garante: ' + e.message)
        }
    }

    // ── Paso 2: Cobrador ─────────────────────────────────────────────────
    const [cobradores, setCobradores] = useState<Cobrador[]>([])
    const [cobradorId, setCobradorId] = useState('')
    useEffect(() => {
        cobradorService.getCobradoresActivos(empresaId).then(setCobradores).catch(() => {})
    }, [empresaId])

    // ── Paso 3: Cálculo ──────────────────────────────────────────────────
    const [valorEntrada, setValorEntrada] = useState(0)
    const [metodoEntrada, setMetodoEntrada] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'cheque'>('efectivo')
    const [tipoTasa, setTipoTasa] = useState<TipoTasa>('TASA_PERIODICA')
    const [tasaValor, setTasaValor] = useState(0)
    const [periodicidad, setPeriodicidad] = useState<Periodicidad>('MENSUAL')
    const [numeroCuotas, setNumeroCuotas] = useState(12)
    const [fechaPrimerVencimiento, setFechaPrimerVencimiento] = useState(HOY)
    const [observaciones, setObservaciones] = useState('')
    const [resultado, setResultado] = useState<ResultadoAmortizacion | null>(null)
    const [errorCalculo, setErrorCalculo] = useState('')

    // Cualquier cambio relevante después de calcular invalida la tabla —
    // obliga a volver a presionar Calcular antes de poder avanzar (pide el
    // requerimiento explícitamente: "Se modificaron datos... debe
    // recalcular antes de continuar").
    const firmaParametros = JSON.stringify([valorEntrada, tipoTasa, tasaValor, periodicidad, numeroCuotas, fechaPrimerVencimiento, config.base_calculo_interes])
    useEffect(() => { setResultado(null) }, [firmaParametros])

    function calcular() {
        setErrorCalculo('')
        try {
            const r = creditoElectrodomesticosService.simular({
                totalFactura,
                valorEntrada,
                baseCalculoInteres: config.base_calculo_interes,
                tipoTasa,
                tasaValor,
                periodicidad,
                numeroCuotas,
                fechaPrimerVencimiento,
            })
            setResultado(r)
        } catch (e: any) {
            setErrorCalculo(e.message)
        }
    }

    const periodicidadesPermitidas = useMemo(() => {
        const opts: { value: Periodicidad; label: string }[] = []
        if (config.permite_periodicidad_diaria)  opts.push({ value: 'DIARIA',  label: 'Diaria' })
        if (config.permite_periodicidad_semanal) opts.push({ value: 'SEMANAL', label: 'Semanal' })
        if (config.permite_periodicidad_mensual) opts.push({ value: 'MENSUAL', label: 'Mensual' })
        return opts
    }, [config])

    // ── Navegación ────────────────────────────────────────────────────────
    const puedeAvanzar =
        paso === 0 ? true :
        paso === 1 ? !!cobradorId :
        paso === 2 ? !!resultado :
        false

    const [confirmado, setConfirmado] = useState(false)

    function handleConfirmar() {
        if (!resultado) return
        if (!confirmado) { alert('Marca la casilla de verificación antes de confirmar.'); return }
        onConfirm({
            garanteClienteId: garante?.id ?? null,
            cobradorId,
            valorEntrada,
            metodoEntrada,
            baseCalculoInteres: config.base_calculo_interes,
            tipoTasa,
            tasaValor,
            periodicidad,
            numeroCuotas,
            fechaPrimerVencimiento,
            resultado,
            observaciones,
        })
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Venta a Crédito de Electrodomésticos</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Total de la venta: <span className="font-bold">{formatCurrency(totalFactura)}</span></p>
                    </div>
                    <div className="flex items-center gap-2">
                        <HelpButton pageKey="credito-electrodomesticos" />
                        <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-100 shrink-0">
                    {PASOS.map((p, i) => (
                        <div key={p} className="flex items-center gap-1 flex-1">
                            <div className={`flex items-center gap-2 text-xs font-bold ${i === paso ? 'text-primary-700' : i < paso ? 'text-emerald-600' : 'text-slate-300'}`}>
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${
                                    i === paso ? 'bg-primary-100 border-2 border-primary-500' : i < paso ? 'bg-emerald-100' : 'bg-slate-100'
                                }`}>{i < paso ? '✓' : i + 1}</span>
                                <span className="hidden sm:inline">{p}</span>
                            </div>
                            {i < PASOS.length - 1 && <div className={`h-px flex-1 ${i < paso ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                        </div>
                    ))}
                </div>

                {/* Contenido */}
                <div className="flex-1 overflow-y-auto p-6">
                    {cargandoConfig ? (
                        <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
                    ) : (
                        <>
                            {/* Paso 0: Garante */}
                            {paso === 0 && (
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-500">El garante es opcional. Puedes buscar una persona ya registrada como cliente, crear una nueva, o continuar sin garante.</p>

                                    {garante ? (
                                        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 flex items-start justify-between">
                                            <div>
                                                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">Garante seleccionado</p>
                                                <p className="font-black text-violet-900">{garante.nombre}</p>
                                                <p className="text-xs text-violet-600">{garante.identificacion}</p>
                                            </div>
                                            <button onClick={() => setGarante(null)} className="text-violet-400 hover:text-violet-700"><X className="w-4 h-4" /></button>
                                        </div>
                                    ) : creandoGarante ? (
                                        <div className="space-y-3 border border-slate-200 rounded-xl p-4">
                                            <div className="grid grid-cols-2 gap-3">
                                                <input placeholder="Cédula/RUC *" value={nuevoGarante.identificacion}
                                                    onChange={e => setNuevoGarante({ ...nuevoGarante, identificacion: e.target.value })}
                                                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                                                <input placeholder="Nombres completos *" value={nuevoGarante.nombre}
                                                    onChange={e => setNuevoGarante({ ...nuevoGarante, nombre: e.target.value })}
                                                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                                                <input placeholder="Dirección" value={nuevoGarante.direccion}
                                                    onChange={e => setNuevoGarante({ ...nuevoGarante, direccion: e.target.value })}
                                                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                                                <input placeholder="Teléfono" value={nuevoGarante.telefono}
                                                    onChange={e => setNuevoGarante({ ...nuevoGarante, telefono: e.target.value })}
                                                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                                                <input placeholder="Correo" value={nuevoGarante.email}
                                                    onChange={e => setNuevoGarante({ ...nuevoGarante, email: e.target.value })}
                                                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm col-span-2" />
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => setCreandoGarante(false)} className="px-4 py-2 text-sm text-slate-500">Cancelar</button>
                                                <button onClick={guardarNuevoGarante} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg font-bold">Guardar garante</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input
                                                    placeholder="Buscar por nombre o identificación…"
                                                    value={searchGarante}
                                                    onChange={e => setSearchGarante(e.target.value)}
                                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                                />
                                                {buscandoGarante && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-300" />}
                                            </div>
                                            {resultadosGarante.length > 0 && (
                                                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-50">
                                                    {resultadosGarante.map(c => (
                                                        <button key={c.id} onClick={() => { setGarante(c); setSearchGarante('') }}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm flex justify-between">
                                                            <span className="font-semibold text-slate-800">{c.nombre}</span>
                                                            <span className="text-slate-400 text-xs">{c.identificacion}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <button onClick={() => setCreandoGarante(true)}
                                                className="flex items-center gap-2 text-sm text-primary-600 font-bold hover:text-primary-800">
                                                <UserPlus className="w-4 h-4" /> Crear nuevo garante
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Paso 1: Cobrador */}
                            {paso === 1 && (
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cobrador asignado <span className="text-red-500">*</span></label>
                                    {cobradores.length === 0 ? (
                                        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-4">
                                            No hay cobradores activos registrados. Crea uno primero en Ajustes → Cobradores.
                                        </p>
                                    ) : (
                                        <select value={cobradorId} onChange={e => setCobradorId(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500">
                                            <option value="">— Selecciona un cobrador —</option>
                                            {cobradores.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.nombres}{c.zona ? ` (${c.zona})` : ''}</option>)}
                                        </select>
                                    )}
                                </div>
                            )}

                            {/* Paso 2: Cálculo */}
                            {paso === 2 && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor de entrada</label>
                                            <input type="number" min="0" step="0.01" value={valorEntrada || ''}
                                                onChange={e => setValorEntrada(parseFloat(e.target.value) || 0)}
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-right font-bold" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Forma de cobro de la entrada</label>
                                            <select value={metodoEntrada} onChange={e => setMetodoEntrada(e.target.value as any)}
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500">
                                                {METODOS_ENTRADA.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {config.base_calculo_interes === 'TOTAL_VENTA' && (
                                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                            <span>Esta empresa calcula el interés sobre el <b>total de la venta</b>, no sobre el saldo después de la entrada — la entrada no reduce la base del cálculo.</span>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo de tasa</label>
                                        <select value={tipoTasa} onChange={e => setTipoTasa(e.target.value as TipoTasa)}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500">
                                            {Object.entries(TIPO_TASA_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{tipoTasa === 'FACTOR_ACUMULADO_PLAZO' ? 'Recargo (%)' : 'Tasa (%)'}</label>
                                            <input type="number" min="0" step="0.0001" value={tasaValor || ''}
                                                onChange={e => setTasaValor(parseFloat(e.target.value) || 0)}
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-right" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Periodicidad</label>
                                            <select value={periodicidad} onChange={e => setPeriodicidad(e.target.value as Periodicidad)}
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500">
                                                {periodicidadesPermitidas.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">N° de cuotas</label>
                                            <input type="number" min="1" step="1" value={numeroCuotas || ''}
                                                onChange={e => setNumeroCuotas(parseInt(e.target.value) || 0)}
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-right" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fecha de primer vencimiento</label>
                                        <input type="date" value={fechaPrimerVencimiento}
                                            onChange={e => setFechaPrimerVencimiento(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500" />
                                    </div>

                                    {errorCalculo && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{errorCalculo}</p>}

                                    <button onClick={calcular}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700">
                                        <Calculator className="w-4 h-4" /> Calcular tabla de amortización
                                    </button>

                                    {resultado && (
                                        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-2">
                                            <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                                                <CheckCircle2 className="w-4 h-4" /> Tabla calculada — {resultado.cuotas.length} cuotas
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
                                                <span>Cuota referencial:</span><span className="text-right font-bold">{formatCurrency(resultado.valor_cuota_referencial)}</span>
                                                <span>Total de intereses:</span><span className="text-right font-bold">{formatCurrency(resultado.total_intereses)}</span>
                                                <span>Total financiado:</span><span className="text-right font-bold">{formatCurrency(resultado.total_financiado)}</span>
                                                <span>Total a pagar (con entrada):</span><span className="text-right font-bold">{formatCurrency(resultado.total_financiado + valorEntrada)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Paso 3: Resumen y confirmación */}
                            {paso === 3 && resultado && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-slate-50 rounded-xl p-4">
                                        <span className="text-slate-500">Garante:</span><span className="text-right font-semibold">{garante?.nombre ?? 'Sin garante'}</span>
                                        <span className="text-slate-500">Cobrador:</span><span className="text-right font-semibold">{cobradores.find(c => c.id === cobradorId)?.nombres}</span>
                                        <span className="text-slate-500">Precio de contado:</span><span className="text-right font-semibold">{formatCurrency(totalFactura)}</span>
                                        <span className="text-slate-500">Entrada ({METODOS_ENTRADA.find(m => m.value === metodoEntrada)?.label}):</span><span className="text-right font-semibold">{formatCurrency(valorEntrada)}</span>
                                        <span className="text-slate-500">Saldo financiado:</span><span className="text-right font-semibold">{formatCurrency(totalFactura - valorEntrada)}</span>
                                        <span className="text-slate-500">Periodicidad / cuotas:</span><span className="text-right font-semibold">{periodicidad} / {numeroCuotas}</span>
                                        <span className="text-slate-500">Primera cuota:</span><span className="text-right font-semibold">{resultado.cuotas[0].fecha_vencimiento}</span>
                                        <span className="text-slate-500">Última cuota:</span><span className="text-right font-semibold">{resultado.cuotas[resultado.cuotas.length - 1].fecha_vencimiento}</span>
                                        <span className="text-slate-500">Total de intereses:</span><span className="text-right font-semibold">{formatCurrency(resultado.total_intereses)}</span>
                                        <span className="text-slate-900 font-bold border-t border-slate-200 pt-2">Total final a pagar:</span>
                                        <span className="text-right font-black text-primary-700 border-t border-slate-200 pt-2">{formatCurrency(resultado.total_financiado + valorEntrada)}</span>
                                    </div>

                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="max-h-56 overflow-y-auto">
                                            <table className="w-full text-xs">
                                                <thead className="bg-slate-100 sticky top-0">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left">#</th>
                                                        <th className="px-3 py-2 text-left">Vencimiento</th>
                                                        <th className="px-3 py-2 text-right">Capital</th>
                                                        <th className="px-3 py-2 text-right">Interés</th>
                                                        <th className="px-3 py-2 text-right">Cuota</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {resultado.cuotas.map(c => (
                                                        <tr key={c.numero_cuota}>
                                                            <td className="px-3 py-1.5">{c.numero_cuota}</td>
                                                            <td className="px-3 py-1.5">{c.fecha_vencimiento}</td>
                                                            <td className="px-3 py-1.5 text-right">{formatCurrency(c.capital_programado)}</td>
                                                            <td className="px-3 py-1.5 text-right">{formatCurrency(c.interes_programado)}</td>
                                                            <td className="px-3 py-1.5 text-right font-bold">{formatCurrency(c.cuota_programada)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <textarea placeholder="Observaciones (opcional)" value={observaciones}
                                        onChange={e => setObservaciones(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500" rows={2} />

                                    <label className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 cursor-pointer">
                                        <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)}
                                            className="w-5 h-5 mt-0.5 rounded border-slate-300 text-primary-600" />
                                        <span className="text-sm text-amber-900 font-semibold">He verificado los valores del crédito y la tabla de cuotas.</span>
                                    </label>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Pie */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                    <button
                        onClick={() => paso === 0 ? onCancel() : setPaso(p => p - 1)}
                        className="flex items-center gap-1 px-4 py-2.5 text-slate-500 font-semibold hover:bg-slate-50 rounded-xl"
                    >
                        <ChevronLeft className="w-4 h-4" /> {paso === 0 ? 'Cancelar' : 'Atrás'}
                    </button>
                    {paso < PASOS.length - 1 ? (
                        <button
                            onClick={() => setPaso(p => p + 1)}
                            disabled={!puedeAvanzar}
                            className="flex items-center gap-1 px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold disabled:opacity-40 hover:bg-primary-700"
                        >
                            Siguiente <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            onClick={handleConfirmar}
                            title={!confirmado ? 'Marca la casilla de verificación de arriba primero' : undefined}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-colors ${
                                confirmado ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-emerald-100 text-emerald-400'
                            }`}
                        >
                            <CheckCircle2 className="w-4 h-4" /> Confirmar crédito
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
