import { supabase } from '../lib/supabase'

export interface Pedido {
    id: string
    mesa_id: string
    mesero_id: string
    estado: 'pendiente' | 'en_preparacion' | 'atendido' | 'facturado'
    total: number
    empresa_id: string
    created_at?: string
}

export interface PedidoDetalle {
    id: string
    pedido_id: string
    producto_id: string
    cantidad: number
    precio_unitario: number
    notas?: string
}

export const pedidoService = {
    async crearPedido(mesaId: string, meseroId: string, empresaId: string, items: any[], total: number, clienteInfo?: { nombre?: string, identificacion?: string, email?: string }) {
        // Preparar los detalles para el RPC
        const detalles = items.map(item => ({
            producto_id: item.id,
            cantidad: Number(item.cantidad || 0),
            precio_unitario: Number(item.precio_venta || 0),
            subtotal: Number(item.precio_venta || 0) * Number(item.cantidad || 0)
        }))

        // Llamar al RPC (Procedimiento Almacenado) que maneja la transacción atómica
        const { data, error } = await supabase.rpc('crear_pedido_completo', {
            p_mesa_id: mesaId,
            p_mesero_id: meseroId,
            p_empresa_id: empresaId,
            p_total: total,
            p_detalles: detalles,
            p_nombre_cliente: clienteInfo?.nombre || null,
            p_identificacion_cliente: clienteInfo?.identificacion || null,
            p_email_cliente: clienteInfo?.email || null
        })

        if (error) {
            console.error('Error en RPC crear_pedido_completo:', error)
            throw error
        }

        // Retornar el pedido completo (con detalles) para que sea usable inmediatamente
        return this.getPedidoById(data.id)
    },

    async getPedidosRecientes(limit = 5) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                *,
                mesas (numero)
            `)
            .gte('created_at', today.toISOString())
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) throw error
        return data
    },

    async getPedidos(empresaId: string, fecha: string) {
        const start = new Date(fecha)
        start.setUTCHours(0, 0, 0, 0)

        const end = new Date(fecha)
        end.setUTCHours(23, 59, 59, 999)

        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                *,
                mesas (numero),
                pedido_detalles (
                    *,
                    productos (nombre)
                )
            `)
            .eq('empresa_id', empresaId)
            .neq('estado', 'facturado') // Excluir facturados por peticion del usuario
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false })

        if (error) throw error
        return data
    },

    // Nueva función optimizada para Gestión (Cocina/Caja)
    // Trae TODOS los pendientes (independiente de la fecha) + Facturados del día seleccionado
    async getPedidosGestion(empresaId: string, fecha: string) {
        const start = new Date(fecha)
        start.setUTCHours(0, 0, 0, 0)

        const end = new Date(fecha)
        end.setUTCHours(23, 59, 59, 999)

        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                *,
                mesas (numero),
                pedido_detalles (
                    *,
                    productos (nombre)
                )
            `)
            .eq('empresa_id', empresaId)
            // Lógica: Solo mostrar estados activos (excluir facturado y cancelado)
            .neq('estado', 'facturado')
            .neq('estado', 'cancelado')
            .order('created_at', { ascending: false })

        if (error) throw error
        return data
    },

    async getPedidosByMesero(empresaId: string, meseroId: string) {
        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                *,
                mesas (numero),
                pedido_detalles (
                    *,
                    productos (nombre)
                )
            `)
            .eq('empresa_id', empresaId)
            .eq('mesero_id', meseroId)
            .order('created_at', { ascending: false })

        if (error) throw error
        return data
    },

    async getEstadisticas(empresaId: string) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Ventas del día (desde comprobantes oficiales)
        const { data: sales, error: salesError } = await supabase
            .from('comprobantes')
            .select('total')
            .eq('empresa_id', empresaId)
            .gte('created_at', today.toISOString())

        if (salesError) throw salesError

        // Pedidos activos
        const { count: pedidosActivos, error: countError } = await supabase
            .from('pedidos')
            .select('*', { count: 'exact', head: true })
            .eq('empresa_id', empresaId)
            .neq('estado', 'facturado')

        if (countError) throw countError

        // Mesas ocupadas
        const { count: mesasOcupadas, error: mesaCountError } = await supabase
            .from('mesas')
            .select('*', { count: 'exact', head: true })
            .eq('empresa_id', empresaId)
            .eq('estado', 'ocupada')

        if (mesaCountError) throw mesaCountError

        const totalVentas = sales?.reduce((sum, p) => sum + Number(p.total), 0) || 0
        const promedioTicket = sales?.length ? totalVentas / sales.length : 0

        return {
            totalVentas,
            pedidosActivos: pedidosActivos || 0,
            mesasOcupadas: mesasOcupadas || 0,
            promedioTicket
        }
    },

    async getPedidosPorEstado(empresaId: string, estados?: string[]) {
        let query = supabase
            .from('pedidos')
            .select(`
                *,
                mesas (numero),
                pedido_detalles (
                    *,
                    productos (nombre)
                )
            `)
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })

        if (estados && estados.length > 0) {
            query = query.in('estado', estados)
        }

        const { data, error } = await query

        console.log('PEDIDOS RETRIEVED:', data)
        if (error) {
            console.error('QUERY ERROR:', error)
            throw error
        }
        return data
    },

    async actualizarEstado(pedidoId: string, nuevoEstado: string) {
        const { data, error } = await supabase
            .from('pedidos')
            .update({ estado: nuevoEstado })
            .eq('id', pedidoId)
            .select()
            .single()

        if (error) throw error

        // Si el pedido se marca como 'facturado' o se cancela, 
        // podríamos liberar la mesa, pero eso suele hacerse en el flujo de factura.

        return data
    },

    async getPedidoActivoPorMesa(mesaId: string) {
        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                *,
                pedido_detalles (
                    *,
                    productos (*)
                )
            `)
            .eq('mesa_id', mesaId)
            .neq('estado', 'facturado')
            .neq('estado', 'cancelado')
            .order('created_at', { ascending: false })
            .limit(1) // Asegurar que solo traiga uno para evitar error con .single() si hay multiples
            .maybeSingle()

        if (error) throw error
        return data
    },

    async getPedidosActivosMesa(mesaId: string) {
        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                *,
                pedido_detalles (
                    *,
                    productos (*)
                )
            `)
            .eq('mesa_id', mesaId)
            .neq('estado', 'facturado')
            .neq('estado', 'cancelado')
            .order('created_at', { ascending: true }) // Ordenar por creación para ver el original primero

        if (error) throw error
        return data
    },

    async dividirPedido(pedidoOriginalId: string, nuevosPedidos: any[], nombreOriginal?: string) {
        // 1. Ejecutar RPC de división
        const { data, error } = await supabase.rpc('dividir_pedido', {
            p_pedido_original_id: pedidoOriginalId,
            p_nuevos_pedidos: nuevosPedidos
        })

        if (error) throw error

        // 2. Si se cambió el nombre del original, actualizarlo
        if (nombreOriginal) {
            await supabase
                .from('pedidos')
                .update({ nombre_cliente_mesa: nombreOriginal })
                .eq('id', pedidoOriginalId)
        }

        return data
    },

    async revertirDivision(pedidoId: string) {
        const { data, error } = await supabase.rpc('revertir_division_total', {
            p_pedido_id: pedidoId
        })

        if (error) throw error
        return data
    },

    async getPedidoById(pedidoId: string) {
        try {
            const { data, error } = await supabase
                .from('pedidos')
                .select(`
                    *,
                    mesas(numero),
                    profiles(nombre),
                    pedido_detalles(
                        *,
                        productos(
                            nombre,
                            categorias(tipo)
                        )
                    )
                `)
                .eq('id', pedidoId)
                .single()

            if (error) {
                console.warn('Error in getPedidoById join:', error)
                // Reintento sin el join de tipo o perfiles por si la columna/tabla no existe
                const { data: simpleData, error: simpleError } = await supabase
                    .from('pedidos')
                    .select(`
                        *,
                        mesas(numero),
                        pedido_detalles(
                            *,
                            productos(
                                nombre,
                                categorias(nombre)
                            )
                        )
                    `)
                    .eq('id', pedidoId)
                    .single()

                if (simpleError) throw simpleError
                return simpleData
            }
            return data
        } catch (err) {
            console.error('Fatal error in getPedidoById:', err)
            throw err
        }
    },

    async agregarItemsAPedido(pedidoId: string, nuevosItems: any[], nuevoTotal: number) {
        // 1. Insertar los nuevos detalles
        const detalles = nuevosItems.map(item => {
            const precio_unitario = Number(item.precio_venta || 0)
            const cantidad = Number(item.cantidad || 0)
            const subtotal = precio_unitario * cantidad

            return {
                pedido_id: pedidoId,
                producto_id: item.id,
                cantidad: cantidad,
                precio_unitario: precio_unitario,
                subtotal: subtotal
            }
        })

        const { error: detallesError } = await supabase
            .from('pedido_detalles')
            .insert(detalles)

        if (detallesError) throw detallesError

        // 2. Actualizar el total del pedido
        const { error: pedidoError } = await supabase
            .from('pedidos')
            .update({ total: nuevoTotal })
            .eq('id', pedidoId)

        if (pedidoError) throw pedidoError

        return true
    }
}
