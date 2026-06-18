import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { finiquitoService } from '../../services/nominas/finiquitoService'
import { empleadosService } from '../../services/nominas/empleadosService'
import type { Finiquito, Empleado, CausaTerminacion, EstadoFiniquito } from '../../types/nominas'
import {
    Scale, Plus, Edit2, X, Save, Loader2, Trash2, Printer,
    CheckCircle, ChevronRight, User, Calendar, DollarSign, AlertTriangle,
    FileText, ArrowRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CAUSA_LABEL: Record<CausaTerminacion, string> = {
    renuncia_voluntaria:  'Renuncia voluntaria',
    desahucio_trabajador: 'Desahucio (aviso trabajador)',
    acuerdo_partes:       'Acuerdo entre partes',
    despido_intempestivo: 'Despido intempestivo',
    fin_contrato:         'Fin de contrato',
    jubilacion:           'Jubilación',
    otro:                 'Otro',
}
const CAUSA_COLOR: Record<CausaTerminacion, string> = {
    renuncia_voluntaria:  'bg-slate-100 text-slate-600',
    desahucio_trabajador: 'bg-amber-100 text-amber-700',
    acuerdo_partes:       'bg-blue-100 text-blue-700',
    despido_intempestivo: 'bg-red-100 text-red-700',
    fin_contrato:         'bg-indigo-100 text-indigo-700',
    jubilacion:           'bg-emerald-100 text-emerald-700',
    otro:                 'bg-slate-100 text-slate-500',
}
const ESTADO_LABEL: Record<EstadoFiniquito, string> = {
    borrador:       'Borrador',
    aprobado:       'Aprobado',
    pagado:         'Pagado',
    registrado_sut: 'Registrado SUT',
}
const ESTADO_COLOR: Record<EstadoFiniquito, string> = {
    borrador:       'bg-slate-100 text-slate-600',
    aprobado:       'bg-blue-100 text-blue-700',
    pagado:         'bg-emerald-100 text-emerald-700',
    registrado_sut: 'bg-violet-100 text-violet-700',
}

const fmt = (n: number) =>
    `$${n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ─── Tipos para el formulario ─────────────────────────────────────────────────

type FormFin = {
    id?: string
    empleado_id: string
    fecha_ingreso: string
    fecha_salida: string
    causa_terminacion: CausaTerminacion
    ultimo_sueldo: string
    mejor_sueldo: string
    sbu: string
    dias_pendientes: string
    dias_vac_generadas: string
    dias_vac_gozadas: string
    v_decimo_tercero: string
    v_decimo_cuarto: string
    v_fondos_reserva: string
    horas_extras_pend: string
    otros_ingresos: string
    d_iess_personal: string
    d_prestamos_empresa: string
    d_prestamos_iess: string
    d_anticipos: string
    d_otros_descuentos: string
    numero_acta: string
    observaciones: string
}

const EMPTY: FormFin = {
    empleado_id: '', fecha_ingreso: '',
    fecha_salida: new Date().toISOString().slice(0, 10),
    causa_terminacion: 'renuncia_voluntaria',
    ultimo_sueldo: '', mejor_sueldo: '', sbu: '460',
    dias_pendientes: '0', dias_vac_generadas: '0', dias_vac_gozadas: '0',
    v_decimo_tercero: '0', v_decimo_cuarto: '0', v_fondos_reserva: '0',
    horas_extras_pend: '0', otros_ingresos: '0',
    d_iess_personal: '0', d_prestamos_empresa: '0', d_prestamos_iess: '0',
    d_anticipos: '0', d_otros_descuentos: '0',
    numero_acta: '', observaciones: '',
}

// ─── Función de impresión ─────────────────────────────────────────────────────

function imprimirActa(f: Finiquito) {
    const fv = (n: number) => n > 0 ? `$${n.toFixed(2)}` : '—'
    const fd = (n: number) => n > 0 ? `($${n.toFixed(2)})` : '—'
    const anios = Math.floor(
        (new Date(f.fecha_salida).getTime() - new Date(f.fecha_ingreso).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000)
    )
    const diasVacPend = Math.max(0, f.dias_vac_generadas - f.dias_vac_gozadas)

    const filasIngreso = [
        f.v_sueldo_pendiente > 0 &&
            `<tr><td>Sueldo pendiente (${f.dias_pendientes} días)</td><td class="tr">${fv(f.v_sueldo_pendiente)}</td></tr>`,
        f.v_horas_extras > 0 &&
            `<tr><td>Horas extras / recargos pendientes</td><td class="tr">${fv(f.v_horas_extras)}</td></tr>`,
        `<tr><td>Vacaciones no gozadas (${diasVacPend.toFixed(1)} días)</td><td class="tr">${fv(f.v_vacaciones)}</td></tr>`,
        f.v_decimo_tercero > 0 &&
            `<tr><td>Décimo tercer sueldo (proporcional)</td><td class="tr">${fv(f.v_decimo_tercero)}</td></tr>`,
        f.v_decimo_cuarto > 0 &&
            `<tr><td>Décimo cuarto sueldo (proporcional)</td><td class="tr">${fv(f.v_decimo_cuarto)}</td></tr>`,
        f.v_fondos_reserva > 0 &&
            `<tr><td>Fondos de reserva pendientes</td><td class="tr">${fv(f.v_fondos_reserva)}</td></tr>`,
        f.v_bonif_desahucio > 0 &&
            `<tr><td>Bonificación por desahucio (25% × $${f.ultimo_sueldo.toFixed(2)} × ${anios} años)</td><td class="tr">${fv(f.v_bonif_desahucio)}</td></tr>`,
        f.v_indemnizacion > 0 &&
            `<tr><td>Indemnización por despido intempestivo</td><td class="tr">${fv(f.v_indemnizacion)}</td></tr>`,
        f.v_otros_ingresos > 0 &&
            `<tr><td>Otros ingresos</td><td class="tr">${fv(f.v_otros_ingresos)}</td></tr>`,
    ].filter(Boolean).join('\n')

    const filasDesc = [
        f.d_iess_personal > 0 && `<tr><td>Aporte personal IESS (9.45%)</td><td class="tr">${fd(f.d_iess_personal)}</td></tr>`,
        f.d_prestamos_empresa > 0 && `<tr><td>Préstamos empresa</td><td class="tr">${fd(f.d_prestamos_empresa)}</td></tr>`,
        f.d_prestamos_iess > 0 && `<tr><td>Préstamos IESS</td><td class="tr">${fd(f.d_prestamos_iess)}</td></tr>`,
        f.d_anticipos > 0 && `<tr><td>Anticipos</td><td class="tr">${fd(f.d_anticipos)}</td></tr>`,
        f.d_otros_descuentos > 0 && `<tr><td>Otros descuentos</td><td class="tr">${fd(f.d_otros_descuentos)}</td></tr>`,
    ].filter(Boolean).join('\n')

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Acta de Finiquito — ${f.empleado?.apellidos} ${f.empleado?.nombres}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:11pt;padding:28px;color:#000}
h1{text-align:center;font-size:13pt;font-weight:bold;margin-bottom:3px}
.sub{text-align:center;font-size:9pt;margin-bottom:14px;color:#555}
h2{font-size:11pt;font-weight:bold;margin:14px 0 5px;border-bottom:1px solid #777;padding-bottom:2px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;margin:6px 0 10px}
.gi{font-size:10pt}.gi strong{font-weight:bold}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{background:#e8e8e8;border:1px solid #bbb;padding:4px 8px;text-align:left;font-size:10pt}
td{border:1px solid #bbb;padding:4px 8px;font-size:10pt}
.tr{text-align:right}
.totrow td{font-weight:bold;background:#ddd}
.neto td{font-weight:bold;font-size:12pt;background:#c8e6c9}
.signs{margin-top:56px;display:flex;justify-content:space-around}
.firma{text-align:center}
.fline{border-top:1px solid #000;width:210px;margin:0 auto 4px;padding-top:4px;font-size:10pt}
.legal{font-size:8pt;color:#666;margin-top:12px}
</style></head><body>
<h1>ACTA DE FINIQUITO Y LIQUIDACIÓN FINAL</h1>
<p class="sub">República del Ecuador — Código del Trabajo</p>
<h2>INFORMACIÓN GENERAL</h2>
<div class="grid">
  <div class="gi"><strong>Trabajador:</strong> ${f.empleado?.apellidos ?? ''} ${f.empleado?.nombres ?? ''}</div>
  <div class="gi"><strong>C.I.:</strong> ${f.empleado?.cedula ?? '—'}</div>
  <div class="gi"><strong>Fecha de ingreso:</strong> ${f.fecha_ingreso}</div>
  <div class="gi"><strong>Fecha de salida:</strong> ${f.fecha_salida}</div>
  <div class="gi"><strong>Tiempo de servicio:</strong> ${anios} año(s)</div>
  <div class="gi"><strong>Causa:</strong> ${CAUSA_LABEL[f.causa_terminacion]}</div>
  <div class="gi"><strong>Último sueldo:</strong> $${f.ultimo_sueldo.toFixed(2)}</div>
  ${f.numero_acta ? `<div class="gi"><strong>N° Acta:</strong> ${f.numero_acta}</div>` : ''}
</div>
<h2>LIQUIDACIÓN DE HABERES</h2>
<table>
  <thead><tr><th style="width:65%">Concepto</th><th class="tr">Valor (USD)</th></tr></thead>
  <tbody>${filasIngreso}</tbody>
  <tfoot><tr class="totrow"><td><strong>TOTAL INGRESOS</strong></td><td class="tr"><strong>$${f.total_ingresos.toFixed(2)}</strong></td></tr></tfoot>
</table>
${filasDesc ? `<h2>DESCUENTOS</h2>
<table>
  <tbody>${filasDesc}
    <tr class="totrow"><td><strong>TOTAL DESCUENTOS</strong></td><td class="tr"><strong>($${f.total_descuentos.toFixed(2)})</strong></td></tr>
  </tbody>
</table>` : ''}
<table style="margin-top:6px">
  <tbody>
    <tr class="neto">
      <td style="width:70%"><strong>TOTAL NETO A PAGAR AL TRABAJADOR</strong></td>
      <td class="tr"><strong>$ ${f.neto_a_pagar.toFixed(2)}</strong></td>
    </tr>
  </tbody>
</table>
${f.observaciones ? `<p style="margin-top:10px;font-size:10pt"><strong>Obs.:</strong> ${f.observaciones}</p>` : ''}
<p style="margin-top:14px;font-size:10pt">Con la firma de este documento el trabajador declara haber recibido los valores indicados a entera satisfacción y renuncia a cualquier reclamación laboral posterior, salvo las irrenunciables por ley.</p>
<div class="signs">
  <div class="firma"><div class="fline">&nbsp;</div><p><strong>EMPLEADOR</strong></p><p style="font-size:9pt">Representante Legal</p></div>
  <div class="firma"><div class="fline">&nbsp;</div><p><strong>TRABAJADOR</strong></p><p style="font-size:9pt">${f.empleado?.apellidos ?? ''} ${f.empleado?.nombres ?? ''}</p>${f.empleado?.cedula ? `<p style="font-size:9pt">C.I.: ${f.empleado.cedula}</p>` : ''}</div>
</div>
<p class="legal">Emitido el ${new Date().toLocaleDateString('es-EC')}. Este documento debe registrarse en el SUT del Ministerio de Trabajo dentro del plazo legal establecido.</p>
</body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400) }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function FiniquitoPage() {
    const { empresa } = useAuth() as any
    const [finiquitos, setFiniquitos] = useState<Finiquito[]>([])
    const [empleados, setEmpleados] = useState<Empleado[]>([])
    const [loading, setLoading] = useState(true)
    const [activo, setActivo] = useState<Finiquito | null>(null)

    const [modalOpen, setModalOpen] = useState(false)
    const [tabModal, setTabModal] = useState<'datos' | 'liquidacion' | 'descuentos'>('datos')
    const [form, setForm] = useState<FormFin>({ ...EMPTY })
    const [saving, setSaving] = useState(false)

    const n = (s: string) => parseFloat(s) || 0

    // Cálculo reactivo en tiempo real
    const calc = useMemo(() => {
        if (!form.fecha_ingreso || !form.fecha_salida) return null
        return finiquitoService.calcular({
            fechaIngreso:      form.fecha_ingreso,
            fechaSalida:       form.fecha_salida,
            causaTerminacion:  form.causa_terminacion,
            ultimoSueldo:      n(form.ultimo_sueldo),
            mejorSueldo:       n(form.mejor_sueldo),
            diasPendientes:    n(form.dias_pendientes),
            diasVacGeneradas:  n(form.dias_vac_generadas),
            diasVacGozadas:    n(form.dias_vac_gozadas),
            hExtPend:          n(form.horas_extras_pend),
            otrosIngresos:     n(form.otros_ingresos),
            vDecimo3:          n(form.v_decimo_tercero),
            vDecimo4:          n(form.v_decimo_cuarto),
            vFondosReserva:    n(form.v_fondos_reserva),
            dIess:             n(form.d_iess_personal),
            dPrestamosEmpresa: n(form.d_prestamos_empresa),
            dPrestamosIESS:    n(form.d_prestamos_iess),
            dAnticipos:        n(form.d_anticipos),
            dOtros:            n(form.d_otros_descuentos),
        })
    }, [form])

    useEffect(() => { if (empresa?.id) loadData() }, [empresa?.id])

    async function loadData() {
        try {
            setLoading(true)
            const [fins, emps] = await Promise.all([
                finiquitoService.listar(empresa!.id),
                empleadosService.listarEmpleadosTodos(empresa!.id),
            ])
            setFiniquitos(fins)
            setEmpleados(emps)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    function handleEmpleadoChange(empleadoId: string) {
        const emp = empleados.find(e => e.id === empleadoId)
        if (!emp) { setForm(f => ({ ...f, empleado_id: empleadoId })); return }
        const hoy = new Date().toISOString().slice(0, 10)
        const salida = form.fecha_salida || hoy
        const sueldo = emp.sueldo_base ?? 0
        const sbu = n(form.sbu) || 460
        const d13 = finiquitoService.estimarDecimo3(sueldo, salida, emp.fecha_ingreso)
        const d14 = finiquitoService.estimarDecimo4(sbu, salida, emp.fecha_ingreso)
        const diasVac = finiquitoService.diasVacacionesGeneradas(emp.fecha_ingreso, salida)
        setForm(f => ({
            ...f,
            empleado_id:      empleadoId,
            fecha_ingreso:    emp.fecha_ingreso,
            ultimo_sueldo:    sueldo.toString(),
            mejor_sueldo:     sueldo.toString(),
            dias_vac_generadas: diasVac.toFixed(2),
            v_decimo_tercero: d13.toString(),
            v_decimo_cuarto:  d14.toString(),
        }))
    }

    // Recalcular estimados al cambiar fecha salida o sueldo
    function recalcularEstimados() {
        const emp = empleados.find(e => e.id === form.empleado_id)
        if (!emp || !form.fecha_salida) return
        const sueldo = n(form.ultimo_sueldo)
        const sbu = n(form.sbu) || 460
        const d13 = finiquitoService.estimarDecimo3(sueldo, form.fecha_salida, form.fecha_ingreso)
        const d14 = finiquitoService.estimarDecimo4(sbu, form.fecha_salida, form.fecha_ingreso)
        const diasVac = finiquitoService.diasVacacionesGeneradas(form.fecha_ingreso, form.fecha_salida)
        const iess = Math.round(((sueldo / 30) * n(form.dias_pendientes)) * 0.0945 * 100) / 100
        setForm(f => ({
            ...f,
            dias_vac_generadas: diasVac.toFixed(2),
            v_decimo_tercero:   d13.toString(),
            v_decimo_cuarto:    d14.toString(),
            d_iess_personal:    iess.toString(),
        }))
    }

    function abrirNuevo() {
        setForm({ ...EMPTY })
        setTabModal('datos')
        setModalOpen(true)
    }

    function abrirEditar(f: Finiquito) {
        setForm({
            id:                   f.id,
            empleado_id:          f.empleado_id,
            fecha_ingreso:        f.fecha_ingreso,
            fecha_salida:         f.fecha_salida,
            causa_terminacion:    f.causa_terminacion,
            ultimo_sueldo:        f.ultimo_sueldo.toString(),
            mejor_sueldo:         f.mejor_sueldo.toString(),
            sbu:                  '460',
            dias_pendientes:      f.dias_pendientes.toString(),
            dias_vac_generadas:   f.dias_vac_generadas.toString(),
            dias_vac_gozadas:     f.dias_vac_gozadas.toString(),
            v_decimo_tercero:     f.v_decimo_tercero.toString(),
            v_decimo_cuarto:      f.v_decimo_cuarto.toString(),
            v_fondos_reserva:     f.v_fondos_reserva.toString(),
            horas_extras_pend:    f.horas_extras_pend.toString(),
            otros_ingresos:       f.otros_ingresos.toString(),
            d_iess_personal:      f.d_iess_personal.toString(),
            d_prestamos_empresa:  f.d_prestamos_empresa.toString(),
            d_prestamos_iess:     f.d_prestamos_iess.toString(),
            d_anticipos:          f.d_anticipos.toString(),
            d_otros_descuentos:   f.d_otros_descuentos.toString(),
            numero_acta:          f.numero_acta ?? '',
            observaciones:        f.observaciones ?? '',
        })
        setTabModal('datos')
        setModalOpen(true)
    }

    async function guardar() {
        if (!form.empleado_id) { alert('Seleccione un empleado'); return }
        if (!form.fecha_ingreso || !form.fecha_salida) { alert('Las fechas son obligatorias'); return }
        if (!calc) return
        setSaving(true)
        try {
            const payload: Partial<Finiquito> = {
                empresa_id:          empresa!.id,
                empleado_id:         form.empleado_id,
                fecha_ingreso:       form.fecha_ingreso,
                fecha_salida:        form.fecha_salida,
                causa_terminacion:   form.causa_terminacion,
                ultimo_sueldo:       n(form.ultimo_sueldo),
                mejor_sueldo:        n(form.mejor_sueldo),
                dias_pendientes:     n(form.dias_pendientes),
                dias_vac_generadas:  n(form.dias_vac_generadas),
                dias_vac_gozadas:    n(form.dias_vac_gozadas),
                horas_extras_pend:   n(form.horas_extras_pend),
                otros_ingresos:      n(form.otros_ingresos),
                v_sueldo_pendiente:  calc.vSueldoPendiente,
                v_horas_extras:      calc.vHorasExtras,
                v_vacaciones:        calc.vVacaciones,
                v_decimo_tercero:    calc.vDecimo3,
                v_decimo_cuarto:     calc.vDecimo4,
                v_fondos_reserva:    calc.vFondosReserva,
                v_bonif_desahucio:   calc.vBonifDesahucio,
                v_indemnizacion:     calc.vIndemnizacion,
                v_otros_ingresos:    calc.vOtrosIngresos,
                d_iess_personal:     n(form.d_iess_personal),
                d_prestamos_empresa: n(form.d_prestamos_empresa),
                d_prestamos_iess:    n(form.d_prestamos_iess),
                d_anticipos:         n(form.d_anticipos),
                d_otros_descuentos:  n(form.d_otros_descuentos),
                total_ingresos:      calc.totalIngresos,
                total_descuentos:    calc.totalDescuentos,
                neto_a_pagar:        calc.netoAPagar,
                numero_acta:         form.numero_acta || null,
                observaciones:       form.observaciones || null,
            }
            if (form.id) {
                await finiquitoService.actualizar(form.id, payload)
            } else {
                await finiquitoService.crear(payload)
            }
            setModalOpen(false)
            const updated = await finiquitoService.listar(empresa!.id)
            setFiniquitos(updated)
            if (activo && form.id) {
                const upd = updated.find(x => x.id === form.id)
                if (upd) setActivo(upd)
            }
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function cambiarEstado(f: Finiquito, estado: EstadoFiniquito) {
        const labels: Record<EstadoFiniquito, string> = {
            borrador: 'borrador', aprobado: 'aprobado',
            pagado: 'pagado', registrado_sut: 'registrado en SUT',
        }
        if (!confirm(`¿Marcar finiquito como "${labels[estado]}"?`)) return
        const extras = estado === 'pagado' ? { fecha_pago: new Date().toISOString().slice(0, 10) } : undefined
        await finiquitoService.cambiarEstado(f.id, estado, empresa!.id, extras)
        const updated = await finiquitoService.listar(empresa!.id)
        setFiniquitos(updated)
        const upd = updated.find(x => x.id === f.id)
        if (upd) setActivo(upd)
    }

    async function eliminar(f: Finiquito) {
        if (!confirm(`¿Eliminar finiquito de ${f.empleado?.apellidos} ${f.empleado?.nombres}?`)) return
        await finiquitoService.eliminar(f.id)
        if (activo?.id === f.id) setActivo(null)
        const updated = await finiquitoService.listar(empresa!.id)
        setFiniquitos(updated)
    }

    // ─── Renderizado ────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Finiquitos</h1>
                    <p className="text-slate-600 mt-1">Liquidación final y acta de finiquito</p>
                </div>
                <button onClick={abrirNuevo} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nuevo Finiquito
                </button>
            </div>

            {/* Panel split */}
            <div className={cn('grid gap-4', activo ? 'grid-cols-[340px,1fr]' : 'grid-cols-1')}>

                {/* ── Lista ── */}
                <div className="space-y-2">
                    {finiquitos.length === 0 ? (
                        <div className="card flex flex-col items-center py-16 text-slate-400">
                            <Scale className="w-10 h-10 mb-3 opacity-40" />
                            <p className="font-semibold">Sin finiquitos registrados</p>
                            <button onClick={abrirNuevo} className="btn btn-primary mt-4 text-sm flex items-center gap-1.5">
                                <Plus className="w-3.5 h-3.5" /> Crear finiquito
                            </button>
                        </div>
                    ) : finiquitos.map(f => (
                        <div key={f.id} onClick={() => setActivo(f)}
                            className={cn('card p-4 cursor-pointer transition-all hover:shadow-md',
                                activo?.id === f.id && 'ring-2 ring-indigo-500')}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-900 truncate">
                                        {f.empleado?.apellidos} {f.empleado?.nombres}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Salida: {f.fecha_salida}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', ESTADO_COLOR[f.estado])}>
                                        {ESTADO_LABEL[f.estado]}
                                    </span>
                                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', CAUSA_COLOR[f.causa_terminacion])}>
                                        {CAUSA_LABEL[f.causa_terminacion]}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-3">
                                <span className="text-sm font-bold text-emerald-700">
                                    {fmt(f.neto_a_pagar)}
                                </span>
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Panel detalle ── */}
                {activo && (
                    <div className="card overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">
                                    {activo.empleado?.apellidos} {activo.empleado?.nombres}
                                </h2>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', CAUSA_COLOR[activo.causa_terminacion])}>
                                        {CAUSA_LABEL[activo.causa_terminacion]}
                                    </span>
                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', ESTADO_COLOR[activo.estado])}>
                                        {ESTADO_LABEL[activo.estado]}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => imprimirActa(activo)} title="Imprimir acta"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                    <Printer className="w-4 h-4" />
                                </button>
                                <button onClick={() => abrirEditar(activo)} title="Editar"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => eliminar(activo)} title="Eliminar"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setActivo(null)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                            {/* Info cards */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" /> Ingreso / Salida
                                    </p>
                                    <p className="font-semibold text-slate-800 text-sm">{activo.fecha_ingreso}</p>
                                    <p className="font-semibold text-slate-800 text-sm">{activo.fecha_salida}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                                        <User className="w-3 h-3" /> Tiempo de servicio
                                    </p>
                                    <p className="font-semibold text-slate-800 text-sm">
                                        {Math.floor((new Date(activo.fecha_salida).getTime() - new Date(activo.fecha_ingreso).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} año(s)
                                    </p>
                                    <p className="text-xs text-slate-400">C.I.: {activo.empleado?.cedula ?? '—'}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                                        <DollarSign className="w-3 h-3" /> Último sueldo
                                    </p>
                                    <p className="font-semibold text-slate-800">{fmt(activo.ultimo_sueldo)}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs text-slate-500 mb-0.5">Estado de pago</p>
                                    <p className="font-semibold text-slate-800 text-sm">
                                        {activo.fecha_pago ? `Pagado: ${activo.fecha_pago}` : '—'}
                                    </p>
                                    {activo.numero_acta && <p className="text-xs text-slate-400">Acta: {activo.numero_acta}</p>}
                                </div>
                            </div>

                            {/* Tabla ingresos */}
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Ingresos</p>
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <tbody className="divide-y divide-slate-100">
                                            {[
                                                ['Sueldo pendiente', activo.v_sueldo_pendiente, `${activo.dias_pendientes} días`],
                                                ['Horas extras pendientes', activo.v_horas_extras, ''],
                                                [`Vacaciones no gozadas`, activo.v_vacaciones, `${Math.max(0, activo.dias_vac_generadas - activo.dias_vac_gozadas).toFixed(1)} días`],
                                                ['Décimo tercer sueldo', activo.v_decimo_tercero, 'proporcional'],
                                                ['Décimo cuarto sueldo', activo.v_decimo_cuarto, 'proporcional'],
                                                ['Fondos de reserva', activo.v_fondos_reserva, 'pendientes'],
                                                ['Bonificación desahucio', activo.v_bonif_desahucio, '25% × años'],
                                                ['Indemnización', activo.v_indemnizacion, 'por despido'],
                                                ['Otros ingresos', activo.v_otros_ingresos, ''],
                                            ].filter(([, v]) => (v as number) > 0).map(([label, valor, detalle], i) => (
                                                <tr key={i} className="px-3 py-2">
                                                    <td className="px-3 py-2 text-slate-600">{label as string}
                                                        {detalle && <span className="ml-1 text-xs text-slate-400">({detalle})</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-medium text-slate-800">{fmt(valor as number)}</td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-50 font-bold">
                                                <td className="px-3 py-2.5 text-slate-700">TOTAL INGRESOS</td>
                                                <td className="px-3 py-2.5 text-right text-slate-900">{fmt(activo.total_ingresos)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Tabla descuentos */}
                            {activo.total_descuentos > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Descuentos</p>
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-sm">
                                            <tbody className="divide-y divide-slate-100">
                                                {[
                                                    ['IESS personal', activo.d_iess_personal],
                                                    ['Préstamos empresa', activo.d_prestamos_empresa],
                                                    ['Préstamos IESS', activo.d_prestamos_iess],
                                                    ['Anticipos', activo.d_anticipos],
                                                    ['Otros descuentos', activo.d_otros_descuentos],
                                                ].filter(([, v]) => (v as number) > 0).map(([label, valor], i) => (
                                                    <tr key={i}>
                                                        <td className="px-3 py-2 text-slate-600">{label as string}</td>
                                                        <td className="px-3 py-2 text-right text-red-600">({fmt(valor as number)})</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-slate-50 font-bold">
                                                    <td className="px-3 py-2.5 text-slate-700">TOTAL DESCUENTOS</td>
                                                    <td className="px-3 py-2.5 text-right text-red-700">({fmt(activo.total_descuentos)})</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Neto */}
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 flex items-center justify-between">
                                <p className="font-bold text-emerald-800">NETO A PAGAR</p>
                                <p className="text-2xl font-bold text-emerald-700">{fmt(activo.neto_a_pagar)}</p>
                            </div>

                            {/* Acciones de estado */}
                            <div className="flex gap-2 flex-wrap">
                                {activo.estado === 'borrador' && (
                                    <button onClick={() => cambiarEstado(activo, 'aprobado')}
                                        className="btn text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5">
                                        <CheckCircle className="w-3.5 h-3.5" /> Aprobar
                                    </button>
                                )}
                                {activo.estado === 'aprobado' && (
                                    <button onClick={() => cambiarEstado(activo, 'pagado')}
                                        className="btn text-sm bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5">
                                        <DollarSign className="w-3.5 h-3.5" /> Marcar pagado
                                    </button>
                                )}
                                {activo.estado === 'pagado' && (
                                    <button onClick={() => cambiarEstado(activo, 'registrado_sut')}
                                        className="btn text-sm bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5" /> Registrado en SUT
                                    </button>
                                )}
                                <button onClick={() => imprimirActa(activo)}
                                    className="btn btn-secondary text-sm flex items-center gap-1.5">
                                    <Printer className="w-3.5 h-3.5" /> Imprimir acta
                                </button>
                            </div>

                            {activo.observaciones && (
                                <div className="text-xs text-slate-500 italic">
                                    <strong>Obs.:</strong> {activo.observaciones}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ──────────────────────── MODAL CREAR / EDITAR ──── */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Scale className="w-5 h-5 text-indigo-500" />
                                {form.id ? 'Editar Finiquito' : 'Nuevo Finiquito'}
                            </h3>
                            <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-slate-200 px-6 gap-1">
                            {(['datos', 'liquidacion', 'descuentos'] as const).map(t => (
                                <button key={t} onClick={() => setTabModal(t)}
                                    className={cn('px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
                                        tabModal === t
                                            ? 'border-indigo-600 text-indigo-600'
                                            : 'border-transparent text-slate-500 hover:text-slate-700')}>
                                    {t === 'datos' ? 'Datos laborales' : t === 'liquidacion' ? 'Liquidación' : 'Descuentos y resumen'}
                                </button>
                            ))}
                        </div>

                        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

                            {/* ── TAB: DATOS ── */}
                            {tabModal === 'datos' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Empleado *</label>
                                        <select className="input w-full" value={form.empleado_id}
                                            onChange={e => handleEmpleadoChange(e.target.value)}>
                                            <option value="">— Seleccionar empleado —</option>
                                            {empleados.map(e => (
                                                <option key={e.id} value={e.id}>
                                                    {e.apellidos} {e.nombres}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de ingreso *</label>
                                            <input type="date" className="input w-full" value={form.fecha_ingreso}
                                                onChange={e => setForm(f => ({ ...f, fecha_ingreso: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de salida *</label>
                                            <input type="date" className="input w-full" value={form.fecha_salida}
                                                onChange={e => setForm(f => ({ ...f, fecha_salida: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Causa de terminación *</label>
                                        <select className="input w-full" value={form.causa_terminacion}
                                            onChange={e => setForm(f => ({ ...f, causa_terminacion: e.target.value as CausaTerminacion }))}>
                                            {(Object.keys(CAUSA_LABEL) as CausaTerminacion[]).map(c => (
                                                <option key={c} value={c}>{CAUSA_LABEL[c]}</option>
                                            ))}
                                        </select>
                                        {form.causa_terminacion === 'despido_intempestivo' && (
                                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Genera indemnización: {calc?.aniosCompletos ?? 0} &lt; 3 años → 3 sueldos; ≥ 3 años → 1 sueldo/año
                                            </p>
                                        )}
                                        {['desahucio_trabajador', 'acuerdo_partes'].includes(form.causa_terminacion) && (
                                            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Genera bonificación: 25% del último sueldo por cada año de servicio
                                            </p>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Último sueldo (USD) *</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.ultimo_sueldo}
                                                onChange={e => setForm(f => ({ ...f, ultimo_sueldo: e.target.value }))}
                                                placeholder="0.00" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Mejor sueldo (USD)</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.mejor_sueldo}
                                                onChange={e => setForm(f => ({ ...f, mejor_sueldo: e.target.value }))}
                                                placeholder="= último sueldo si no hubo cambios" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Días pendientes de pago</label>
                                            <input type="number" min="0" max="31" step="0.5" className="input w-full"
                                                value={form.dias_pendientes}
                                                onChange={e => setForm(f => ({ ...f, dias_pendientes: e.target.value }))}
                                                placeholder="Días del último período sin pagar" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">SBU (para D14)</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.sbu}
                                                onChange={e => setForm(f => ({ ...f, sbu: e.target.value }))}
                                                placeholder="460.00" />
                                        </div>
                                    </div>
                                    <button onClick={recalcularEstimados} type="button"
                                        className="text-xs text-indigo-600 hover:text-indigo-800 underline">
                                        Recalcular estimados de décimos y vacaciones
                                    </button>
                                </>
                            )}

                            {/* ── TAB: LIQUIDACIÓN ── */}
                            {tabModal === 'liquidacion' && (
                                <>
                                    {calc && (
                                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2 text-sm text-indigo-700 flex items-center gap-3">
                                            <span>
                                                <strong>{calc.aniosCompletos}</strong> año(s) de servicio
                                            </span>
                                            <span className="text-indigo-400">·</span>
                                            <span>
                                                Vac. pendientes: <strong>{calc.diasVacPendientes.toFixed(1)} días</strong>
                                            </span>
                                        </div>
                                    )}

                                    {/* Sueldo pendiente (calculado) */}
                                    <div className="p-3 bg-slate-50 rounded-xl">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-slate-700">Sueldo pendiente</p>
                                            <p className="text-sm font-bold text-slate-900">{calc ? fmt(calc.vSueldoPendiente) : '—'}</p>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            = {fmt(n(form.ultimo_sueldo))} ÷ 30 × {n(form.dias_pendientes)} días
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Horas extras pendientes ($)</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.horas_extras_pend}
                                                onChange={e => setForm(f => ({ ...f, horas_extras_pend: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Otros ingresos ($)</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.otros_ingresos}
                                                onChange={e => setForm(f => ({ ...f, otros_ingresos: e.target.value }))} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Vacaciones generadas (días)</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.dias_vac_generadas}
                                                onChange={e => setForm(f => ({ ...f, dias_vac_generadas: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Vacaciones gozadas (días)</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.dias_vac_gozadas}
                                                onChange={e => setForm(f => ({ ...f, dias_vac_gozadas: e.target.value }))} />
                                        </div>
                                    </div>
                                    {calc && (
                                        <div className="p-3 bg-slate-50 rounded-xl">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-semibold text-slate-700">Vacaciones no gozadas</p>
                                                <p className="text-sm font-bold text-slate-900">{fmt(calc.vVacaciones)}</p>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                = {fmt(n(form.ultimo_sueldo))} ÷ 24 × {calc.diasVacPendientes.toFixed(1)} días
                                            </p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Décimo tercero (estimado, editable)</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.v_decimo_tercero}
                                                onChange={e => setForm(f => ({ ...f, v_decimo_tercero: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Décimo cuarto (estimado, editable)</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.v_decimo_cuarto}
                                                onChange={e => setForm(f => ({ ...f, v_decimo_cuarto: e.target.value }))} />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Fondos de reserva pendientes ($)</label>
                                        <input type="number" min="0" step="0.01" className="input w-full"
                                            value={form.v_fondos_reserva}
                                            onChange={e => setForm(f => ({ ...f, v_fondos_reserva: e.target.value }))} />
                                    </div>

                                    {calc && (calc.vBonifDesahucio > 0 || calc.vIndemnizacion > 0) && (
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
                                            {calc.vBonifDesahucio > 0 && (
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-amber-800">Bonificación desahucio</span>
                                                    <span className="font-bold text-amber-700">{fmt(calc.vBonifDesahucio)}</span>
                                                </div>
                                            )}
                                            {calc.vIndemnizacion > 0 && (
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-amber-800">Indemnización despido</span>
                                                    <span className="font-bold text-amber-700">{fmt(calc.vIndemnizacion)}</span>
                                                </div>
                                            )}
                                            <p className="text-xs text-amber-600">Calculado automáticamente según la causa.</p>
                                        </div>
                                    )}

                                    {calc && (
                                        <div className="bg-slate-100 rounded-xl px-4 py-3 flex justify-between items-center">
                                            <span className="font-semibold text-slate-700">TOTAL INGRESOS</span>
                                            <span className="text-xl font-bold text-slate-900">{fmt(calc.totalIngresos)}</span>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── TAB: DESCUENTOS ── */}
                            {tabModal === 'descuentos' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">IESS personal (9.45%)</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.d_iess_personal}
                                                onChange={e => setForm(f => ({ ...f, d_iess_personal: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Anticipos</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.d_anticipos}
                                                onChange={e => setForm(f => ({ ...f, d_anticipos: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Préstamos empresa</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.d_prestamos_empresa}
                                                onChange={e => setForm(f => ({ ...f, d_prestamos_empresa: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Préstamos IESS</label>
                                            <input type="number" min="0" step="0.01" className="input w-full"
                                                value={form.d_prestamos_iess}
                                                onChange={e => setForm(f => ({ ...f, d_prestamos_iess: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Otros descuentos</label>
                                        <input type="number" min="0" step="0.01" className="input w-full"
                                            value={form.d_otros_descuentos}
                                            onChange={e => setForm(f => ({ ...f, d_otros_descuentos: e.target.value }))} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">N° de Acta</label>
                                            <input className="input w-full" value={form.numero_acta}
                                                onChange={e => setForm(f => ({ ...f, numero_acta: e.target.value }))}
                                                placeholder="001-2026" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Observaciones</label>
                                            <input className="input w-full" value={form.observaciones}
                                                onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
                                        </div>
                                    </div>

                                    {/* Resumen final */}
                                    {calc && (
                                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                                            <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between text-sm">
                                                <span className="text-slate-600">Total ingresos</span>
                                                <span className="font-semibold text-slate-800">{fmt(calc.totalIngresos)}</span>
                                            </div>
                                            <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between text-sm">
                                                <span className="text-slate-600">Total descuentos</span>
                                                <span className="font-semibold text-red-600">({fmt(calc.totalDescuentos)})</span>
                                            </div>
                                            <div className="px-4 py-3 bg-emerald-50 flex justify-between items-center">
                                                <span className="font-bold text-emerald-800">NETO A PAGAR</span>
                                                <span className="text-2xl font-bold text-emerald-700">{fmt(calc.netoAPagar)}</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <div>
                                {tabModal !== 'datos' && (
                                    <button onClick={() => setTabModal(t => t === 'descuentos' ? 'liquidacion' : 'datos')}
                                        className="btn btn-secondary text-sm flex items-center gap-1.5">
                                        ← Anterior
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setModalOpen(false)} className="btn btn-secondary flex items-center gap-2">
                                    <X className="w-4 h-4" /> Cancelar
                                </button>
                                {tabModal !== 'descuentos' ? (
                                    <button onClick={() => setTabModal(t => t === 'datos' ? 'liquidacion' : 'descuentos')}
                                        className="btn btn-primary flex items-center gap-2">
                                        Siguiente <ArrowRight className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <button onClick={guardar} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Guardar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
