import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

// ─── Interfaces ───────────────────────────────────────────

export interface NotaCredito {
    id: string
    empresa_id: string
    comprobante_origen_id: string
    cliente_id: string
    vendedor_id: string | null
    secuencial: string
    clave_acceso: string | null
    tipo_nc: 'DEVOLUCION' | 'DESCUENTO' | 'CORRECCION'
    motivo_sri: '01' | '02' | '03' | '04'
    motivo_descripcion: string
    total_sin_impuestos: number
    total_iva: number
    total: number
    saldo_nc: number
    estado_sri: 'PENDIENTE' | 'ENVIADO' | 'AUTORIZADO' | 'RECHAZADO'
    autorizacion_numero: string | null
    observaciones_sri: string | null
    xml_firmado: string | null
    usuario_id: string | null
    created_at: string
    updated_at: string
    // joins
    clientes?: { nombre: string; identificacion: string; email?: string }
    comprobante_origen?: { secuencial: string; total: number; created_at: string }
}

export interface NCDetalle {
    id?: string
    nota_credito_id?: string
    producto_id: string | null
    nombre_producto: string
    cantidad: number
    precio_unitario: number  // sin IVA
    descuento: number
    subtotal: number         // sin IVA
    iva_porcentaje: number
    iva_valor: number
    total_linea: number
}

export interface ComprobanteParaNC {
    id: string
    secuencial: string
    total: number
    created_at: string
    estado_sri: string
    estado_sistema: string
    clave_acceso: string | null
    clientes: { id: string; nombre: string; identificacion: string; email?: string }
    comprobante_detalles: Array<{
        id: string
        producto_id: string | null
        nombre_producto: string
        cantidad: number
        precio_unitario: number
        descuento: number
        subtotal: number
        iva_porcentaje: number
        iva_valor: number
    }>
}

// ─── Helpers ─────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100

function generarClaveAccesoNC(
    fecha: Date,
    ruc: string,
    ambiente: string,
    establecimiento: string,
    ptoEmision: string,
    secuencial: string
): string {
    const f = format(fecha, 'ddMMyyyy')
    const tipo = '04'  // Nota de Crédito
    const ruc13 = ruc.padStart(13, '0')
    const amb = ambiente === 'PRODUCCION' ? '2' : '1'
    const sec9 = (secuencial.split('-').pop() || '000000001').padStart(9, '0')
    const est = establecimiento.padStart(3, '0').slice(-3)
    const pto = ptoEmision.padStart(3, '0').slice(-3)
    const codigoNum = '00000072'
    const emision = '1'

    const clavePrevia = `${f}${tipo}${ruc13}${amb}${est}${pto}${sec9}${codigoNum}${emision}`

    let suma = 0
    let factor = 2
    for (let i = clavePrevia.length - 1; i >= 0; i--) {
        suma += parseInt(clavePrevia[i]) * factor
        factor = factor === 7 ? 2 : factor + 1
    }
    const digito = 11 - (suma % 11)
    const dv = digito === 11 ? '0' : digito === 10 ? '1' : digito.toString()
    return clavePrevia + dv
}

// ─── Service ─────────────────────────────────────────────

