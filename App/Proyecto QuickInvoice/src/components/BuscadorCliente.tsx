/**
 * BuscadorCliente — busca clientes por nombre o identificación con ILIKE.
 * Solo ejecuta la búsqueda cuando el usuario presiona Enter o el botón Buscar.
 * Soporta wildcard * → %
 */
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Loader2, X } from 'lucide-react'
import { cn } from '../lib/utils'

export interface ClienteResultado {
    id: string
    nombre: string
    identificacion: string
    email?: string | null
    telefono?: string | null
    direccion?: string | null
}

interface Props {
    empresaId: string
    onSelect: (c: ClienteResultado) => void
    placeholder?: string
    className?: string
}

export function BuscadorCliente({ empresaId, onSelect, placeholder = 'Nombre o RUC/cédula (Enter para buscar)…', className }: Props) {
    const [texto, setTexto]           = useState('')
    const [resultados, setResultados] = useState<ClienteResultado[]>([])
    const [buscando, setBuscando]     = useState(false)
    const [open, setOpen]             = useState(false)

    async function buscar() {
        const t = texto.trim()
        if (!t || !empresaId) return
        setBuscando(true)
        try {
            const q = '%' + t.replace(/\*/g, '%') + '%'
            const { data } = await supabase
                .from('clientes')
                .select('id, nombre, identificacion, email, telefono, direccion')
                .eq('empresa_id', empresaId)
                .or(`nombre.ilike.${q},identificacion.ilike.${q}`)
                .order('nombre')
                .limit(50)
            setResultados((data ?? []) as ClienteResultado[])
            setOpen(true)
        } finally { setBuscando(false) }
    }

    function seleccionar(c: ClienteResultado) {
        onSelect(c)
        setTexto(c.nombre)
        setResultados([])
        setOpen(false)
    }

    return (
        <div className={cn('relative', className)}>
            <div className="flex gap-1">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        value={texto}
                        onChange={e => { setTexto(e.target.value); setOpen(false) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }}
                        placeholder={placeholder}
                        className="w-full pl-8 pr-2 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    {texto && (
                        <button type="button" onClick={() => { setTexto(''); setResultados([]); setOpen(false) }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={buscar}
                    disabled={buscando || !texto.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 shrink-0"
                >
                    {buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Buscar
                </button>
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
                            <span className="text-xs text-slate-400 font-mono shrink-0">{c.identificacion}</span>
                        </button>
                    ))}
                </div>
            )}
            {open && resultados.length === 0 && !buscando && (
                <div className="absolute z-30 left-0 top-full mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-md px-4 py-3 text-sm text-slate-400">
                    Sin resultados para <strong>{texto}</strong>
                </div>
            )}
        </div>
    )
}
