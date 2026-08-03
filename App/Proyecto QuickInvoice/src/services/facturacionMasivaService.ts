import { supabase } from '../lib/supabase'
import { facturaDirectaService } from './facturaDirectaService'
import { validarIdentificacion } from '../utils/validarIdentificacion'
import type { Cliente } from './facturacionService'

export interface ClienteFacturable extends Cliente {
    valor_facturar: number
    tasa_iva: number
    bloqueo_credito: boolean
}

export interface FilaFacturacionMasiva {
    cliente: ClienteFacturable
    marcado: boolean
    valor: number
    tasaIva: number
    glosa: string
}

export interface OpcionesLote {
    empresaId: string
    diasVencimiento: number
    fechaVencimientoExplicita?: string | null // YYYY-MM-DD, sobreescribe diasVencimiento
    createdBy?: string | null
}

export interface ResultadoCliente {
    clienteId: string
    clienteNombre: string
    identificacion: string
    glosa: string
    valor: number
    iva: number
    total: number
    ok: boolean
    error?: string
    secuencial?: string
    estadoSri?: string
}

export interface ResumenLote {
    clientesSeleccionados: number
    clientesFacturados: number
    clientesConError: number
    subtotalSinIva: number
    totalIva15: number
    totalIva0: number
    totalGeneral: number
    resultados: ResultadoCliente[]
}

export const facturacionMasivaService = {
    // Sin fila = deshabilitado (comportamiento por defecto, no requiere seed)
    async isEnabled(empresaId: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('facturacion_masiva_config')
            .select('enabled')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        if (error) throw error
        return !!data?.enabled
    },

    async listarClientesFacturables(empresaId: string): Promise<ClienteFacturable[]> {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .eq('excluido_facturacion_masiva', false)
            .order('nombre')
        if (error) throw error
        return (data ?? []) as ClienteFacturable[]
    },

    // Reglas 4.1 del spec: identificación válida, razón social y dirección
    // no vacías, valor > 0. No valida nada de SRI en vivo, solo datos locales.
    validarFila(fila: FilaFacturacionMasiva): { ok: boolean; error?: string } {
        const { cliente, valor } = fila
        if (!cliente.nombre?.trim()) return { ok: false, error: 'Razón social vacía' }
        if (!cliente.direccion?.trim()) return { ok: false, error: 'Dirección vacía' }
        if (!(valor > 0)) return { ok: false, error: 'Valor a facturar debe ser mayor a 0' }
        const idCheck = validarIdentificacion(cliente.identificacion)
        if (!idCheck.ok) return { ok: false, error: idCheck.error || 'Identificación inválida' }
        return { ok: true }
    },

    calcularDiasPlazo(opciones: OpcionesLote): number {
        if (!opciones.fechaVencimientoExplicita) return opciones.diasVencimiento
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
        const venc = new Date(opciones.fechaVencimientoExplicita + 'T00:00:00')
        const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000)
        return dias > 0 ? dias : 0
    },

    // Corre secuencial (no Promise.all) para no saturar el SRI y mantener el
    // progreso en orden. Cada cliente es independiente: un error no detiene
    // el lote (mismo criterio que sri-retry-facturas / anular con reversa —
    // nunca dejar que un fallo puntual bloquee el resto).
    async ejecutarLote(
        filas: FilaFacturacionMasiva[],
        opciones: OpcionesLote,
        onProgreso?: (i: number, total: number, clienteNombre: string) => void,
    ): Promise<ResumenLote> {
        const seleccionadas = filas.filter(f => f.marcado)
        const diasPlazo = this.calcularDiasPlazo(opciones)
        const resultados: ResultadoCliente[] = []

        for (let i = 0; i < seleccionadas.length; i++) {
            const fila = seleccionadas[i]
            onProgreso?.(i + 1, seleccionadas.length, fila.cliente.nombre)

            const subtotal = fila.valor
            const ivaValor = subtotal * (fila.tasaIva / 100)
            const total = subtotal + ivaValor

            try {
                const factura = await facturaDirectaService.generarFacturaDirecta({
                    empresa_id: opciones.empresaId,
                    cliente_id: fila.cliente.id,
                    detalles: [{
                        producto_id: null,
                        nombre_producto: fila.glosa,
                        cantidad: 1,
                        precio_unitario: subtotal,
                        descuento: 0,
                        iva_porcentaje: fila.tasaIva,
                    }],
                    pagos: [{ metodo: 'credito', valor: total }],
                    dias_plazo_credito: diasPlazo,
                    observaciones: fila.glosa,
                    created_by: opciones.createdBy ?? null,
                })

                resultados.push({
                    clienteId: fila.cliente.id,
                    clienteNombre: fila.cliente.nombre,
                    identificacion: fila.cliente.identificacion,
                    glosa: fila.glosa,
                    valor: subtotal,
                    iva: ivaValor,
                    total,
                    ok: factura.estado_sri === 'AUTORIZADO',
                    error: factura.estado_sri !== 'AUTORIZADO' ? `No autorizado (${factura.estado_sri})` : undefined,
                    secuencial: factura.secuencial,
                    estadoSri: factura.estado_sri,
                })
            } catch (e: any) {
                resultados.push({
                    clienteId: fila.cliente.id,
                    clienteNombre: fila.cliente.nombre,
                    identificacion: fila.cliente.identificacion,
                    glosa: fila.glosa,
                    valor: subtotal,
                    iva: ivaValor,
                    total,
                    ok: false,
                    error: e.message ?? String(e),
                })
            }
        }

        const exitosos = resultados.filter(r => r.ok)
        const conError = resultados.filter(r => !r.ok)

        return {
            clientesSeleccionados: seleccionadas.length,
            clientesFacturados: exitosos.length,
            clientesConError: conError.length,
            subtotalSinIva: exitosos.reduce((s, r) => s + r.valor, 0),
            totalIva15: exitosos.filter(r => filas.find(f => f.cliente.id === r.clienteId)?.tasaIva === 15).reduce((s, r) => s + r.iva, 0),
            totalIva0: exitosos.filter(r => filas.find(f => f.cliente.id === r.clienteId)?.tasaIva === 0).reduce((s, r) => s + r.iva, 0),
            totalGeneral: exitosos.reduce((s, r) => s + r.total, 0),
            resultados,
        }
    },

    async guardarLog(empresaId: string, usuarioId: string | null, mesFacturado: string, resumen: ResumenLote, clientesOmitidos: number): Promise<void> {
        const { error } = await supabase.from('facturacion_masiva_log').insert({
            empresa_id: empresaId,
            usuario_id: usuarioId,
            mes_facturado: mesFacturado,
            clientes_seleccionados: resumen.clientesSeleccionados,
            clientes_facturados: resumen.clientesFacturados,
            clientes_omitidos: clientesOmitidos,
            clientes_con_error: resumen.clientesConError,
            subtotal_sin_iva: resumen.subtotalSinIva,
            total_iva_15: resumen.totalIva15,
            total_iva_0: resumen.totalIva0,
            total_general: resumen.totalGeneral,
            detalle_errores: resumen.resultados.filter(r => !r.ok).map(r => ({ cliente: r.clienteNombre, error: r.error })),
        })
        if (error) throw error
    },
}