export const ncService = {

    async getNotasCredito(empresaId: string): Promise<NotaCredito[]> {
        const { data, error } = await supabase
            .from('notas_credito')
            .select(`
                *,
                clientes (nombre, identificacion),
                comprobante_origen:comprobantes!comprobante_origen_id (secuencial, total, created_at)
            `)
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })

        if (error) throw error
        return (data || []) as NotaCredito[]
    },

    async getComprobanteParaNC(comprobanteId: string): Promise<ComprobanteParaNC> {
        const { data, error } = await supabase
            .from('comprobantes')
            .select(`
                id, secuencial, total, created_at, estado_sri, estado_sistema, clave_acceso,
                clientes (id, nombre, identificacion, email),
                comprobante_detalles (
                    id, producto_id, nombre_producto, cantidad,
                    precio_unitario, descuento, subtotal, iva_porcentaje, iva_valor
                )
            `)
            .eq('id', comprobanteId)
            .single()

        if (error) throw error
        return data as unknown as ComprobanteParaNC
    },

    async buscarComprobantesParaNC(empresaId: string, texto: string): Promise<Array<{
        id: string; secuencial: string; total: number; created_at: string;
        estado_sri: string; estado_sistema: string;
        clientes: { nombre: string; identificacion: string }
    }>> {
        const { data, error } = await supabase
            .from('comprobantes')
            .select('id, secuencial, total, created_at, estado_sri, estado_sistema, clientes(nombre, identificacion)')
            .eq('empresa_id', empresaId)
            .eq('estado_sri', 'AUTORIZADO')
            .neq('estado_sistema', 'ANULADA')
            .or(`secuencial.ilike.%${texto}%`)
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) throw error
        return (data || []) as any[]
    },

    async crearNotaCredito(params: {
        empresaId: string
        empresaRuc: string
        empresaAmbiente: string
        establecimiento: string
        puntoEmision: string
        comprobanteOrigenId: string
        clienteId: string
        vendedorId: string | null
        tipoNc: NotaCredito['tipo_nc']
        motivoSri: NotaCredito['motivo_sri']
        motivoDescripcion: string
        detalles: NCDetalle[]
        usuarioId: string
    }): Promise<NotaCredito> {
        // 1. Obtener y actualizar secuencial NC
        const { data: empresa, error: eErr } = await supabase
            .from('empresas')
            .select('config_sri')
            .eq('id', params.empresaId)
            .single()
        if (eErr) throw eErr

        const configSri = empresa.config_sri || {}
        const secActual = Number(configSri.secuencial_nc_actual || 0) + 1
        const est = (params.establecimiento || '001').padStart(3, '0').slice(-3)
        const pto = (params.puntoEmision || '001').padStart(3, '0').slice(-3)
        const secStr = secActual.toString().padStart(9, '0')
        const secuencial = `${est}-${pto}-${secStr}`

        // 2. Calcular totales
        const total_sin_impuestos = r2(params.detalles.reduce((s, d) => s + d.subtotal, 0))
        const total_iva            = r2(params.detalles.reduce((s, d) => s + d.iva_valor, 0))
        const total                = r2(total_sin_impuestos + total_iva)

        // 3. Generar clave de acceso (codDoc=04)
        const clave_acceso = generarClaveAccesoNC(
            new Date(),
            params.empresaRuc,
            params.empresaAmbiente,
            params.establecimiento,
            params.puntoEmision,
            secuencial
        )

        // 4. Insertar cabecera
        const { data: nc, error: ncErr } = await supabase
            .from('notas_credito')
            .insert({
                empresa_id:           params.empresaId,
                comprobante_origen_id: params.comprobanteOrigenId,
                cliente_id:           params.clienteId,
                vendedor_id:          params.vendedorId,
                secuencial,
                clave_acceso,
                tipo_nc:              params.tipoNc,
                motivo_sri:           params.motivoSri,
                motivo_descripcion:   params.motivoDescripcion,
                total_sin_impuestos,
                total_iva,
                total,
                saldo_nc:             total,   // inicia con saldo total
                estado_sri:           'PENDIENTE',
                usuario_id:           params.usuarioId,
            })
            .select()
            .single()
        if (ncErr) throw ncErr

        // 5. Insertar detalles
        const detallesInsert = params.detalles.map(d => ({
            nota_credito_id: nc.id,
            producto_id:     d.producto_id,
            nombre_producto: d.nombre_producto,
            cantidad:        d.cantidad,
            precio_unitario: d.precio_unitario,
            descuento:       d.descuento,
            subtotal:        d.subtotal,
            iva_porcentaje:  d.iva_porcentaje,
            iva_valor:       d.iva_valor,
            total_linea:     d.total_linea,
        }))
        const { error: detErr } = await supabase.from('notas_credito_detalle').insert(detallesInsert)
        if (detErr) throw detErr

        // 6. Actualizar secuencial NC en config_sri
        await supabase
            .from('empresas')
            .update({ config_sri: { ...configSri, secuencial_nc_actual: secActual } })
            .eq('id', params.empresaId)

        return nc as NotaCredito
    },

    async procesarNC(ncId: string): Promise<{ authorized: boolean; estado_sri: string; message: string; autorizacion_numero?: string }> {
        const { data, error } = await supabase.functions.invoke('nota-credito-electronica', {
            body: { nota_credito_id: ncId }
        })
        if (error) throw error
        return data
    },

    /** Reintenta envío al SRI (idéntico a procesarNC, expuesto por semántica) */
    async reintentarNC(ncId: string): Promise<{ authorized: boolean; estado_sri: string; message: string; autorizacion_numero?: string }> {
        const { data, error } = await supabase.functions.invoke('nota-credito-electronica', {
            body: { nota_credito_id: ncId }
        })
        if (error) throw error
        return data
    },

    /** Devuelve { producto_id → cantidad_ya_devuelta } para la factura origen.
     *  Solo cuenta NCs no rechazadas (AUTORIZADO, ENVIADO, PENDIENTE). */
    async getCantidadesDevueltas(comprobanteOrigenId: string): Promise<Record<string, number>> {
        const { data: ncs } = await supabase
            .from('notas_credito')
            .select('id')
            .eq('comprobante_origen_id', comprobanteOrigenId)
            .in('estado_sri', ['AUTORIZADO', 'ENVIADO', 'PENDIENTE'])

        if (!ncs || ncs.length === 0) return {}

        const { data: detalles } = await supabase
            .from('notas_credito_detalle')
            .select('producto_id, cantidad')
            .in('nota_credito_id', ncs.map(n => n.id))

        const result: Record<string, number> = {}
        for (const d of (detalles || [])) {
            if (d.producto_id) {
                result[d.producto_id] = r2((result[d.producto_id] || 0) + Number(d.cantidad))
            }
        }
        return result
    },

    /** Obtiene la NC con sus detalles (para imprimir, Kardex, etc.) */
    async getNcConDetalles(ncId: string) {
        const { data, error } = await supabase
            .from('notas_credito')
            .select(`
                *,
                clientes (nombre, identificacion, email, direccion),
                empresas (nombre, razon_social, ruc, direccion, telefono, logo_url, config_sri),
                notas_credito_detalle (*),
                comprobante_origen:comprobantes!comprobante_origen_id (secuencial, created_at)
            `)
            .eq('id', ncId)
            .single()
        if (error) throw error
        return data
    },

    /**
     * Aplica saldo de la NC a cartera CxC (FIFO: factura origen primero, luego otras del mismo cliente)
     * Devuelve el monto total aplicado.
     */
    async aplicarNCaCartera(
        ncId: string,
        empresaId: string,
        clienteId: string,
        comprobanteOrigenId: string,
        usuarioId: string
    ): Promise<number> {
        // 1. Obtener saldo disponible de la NC
        const { data: nc, error: ncErr } = await supabase
            .from('notas_credito')
            .select('saldo_nc, total')
            .eq('id', ncId)
            .single()
        if (ncErr) throw ncErr

        let saldoDisponible = Number(nc.saldo_nc)
        if (saldoDisponible <= 0) return 0

        // 2. Obtener cartera abierta del cliente (factura origen primero, luego FIFO)
        const { data: carteraRows, error: cErr } = await supabase
            .from('cartera_cxc')
            .select('id, comprobante_id, saldo')
            .eq('empresa_id', empresaId)
            .eq('cliente_id', clienteId)
            .in('estado', ['pendiente', 'parcial'])
            .order('fecha_emision', { ascending: true })
        if (cErr) throw cErr

        // Ordenar: factura origen al frente
        const ordenadas = [
            ...(carteraRows || []).filter(r => r.comprobante_id === comprobanteOrigenId),
            ...(carteraRows || []).filter(r => r.comprobante_id !== comprobanteOrigenId),
        ]

        let totalAplicado = 0

        for (const row of ordenadas) {
            if (saldoDisponible <= 0) break
            const saldoCartera = Number(row.saldo)
            if (saldoCartera <= 0) continue

            const valorAplicar = r2(Math.min(saldoDisponible, saldoCartera))

            // Registrar pago en cartera con tipo_pago = 'nota_credito'
            const { error: pagoErr } = await supabase
                .from('cartera_cxc_pagos')
                .insert({
                    cartera_id:     row.id,
                    empresa_id:     empresaId,
                    fecha_pago:     new Date().toISOString().split('T')[0],
                    valor:          valorAplicar,
                    metodo_pago:    'nota_credito',
                    tipo_pago:      'nota_credito',
                    nota_credito_id: ncId,
                    referencia:     `NC aplicada`,
                    usuario_id:     usuarioId,
                })
            if (pagoErr) throw pagoErr

            // Registrar en aplicaciones_nc_cxc (el trigger actualiza saldo_nc)
            const { error: aplErr } = await supabase
                .from('aplicaciones_nc_cxc')
                .insert({ nota_credito_id: ncId, cartera_cxc_id: row.id, valor_aplicado: valorAplicar })
            if (aplErr) throw aplErr

            saldoDisponible = r2(saldoDisponible - valorAplicar)
            totalAplicado   = r2(totalAplicado + valorAplicar)
        }

        return totalAplicado
    },

    async getAplicaciones(ncId: string) {
        const { data, error } = await supabase
            .from('aplicaciones_nc_cxc')
            .select('*, cartera_cxc(comprobantes(secuencial))')
            .eq('nota_credito_id', ncId)
            .order('created_at', { ascending: true })
        if (error) throw error
        return data || []
    },

    async descargarXmlNC(ncId: string, secuencial: string) {
        const { data, error } = await supabase
            .from('notas_credito')
            .select('xml_firmado, clave_acceso')
            .eq('id', ncId)
            .single()
        if (error) throw error

        const xmlContent = data.xml_firmado || '<!-- NC sin procesar -->'
        const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${secuencial}.xml`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => window.URL.revokeObjectURL(url), 5000)
    },
}
