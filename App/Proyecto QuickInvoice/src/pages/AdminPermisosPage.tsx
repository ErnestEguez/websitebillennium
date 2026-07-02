import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth, DEFAULT_PERMISOS, type Permisos } from '../contexts/AuthContext'
import { UserCog, Loader2, RefreshCw, ShieldOff, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'

interface UsuarioFila {
    user_id:  string
    nombre:   string
    permisos: Permisos
    dirty:    boolean
    saving:   boolean
}

const MODULOS = [
    {
        key: 'facturacion', label: 'Facturación',
        items: [
            { field: 'perm_dashboard',          label: 'Dashboard' },
            { field: 'perm_nueva_factura',       label: 'Nueva Factura' },
            { field: 'perm_comprobantes',        label: 'Comprobantes' },
            { field: 'perm_notas_credito',       label: 'Notas de Crédito' },
            { field: 'perm_anulacion_facturas',  label: 'Anulación Facturas' },
            { field: 'perm_cierres_caja',        label: 'Cierres de Caja' },
            { field: 'perm_consulta_ventas',     label: 'Consulta Ventas' },
        ],
    },
    {
        key: 'clientes', label: 'Manejo de Clientes',
        items: [
            { field: 'perm_clientes',           label: 'Clientes' },
            { field: 'perm_cartera_cxc',        label: 'Cartera / Abonos' },
            { field: 'perm_consulta_cartera',   label: 'Consulta Cartera' },
            { field: 'perm_estado_cuenta',      label: 'Estado de Cuenta' },
        ],
    },
    {
        key: 'vendor', label: 'Compras / Proveedores',
        items: [
            { field: 'perm_proveedores',    label: 'Proveedores' },
            { field: 'perm_compras',        label: 'Compras' },
            { field: 'perm_cxp',            label: 'Cuentas por Pagar' },
            { field: 'perm_reportes_cxp',   label: 'Reportes Compras' },
        ],
    },
    {
        key: 'finance', label: 'Tesorería',
        items: [
            { field: 'perm_bancos',             label: 'Cuentas Bancarias' },
            { field: 'perm_egresos',            label: 'Egresos' },
            { field: 'perm_cheques',            label: 'Cheques' },
            { field: 'perm_movimientos_banc',   label: 'Movimientos Bancarios' },
            { field: 'perm_conciliacion',       label: 'Conciliación' },
            { field: 'perm_cierres_caja',       label: 'Cierre Caja General' },
        ],
    },
    {
        key: 'gerencia', label: 'Gerencia',
        items: [
            { field: 'perm_gerencia', label: 'Resumen Operacional' },
        ],
    },
    {
        key: 'ledgerpro', label: 'Contabilidad',
        items: [
            { field: 'perm_plan_cuentas',   label: 'Plan de Cuentas' },
            { field: 'perm_asientos',       label: 'Diarios / Asientos' },
            { field: 'perm_reportes_cont',  label: 'Reportes' },
            { field: 'perm_tributario',     label: 'Tributario' },
        ],
    },
    {
        key: 'talento', label: 'Talento Humano y Nóminas',
        items: [
            { field: 'perm_th_empleados',         label: 'Empleados' },
            { field: 'perm_th_estructura',        label: 'Estructura Organizativa' },
            { field: 'perm_th_rol_nomina',        label: 'Períodos / Rol de Pagos' },
            { field: 'perm_th_conceptos_nomina',  label: 'Conceptos de Nómina' },
            { field: 'perm_th_nomina_parametros', label: 'Parámetros de Nómina' },
        ],
    },
]

export function AdminPermisosPage() {
    const { empresa, isAdmin, loading: authLoading } = useAuth() as any
    const [filas, setFilas]             = useState<UsuarioFila[]>([])
    const [loading, setLoading]         = useState(true)
    const [selectedUser, setSelectedUser] = useState<string | null>(null)
    const [openMods, setOpenMods]       = useState<string[]>(['facturacion'])

    useEffect(() => { if (empresa?.id) cargar() }, [empresa?.id])

    async function cargar() {
        setLoading(true)
        try {
            // 1. Todos los usuarios de esta empresa: legacy (profiles.empresa_id)
            //    + multiempresa (usuario_empresas)
            const { data: ueRows } = await supabase
                .from('usuario_empresas')
                .select('user_id')
                .eq('empresa_id', empresa.id)
                .eq('activo', true)

            const ueUserIds = (ueRows ?? []).map(r => r.user_id)

            let profsQuery = supabase.from('profiles').select('id, nombre')
            profsQuery = ueUserIds.length
                ? profsQuery.or(`empresa_id.eq.${empresa.id},id.in.(${ueUserIds.join(',')})`)
                : profsQuery.eq('empresa_id', empresa.id)

            const { data: profs } = await profsQuery

            if (!profs?.length) { setFilas([]); return }
            const userIds = profs.map(pr => pr.id)

            // 2. user_permisos existentes
            const { data: permsData } = await supabase
                .from('user_permisos')
                .select('*')
                .eq('empresa_id', empresa.id)
                .in('user_id', userIds)

            const permsPor: Record<string, Permisos> = {}
            permsData?.forEach(r => {
                const def = DEFAULT_PERMISOS
                permsPor[r.user_id] = {
                    perm_dashboard:          r.perm_dashboard          ?? def.perm_dashboard,
                    perm_nueva_factura:      r.perm_nueva_factura      ?? def.perm_nueva_factura,
                    perm_comprobantes:       r.perm_comprobantes       ?? def.perm_comprobantes,
                    perm_notas_credito:      r.perm_notas_credito      ?? def.perm_notas_credito,
                    perm_anulacion_facturas: r.perm_anulacion_facturas ?? def.perm_anulacion_facturas,
                    perm_cierres_caja:       r.perm_cierres_caja       ?? def.perm_cierres_caja,
                    perm_consulta_ventas:    r.perm_consulta_ventas    ?? def.perm_consulta_ventas,
                    perm_gerencia:           r.perm_gerencia           ?? def.perm_gerencia,
                    perm_clientes:           r.perm_clientes           ?? def.perm_clientes,
                    perm_cartera_cxc:        r.perm_cartera_cxc        ?? def.perm_cartera_cxc,
                    perm_consulta_cartera:   r.perm_consulta_cartera   ?? def.perm_consulta_cartera,
                    perm_estado_cuenta:      r.perm_estado_cuenta      ?? def.perm_estado_cuenta,
                    perm_proveedores:        r.perm_proveedores        ?? def.perm_proveedores,
                    perm_compras:            r.perm_compras            ?? def.perm_compras,
                    perm_cxp:                r.perm_cxp               ?? def.perm_cxp,
                    perm_reportes_cxp:       r.perm_reportes_cxp       ?? def.perm_reportes_cxp,
                    perm_bancos:             r.perm_bancos             ?? def.perm_bancos,
                    perm_egresos:            r.perm_egresos            ?? def.perm_egresos,
                    perm_cheques:            r.perm_cheques            ?? def.perm_cheques,
                    perm_movimientos_banc:   r.perm_movimientos_banc   ?? def.perm_movimientos_banc,
                    perm_conciliacion:       r.perm_conciliacion       ?? def.perm_conciliacion,
                    perm_plan_cuentas:       r.perm_plan_cuentas       ?? def.perm_plan_cuentas,
                    perm_asientos:           r.perm_asientos           ?? def.perm_asientos,
                    perm_reportes_cont:      r.perm_reportes_cont      ?? def.perm_reportes_cont,
                    perm_tributario:         r.perm_tributario         ?? def.perm_tributario,
                    perm_th_estructura:        r.perm_th_estructura        ?? def.perm_th_estructura,
                    perm_th_empleados:          r.perm_th_empleados          ?? def.perm_th_empleados,
                    perm_th_nomina_parametros:  r.perm_th_nomina_parametros  ?? def.perm_th_nomina_parametros,
                    perm_th_conceptos_nomina:   r.perm_th_conceptos_nomina   ?? def.perm_th_conceptos_nomina,
                    perm_th_rol_nomina:         r.perm_th_rol_nomina         ?? def.perm_th_rol_nomina,
                }
            })

            const resultado: UsuarioFila[] = profs.map(pr => ({
                user_id: pr.id,
                nombre:  pr.nombre ?? pr.id.slice(0, 8),
                permisos: permsPor[pr.id] ?? { ...DEFAULT_PERMISOS },
                dirty:   false,
                saving:  false,
            }))

            setFilas(resultado)
            if (resultado.length && !selectedUser) setSelectedUser(resultado[0].user_id)
        } finally {
            setLoading(false)
        }
    }

    function updatePerm(userId: string, field: keyof Permisos, value: boolean) {
        setFilas(prev => prev.map(f =>
            f.user_id === userId
                ? { ...f, dirty: true, permisos: { ...f.permisos, [field]: value } }
                : f
        ))
    }

    function setTodosMod(userId: string, modKey: string, value: boolean) {
        const items = MODULOS.find(m => m.key === modKey)?.items ?? []
        setFilas(prev => prev.map(f => {
            if (f.user_id !== userId) return f
            const updated = { ...f.permisos }
            items.forEach(i => { (updated as any)[i.field] = value })
            return { ...f, dirty: true, permisos: updated }
        }))
    }

    function setTodosSistema(userId: string, value: boolean) {
        setFilas(prev => prev.map(f => {
            if (f.user_id !== userId) return f
            const updated = {} as Permisos
            Object.keys(DEFAULT_PERMISOS).forEach(k => { (updated as any)[k] = value })
            return { ...f, dirty: true, permisos: updated }
        }))
    }

    async function guardar(userId: string) {
        const fila = filas.find(f => f.user_id === userId)
        if (!fila) return
        setFilas(prev => prev.map(f => f.user_id === userId ? { ...f, saving: true } : f))
        try {
            await supabase
                .from('user_permisos')
                .upsert({
                    user_id: userId, empresa_id: empresa.id,
                    ...fila.permisos,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id,empresa_id' })

            setFilas(prev => prev.map(f =>
                f.user_id === userId ? { ...f, dirty: false, saving: false } : f
            ))
        } catch {
            setFilas(prev => prev.map(f => f.user_id === userId ? { ...f, saving: false } : f))
        }
    }

    if (authLoading) return (
        <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
    )

    if (!isAdmin) return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <ShieldOff className="w-12 h-12 mb-4 opacity-40" />
            <p className="font-semibold">Solo el administrador puede acceder a esta pantalla.</p>
        </div>
    )

    const fila = filas.find(f => f.user_id === selectedUser)

    return (
        <div className="max-w-3xl space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center">
                        <UserCog className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Permisos de usuario</h1>
                        <p className="text-sm text-slate-500">Selecciona un usuario y asigna sus permisos de menú.</p>
                    </div>
                </div>
                <button onClick={cargar} className="p-2 text-slate-400 hover:text-slate-700">
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
            ) : filas.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    No hay usuarios registrados para esta empresa.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Lista de usuarios */}
                    <div className="md:col-span-1 space-y-1">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 mb-2">Usuarios</p>
                        {filas.map(f => (
                            <button key={f.user_id} onClick={() => setSelectedUser(f.user_id)}
                                className={cn(
                                    'w-full text-left px-4 py-3 rounded-xl border transition-all',
                                    selectedUser === f.user_id
                                        ? 'bg-primary-50 border-primary-200 text-primary-900 font-semibold'
                                        : 'bg-white border-slate-200 text-slate-700 hover:border-primary-200'
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-sm truncate">{f.nombre}</span>
                                    {f.dirty && <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Panel de permisos */}
                    {fila && (
                        <div className="md:col-span-2 space-y-3">

                            {/* Acciones rápidas globales */}
                            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                                <span className="text-sm font-semibold text-slate-700">{fila.nombre}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setTodosSistema(fila.user_id, true)}
                                        className="text-xs px-3 py-1.5 rounded-lg bg-primary-100 text-primary-700 hover:bg-primary-200 font-medium transition-colors">
                                        Dar todo
                                    </button>
                                    <button onClick={() => setTodosSistema(fila.user_id, false)}
                                        className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-colors">
                                        Quitar todo
                                    </button>
                                </div>
                            </div>

                            {/* Módulos */}
                            {MODULOS.map(mod => {
                                const isOpen = openMods.includes(mod.key)
                                const allOn  = mod.items.every(i => (fila.permisos as any)[i.field])
                                return (
                                    <div key={mod.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                                            <button
                                                onClick={() => setOpenMods(prev =>
                                                    prev.includes(mod.key)
                                                        ? prev.filter(k => k !== mod.key)
                                                        : [...prev, mod.key])}
                                                className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                                            >
                                                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                {mod.label}
                                            </button>
                                            <button
                                                onClick={() => setTodosMod(fila.user_id, mod.key, !allOn)}
                                                className={cn(
                                                    'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                                                    allOn
                                                        ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                )}
                                            >
                                                {allOn ? 'Quitar todos' : 'Dar todos'}
                                            </button>
                                        </div>

                                        {isOpen && (
                                            <div className="divide-y divide-slate-50">
                                                {mod.items.map(item => (
                                                    <div key={item.field} className="flex items-center justify-between px-4 py-2.5">
                                                        <span className="text-sm text-slate-700">{item.label}</span>
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input type="checkbox" className="sr-only peer"
                                                                checked={(fila.permisos as any)[item.field]}
                                                                onChange={e => updatePerm(fila.user_id, item.field as keyof Permisos, e.target.checked)} />
                                                            <div className="w-9 h-5 bg-slate-200 peer-checked:bg-primary-500 rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {/* Guardar */}
                            <button
                                onClick={() => guardar(fila.user_id)}
                                disabled={!fila.dirty || fila.saving}
                                className={cn(
                                    'w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all',
                                    fila.dirty
                                        ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                )}
                            >
                                {fila.saving
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                                    : <><Save className="w-4 h-4" /> {fila.dirty ? 'Guardar cambios' : 'Sin cambios'}</>
                                }
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
