/**
 * BuscadorCuentaContable — buscador interactivo de cuentas contables (LedgerPro).
 * Trae el plan de cuentas (acepta_movimientos=true) una sola vez y filtra
 * en el cliente por código/nombre a medida que se escribe — igual patrón
 * de interacción que BuscadorCliente/BuscadorProducto, pero sin ida y
 * vuelta al servidor por cada tecla porque el plan de cuentas es acotado.
 */
import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { contableConfigService, type CuentaLP } from '../services/contableConfigService'
import { cn } from '../lib/utils'

interface Props {
    portalRuc?: string
    value?: string | null
    onChange: (cuenta: CuentaLP | null) => void
    placeholder?: string
    className?: string
}

export function BuscadorCuentaContable({ portalRuc, value, onChange, placeholder = 'Buscar cuenta contable por código o nombre…', className }: Props) {
    const [cuentas, setCuentas]       = useState<CuentaLP[]>([])
    const [cargando, setCargando]     = useState(false)
    const [texto, setTexto]           = useState('')
    const [open, setOpen]             = useState(false)
    const cargado = useRef(false)

    useEffect(() => {
        if (cargado.current) return
        cargado.current = true
        setCargando(true)
        contableConfigService.getCuentas(portalRuc)
            .then(setCuentas)
            .finally(() => setCargando(false))
    }, [portalRuc])

    useEffect(() => {
        if (!value) { if (!texto) setTexto(''); return }
        const actual = cuentas.find(c => c.id === value)
        if (actual) setTexto(`${actual.codigo} — ${actual.nombre}`)
    }, [value, cuentas])

    const resultados = texto.trim().length > 0
        ? cuentas.filter(c => {
              const q = texto.trim().toLowerCase()
              return c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)
          }).slice(0, 50)
        : []

    function seleccionar(c: CuentaLP) {
        onChange(c)
        setTexto(`${c.codigo} — ${c.nombre}`)
        setOpen(false)
    }

    function limpiar() {
        onChange(null)
        setTexto('')
        setOpen(false)
    }

    return (
        <div className={cn('relative', className)}>
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                    type="text"
                    value={texto}
                    onChange={e => { setTexto(e.target.value); setOpen(true) }}
                    onFocus={() => texto && setOpen(true)}
                    placeholder={cargando ? 'Cargando plan de cuentas…' : placeholder}
                    disabled={cargando}
                    className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-400 disabled:bg-slate-50"
                />
                {cargando
                    ? <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
                    : texto && (
                        <button type="button" onClick={limpiar}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
            </div>

            {open && resultados.length > 0 && (
                <div className="absolute z-30 left-0 top-full mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-2xl max-h-64 overflow-y-auto">
                    {resultados.map(c => (
                        <button
                            key={c.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); seleccionar(c) }}
                            className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 text-sm"
                        >
                            <span className="font-medium text-slate-800">{c.nombre}</span>
                            <span className="text-xs text-slate-400 font-mono shrink-0">{c.codigo}</span>
                        </button>
                    ))}
                </div>
            )}
            {open && texto.trim().length > 0 && resultados.length === 0 && !cargando && (
                <div className="absolute z-30 left-0 top-full mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-md px-4 py-3 text-sm text-slate-400">
                    Sin resultados para <strong>{texto}</strong>
                </div>
            )}
        </div>
    )
}
