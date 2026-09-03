import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type CanalGestion = 'llamada' | 'email' | 'whatsapp' | 'visita' | 'carta' | 'otro'
export type EstadoGestion = 'sin_gestionar' | 'en_negociacion' | 'promesa_pago' | 'acuerdo_pago' | 'incobrable' | 'pagada'
export type ClasificacionScore = 'buen_pagador' | 'irregular' | 'alto_riesgo' | 'incobrable'

export interface FilaCartera {
    id: string
    empresa_id: string
    cliente_id: string
    comprobante_id: string
    fecha_emision: string
    fecha_vencimiento: string | null
    valor_original: number
    saldo: number
    estado: string
    // joins
    cliente_nombre: string
    cliente_identificacion: string
    cliente_email: string | null
    cliente_telefono: string | null
    secuencial: string
    vendedor_nombre: string | null
    vendedor_id: string | null
    // calculados
    dias: number           // positivo=vencido, negativo=por vencer
    semaforo: 'verde' | 'amarillo' | 'rojo' | 'negro'
    // gestión (desnormalizado en cartera_cxc)
    estado_gestion: EstadoGestion
    proxima_gestion: string | null
    ultimo_contacto: string | null
    // score (si existe)
    score: number | null
    clasificacion: ClasificacionScore | null
    // último pago
    ultimo_pago_fecha: string | null
    limite_credito: number | null
    bloqueo_credito: boolean
}

export interface GestionHistorial {
    id: string
    cartera_id: string
    usuario_nombre: string | null
    fecha_gestion: string
    canal: CanalGestion
    observacion: string | null
    estado_gestion: EstadoGestion
    proxima_gestion: string | null
    promesa_fecha: string | null
    promesa_monto: number | null
    promesa_cumplida: boolean | null
    created_at: string
}

export interface NuevaGestion {
    cartera_id: string
    empresa_id: string
    usuario_id: string
    usuario_nombre: string
    fecha_gestion: string
    canal: CanalGestion
    observacion: string
    estado_gestion: EstadoGestion
    proxima_gestion: string | null
    promesa_fecha: string | null
    promesa_monto: number | null
}

export interface KPIsCartera {
    total_cartera: number
    total_vencido: number
    total_por_vencer: number
    clientes_mora: number
    promedio_dias_mora: number
    rotacion_dias: number
    total_facturas: number
}

export interface CarteraConfig {
    dias_alerta_mora: number
    dias_bloqueo_credito: number
    plantilla_wa_1: string
    plantilla_wa_2: string
    plantilla_wa_judicial: string
    plantilla_carta_firma: string
}

