import { supabase } from '../lib/supabase'
import { puntoEmisionService } from './puntoEmisionService'
import { format } from 'date-fns'

export interface DetalleGuiaRemision {
    producto_id?: string | null
    codigo?: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    total: number
}

export interface GuiaRemisionInput {
    empresa_id: string
    // Factura de origen
    comprobante_id?: string | null
    doc_sustento_numero: string
    doc_sustento_autorizacion?: string | null
    doc_sustento_fecha?: string | null
    // Transportista
    transportista_id?: string | null
    transportista_nombre: string
    transportista_identificacion: string
    transportista_tipo_id: string
    placa: string
    // Transporte
    fecha_ini_transporte: string  // YYYY-MM-DD
    fecha_fin_transporte: string  // YYYY-MM-DD
    dir_salida: string
    motivo_traslado: string
    ruta?: string | null
    // Destinatario
    cliente_id?: string | null
    destinatario_nombre: string
    destinatario_identificacion: string
    destinatario_direccion: string
    // Detalle
    detalles: DetalleGuiaRemision[]
}

export interface GuiaRemision {
    id: string
    empresa_id: string
    secuencial: string
    clave_acceso?: string | null
    ambiente: string
    fecha_emision: string
    fecha_ini_transporte: string
    fecha_fin_transporte: string
    dir_salida: string
    transportista_id?: string | null
    transportista_nombre: string
    transportista_identificacion: string
    transportista_tipo_id: string
    placa: string
    cliente_id?: string | null
    destinatario_nombre: string
    destinatario_identificacion: string
    destinatario_direccion: string
    comprobante_id?: string | null
    doc_sustento_numero: string
    doc_sustento_autorizacion?: string | null
    doc_sustento_fecha?: string | null
    motivo_traslado: string
    ruta?: string | null
    estado_sri: string
    xml_firmado?: string | null
    autorizacion_numero?: string | null
    fecha_autorizacion?: string | null
    observaciones_sri?: string | null
    created_at?: string
    guia_remision_detalles?: DetalleGuiaRemision[]
}

