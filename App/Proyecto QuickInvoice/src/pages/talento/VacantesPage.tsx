import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { vacantesService } from '../../services/nominas/vacantesService'
import { candidatosService } from '../../services/nominas/candidatosService'
import { empleadosService } from '../../services/nominas/empleadosService'
import { estructuraOrganizativaService } from '../../services/nominas/estructuraOrganizativaService'
import type {
    Vacante, Candidato, CandidatoEvento,
    EstadoVacante, EtapaCandidato, TipoEvento, ResultadoEvento,
    TipoContrato, SeccionNomina, CargoNomina,
} from '../../types/nominas'
import {
    Briefcase, Plus, Edit2, X, Save, Loader2, Users, UserPlus,
    Star, Calendar, ChevronRight, Trash2, Phone, Mail, FileText,
    CheckCircle, XCircle, Clock, ArrowRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'

// ─── Helpers de etiqueta/color ────────────────────────────────────────────────

const ETAPA_LABEL: Record<EtapaCandidato, string> = {
    postulacion:          'Postulación',
    revision_cv:          'Revisión CV',
    entrevista_inicial:   'Entrevista inicial',
    entrevista_tecnica:   'Entrevista técnica',
    evaluacion:           'Evaluación',
    oferta:               'Oferta enviada',
    contratado:           'Contratado',
    rechazado:            'Rechazado',
    retirado:             'Retirado',
}
const ETAPA_COLOR: Record<EtapaCandidato, string> = {
    postulacion:          'bg-slate-100 text-slate-600',
    revision_cv:          'bg-blue-100 text-blue-700',
    entrevista_inicial:   'bg-indigo-100 text-indigo-700',
    entrevista_tecnica:   'bg-violet-100 text-violet-700',
    evaluacion:           'bg-amber-100 text-amber-700',
    oferta:               'bg-green-100 text-green-700',
    contratado:           'bg-emerald-100 text-emerald-700',
    rechazado:            'bg-red-100 text-red-600',
    retirado:             'bg-slate-100 text-slate-400',
}
const ESTADO_COLOR: Record<EstadoVacante, string> = {
    abierta:    'bg-green-100 text-green-700',
    en_proceso: 'bg-amber-100 text-amber-700',
    cerrada:    'bg-slate-100 text-slate-500',
    cancelada:  'bg-red-100 text-red-500',
}
const ESTADO_LABEL: Record<EstadoVacante, string> = {
    abierta: 'Abierta', en_proceso: 'En proceso', cerrada: 'Cerrada', cancelada: 'Cancelada',
}
const FUENTE_LABEL: Record<string, string> = {
    directo: 'Directo', referido: 'Referido', portal: 'Portal web',
    linkedin: 'LinkedIn', bolsa_trabajo: 'Bolsa de trabajo', otro: 'Otro',
}
const TIPO_EVENTO_LABEL: Record<TipoEvento, string> = {
    entrevista: 'Entrevista', evaluacion: 'Evaluación',
    prueba_tecnica: 'Prueba técnica', llamada: 'Llamada', otro: 'Otro',
}

function estrellas(n: number | null | undefined) {
    if (!n) return null
    return (
        <span className="flex items-center gap-0.5 text-amber-400">
            {[1,2,3,4,5].map(i => (
                <Star key={i} className={cn('w-3 h-3', i <= n ? 'fill-current' : 'text-slate-200')} />
            ))}
        </span>
    )
}

// ─── Tipos para los formularios ───────────────────────────────────────────────

type FormVacante = {
    id?: string
    titulo: string
    cargo_id: string
    seccion_id: string
    descripcion: string
    sueldo_referencial: string
    tipo_contrato: string
    estado: EstadoVacante
    fecha_apertura: string
    fecha_cierre: string
}
type FormCandidato = {
    id?: string
    nombres: string
    apellidos: string
    cedula: string
    email: string
    telefono: string
    fuente: string
    referido_por: string
    cv_url: string
    notas: string
    etapa: EtapaCandidato
}
type FormEvento = {
    tipo: TipoEvento
    fecha: string
    responsable: string
    calificacion: string
    comentarios: string
    resultado: ResultadoEvento | ''
}
type FormContratar = {
    fecha_ingreso: string
    sueldo_base: string
    tipo_nomina: 'mensual' | 'quincenal'
    tipo_contrato: string
}

const EMPTY_VAC: FormVacante = {
    titulo: '', cargo_id: '', seccion_id: '', descripcion: '',
    sueldo_referencial: '', tipo_contrato: '', estado: 'abierta',
    fecha_apertura: new Date().toISOString().slice(0, 10), fecha_cierre: '',
}
const EMPTY_CAND: FormCandidato = {
    nombres: '', apellidos: '', cedula: '', email: '', telefono: '',
    fuente: 'directo', referido_por: '', cv_url: '', notas: '', etapa: 'postulacion',
}
const EMPTY_EVT: FormEvento = {
    tipo: 'entrevista', fecha: new Date().toISOString().slice(0, 10),
    responsable: '', calificacion: '', comentarios: '', resultado: 'pendiente',
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function VacantesPage() {
    const { empresa } = useAuth() as any
    const [vacantes, setVacantes] = useState<Vacante[]>([])
    const [candidatos, setCandidatos] = useState<Candidato[]>([])
    const [eventos, setEventos] = useState<CandidatoEvento[]>([])
    const [secciones, setSecciones] = useState<SeccionNomina[]>([])
    const [cargos, setCargos] = useState<CargoNomina[]>([])
    const [loading, setLoading] = useState(true)
    const [vacanteActiva, setVacanteActiva] = useState<Vacante | null>(null)
    const [candidatoActivo, setCandidatoActivo] = useState<Candidato | null>(null)
    const [filtroEstado, setFiltroEstado] = useState<EstadoVacante | 'todas'>('todas')
    const [tabCand, setTabCand] = useState<'datos' | 'seguimiento'>('datos')

    // Modales
    const [modalVac, setModalVac] = useState(false)
    const [modalCand, setModalCand] = useState(false)
    const [modalEvt, setModalEvt] = useState(false)
    const [modalContratar, setModalContratar] = useState(false)

    // Formularios
    const [formVac, setFormVac] = useState<FormVacante>({ ...EMPTY_VAC })
    const [formCand, setFormCand] = useState<FormCandidato>({ ...EMPTY_CAND })
    const [formEvt, setFormEvt] = useState<FormEvento>({ ...EMPTY_EVT })
    const [formContratar, setFormContratar] = useState<FormContratar>({ fecha_ingreso: '', sueldo_base: '', tipo_nomina: 'mensual', tipo_contrato: '' })

    const [saving, setSaving] = useState(false)
    const [loadingCands, setLoadingCands] = useState(false)
    const [loadingEvts, setLoadingEvts] = useState(false)

    useEffect(() => {
        if (empresa?.id) loadData()
    }, [empresa?.id])

    async function loadData() {
        try {
            setLoading(true)
            const [vacs, secs, cars] = await Promise.all([
                vacantesService.listar(empresa!.id),
                estructuraOrganizativaService.listarSecciones(empresa!.id),
                estructuraOrganizativaService.listarCargos(empresa!.id),
            ])
            setVacantes(vacs)
            setSecciones(secs)
            setCargos(cars)
            if (vacanteActiva) {
                const v = vacs.find(x => x.id === vacanteActiva.id)
                if (v) setVacanteActiva(v)
            }
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    async function seleccionarVacante(v: Vacante) {
        setVacanteActiva(v)
        setCandidatoActivo(null)
        setLoadingCands(true)
        try {
            const c = await candidatosService.listarPorVacante(v.id)
            setCandidatos(c)
        } catch (e) { console.error(e) }
        finally { setLoadingCands(false) }
    }

    async function loadEventos(cand: Candidato) {
        setLoadingEvts(true)
        try {
            const ev = await candidatosService.listarEventos(cand.id)
            setEventos(ev)
        } catch (e) { console.error(e) }
        finally { setLoadingEvts(false) }
    }

    // ── Vacante CRUD ──────────────────────────────────────────────────────────

    function abrirNuevaVacante() {
        setFormVac({ ...EMPTY_VAC })
        setModalVac(true)
    }
    function abrirEditarVacante(v: Vacante) {
        setFormVac({
            id: v.id,
            titulo: v.titulo,
            cargo_id: v.cargo_id ?? '',
            seccion_id: v.seccion_id ?? '',
            descripcion: v.descripcion ?? '',
            sueldo_referencial: v.sueldo_referencial?.toString() ?? '',
            tipo_contrato: v.tipo_contrato ?? '',
            estado: v.estado,
            fecha_apertura: v.fecha_apertura,
            fecha_cierre: v.fecha_cierre ?? '',
        })
        setModalVac(true)
    }

    async function guardarVacante() {
        if (!formVac.titulo.trim()) { alert('El título es obligatorio'); return }
        setSaving(true)
        try {
            const payload = {
                empresa_id: empresa!.id,
                titulo: formVac.titulo.trim(),
                cargo_id: formVac.cargo_id || null,
                seccion_id: formVac.seccion_id || null,
                descripcion: formVac.descripcion || null,
                sueldo_referencial: formVac.sueldo_referencial ? parseFloat(formVac.sueldo_referencial) : null,
                tipo_contrato: (formVac.tipo_contrato as TipoContrato) || null,
                estado: formVac.estado,
                fecha_apertura: formVac.fecha_apertura,
                fecha_cierre: formVac.fecha_cierre || null,
            }
            if (formVac.id) {
                await vacantesService.actualizar(formVac.id, payload)
            } else {
                await vacantesService.crear(payload)
            }
            setModalVac(false)
            await loadData()
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function eliminarVacante(v: Vacante) {
        if (!confirm(`¿Eliminar la vacante "${v.titulo}"? Se eliminarán también sus candidatos.`)) return
        await vacantesService.eliminar(v.id)
        if (vacanteActiva?.id === v.id) setVacanteActiva(null)
        await loadData()
    }

    // ── Candidato CRUD ────────────────────────────────────────────────────────

    function abrirNuevoCandidato() {
        setFormCand({ ...EMPTY_CAND })
        setTabCand('datos')
        setModalCand(true)
    }
    function abrirEditarCandidato(c: Candidato) {
        setCandidatoActivo(c)
        setFormCand({
            id: c.id,
            nombres: c.nombres,
            apellidos: c.apellidos,
            cedula: c.cedula ?? '',
            email: c.email ?? '',
            telefono: c.telefono ?? '',
            fuente: c.fuente,
            referido_por: c.referido_por ?? '',
            cv_url: c.cv_url ?? '',
            notas: c.notas ?? '',
            etapa: c.etapa,
        })
        setTabCand('datos')
        setEventos([])
        loadEventos(c)
        setModalCand(true)
    }

    async function guardarCandidato() {
        if (!formCand.nombres.trim() || !formCand.apellidos.trim()) { alert('Nombres y apellidos son obligatorios'); return }
        if (!vacanteActiva) return
        setSaving(true)
        try {
            const payload = {
                empresa_id: empresa!.id,
                vacante_id: vacanteActiva.id,
                nombres: formCand.nombres.trim(),
                apellidos: formCand.apellidos.trim(),
                cedula: formCand.cedula || null,
                email: formCand.email || null,
                telefono: formCand.telefono || null,
                fuente: formCand.fuente as any,
                referido_por: formCand.referido_por || null,
                cv_url: formCand.cv_url || null,
                notas: formCand.notas || null,
                etapa: formCand.etapa,
            }
            if (formCand.id) {
                await candidatosService.actualizar(formCand.id, payload)
            } else {
                await candidatosService.crear(payload)
            }
            setModalCand(false)
            setCandidatoActivo(null)
            const c = await candidatosService.listarPorVacante(vacanteActiva.id)
            setCandidatos(c)
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function eliminarCandidato(c: Candidato) {
        if (!confirm(`¿Eliminar a ${c.apellidos} ${c.nombres}?`)) return
        await candidatosService.eliminar(c.id)
        if (vacanteActiva) {
            const updated = await candidatosService.listarPorVacante(vacanteActiva.id)
            setCandidatos(updated)
        }
    }

    // ── Evento CRUD ───────────────────────────────────────────────────────────

    function abrirNuevoEvento(c: Candidato) {
        setCandidatoActivo(c)
        setFormEvt({ ...EMPTY_EVT })
        setModalEvt(true)
    }

    async function guardarEvento() {
        if (!candidatoActivo) return
        setSaving(true)
        try {
            await candidatosService.crearEvento({
                empresa_id: empresa!.id,
                candidato_id: candidatoActivo.id,
                tipo: formEvt.tipo,
                fecha: formEvt.fecha,
                responsable: formEvt.responsable || null,
                calificacion: formEvt.calificacion ? parseInt(formEvt.calificacion) : null,
                comentarios: formEvt.comentarios || null,
                resultado: (formEvt.resultado as ResultadoEvento) || null,
            })
            setModalEvt(false)
            await loadEventos(candidatoActivo)
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    // ── Contratar ─────────────────────────────────────────────────────────────

    function abrirContratar(c: Candidato) {
        setCandidatoActivo(c)
        setFormContratar({
            fecha_ingreso: new Date().toISOString().slice(0, 10),
            sueldo_base: vacanteActiva?.sueldo_referencial?.toString() ?? '',
            tipo_nomina: 'mensual',
            tipo_contrato: vacanteActiva?.tipo_contrato ?? '',
        })
        setModalContratar(true)
    }

    async function confirmarContratar() {
        if (!candidatoActivo) return
        if (!formContratar.fecha_ingreso) { alert('Fecha de ingreso es obligatoria'); return }
        setSaving(true)
        try {
            await empleadosService.crearEmpleado({
                empresa_id: empresa!.id,
                nombres: candidatoActivo.nombres,
                apellidos: candidatoActivo.apellidos,
                cedula: candidatoActivo.cedula ?? '',
                email: candidatoActivo.email ?? null,
                telefono: candidatoActivo.telefono ?? null,
                fecha_ingreso: formContratar.fecha_ingreso,
                sueldo_base: parseFloat(formContratar.sueldo_base) || 0,
                tipo_nomina: formContratar.tipo_nomina,
                tipo_contrato: (formContratar.tipo_contrato as TipoContrato) || null,
                tipo_jornada: 'completa',
                afiliado_iess: true,
                decimo_tercero_modo: 'mensualizado',
                decimo_cuarto_modo: 'mensualizado',
                fondo_reserva_modo: 'mensual',
                cargas_familiares: 0,
            })
            await candidatosService.cambiarEtapa(candidatoActivo.id, 'contratado')
            setModalContratar(false)
            setCandidatoActivo(null)
            if (vacanteActiva) {
                const c = await candidatosService.listarPorVacante(vacanteActiva.id)
                setCandidatos(c)
            }
            alert(`¡${candidatoActivo.apellidos} ${candidatoActivo.nombres} fue registrado como empleado!\nCompleta su ficha en Talento → Empleados.`)
        } catch (e: any) { alert(`Error al contratar: ${e.message}`) }
        finally { setSaving(false) }
    }

    // ─── Renderizado ──────────────────────────────────────────────────────────

    const vacsFiltradas = vacantes.filter(v =>
        filtroEstado === 'todas' || v.estado === filtroEstado
    )

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Reclutamiento</h1>
                    <p className="text-slate-600 mt-1">Vacantes, candidatos y flujo de selección</p>
                </div>
                <button onClick={abrirNuevaVacante} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nueva Vacante
                </button>
            </div>

            {/* Filtros de estado */}
            <div className="flex gap-2 flex-wrap">
                {(['todas', 'abierta', 'en_proceso', 'cerrada', 'cancelada'] as const).map(e => (
                    <button key={e} onClick={() => setFiltroEstado(e)}
                        className={cn('px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                            filtroEstado === e
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                        {e === 'todas' ? 'Todas' : ESTADO_LABEL[e]}
                        {e !== 'todas' && (
                            <span className="ml-1.5 text-xs opacity-70">
                                ({vacantes.filter(v => v.estado === e).length})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Panel principal */}
            <div className={cn('grid gap-4', vacanteActiva ? 'grid-cols-[320px,1fr]' : 'grid-cols-1')}>

                {/* ── Lista de vacantes ── */}
                <div className="space-y-2">
                    {vacsFiltradas.length === 0 ? (
                        <div className="card flex flex-col items-center py-16 text-slate-400">
                            <Briefcase className="w-10 h-10 mb-3 opacity-40" />
                            <p className="font-semibold">Sin vacantes</p>
                            <button onClick={abrirNuevaVacante} className="btn btn-primary mt-4 text-sm flex items-center gap-1.5">
                                <Plus className="w-3.5 h-3.5" /> Crear primera vacante
                            </button>
                        </div>
                    ) : vacsFiltradas.map(v => (
                        <div key={v.id} onClick={() => seleccionarVacante(v)}
                            className={cn('card p-4 cursor-pointer transition-all hover:shadow-md',
                                vacanteActiva?.id === v.id && 'ring-2 ring-indigo-500')}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-900 truncate">{v.titulo}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {v.seccion?.nombre ?? v.cargo?.nombre ?? '—'}
                                        {v.sueldo_referencial && <span> · ${v.sueldo_referencial.toFixed(0)}</span>}
                                    </p>
                                </div>
                                <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold shrink-0', ESTADO_COLOR[v.estado])}>
                                    {ESTADO_LABEL[v.estado]}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-3">
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                    <Users className="w-3.5 h-3.5" />
                                    {(v.candidatos_count as any) ?? 0} candidatos
                                </span>
                                <div className="flex items-center gap-1">
                                    <button onClick={e => { e.stopPropagation(); abrirEditarVacante(v) }}
                                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); eliminarVacante(v) }}
                                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Panel de candidatos ── */}
                {vacanteActiva && (
                    <div className="card overflow-hidden flex flex-col">
                        {/* Header vacante */}
                        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">{vacanteActiva.titulo}</h2>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {vacanteActiva.seccion?.nombre && (
                                        <span className="text-xs text-slate-500">{vacanteActiva.seccion.nombre}</span>
                                    )}
                                    {vacanteActiva.sueldo_referencial && (
                                        <span className="text-xs text-slate-500">· ${vacanteActiva.sueldo_referencial.toFixed(2)}</span>
                                    )}
                                    {vacanteActiva.tipo_contrato && (
                                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                                            {vacanteActiva.tipo_contrato.replace('_', ' ')}
                                        </span>
                                    )}
                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', ESTADO_COLOR[vacanteActiva.estado])}>
                                        {ESTADO_LABEL[vacanteActiva.estado]}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => abrirNuevoCandidato()}
                                    className="btn btn-primary text-sm flex items-center gap-1.5">
                                    <UserPlus className="w-3.5 h-3.5" /> Candidato
                                </button>
                                <button onClick={() => setVacanteActiva(null)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Tabla de candidatos */}
                        <div className="flex-1 overflow-y-auto">
                            {loadingCands ? (
                                <div className="flex items-center justify-center py-12 text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />Cargando...
                                </div>
                            ) : candidatos.length === 0 ? (
                                <div className="flex flex-col items-center py-16 text-slate-400">
                                    <Users className="w-10 h-10 opacity-40 mb-3" />
                                    <p className="font-semibold">Sin candidatos registrados</p>
                                    <button onClick={abrirNuevoCandidato}
                                        className="btn btn-primary mt-4 text-sm flex items-center gap-1.5">
                                        <UserPlus className="w-3.5 h-3.5" /> Agregar candidato
                                    </button>
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidato</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Etapa</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Fuente</th>
                                            <th className="px-4 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {candidatos.map(c => (
                                            <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-slate-900">{c.apellidos} {c.nombres}</p>
                                                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                                                        {c.email && <span className="flex items-center gap-0.5"><Mail className="w-3 h-3" />{c.email}</span>}
                                                        {c.telefono && <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" />{c.telefono}</span>}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', ETAPA_COLOR[c.etapa])}>
                                                        {ETAPA_LABEL[c.etapa]}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-500">
                                                    {FUENTE_LABEL[c.fuente]}
                                                    {c.referido_por && <span className="block text-slate-400">por: {c.referido_por}</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1 justify-end">
                                                        {c.cv_url && (
                                                            <a href={c.cv_url} target="_blank" rel="noreferrer"
                                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                                title="Ver CV">
                                                                <FileText className="w-4 h-4" />
                                                            </a>
                                                        )}
                                                        <button onClick={() => abrirNuevoEvento(c)}
                                                            title="Registrar evento"
                                                            className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors">
                                                            <Calendar className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => abrirEditarCandidato(c)}
                                                            title="Editar / seguimiento"
                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        {(c.etapa === 'oferta' || c.etapa === 'evaluacion') && (
                                                            <button onClick={() => abrirContratar(c)}
                                                                title="Contratar como empleado"
                                                                className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors">
                                                                <CheckCircle className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button onClick={() => eliminarCandidato(c)}
                                                            title="Eliminar"
                                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ──────────────────────────────────── MODAL: VACANTE ──── */}
            {modalVac && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">
                                {formVac.id ? 'Editar Vacante' : 'Nueva Vacante'}
                            </h3>
                            <button onClick={() => setModalVac(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Título de la vacante *</label>
                                <input className="input w-full" value={formVac.titulo}
                                    onChange={e => setFormVac(v => ({ ...v, titulo: e.target.value }))}
                                    placeholder="Ej: Desarrollador Senior React" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Sección</label>
                                    <select className="input w-full" value={formVac.seccion_id}
                                        onChange={e => setFormVac(v => ({ ...v, seccion_id: e.target.value }))}>
                                        <option value="">— Sin sección —</option>
                                        {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cargo objetivo</label>
                                    <select className="input w-full" value={formVac.cargo_id}
                                        onChange={e => setFormVac(v => ({ ...v, cargo_id: e.target.value }))}>
                                        <option value="">— Sin cargo —</option>
                                        {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Sueldo referencial (USD)</label>
                                    <input type="number" min="0" step="0.01" className="input w-full"
                                        value={formVac.sueldo_referencial}
                                        onChange={e => setFormVac(v => ({ ...v, sueldo_referencial: e.target.value }))}
                                        placeholder="0.00" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de contrato</label>
                                    <select className="input w-full" value={formVac.tipo_contrato}
                                        onChange={e => setFormVac(v => ({ ...v, tipo_contrato: e.target.value }))}>
                                        <option value="">—</option>
                                        <option value="indefinido">Indefinido</option>
                                        <option value="plazo_fijo">Plazo fijo</option>
                                        <option value="prueba">A prueba</option>
                                        <option value="honorarios">Honorarios</option>
                                        <option value="servicios">Servicios ocasionales</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
                                    <select className="input w-full" value={formVac.estado}
                                        onChange={e => setFormVac(v => ({ ...v, estado: e.target.value as EstadoVacante }))}>
                                        <option value="abierta">Abierta</option>
                                        <option value="en_proceso">En proceso</option>
                                        <option value="cerrada">Cerrada</option>
                                        <option value="cancelada">Cancelada</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha apertura</label>
                                    <input type="date" className="input w-full" value={formVac.fecha_apertura}
                                        onChange={e => setFormVac(v => ({ ...v, fecha_apertura: e.target.value }))} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción del perfil</label>
                                <textarea className="input w-full resize-none" rows={3}
                                    value={formVac.descripcion}
                                    onChange={e => setFormVac(v => ({ ...v, descripcion: e.target.value }))}
                                    placeholder="Requisitos, responsabilidades, beneficios..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalVac(false)} className="btn btn-secondary flex items-center gap-2">
                                <X className="w-4 h-4" /> Cancelar
                            </button>
                            <button onClick={guardarVacante} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ──────────────────────────────────── MODAL: CANDIDATO ──── */}
            {modalCand && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">
                                {formCand.id ? `${formCand.apellidos} ${formCand.nombres}` : 'Nuevo Candidato'}
                            </h3>
                            <button onClick={() => { setModalCand(false); setCandidatoActivo(null) }}
                                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        {/* Tabs candidato */}
                        <div className="flex border-b border-slate-200 px-6 gap-1">
                            {(['datos', 'seguimiento'] as const).map(t => (
                                <button key={t} onClick={() => setTabCand(t)}
                                    className={cn('px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
                                        tabCand === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                                    {t === 'datos' ? 'Datos personales' : 'Etapa y seguimiento'}
                                </button>
                            ))}
                        </div>
                        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

                            {tabCand === 'datos' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Apellidos *</label>
                                            <input className="input w-full" value={formCand.apellidos}
                                                onChange={e => setFormCand(v => ({ ...v, apellidos: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombres *</label>
                                            <input className="input w-full" value={formCand.nombres}
                                                onChange={e => setFormCand(v => ({ ...v, nombres: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Cédula</label>
                                            <input className="input w-full" value={formCand.cedula}
                                                onChange={e => setFormCand(v => ({ ...v, cedula: e.target.value }))}
                                                placeholder="1712345678" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                                            <input className="input w-full" value={formCand.telefono}
                                                onChange={e => setFormCand(v => ({ ...v, telefono: e.target.value }))}
                                                placeholder="0991234567" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                                        <input type="email" className="input w-full" value={formCand.email}
                                            onChange={e => setFormCand(v => ({ ...v, email: e.target.value }))}
                                            placeholder="candidato@email.com" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Fuente</label>
                                            <select className="input w-full" value={formCand.fuente}
                                                onChange={e => setFormCand(v => ({ ...v, fuente: e.target.value }))}>
                                                <option value="directo">Directo</option>
                                                <option value="referido">Referido</option>
                                                <option value="portal">Portal web</option>
                                                <option value="linkedin">LinkedIn</option>
                                                <option value="bolsa_trabajo">Bolsa de trabajo</option>
                                                <option value="otro">Otro</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Referido por</label>
                                            <input className="input w-full" value={formCand.referido_por}
                                                onChange={e => setFormCand(v => ({ ...v, referido_por: e.target.value }))}
                                                placeholder="Nombre del referente" disabled={formCand.fuente !== 'referido'} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">URL del CV</label>
                                        <input className="input w-full" value={formCand.cv_url}
                                            onChange={e => setFormCand(v => ({ ...v, cv_url: e.target.value }))}
                                            placeholder="https://..." />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
                                        <textarea className="input w-full resize-none" rows={2}
                                            value={formCand.notas}
                                            onChange={e => setFormCand(v => ({ ...v, notas: e.target.value }))}
                                            placeholder="Impresión general, fortalezas, debilidades..." />
                                    </div>
                                </>
                            )}

                            {tabCand === 'seguimiento' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Etapa actual</label>
                                        <select className="input w-full" value={formCand.etapa}
                                            onChange={e => setFormCand(v => ({ ...v, etapa: e.target.value as EtapaCandidato }))}>
                                            {(Object.keys(ETAPA_LABEL) as EtapaCandidato[]).map(e => (
                                                <option key={e} value={e}>{ETAPA_LABEL[e]}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Timeline de eventos */}
                                    <div className="border-t border-slate-100 pt-3">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                            Historial de eventos
                                        </p>
                                        {loadingEvts ? (
                                            <div className="flex items-center gap-2 text-slate-400 text-sm">
                                                <Loader2 className="w-4 h-4 animate-spin" />Cargando...
                                            </div>
                                        ) : eventos.length === 0 ? (
                                            <p className="text-sm text-slate-400">Sin eventos registrados.</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {eventos.map(ev => (
                                                    <div key={ev.id} className="flex gap-3">
                                                        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                                                            ev.resultado === 'aprobado' ? 'bg-green-100' :
                                                            ev.resultado === 'reprobado' ? 'bg-red-100' : 'bg-slate-100')}>
                                                            {ev.resultado === 'aprobado' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                                                             ev.resultado === 'reprobado' ? <XCircle className="w-4 h-4 text-red-500" /> :
                                                             <Clock className="w-4 h-4 text-slate-400" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm font-semibold text-slate-700">
                                                                    {TIPO_EVENTO_LABEL[ev.tipo]}
                                                                </p>
                                                                {estrellas(ev.calificacion)}
                                                            </div>
                                                            <p className="text-xs text-slate-400">{ev.fecha}{ev.responsable && ` · ${ev.responsable}`}</p>
                                                            {ev.comentarios && <p className="text-xs text-slate-600 mt-0.5">{ev.comentarios}</p>}
                                                        </div>
                                                        <button onClick={() => candidatosService.eliminarEvento(ev.id).then(() => {
                                                            if (candidatoActivo) loadEventos(candidatoActivo)
                                                        })}
                                                            className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <div>
                                {formCand.id && (formCand.etapa === 'oferta' || formCand.etapa === 'evaluacion') && (
                                    <button onClick={() => {
                                        setModalCand(false)
                                        const c = candidatos.find(x => x.id === formCand.id)
                                        if (c) abrirContratar(c)
                                    }}
                                        className="btn text-sm flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                                        <ArrowRight className="w-3.5 h-3.5" /> Contratar
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => { setModalCand(false); setCandidatoActivo(null) }}
                                    className="btn btn-secondary flex items-center gap-2">
                                    <X className="w-4 h-4" /> Cancelar
                                </button>
                                <button onClick={guardarCandidato} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ──────────────────────────────────── MODAL: EVENTO ──── */}
            {modalEvt && candidatoActivo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">
                                Registrar evento — {candidatoActivo.apellidos} {candidatoActivo.nombres}
                            </h3>
                            <button onClick={() => setModalEvt(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de evento</label>
                                    <select className="input w-full" value={formEvt.tipo}
                                        onChange={e => setFormEvt(v => ({ ...v, tipo: e.target.value as TipoEvento }))}>
                                        <option value="entrevista">Entrevista</option>
                                        <option value="evaluacion">Evaluación</option>
                                        <option value="prueba_tecnica">Prueba técnica</option>
                                        <option value="llamada">Llamada</option>
                                        <option value="otro">Otro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha</label>
                                    <input type="date" className="input w-full" value={formEvt.fecha}
                                        onChange={e => setFormEvt(v => ({ ...v, fecha: e.target.value }))} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Responsable</label>
                                    <input className="input w-full" value={formEvt.responsable}
                                        onChange={e => setFormEvt(v => ({ ...v, responsable: e.target.value }))}
                                        placeholder="Nombre del entrevistador" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Calificación (1–5)</label>
                                    <select className="input w-full" value={formEvt.calificacion}
                                        onChange={e => setFormEvt(v => ({ ...v, calificacion: e.target.value }))}>
                                        <option value="">Sin calificar</option>
                                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Resultado</label>
                                <select className="input w-full" value={formEvt.resultado}
                                    onChange={e => setFormEvt(v => ({ ...v, resultado: e.target.value as ResultadoEvento | '' }))}>
                                    <option value="pendiente">Pendiente</option>
                                    <option value="aprobado">Aprobado</option>
                                    <option value="reprobado">Reprobado</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Comentarios</label>
                                <textarea className="input w-full resize-none" rows={3}
                                    value={formEvt.comentarios}
                                    onChange={e => setFormEvt(v => ({ ...v, comentarios: e.target.value }))}
                                    placeholder="Impresiones, fortalezas observadas, puntos de mejora..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalEvt(false)} className="btn btn-secondary flex items-center gap-2">
                                <X className="w-4 h-4" /> Cancelar
                            </button>
                            <button onClick={guardarEvento} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar evento
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ──────────────────────────────────── MODAL: CONTRATAR ──── */}
            {modalContratar && candidatoActivo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">Contratar candidato</h3>
                            <button onClick={() => setModalContratar(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                                <p className="font-semibold text-emerald-800">
                                    {candidatoActivo.apellidos} {candidatoActivo.nombres}
                                </p>
                                <p className="text-sm text-emerald-600 mt-0.5">
                                    Se creará como empleado. Completa la ficha completa en Empleados.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de ingreso *</label>
                                    <input type="date" className="input w-full" value={formContratar.fecha_ingreso}
                                        onChange={e => setFormContratar(v => ({ ...v, fecha_ingreso: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Sueldo base (USD)</label>
                                    <input type="number" min="0" step="0.01" className="input w-full"
                                        value={formContratar.sueldo_base}
                                        onChange={e => setFormContratar(v => ({ ...v, sueldo_base: e.target.value }))}
                                        placeholder="0.00" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de nómina</label>
                                    <select className="input w-full" value={formContratar.tipo_nomina}
                                        onChange={e => setFormContratar(v => ({ ...v, tipo_nomina: e.target.value as 'mensual' | 'quincenal' }))}>
                                        <option value="mensual">Mensual</option>
                                        <option value="quincenal">Quincenal</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de contrato</label>
                                    <select className="input w-full" value={formContratar.tipo_contrato}
                                        onChange={e => setFormContratar(v => ({ ...v, tipo_contrato: e.target.value }))}>
                                        <option value="">—</option>
                                        <option value="indefinido">Indefinido</option>
                                        <option value="plazo_fijo">Plazo fijo</option>
                                        <option value="prueba">A prueba</option>
                                        <option value="honorarios">Honorarios</option>
                                        <option value="servicios">Servicios ocasionales</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalContratar(false)} className="btn btn-secondary flex items-center gap-2">
                                <X className="w-4 h-4" /> Cancelar
                            </button>
                            <button onClick={confirmarContratar} disabled={saving}
                                className="btn flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Confirmar contratación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
