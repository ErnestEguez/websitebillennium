import { supabase } from '../lib/supabase'

export const seedService = {
    async seedInitialData(empresaId: string) {
        try {
            // 1. Seed Categories
            const categoriesToSeed = ['Entradas', 'Platos Fuertes', 'Bebidas', 'Postres']
            const categories: Record<string, string> = {}

            for (const nombre of categoriesToSeed) {
                const { data: existing } = await supabase
                    .from('categorias')
                    .select('id')
                    .eq('nombre', nombre)
                    .eq('empresa_id', empresaId)
                    .single()

                if (existing) {
                    categories[nombre] = existing.id
                } else {
                    const { data: created, error: createError } = await supabase
                        .from('categorias')
                        .insert({ nombre, empresa_id: empresaId })
                        .select()
                        .single()

                    if (createError) throw createError
                    categories[nombre] = created.id
                }
            }

            // 2. Seed Products
            const productsToSeed = [
                { nombre: 'Ceviche de Camarón', precio_venta: 12.50, cat: 'Entradas' },
                { nombre: 'Lomo Saltado', precio_venta: 18.00, cat: 'Platos Fuertes' },
                { nombre: 'Encebollado Mixto', precio_venta: 10.00, cat: 'Platos Fuertes' },
                { nombre: 'Jugo Natural', precio_venta: 3.50, cat: 'Bebidas' },
                { nombre: 'Cerveza Nacional', precio_venta: 4.00, cat: 'Bebidas' },
                { nombre: 'Tarta de Chocolate', precio_venta: 6.00, cat: 'Postres' }
            ]

            for (const prod of productsToSeed) {
                const { data: existing } = await supabase
                    .from('productos')
                    .select('id')
                    .eq('nombre', prod.nombre)
                    .eq('empresa_id', empresaId)
                    .single()

                if (!existing) {
                    await supabase.from('productos').insert({
                        nombre: prod.nombre,
                        precio_venta: prod.precio_venta,
                        categoria_id: categories[prod.cat],
                        iva_porcentaje: 15,
                        activo: true,
                        empresa_id: empresaId
                    })
                }
            }

            // 3. Seed Tables
            const mesasToSeed = ['1', '2', '3', '4', '5', '6', '7', '8']
            for (const numero of mesasToSeed) {
                const { data: existing } = await supabase
                    .from('mesas')
                    .select('id')
                    .eq('numero', numero)
                    .eq('empresa_id', empresaId)
                    .single()

                if (!existing) {
                    await supabase.from('mesas').insert({
                        numero,
                        capacidad: numero === '3' || numero === '5' ? 6 : 4,
                        estado: 'libre',
                        empresa_id: empresaId
                    })
                }
            }

            return { success: true }
        } catch (error) {
            console.error('Error seeding data:', error)
            throw error
        }
    }
}