export interface Notificacion {
    id: string
    tipo: string
    titulo: string
    mensaje: string
    cartera_id: string | null
    leida: boolean
    created_at: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function calcDias(fechaVencimiento: string | null, fechaCorte: string): number {
    if (!fechaVencimiento) return 0
    const corte = new Date(fechaCorte + 'T12:00:00')
    const venc  = new Date(fechaVencimiento + 'T12:00:00')
    return Math.floor((corte.getTime() - venc.getTime()) / 86400000)
}

export function calcSemaforo(dias: number): FilaCartera['semaforo'] {
    if (dias <= 0)   return 'verde'
    if (dias <= 30)  return 'verde'
    if (dias <= 90)  return 'amarillo'
    if (dias <= 180) return 'rojo'
    return 'negro'
}

export function calcScore(
    avgDiasRetraso: number,
    pctPromesCumplidas: number,
    frecuenciaMora: number,
    montoMaximo: number,
    limiteCreditoRef: number
): { score: number; clasificacion: ClasificacionScore } {
    let score = 100

    // Factor 1: avg días retraso (30%)
    if (avgDiasRetraso >= 90)       score -= 30
    else if (avgDiasRetraso >= 60)  score -= 22
    else if (avgDiasRetraso >= 30)  score -= 15
    else if (avgDiasRetraso > 0)    score -= 7

    // Factor 2: promesas cumplidas (25%)
    const pctIncumplidas = 100 - pctPromesCumplidas
    score -= Math.round(pctIncumplidas * 0.25)

    // Factor 3: frecuencia mora 12 meses (25%)
    if (frecuenciaMora >= 6)       score -= 25
    else if (frecuenciaMora >= 3)  score -= 17
    else if (frecuenciaMora >= 1)  score -= 8

    // Factor 4: monto máximo vs límite (20%)
    if (limiteCreditoRef > 0) {
        const utilPct = montoMaximo / limiteCreditoRef * 100
        if (utilPct >= 100)      score -= 20
        else if (utilPct >= 80)  score -= 12
        else if (utilPct >= 50)  score -= 5
    }

    score = Math.max(0, Math.min(100, score))

    let clasificacion: ClasificacionScore
    if (score >= 80) clasificacion = 'buen_pagador'
    else if (score >= 50) clasificacion = 'irregular'
    else if (score >= 20) clasificacion = 'alto_riesgo'
    else clasificacion = 'incobrable'

    return { score, clasificacion }
}

export const CANAL_LABEL: Record<CanalGestion, string> = {
    llamada: 'Llamada', email: 'Email', whatsapp: 'WhatsApp',
    visita: 'Visita', carta: 'Carta', otro: 'Otro',
}

export const ESTADO_LABEL: Record<EstadoGestion, string> = {
    sin_gestionar: 'Sin gestionar', en_negociacion: 'En negociación',
    promesa_pago: 'Promesa de pago', acuerdo_pago: 'Acuerdo de pago',
    incobrable: 'Incobrable', pagada: 'Pagada',
}

export function generarLinkWA(
    telefono: string | null,
    plantilla: string,
    vars: Record<string, string>
): string | null {
    if (!telefono) return null
    let msg = plantilla
    for (const [k, v] of Object.entries(vars)) {
        msg = msg.replace(new RegExp(`{{${k}}}`, 'g'), v)
    }
    const tel = telefono.replace(/\D/g, '')
    const telConPais = tel.startsWith('593') ? tel : tel.startsWith('0') ? '593' + tel.slice(1) : '593' + tel
    return `https://wa.me/${telConPais}?text=${encodeURIComponent(msg)}`
}

// ─── Queries principales ──────────────────────────────────────────────────────

export const carteraGestionService = {

    async getCartera(
        empresaId: string,
        opts: {
            fechaCorte:   string
            vendedorId?:  string
            clienteQ?:    string
            estado?:      'todas' | 'vencidas' | 'por_vencer'
            antiguedad?:  'normal' | 'mayor1anio' | 'todas'
        }
    ): Promise<FilaCartera[]> {
        const { fechaCorte, vendedorId, clienteQ, estado = 'todas', antiguedad = 'todas' } = opts

        let q = supabase
            .from('cartera_cxc')
            .select(`
                id, empresa_id, cliente_id, comprobante_id,
                fecha_emision, fecha_vencimiento,
                valor_original, saldo, estado, numero_documento_externo,
                estado_gestion, proxima_gestion, ultimo_contacto,
                clientes(id, nombre, identificacion, email, telefono,
                         limite_credito, bloqueo_credito, score_credito),
                comprobantes(id, secuencial, total, vendedor_id,
                             vendedores(id, nombre))
            `)
            .eq('empresa_id', empresaId)
            .in('estado', ['pendiente', 'parcial'])
            .gt('saldo', 0)
            .order('fecha_vencimiento', { ascending: true })

        if (clienteQ) {
            const cq = '%' + clienteQ.replace(/\*/g, '%') + '%'
            q = q.or(`clientes.nombre.ilike.${cq},clientes.identificacion.ilike.${cq}`)
        }

        const { data, error } = await q
        if (error) throw error

        let filas: FilaCartera[] = (data ?? []).map((c: any) => {
            const dias = calcDias(c.fecha_vencimiento, fechaCorte)
            return {
                id:                   c.id,
                empresa_id:           c.empresa_id,
                cliente_id:           c.cliente_id,
                comprobante_id:       c.comprobante_id,
                fecha_emision:        c.fecha_emision ?? '',
                fecha_vencimiento:    c.fecha_vencimiento ?? '',
                valor_original:       Number(c.valor_original ?? 0),
                saldo:                Number(c.saldo ?? 0),
                estado:               c.estado ?? '',
                cliente_nombre:       c.clientes?.nombre ?? '—',
                cliente_identificacion: c.clientes?.identificacion ?? '',
                cliente_email:        c.clientes?.email ?? null,
                cliente_telefono:     c.clientes?.telefono ?? null,
                // Cartera migrada (sin comprobante_id) no tiene secuencial real —
                // se cae al número capturado en la migración.
                secuencial:           c.comprobantes?.secuencial ?? c.numero_documento_externo ?? '—',
                vendedor_nombre:      c.comprobantes?.vendedores?.nombre ?? null,
                vendedor_id:          c.comprobantes?.vendedor_id ?? null,
                dias,
                semaforo:             calcSemaforo(dias),
                estado_gestion:       (c.estado_gestion ?? 'sin_gestionar') as EstadoGestion,
                proxima_gestion:      c.proxima_gestion ?? null,
                ultimo_contacto:      c.ultimo_contacto ?? null,
                score:                c.clientes?.score_credito ?? null,
                clasificacion:        null,
                ultimo_pago_fecha:    null,
                limite_credito:       c.clientes?.limite_credito ?? null,
                bloqueo_credito:      c.clientes?.bloqueo_credito ?? false,
            }
        })

        // Filtros post-query
        if (vendedorId) filas = filas.filter(f => f.vendedor_id === vendedorId)
        if (estado === 'vencidas')    filas = filas.filter(f => f.dias > 0)
        if (estado === 'por_vencer')  filas = filas.filter(f => f.dias <= 0)
        if (antiguedad === 'normal')  filas = filas.filter(f => f.dias <= 365)
        if (antiguedad === 'mayor1anio') filas = filas.filter(f => f.dias > 365)

        return filas
    },

    async getKPIs(empresaId: string, fechaCorte: string): Promise<KPIsCartera> {
        const fechaHace30 = new Date(fechaCorte)
        fechaHace30.setDate(fechaHace30.getDate() - 30)

        const [{ data }, { data: clientesMora }, { data: ventasData }] = await Promise.all([
            supabase.from('cartera_cxc').select('saldo, fecha_vencimiento')
                .eq('empresa_id', empresaId).in('estado', ['pendiente', 'parcial']).gt('saldo', 0),
            supabase.from('cartera_cxc').select('cliente_id')
                .eq('empresa_id', empresaId).in('estado', ['pendiente', 'parcial'])
                .gt('saldo', 0).lt('fecha_vencimiento', fechaCorte),
            supabase.from('comprobantes').select('total')
                .eq('empresa_id', empresaId).eq('tipo_comprobante', 'FACTURA')
                .neq('estado_sistema', 'ANULADO')
                .gte('created_at', fechaHace30.toISOString().split('T')[0] + 'T00:00:00')
                .lte('created_at', fechaCorte + 'T23:59:59'),
        ])

        const filas = data ?? []
        let totalCartera = 0, totalVencido = 0, totalPorVencer = 0, diasSuma = 0, diasCnt = 0

        for (const f of filas) {
            const s = Number(f.saldo || 0)
            const dias = calcDias(f.fecha_vencimiento, fechaCorte)
            totalCartera += s
            if (dias > 0) { totalVencido += s; diasSuma += dias; diasCnt++ }
            else totalPorVencer += s
        }

        const clientesUnicos = new Set((clientesMora ?? []).map((r: any) => r.cliente_id)).size

        // Rotación: CxC promedio / ventas 30 días × 365 (approx)
        const ventas30 = (ventasData ?? []).reduce((s: number, v: any) => s + Number(v.total || 0), 0)
        const rotacion = ventas30 > 0 ? Math.round((totalCartera / ventas30) * 30) : 0

        return {
            total_cartera:    Math.round(totalCartera * 100) / 100,
            total_vencido:    Math.round(totalVencido * 100) / 100,
            total_por_vencer: Math.round(totalPorVencer * 100) / 100,
            clientes_mora:    clientesUnicos,
            promedio_dias_mora: diasCnt > 0 ? Math.round(diasSuma / diasCnt) : 0,
            rotacion_dias:    rotacion,
            total_facturas:   filas.length,
        }
    },

    async getGestiones(carteraId: string): Promise<GestionHistorial[]> {
        const { data } = await supabase
            .from('cartera_gestiones')
            .select('*')
            .eq('cartera_id', carteraId)
            .order('created_at', { ascending: false })
        return (data ?? []) as GestionHistorial[]
    },

    async registrarGestion(g: NuevaGestion): Promise<void> {
        const { error } = await supabase
            .from('cartera_gestiones')
            .insert({
                empresa_id:     g.empresa_id,
                cartera_id:     g.cartera_id,
                usuario_id:     g.usuario_id,
                usuario_nombre: g.usuario_nombre,
                fecha_gestion:  g.fecha_gestion,
                canal:          g.canal,
                observacion:    g.observacion || null,
                estado_gestion: g.estado_gestion,
                proxima_gestion: g.proxima_gestion || null,
                promesa_fecha:  g.promesa_fecha || null,
                promesa_monto:  g.promesa_monto || null,
            })
        if (error) throw error

        // Actualizar estado desnormalizado en cartera_cxc
        await supabase
            .from('cartera_cxc')
            .update({
                estado_gestion:  g.estado_gestion,
                proxima_gestion: g.proxima_gestion || null,
                ultimo_contacto: g.fecha_gestion,
            })
            .eq('id', g.cartera_id)
    },

    async getConfig(empresaId: string): Promise<CarteraConfig> {
        const { data } = await supabase
            .from('cartera_config')
            .select('*')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        return {
            dias_alerta_mora:      data?.dias_alerta_mora ?? 30,
            dias_bloqueo_credito:  data?.dias_bloqueo_credito ?? 90,
            plantilla_wa_1:        data?.plantilla_wa_1 ?? 'Estimado/a {{nombre}}, le recordamos que la Factura {{factura}} por {{monto}} venció el {{vencimiento}}.',
            plantilla_wa_2:        data?.plantilla_wa_2 ?? 'Estimado/a {{nombre}}, segunda notificación. Factura {{factura}} por {{monto}}, {{dias}} días vencida.',
            plantilla_wa_judicial: data?.plantilla_wa_judicial ?? 'Estimado/a {{nombre}}, su deuda Fac. {{factura}} por {{monto}} está en gestión prejudicial.',
            plantilla_carta_firma: data?.plantilla_carta_firma ?? 'Gerente de Cobros',
        }
    },

    async guardarConfig(empresaId: string, cfg: Partial<CarteraConfig>): Promise<void> {
        await supabase
            .from('cartera_config')
            .upsert({ empresa_id: empresaId, ...cfg, updated_at: new Date().toISOString() },
                { onConflict: 'empresa_id' })
    },

    async actualizarLimiteCredito(clienteId: string, limite: number | null, bloqueo: boolean): Promise<void> {
        await supabase
            .from('clientes')
            .update({ limite_credito: limite, bloqueo_credito: bloqueo })
            .eq('id', clienteId)
    },

    async recalcularScore(empresaId: string, clienteId: string): Promise<{ score: number; clasificacion: ClasificacionScore }> {
        const hace12 = new Date(); hace12.setFullYear(hace12.getFullYear() - 1)
        const hoy = new Date().toISOString().split('T')[0]

        // Historial y saldo actual son independientes — corren en paralelo
        const [{ data: historial }, { data: cxcActual }] = await Promise.all([
            supabase.from('cartera_cxc').select('saldo, fecha_vencimiento, valor_original')
                .eq('empresa_id', empresaId).eq('cliente_id', clienteId)
                .gte('created_at', hace12.toISOString()),
            supabase.from('cartera_cxc').select('saldo, clientes!inner(limite_credito)')
                .eq('empresa_id', empresaId).eq('cliente_id', clienteId)
                .in('estado', ['pendiente', 'parcial']).gt('saldo', 0),
        ])

        let avgDias = 0, frecMora = 0
        const facturas = historial ?? []
        if (facturas.length) {
            let diasTotal = 0, cnt = 0
            for (const f of facturas) {
                if (!f.fecha_vencimiento) continue
                const d = calcDias(f.fecha_vencimiento, hoy)
                if (d > 0) { diasTotal += d; cnt++; frecMora++ }
            }
            avgDias = cnt > 0 ? diasTotal / cnt : 0
        }

        // Promesas (depende de facturas.id → secuencial después del historial)
        const { data: promesas } = await supabase
            .from('cartera_gestiones')
            .select('promesa_fecha, promesa_monto, promesa_cumplida')
            .eq('empresa_id', empresaId)
            .not('promesa_fecha', 'is', null)
            .in('cartera_id',
                facturas.map((f: any) => f.id).filter(Boolean)
            )
        const totalProm = (promesas ?? []).length
        const cumplidas = (promesas ?? []).filter((p: any) => p.promesa_cumplida === true).length
        const pctCumpl = totalProm > 0 ? (cumplidas / totalProm) * 100 : 100

        const montoActual = (cxcActual ?? []).reduce((s: number, c: any) => s + Number(c.saldo || 0), 0)
        const limiteRef = (cxcActual?.[0] as any)?.clientes?.limite_credito ?? 10000

        const result = calcScore(avgDias, pctCumpl, frecMora, montoActual, limiteRef)

        // Guardar score en tabla y en clientes
        await supabase.from('cartera_score_clientes').upsert({
            empresa_id: empresaId, cliente_id: clienteId,
            score: result.score, clasificacion: result.clasificacion,
            avg_dias_retraso: Math.round(avgDias * 10) / 10,
            pct_promesas_cumplidas: Math.round(pctCumpl * 10) / 10,
            frecuencia_mora: frecMora,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'empresa_id,cliente_id' })

        await supabase.from('clientes').update({ score_credito: result.score })
            .eq('id', clienteId)

        return result
    },

    async getNotificaciones(userId: string): Promise<Notificacion[]> {
        const { data } = await supabase
            .from('cartera_notificaciones')
            .select('*')
            .eq('user_id', userId)
            .eq('leida', false)
            .order('created_at', { ascending: false })
            .limit(50)
        return (data ?? []) as Notificacion[]
    },

    async marcarLeidaNotif(id: string): Promise<void> {
        await supabase.from('cartera_notificaciones').update({ leida: true }).eq('id', id)
    },

    // ── Aging Report (Antigüedad de Saldos) ──────────────────────────────────

    async getAgingData(empresaId: string, fechaCorte: string): Promise<{
        cliente: string
        identificacion: string
        d0_30: number; d31_60: number; d61_90: number; d91_180: number; d180mas: number
        total: number
    }[]> {
        const { data } = await supabase
            .from('cartera_cxc')
            .select('cliente_id, saldo, fecha_vencimiento, clientes(nombre, identificacion)')
            .eq('empresa_id', empresaId)
            .in('estado', ['pendiente', 'parcial'])
            .gt('saldo', 0)

        const mapa: Record<string, any> = {}
        for (const c of (data ?? []) as any[]) {
            const key = c.cliente_id
            if (!mapa[key]) mapa[key] = {
                cliente: c.clientes?.nombre ?? '—',
                identificacion: c.clientes?.identificacion ?? '',
                d0_30: 0, d31_60: 0, d61_90: 0, d91_180: 0, d180mas: 0, total: 0,
            }
            const dias = calcDias(c.fecha_vencimiento, fechaCorte)
            const saldo = Number(c.saldo || 0)
            mapa[key].total += saldo
            if (dias <= 30)       mapa[key].d0_30   += saldo
            else if (dias <= 60)  mapa[key].d31_60  += saldo
            else if (dias <= 90)  mapa[key].d61_90  += saldo
            else if (dias <= 180) mapa[key].d91_180 += saldo
            else                  mapa[key].d180mas += saldo
        }
        return Object.values(mapa).sort((a, b) => b.total - a.total)
    },

    exportarAgingExcel(rows: any[], empresaNombre: string, fechaCorte: string) {
        const header = [[empresaNombre], ['REPORTE ANTIGÜEDAD DE SALDOS (AGING)'], [`Fecha de corte: ${fechaCorte}`], [],
            ['Cliente', 'Identificación', '0-30 días', '31-60 días', '61-90 días', '91-180 días', '+180 días', 'TOTAL']]
        const data = rows.map(r => [
            r.cliente, r.identificacion,
            +r.d0_30.toFixed(2), +r.d31_60.toFixed(2), +r.d61_90.toFixed(2),
            +r.d91_180.toFixed(2), +r.d180mas.toFixed(2), +r.total.toFixed(2),
        ])
        const totRow = ['TOTALES', '',
            ...['d0_30','d31_60','d61_90','d91_180','d180mas','total'].map(k =>
                +rows.reduce((s, r) => s + r[k], 0).toFixed(2)
            ),
        ]
        const ws = XLSX.utils.aoa_to_sheet([...header, ...data, [], totRow])
        ws['!cols'] = [30,15,12,12,12,12,12,14].map(w=>({wch:w}))
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:7}},{s:{r:1,c:0},e:{r:1,c:7}},{s:{r:2,c:0},e:{r:2,c:7}}]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Aging')
        XLSX.writeFile(wb, `Aging_${fechaCorte}.xlsx`)
    },

    exportarCarteraExcel(filas: FilaCartera[], empresaNombre: string, fechaCorte: string) {
        const header = [[empresaNombre], ['REPORTE DE CARTERA'], [`Fecha de corte: ${fechaCorte}`], [],
            ['Factura','Cliente','RUC/CI','Teléfono','Emisión','Vencimiento','Días','Saldo','Estado Gestión','Próx. Gestión','Vendedor']]
        const data = filas.map(f => [
            f.secuencial, f.cliente_nombre, f.cliente_identificacion, f.cliente_telefono ?? '',
            f.fecha_emision, f.fecha_vencimiento ?? '',
            f.dias, +f.saldo.toFixed(2),
            ESTADO_LABEL[f.estado_gestion],
            f.proxima_gestion ?? '', f.vendedor_nombre ?? '',
        ])
        const ws = XLSX.utils.aoa_to_sheet([...header, ...data])
        ws['!cols'] = [20,30,14,12,12,12,6,12,16,12,20].map(w=>({wch:w}))
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:10}},{s:{r:1,c:0},e:{r:1,c:10}},{s:{r:2,c:0},e:{r:2,c:10}}]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Cartera')
        XLSX.writeFile(wb, `Cartera_${fechaCorte}.xlsx`)
    },

    // ── R2: Reporte por Vendedor ──────────────────────────────────────────────
    async exportarPorVendedorExcel(empresaId: string, fechaCorte: string, empresaNombre: string) {
        const { data } = await supabase
            .from('cartera_cxc')
            .select(`saldo, fecha_vencimiento,
                comprobantes!inner(vendedores(nombre))`)
            .eq('empresa_id', empresaId)
            .in('estado', ['pendiente', 'parcial'])
            .gt('saldo', 0)

        const mapa: Record<string, { vencido: number; por_vencer: number; total: number; cnt: number; dias: number[] }> = {}
        for (const c of (data ?? []) as any[]) {
            const nombre = c.comprobantes?.vendedores?.nombre ?? '(Sin vendedor)'
            if (!mapa[nombre]) mapa[nombre] = { vencido: 0, por_vencer: 0, total: 0, cnt: 0, dias: [] }
            const s = Number(c.saldo || 0)
            const d = calcDias(c.fecha_vencimiento, fechaCorte)
            mapa[nombre].total += s; mapa[nombre].cnt++
            if (d > 0) { mapa[nombre].vencido += s; mapa[nombre].dias.push(d) }
            else mapa[nombre].por_vencer += s
        }

        const rows = Object.entries(mapa).map(([v, d]) => [
            v, d.cnt, +d.total.toFixed(2), +d.vencido.toFixed(2), +d.por_vencer.toFixed(2),
            d.dias.length ? Math.round(d.dias.reduce((a,b)=>a+b,0)/d.dias.length) : 0,
        ])
        const header = [[empresaNombre], ['CARTERA POR VENDEDOR'], [`Fecha de corte: ${fechaCorte}`], [],
            ['Vendedor','Documentos','Total Cartera','Total Vencido','Por Vencer','Prom. Días Mora']]
        const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
        ws['!cols'] = [30,12,16,16,14,14].map(w=>({wch:w}))
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:5}},{s:{r:1,c:0},e:{r:1,c:5}},{s:{r:2,c:0},e:{r:2,c:5}}]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Por Vendedor')
        XLSX.writeFile(wb, `Cartera_Vendedor_${fechaCorte}.xlsx`)
    },

    // ── R3: Efectividad del Cobrador ──────────────────────────────────────────
    async exportarEfectividadExcel(empresaId: string, desde: string, hasta: string, empresaNombre: string) {
        const { data } = await supabase
            .from('cartera_gestiones')
            .select('usuario_nombre, canal, promesa_fecha, promesa_cumplida, created_at')
            .eq('empresa_id', empresaId)
            .gte('fecha_gestion', desde)
            .lte('fecha_gestion', hasta)

        const mapa: Record<string, { gestiones: number; promesas: number; cumplidas: number }> = {}
        for (const g of (data ?? []) as any[]) {
            const u = g.usuario_nombre ?? '—'
            if (!mapa[u]) mapa[u] = { gestiones: 0, promesas: 0, cumplidas: 0 }
            mapa[u].gestiones++
            if (g.promesa_fecha) {
                mapa[u].promesas++
                if (g.promesa_cumplida) mapa[u].cumplidas++
            }
        }

        const rows = Object.entries(mapa).map(([u, d]) => [
            u, d.gestiones, d.promesas, d.cumplidas,
            d.promesas > 0 ? +((d.cumplidas / d.promesas * 100).toFixed(1)) : 100,
        ])
        const header = [[empresaNombre], ['EFECTIVIDAD DEL COBRADOR'], [`Período: ${desde} al ${hasta}`], [],
            ['Cobrador','Total Gestiones','Promesas Hechas','Promesas Cumplidas','% Cumplimiento']]
        const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
        ws['!cols'] = [30,16,16,18,14].map(w=>({wch:w}))
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}},{s:{r:2,c:0},e:{r:2,c:4}}]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Efectividad')
        XLSX.writeFile(wb, `Efectividad_Cobrador_${desde}_${hasta}.xlsx`)
    },

    // ── R4: Promesas de Pago ──────────────────────────────────────────────────
    async exportarPromesasExcel(empresaId: string, empresaNombre: string) {
        const fechaHoy = new Date().toISOString().split('T')[0]
        const { data } = await supabase
            .from('cartera_gestiones')
            .select(`promesa_fecha, promesa_monto, promesa_cumplida,
                usuario_nombre, created_at,
                cartera_cxc!inner(
                    saldo, fecha_vencimiento,
                    clientes(nombre, identificacion),
                    comprobantes(secuencial)
                )`)
            .eq('empresa_id', empresaId)
            .not('promesa_fecha', 'is', null)
            .order('promesa_fecha', { ascending: true })

        const rows = (data ?? []).map((g: any) => {
            const vencida = g.promesa_fecha < fechaHoy && g.promesa_cumplida !== true
            return [
                g.cartera_cxc?.comprobantes?.secuencial ?? '',
                g.cartera_cxc?.clientes?.nombre ?? '',
                g.cartera_cxc?.clientes?.identificacion ?? '',
                g.promesa_fecha,
                +Number(g.promesa_monto || 0).toFixed(2),
                g.promesa_cumplida === true ? 'Cumplida' : vencida ? 'Incumplida' : 'Pendiente',
                g.usuario_nombre ?? '',
            ]
        })
        const header = [[empresaNombre], ['LISTADO DE PROMESAS DE PAGO'], [`Generado: ${fechaHoy}`], [],
            ['Factura','Cliente','RUC/CI','Fecha Prometida','Monto Comprometido','Estado','Registrado por']]
        const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
        ws['!cols'] = [18,28,14,14,16,12,20].map(w=>({wch:w}))
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:6}},{s:{r:1,c:0},e:{r:1,c:6}},{s:{r:2,c:0},e:{r:2,c:6}}]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Promesas')
        XLSX.writeFile(wb, `Promesas_Pago_${fechaHoy}.xlsx`)
    },

    // ── R5: Acuerdos de Pago en Cuotas ───────────────────────────────────────
    async exportarAcuerdosExcel(empresaId: string, empresaNombre: string) {
        const { data: acuerdos } = await supabase
            .from('cartera_acuerdos')
            .select(`id, total_acuerdo, n_cuotas, estado, fecha_inicio, observaciones,
                clientes!inner(nombre, identificacion),
                cartera_cxc!inner(comprobantes(secuencial)),
                cartera_acuerdo_cuotas(numero_cuota, fecha_vencimiento, monto, estado, fecha_pago)`)
            .eq('empresa_id', empresaId)
            .order('fecha_inicio', { ascending: false })

        const filas: any[][] = []
        for (const a of (acuerdos ?? []) as any[]) {
            filas.push([
                (a.cartera_cxc as any)?.comprobantes?.secuencial ?? '',
                (a.clientes as any)?.nombre ?? '',
                (a.clientes as any)?.identificacion ?? '',
                a.fecha_inicio, a.total_acuerdo, a.n_cuotas, a.estado, '', '', '',
            ])
            const cuotas = a.cartera_acuerdo_cuotas ?? []
            for (const c of cuotas) {
                filas.push(['', '', '', '', '', '', '',
                    `Cuota ${c.numero_cuota}`, c.fecha_vencimiento,
                    +Number(c.monto).toFixed(2), c.estado, c.fecha_pago ?? '',
                ])
            }
        }
        const header = [[empresaNombre], ['ACUERDOS DE PAGO EN CUOTAS'], [`Generado: ${new Date().toISOString().split('T')[0]}`], [],
            ['Factura','Cliente','RUC/CI','Fecha Inicio','Total Acuerdo','N° Cuotas','Estado Acuerdo','Cuota','Vencimiento Cuota','Monto Cuota','Estado Cuota','Fecha Pago']]
        const ws = XLSX.utils.aoa_to_sheet([...header, ...filas])
        ws['!cols'] = [18,25,13,12,13,10,14,10,16,12,12,12].map(w=>({wch:w}))
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:11}},{s:{r:1,c:0},e:{r:1,c:11}},{s:{r:2,c:0},e:{r:2,c:11}}]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Acuerdos')
        XLSX.writeFile(wb, `Acuerdos_Pago_${new Date().toISOString().split('T')[0]}.xlsx`)
    },

    // ── R6: Comparativo mes a mes (últimos 12 meses) ──────────────────────────
    async exportarComparativoExcel(empresaId: string, empresaNombre: string) {
        const hoy = new Date()
        const meses: { label: string; desde: string; hasta: string }[] = []
        for (let i = 11; i >= 0; i--) {
            const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
            const h = new Date(d.getFullYear(), d.getMonth() + 1, 0)
            meses.push({
                label: d.toLocaleDateString('es-EC', { month: 'short', year: 'numeric' }),
                desde: d.toISOString().split('T')[0],
                hasta: h.toISOString().split('T')[0],
            })
        }

        const resultsMeses = await Promise.all(
            meses.map(m =>
                supabase.from('cartera_cxc')
                    .select('saldo, fecha_vencimiento, cliente_id')
                    .eq('empresa_id', empresaId)
                    .in('estado', ['pendiente', 'parcial'])
                    .gt('saldo', 0)
                    .lte('created_at', `${m.hasta}T23:59:59`)
            )
        )

        const rows: any[][] = meses.map((m, i) => {
            let total = 0, vencido = 0, clientesMora = new Set<string>()
            for (const c of (resultsMeses[i].data ?? []) as any[]) {
                const s = Number(c.saldo || 0)
                total += s
                const d = calcDias(c.fecha_vencimiento, m.hasta)
                if (d > 0) { vencido += s; clientesMora.add(c.cliente_id) }
            }
            return [m.label, +total.toFixed(2), +vencido.toFixed(2),
                +(total - vencido).toFixed(2), clientesMora.size]
        })

        const header = [[empresaNombre], ['COMPARATIVO CARTERA — ÚLTIMOS 12 MESES'], [],
            ['Mes','Total Cartera','Total Vencido','Por Vencer','Clientes en Mora']]
        const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
        ws['!cols'] = [16,16,16,14,16].map(w=>({wch:w}))
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}}]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Comparativo')
        XLSX.writeFile(wb, `Comparativo_Cartera.xlsx`)
    },

    // ── R7: Clientes de Alto Riesgo ───────────────────────────────────────────
    async exportarAltoRiesgoExcel(empresaId: string, empresaNombre: string, fechaCorte: string) {
        const { data } = await supabase
            .from('cartera_cxc')
            .select(`saldo, fecha_vencimiento, estado_gestion,
                clientes!inner(nombre, identificacion, score_credito, bloqueo_credito, telefono, email)`)
            .eq('empresa_id', empresaId)
            .in('estado', ['pendiente', 'parcial'])
            .gt('saldo', 0)

        // Agrupar por cliente
        const mapa: Record<string, any> = {}
        for (const c of (data ?? []) as any[]) {
            const cli = c.clientes
            if (!mapa[cli.identificacion]) {
                mapa[cli.identificacion] = {
                    nombre: cli.nombre, identificacion: cli.identificacion,
                    score: cli.score_credito, bloqueo: cli.bloqueo_credito,
                    telefono: cli.telefono, email: cli.email,
                    total: 0, max_dias: 0,
                }
            }
            mapa[cli.identificacion].total += Number(c.saldo || 0)
            const d = calcDias(c.fecha_vencimiento, fechaCorte)
            if (d > mapa[cli.identificacion].max_dias) mapa[cli.identificacion].max_dias = d
        }

        const rows = Object.values(mapa)
            .filter((c: any) => (c.score !== null && c.score < 50) || c.bloqueo || c.max_dias > 90)
            .sort((a: any, b: any) => a.score - b.score)
            .map((c: any) => [
                c.nombre, c.identificacion, c.score ?? '—',
                c.max_dias > 180 ? 'Negro' : c.max_dias > 90 ? 'Rojo' : 'Amarillo',
                +c.total.toFixed(2), c.max_dias, c.bloqueo ? 'SÍ' : 'NO',
                c.telefono ?? '', c.email ?? '',
            ])

        const header = [[empresaNombre], ['CLIENTES DE ALTO RIESGO / INCOBRABLE'], [`Fecha de corte: ${fechaCorte}`], [],
            ['Cliente','RUC/CI','Score','Semáforo','Saldo Total','Máx. Días Mora','Bloqueado','Teléfono','Email']]
        const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
        ws['!cols'] = [28,14,8,10,14,14,10,14,24].map(w=>({wch:w}))
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:8}},{s:{r:1,c:0},e:{r:1,c:8}},{s:{r:2,c:0},e:{r:2,c:8}}]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Alto Riesgo')
        XLSX.writeFile(wb, `Clientes_Alto_Riesgo_${fechaCorte}.xlsx`)
    },
}
