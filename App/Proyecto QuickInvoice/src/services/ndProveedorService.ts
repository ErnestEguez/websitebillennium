import { supabase } from '../lib/supabase'
import { auditService } from './auditoria/auditService'

export interface NDProveedor {
    id: string
    empresa_id: string
    proveedor_id: string
    compra_id: string | null
    cxp_id: string | null
    numero_nd: string
    fecha_emision: string
    numero_autorizacion: string | null
    base_imponible: number
    iva: number
    total: number
    concepto: string | null
    estado: 'ACTIVA' | 'ANULADA'
    created_at: string
    created_by: string | null
    // joins
    proveedores?: { nombre_empresa: string; ruc: string }
    ingresos_stock?: { numero_factura: string | null } | null
}

export const ndProveedorService = {
    async listar(empresaId: string): Promise<NDProveedor[]> {
        const { data, error } = await supabase
            .from('nd_proveedores')
            .select('*, proveedores(nombre_empresa, ruc), ingresos_stock(numero_factura)')
            .eq('empresa_id', empresaId)
            .order('fecha_emision', { ascending: false })
        if (error) throw error
        return (data ?? []) as unknown as NDProveedor[]
    },

    /**
     * Registra una N/D de proveedor. Si hay factura relacionada (compraId):
     * - si ya tiene una CxP (compra a crédito), le suma el total de la N/D
     *   directo a monto_original y saldo_pendiente.
     * - si no tiene CxP (compra de contado), crea una CxP nueva por el
     *   valor de la N/D — es deuda nueva que antes no existía.
     */
    async crear(params: {
        empresaId: string
        proveedorId: string
        compraId: string | null
        facturaReferencia?: string   // N° de factura del proveedor cuando NO hay compra vinculada en el sistema
        numeroNd: string
        fechaEmision: string
        numeroAutorizacion?: string
        baseImponible: number
        iva: number
        total: number
        concepto?: string
        usuarioId: string
    }): Promise<NDProveedor> {
        // Validar N/D duplicada (mismo número + proveedor, ya registrada y ACTIVA)
        // ANTES de tocar cualquier CxP — una N/D ANULADA no bloquea.
        const { data: dup } = await supabase
            .from('nd_proveedores')
            .select('id')
            .eq('empresa_id', params.empresaId)
            .eq('proveedor_id', params.proveedorId)
            .eq('numero_nd', params.numeroNd)
            .eq('estado', 'ACTIVA')
            .maybeSingle()
        if (dup) throw new Error(`Ya existe una N/D activa con el número "${params.numeroNd}" para este proveedor.`)

        // La N/D SIEMPRE incrementa una deuda con el proveedor: si hay compra
        // vinculada y ya tiene CxP, se le suma; si no tiene CxP (contado) o no
        // hay compra vinculada en el sistema, se crea una CxP nueva.
        let cxpId: string | null = null

        const cxpExistente = params.compraId
            ? (await supabase
                .from('cuentas_por_pagar')
                .select('id, monto_original, saldo_pendiente')
                .eq('compra_id', params.compraId)
                .maybeSingle()
              ).data
            : null

        if (cxpExistente) {
            const { error: updErr } = await supabase
                .from('cuentas_por_pagar')
                .update({
                    monto_original:  Number(cxpExistente.monto_original) + params.total,
                    saldo_pendiente: Number(cxpExistente.saldo_pendiente) + params.total,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', cxpExistente.id)
            if (updErr) throw updErr
            cxpId = cxpExistente.id
        } else {
            const { data: prov } = await supabase
                .from('proveedores').select('dias_credito').eq('id', params.proveedorId).maybeSingle()
            const dias = prov?.dias_credito ?? 30
            const fVenc = new Date(params.fechaEmision + 'T12:00:00')
            fVenc.setDate(fVenc.getDate() + dias)

            const observaciones = params.compraId
                ? `Generada por N/D ${params.numeroNd} sobre compra pagada de contado`
                : `Generada por N/D ${params.numeroNd}${params.facturaReferencia ? ` — Factura proveedor: ${params.facturaReferencia}` : ' (sin factura relacionada en el sistema)'}`

            const { data: nuevaCxp, error: cxpCrearErr } = await supabase
                .from('cuentas_por_pagar')
                .insert({
                    empresa_id:        params.empresaId,
                    proveedor_id:      params.proveedorId,
                    compra_id:         params.compraId,
                    fecha_emision:     params.fechaEmision,
                    fecha_vencimiento: fVenc.toISOString().split('T')[0],
                    monto_original:    params.total,
                    saldo_pendiente:   params.total,
                    estado:            'PENDIENTE',
                    observaciones,
                })
                .select('id')
                .single()
            if (cxpCrearErr) throw cxpCrearErr
            cxpId = nuevaCxp.id
        }

        const { data: nd, error: ndErr } = await supabase
            .from('nd_proveedores')
            .insert({
                empresa_id:          params.empresaId,
                proveedor_id:        params.proveedorId,
                compra_id:           params.compraId,
                cxp_id:              cxpId,
                numero_nd:           params.numeroNd,
                fecha_emision:       params.fechaEmision,
                numero_autorizacion: params.numeroAutorizacion || null,
                base_imponible:      params.baseImponible,
                iva:                 params.iva,
                total:               params.total,
                concepto:            params.concepto || null,
                created_by:          params.usuarioId,
            })
            .select()
            .single()
        if (ndErr) throw ndErr

        auditService.logEvent({
            empresaId: params.empresaId,
            modulo: 'compras',
            accion: 'crear',
            entidad: 'nd_proveedor',
            entidadId: nd.id,
            numeroDocumento: params.numeroNd,
            resumen: `Nota de débito de proveedor No. ${params.numeroNd} — incrementa deuda en ${params.total.toFixed(2)}`,
            detalle: { compra_id: params.compraId, cxp_id: cxpId, total: params.total },
            nivel: 'sensible',
        })

        return nd as unknown as NDProveedor
    },
}
