import { supabase } from '../lib/supabase'

export interface CandidatoRuta {
    cliente_id: string
    cliente_nombre: string
    direccion: string | null
    geo_latitud: number | null
    geo_longitud: number | null
    monto_pendiente: number
}

export interface ParadaRuta {
    id: string
    ruta_id: string
    orden: number
    cliente_id: string
    cliente_nombre: string
    direccion: string | null
    geo_latitud: number | null
    geo_longitud: number | null
    monto_pendiente: number
    estado: 'pendiente' | 'visitado'
}

export interface RutaCobro {
    id: string
    empresa_id: string
    cobrador_id: string
    fecha: string
    total_estimado: number
    created_at: string
    paradas: ParadaRuta[]
}

interface PuntoGeo { lat: number; lng: number }

function haversineKm(a: PuntoGeo, b: PuntoGeo): number {
    const R = 6371
    const dLat = (b.lat - a.lat) * Math.PI / 180
    const dLng = (b.lng - a.lng) * Math.PI / 180
    const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// Vecino más cercano desde el origen (el local). Los clientes sin
// geo-ubicación capturada no se pueden ordenar por cercanía — van al
// final, en el orden en que llegaron, para que el cobrador sepa que
// esos hay que ubicarlos "a mano".
function ordenarPorCercania(origen: PuntoGeo | null, puntos: CandidatoRuta[]): CandidatoRuta[] {
    const conGeo = puntos.filter(p => p.geo_latitud != null && p.geo_longitud != null)
    const sinGeo = puntos.filter(p => p.geo_latitud == null || p.geo_longitud == null)

    const restantes = [...conGeo]
    const ordenados: CandidatoRuta[] = []
    let actual = origen
    while (restantes.length > 0) {
        let idx = 0
        if (actual) {
            let distMin = Infinity
            restantes.forEach((p, i) => {
                const d = haversineKm(actual as PuntoGeo, { lat: p.geo_latitud!, lng: p.geo_longitud! })
                if (d < distMin) { distMin = d; idx = i }
            })
        }
        const [siguiente] = restantes.splice(idx, 1)
        ordenados.push(siguiente)
        actual = { lat: siguiente.geo_latitud!, lng: siguiente.geo_longitud! }
    }
    return [...ordenados, ...sinGeo]
}

export const rutaCobroService = {
    /** Clientes de un cobrador con cuotas vencidas o que vencen hoy (paso 1 del modal "Generar Ruta"). */
    async obtenerCandidatos(empresaId: string, cobradorId: string, fecha: string): Promise<CandidatoRuta[]> {
        const { data, error } = await supabase
            .from('creditos_electrodomesticos_cuotas')
            .select(`
                saldo_pendiente,
                fecha_vencimiento,
                estado,
                creditos_electrodomesticos!inner (
                    cliente_id, cobrador_id, empresa_id, estado,
                    clientes:cliente_id (nombre, direccion, geo_latitud, geo_longitud)
                )
            `)
            .eq('creditos_electrodomesticos.cobrador_id', cobradorId)
            .eq('creditos_electrodomesticos.empresa_id', empresaId)
            .neq('creditos_electrodomesticos.estado', 'ANULADO')
            .in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            .lte('fecha_vencimiento', fecha)
            .gt('saldo_pendiente', 0)
        if (error) throw error

        const porCliente = new Map<string, CandidatoRuta>()
        for (const row of (data ?? []) as any[]) {
            const cred = row.creditos_electrodomesticos
            const cli = cred?.clientes
            if (!cred || !cli) continue
            const existente = porCliente.get(cred.cliente_id)
            if (existente) {
                existente.monto_pendiente += Number(row.saldo_pendiente)
            } else {
                porCliente.set(cred.cliente_id, {
                    cliente_id: cred.cliente_id,
                    cliente_nombre: cli.nombre,
                    direccion: cli.direccion ?? null,
                    geo_latitud: cli.geo_latitud != null ? Number(cli.geo_latitud) : null,
                    geo_longitud: cli.geo_longitud != null ? Number(cli.geo_longitud) : null,
                    monto_pendiente: Number(row.saldo_pendiente),
                })
            }
        }
        return Array.from(porCliente.values()).sort((a, b) => b.monto_pendiente - a.monto_pendiente)
    },

    async getOrigenEmpresa(empresaId: string): Promise<PuntoGeo | null> {
        const { data } = await supabase.from('empresas').select('geo_latitud, geo_longitud').eq('id', empresaId).single()
        if (data?.geo_latitud == null || data?.geo_longitud == null) return null
        return { lat: Number(data.geo_latitud), lng: Number(data.geo_longitud) }
    },

    async capturarOrigenEmpresa(empresaId: string, lat: number, lng: number): Promise<void> {
        const { error } = await supabase.from('empresas').update({ geo_latitud: lat, geo_longitud: lng }).eq('id', empresaId)
        if (error) throw error
    },

    /** Genera (o regenera) la ruta del día para un cobrador con los clientes marcados en el checklist. */
    async generarRuta(empresaId: string, cobradorId: string, fecha: string, seleccionados: CandidatoRuta[]): Promise<RutaCobro> {
        const origen = await this.getOrigenEmpresa(empresaId)
        const ordenados = ordenarPorCercania(origen, seleccionados)
        const totalEstimado = ordenados.reduce((s, p) => s + p.monto_pendiente, 0)

        const { data: existente } = await supabase
            .from('rutas_cobro')
            .select('id')
            .eq('empresa_id', empresaId)
            .eq('cobrador_id', cobradorId)
            .eq('fecha', fecha)
            .maybeSingle()

        let rutaId: string
        if (existente) {
            rutaId = existente.id
            const { error: errUpd } = await supabase.from('rutas_cobro').update({ total_estimado: totalEstimado }).eq('id', rutaId)
            if (errUpd) throw errUpd
            const { error: errDel } = await supabase.from('rutas_cobro_paradas').delete().eq('ruta_id', rutaId)
            if (errDel) throw errDel
        } else {
            const { data: nueva, error: errIns } = await supabase
                .from('rutas_cobro')
                .insert({ empresa_id: empresaId, cobrador_id: cobradorId, fecha, total_estimado: totalEstimado })
                .select('id')
                .single()
            if (errIns) throw errIns
            rutaId = nueva.id
        }

        if (ordenados.length > 0) {
            const filas = ordenados.map((p, i) => ({
                ruta_id: rutaId,
                orden: i + 1,
                cliente_id: p.cliente_id,
                cliente_nombre: p.cliente_nombre,
                direccion: p.direccion,
                geo_latitud: p.geo_latitud,
                geo_longitud: p.geo_longitud,
                monto_pendiente: p.monto_pendiente,
                estado: 'pendiente' as const,
            }))
            const { error: errParadas } = await supabase.from('rutas_cobro_paradas').insert(filas)
            if (errParadas) throw errParadas
        }

        const ruta = await this.obtenerRutaDelDia(empresaId, cobradorId, fecha)
        if (!ruta) throw new Error('No se pudo recuperar la ruta recién generada')
        return ruta
    },

    async obtenerRutaDelDia(empresaId: string, cobradorId: string, fecha: string): Promise<RutaCobro | null> {
        const { data: ruta, error } = await supabase
            .from('rutas_cobro')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('cobrador_id', cobradorId)
            .eq('fecha', fecha)
            .maybeSingle()
        if (error) throw error
        if (!ruta) return null

        const { data: paradas, error: errP } = await supabase
            .from('rutas_cobro_paradas')
            .select('*')
            .eq('ruta_id', ruta.id)
            .order('orden', { ascending: true })
        if (errP) throw errP

        return { ...(ruta as any), paradas: (paradas ?? []) as ParadaRuta[] } as RutaCobro
    },

    async marcarParada(paradaId: string, estado: 'pendiente' | 'visitado'): Promise<void> {
        const { error } = await supabase.from('rutas_cobro_paradas').update({ estado }).eq('id', paradaId)
        if (error) throw error
    },

    /** Link de Google Maps con todas las paradas en orden — navegación turno a turno sin mapa propio. */
    linkGoogleMaps(origen: PuntoGeo | null, paradas: ParadaRuta[]): string | null {
        const conGeo = paradas.filter(p => p.geo_latitud != null && p.geo_longitud != null)
        if (conGeo.length === 0) return null
        const puntos = conGeo.map(p => `${p.geo_latitud},${p.geo_longitud}`)
        const destino = puntos[puntos.length - 1]
        const waypoints = puntos.slice(0, -1)
        const params = new URLSearchParams({ api: '1', destination: destino, travelmode: 'driving' })
        if (origen) params.set('origin', `${origen.lat},${origen.lng}`)
        if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'))
        return `https://www.google.com/maps/dir/?${params.toString()}`
    },
}