export const guiaRemisionService = {

    async crearGuia(input: GuiaRemisionInput): Promise<GuiaRemision> {
        const { empresa_id, detalles } = input

        // Obtener configuración SRI
        const { data: empData } = await supabase
            .from('empresas')
            .select('ruc, config_sri, direccion')
            .eq('id', empresa_id)
            .single()
        if (!empData) throw new Error('No se encontró la empresa')

        const config      = empData.config_sri || {}
        const rucEmpresa  = empData.ruc || '1790000000001'

        // Secuencial desde punto de emisión
        const puntoEmision = await puntoEmisionService.resolverParaDispositivo(empresa_id)
        let est: string, pto: string, nextSec: number

        if (puntoEmision) {
            est = puntoEmision.establecimiento
            pto = puntoEmision.punto_emision
            const { data: nextSecData, error: errorSec } = await supabase
                .rpc('qi_next_secuencial_punto', { p_punto_emision_id: puntoEmision.id, p_tipo_comprobante: 'GUIA_REMISION' })
            if (errorSec) throw errorSec
            nextSec = nextSecData as number
        } else {
            est     = config.establecimiento || '001'
            pto     = config.punto_emision   || '001'
            const seriePrefix = `${est.padStart(3, '0')}-${pto.padStart(3, '0')}-`
            const { data: last } = await supabase
                .from('guias_remision')
                .select('secuencial')
                .eq('empresa_id', empresa_id)
                .like('secuencial', `${seriePrefix}%`)
                .order('secuencial', { ascending: false })
                .limit(1)
                .maybeSingle()
            nextSec = last?.secuencial
                ? parseInt(last.secuencial.split('-').pop() || '0', 10) + 1
                : 1
        }

        const secuencialFormateado = `${est.padStart(3, '0')}-${pto.padStart(3, '0')}-${nextSec.toString().padStart(9, '0')}`

        // Clave de acceso — codDoc '06' para guía de remisión
        const claveAcceso = generarClaveAccesoGR(
            new Date(),
            rucEmpresa,
            config.ambiente || 'PRUEBAS',
            est,
            pto,
            secuencialFormateado
        )

        // Insertar cabecera
        const { data: guia, error: guiaErr } = await supabase
            .from('guias_remision')
            .insert({
                empresa_id,
                secuencial:                   secuencialFormateado,
                clave_acceso:                 claveAcceso,
                ambiente:                     config.ambiente || 'PRUEBAS',
                fecha_emision:                format(new Date(), 'yyyy-MM-dd'),
                fecha_ini_transporte:         input.fecha_ini_transporte,
                fecha_fin_transporte:         input.fecha_fin_transporte,
                dir_salida:                   input.dir_salida || empData.direccion || 'ECUADOR',
                transportista_id:             input.transportista_id || null,
                transportista_nombre:         input.transportista_nombre,
                transportista_identificacion: input.transportista_identificacion,
                transportista_tipo_id:        input.transportista_tipo_id,
                placa:                        input.placa,
                cliente_id:                   input.cliente_id || null,
                destinatario_nombre:          input.destinatario_nombre,
                destinatario_identificacion:  input.destinatario_identificacion,
                destinatario_direccion:       input.destinatario_direccion,
                comprobante_id:               input.comprobante_id || null,
                doc_sustento_numero:          input.doc_sustento_numero,
                doc_sustento_autorizacion:    input.doc_sustento_autorizacion || null,
                doc_sustento_fecha:           input.doc_sustento_fecha || null,
                motivo_traslado:              input.motivo_traslado,
                ruta:                         input.ruta || null,
                estado_sri:                   'PENDIENTE',
            })
            .select()
            .single()
        if (guiaErr) throw guiaErr

        // Insertar detalles
        if (detalles.length > 0) {
            const { error: detErr } = await supabase
                .from('guia_remision_detalles')
                .insert(detalles.map(d => ({
                    guia_remision_id: guia.id,
                    producto_id:      d.producto_id || null,
                    codigo:           d.codigo || null,
                    descripcion:      d.descripcion,
                    cantidad:         d.cantidad,
                    precio_unitario:  d.precio_unitario,
                    total:            d.total,
                })))
            if (detErr) console.error('[GR detalles] Error:', detErr)
        }

        // Firmar y autorizar
        try {
            const { data: sriRes, error: sriErr } = await supabase.functions.invoke('sri-guia-remision', {
                body: { guia_remision_id: guia.id }
            })
            if (sriErr) console.error('[sri-guia-remision] Error:', sriErr)
            else        console.log('[sri-guia-remision] Resultado:', sriRes)
        } catch (e) {
            console.error('[sri-guia-remision] Excepción:', e)
        }

        // Leer guía actualizada
        const { data: guiaFinal } = await supabase
            .from('guias_remision')
            .select('*, guia_remision_detalles(*)')
            .eq('id', guia.id)
            .single()

        return (guiaFinal || guia) as GuiaRemision
    },

    async listar(empresaId: string, filtros?: {
        desde?: string; hasta?: string; estado?: string; busqueda?: string
    }): Promise<GuiaRemision[]> {
        let query = supabase
            .from('guias_remision')
            .select('*, guia_remision_detalles(*)')
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })

        if (filtros?.desde)   query = query.gte('created_at', `${filtros.desde}T05:00:00.000Z`)
        if (filtros?.hasta) {
            const d = new Date(`${filtros.hasta}T05:00:00.000Z`)
            d.setUTCDate(d.getUTCDate() + 1)
            query = query.lte('created_at', new Date(d.getTime() - 1).toISOString())
        }
        if (filtros?.estado && filtros.estado !== 'TODOS') query = query.eq('estado_sri', filtros.estado)

        const { data, error } = await query.limit(200)
        if (error) throw error
        let result = (data ?? []) as GuiaRemision[]

        if (filtros?.busqueda) {
            const q = filtros.busqueda.toLowerCase()
            result = result.filter(g =>
                g.secuencial?.toLowerCase().includes(q) ||
                g.destinatario_nombre?.toLowerCase().includes(q) ||
                g.placa?.toLowerCase().includes(q) ||
                g.doc_sustento_numero?.toLowerCase().includes(q)
            )
        }
        return result
    },

    async getCompleta(id: string): Promise<GuiaRemision> {
        const { data, error } = await supabase
            .from('guias_remision')
            .select('*, guia_remision_detalles(*)')
            .eq('id', id)
            .single()
        if (error) throw error
        return data as GuiaRemision
    },

    async reenviar(id: string): Promise<{ success: boolean; message?: string }> {
        try {
            const { data, error } = await supabase.functions.invoke('sri-guia-remision', {
                body: { guia_remision_id: id }
            })
            if (error) return { success: false, message: error.message }
            return { success: true, message: data?.message }
        } catch (e: any) {
            return { success: false, message: e.message }
        }
    },

    async consultar(id: string): Promise<{ success: boolean; message?: string }> {
        try {
            const { data, error } = await supabase.functions.invoke('sri-guia-remision', {
                body: { guia_remision_id: id, solo_consulta: true }
            })
            if (error) return { success: false, message: error.message }
            return { success: true, message: data?.message }
        } catch (e: any) {
            return { success: false, message: e.message }
        }
    },
}

// Clave de acceso para guía de remisión (codDoc = '06')
function generarClaveAccesoGR(
    fecha: Date, ruc: string, ambiente: string,
    establecimiento: string, ptoEmision: string, secuencial: string
): string {
    const f        = format(fecha, 'ddMMyyyy')
    const tipo     = '06'  // guía de remisión
    const ruc13    = ruc.padStart(13, '0')
    const amb      = ambiente === 'PRODUCCION' ? '2' : '1'
    const sec9     = (secuencial.split('-').pop() || '000000001').padStart(9, '0')
    const est      = establecimiento.padStart(3, '0').slice(-3)
    const pto      = ptoEmision.padStart(3, '0').slice(-3)
    const codigoNum = '00000072'
    const emision   = '1'

    const clavePrevia = `${f}${tipo}${ruc13}${amb}${est}${pto}${sec9}${codigoNum}${emision}`

    let suma = 0; let factor = 2
    for (let i = clavePrevia.length - 1; i >= 0; i--) {
        suma += parseInt(clavePrevia[i]) * factor
        factor = factor === 7 ? 2 : factor + 1
    }
    const digito = 11 - (suma % 11)
    const dv     = digito === 11 ? '0' : digito === 10 ? '1' : digito.toString()
    return clavePrevia + dv
}
