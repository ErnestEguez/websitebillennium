import { Plus, Trash2 } from 'lucide-react'
import type { TipoRetencion } from '../../types/vendors'
import type { CodigoRetencion } from '../../services/codigoRetencionService'
import { cn } from '../../lib/utils'

export interface RetLine {
    tipo:        TipoRetencion
    codigo:      string
    descripcion: string
    base:        number
    pct:         number
    valor:       number
}

const EMPTY_RET: RetLine = {
    tipo: 'FUENTE', codigo: '', descripcion: '', base: 0, pct: 0, valor: 0,
}

interface Props {
    // Número único de comprobante de retención (aplica a todas las líneas)
    numeroRetencion:   string
    onChangeNumero:    (n: string) => void
    retenciones:       RetLine[]
    onChange:          (list: RetLine[]) => void
    baseDefault:       number   // base para líneas FUENTE (subtotal de la factura)
    baseIva?:          number   // base para líneas de IVA (valor_iva de la factura)
    codigos:           CodigoRetencion[]   // catálogo leído desde la BD (codigos_retencion)
}

export function RetencionesEditor({
    numeroRetencion, onChangeNumero,
    retenciones, onChange, baseDefault, baseIva = 0, codigos,
}: Props) {

    function baseParaTipo(tipo: TipoRetencion) {
        return tipo === 'IVA' ? baseIva : baseDefault
    }

    function add() {
        if (retenciones.length >= 4) return
        onChange([...retenciones, { ...EMPTY_RET, base: baseDefault }])
    }

    function remove(i: number) { onChange(retenciones.filter((_, j) => j !== i)) }

    function upd(i: number, campo: keyof RetLine, val: unknown) {
        const next = retenciones.map((r, j) => {
            if (j !== i) return r
            const updated = { ...r, [campo]: val }
            if (campo === 'base' || campo === 'pct') {
                updated.valor = Math.round(updated.base * updated.pct / 100 * 100) / 100
            }
            return updated
        })
        onChange(next)
    }

    function selCodigo(i: number, tipo: TipoRetencion, codigo: string) {
        const item  = codigos.find(c => c.tipo === tipo && c.codigo === codigo)
        const next  = retenciones.map((r, j) => {
            if (j !== i) return r
            const pct  = item?.porcentaje ?? r.pct
            const base = r.base || baseParaTipo(tipo)
            return { ...r, codigo, descripcion: item?.descripcion ?? '', pct, base,
                valor: Math.round(base * pct / 100 * 100) / 100 }
        })
        onChange(next)
    }

    function changeTipo(i: number, tipo: TipoRetencion) {
        const base = baseParaTipo(tipo)
        onChange(retenciones.map((r, j) =>
            j !== i ? r : { ...EMPTY_RET, tipo, base }
        ))
    }

    const totalRet = retenciones.reduce((s, r) => s + r.valor, 0)

    return (
        <div className="space-y-4 pt-2">
            {/* Número único del comprobante — aplica a todas las líneas */}
            <div>
                <label className="label text-xs">
                    Nº Comprobante de retención
                    <span className="ml-1 text-slate-400 font-normal">(único para todas las retenciones de esta factura)</span>
                </label>
                <input className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                    value={numeroRetencion}
                    onChange={e => onChangeNumero(e.target.value)}
                    placeholder="001-001-000000001" />
            </div>

            {/* Líneas de retención */}
            {retenciones.map((r, i) => (
                <div key={i} className="border border-amber-200 rounded-xl p-4 space-y-3 bg-amber-50/30">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Línea {i + 1}</span>
                        <button type="button" onClick={() => remove(i)}
                            className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label text-xs">Tipo</label>
                            <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white" value={r.tipo}
                                onChange={e => changeTipo(i, e.target.value as TipoRetencion)}>
                                <option value="FUENTE">Ret. en la fuente</option>
                                <option value="IVA">Ret. de IVA</option>
                            </select>
                        </div>
                        <div>
                            <label className="label text-xs">Código SRI</label>
                            <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white" value={r.codigo}
                                onChange={e => selCodigo(i, r.tipo, e.target.value)}>
                                <option value="">Seleccionar...</option>
                                {codigos.filter(c => c.tipo === r.tipo && c.activo).map(c => (
                                    <option key={c.codigo} value={c.codigo}>
                                        {c.codigo} — {c.descripcion.slice(0, 45)} ({c.porcentaje}%)
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="label text-xs">Base imponible</label>
                            <input type="number" step={0.01} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                                value={r.base || ''}
                                onChange={e => upd(i, 'base', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div>
                            <label className="label text-xs">% Retención</label>
                            <input type="number" step={0.01} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                                value={r.pct || ''}
                                onChange={e => upd(i, 'pct', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div>
                            <label className="label text-xs">Valor retenido</label>
                            <div className={cn('w-full border rounded-lg px-3 py-2 text-sm text-right font-mono font-bold',
                                r.valor > 0 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                                ${r.valor.toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={add}
                    disabled={retenciones.length >= 4}
                    className={cn('flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap',
                        retenciones.length < 4
                            ? 'text-amber-700 hover:bg-amber-50 border border-amber-200'
                            : 'text-slate-300 cursor-not-allowed border border-slate-200')}>
                    <Plus className="w-4 h-4" />
                    Agregar retención {retenciones.length < 4 ? `(${retenciones.length}/4)` : '(máx 4)'}
                </button>
                {retenciones.length > 0 && (
                    <span className="text-sm font-semibold text-amber-800 whitespace-nowrap">
                        Total: <span className="font-mono">${totalRet.toFixed(2)}</span>
                    </span>
                )}
            </div>
        </div>
    )
}


