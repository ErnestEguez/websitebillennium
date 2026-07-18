// Diagnóstico: verifica si el proceso de "Corregir saldo inicial" (o la
// importación original) realmente generó el movimiento de saldo inicial en
// Kardex y actualizó productos/stock_bodega para una empresa.
//
// Uso:
//   QI_SERVICE_KEY=xxxx node get_saldo_inicial.mjs <ruc_o_id_empresa>
//
// QI_SERVICE_KEY debe ser el service_role key de Supabase (Project Settings
// → API → service_role), porque salta RLS para poder ver todo sin depender
// de la sesión del usuario logueado.

import { createClient } from '@supabase/supabase-js'

const URL = 'https://ietsocfibsoclienqafq.supabase.co'
const SERVICE_KEY = process.env.QI_SERVICE_KEY
const empresaRef = process.argv[2]

if (!SERVICE_KEY) {
    console.error('Falta la variable de entorno QI_SERVICE_KEY (service_role key de Supabase).')
    process.exit(1)
}
if (!empresaRef) {
    console.error('Uso: node get_saldo_inicial.mjs <ruc_o_id_empresa>')
    process.exit(1)
}

const admin = createClient(URL, SERVICE_KEY, {
    db:   { schema: 'facturacion' },
    auth: { autoRefreshToken: false, persistSession: false },
})

const isUuid = /^[0-9a-f-]{36}$/i.test(empresaRef)
const empQuery = admin.from('empresas').select('id, nombre, ruc')
const { data: empresa, error: empErr } = await (isUuid
    ? empQuery.eq('id', empresaRef).single()
    : empQuery.eq('ruc', empresaRef).single())

if (empErr) { console.error('Error consultando empresa:', empErr.message); process.exit(1) }

console.log(`Empresa: ${empresa.nombre} (RUC ${empresa.ruc}, id ${empresa.id})`)
console.log('='.repeat(60))

// 1. Productos: total, con stock 0, con stock > 0
const { count: totalProductos } = await admin
    .from('productos').select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresa.id)

const { count: stockCero } = await admin
    .from('productos').select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresa.id).eq('stock', 0)

const { count: stockPositivo } = await admin
    .from('productos').select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresa.id).gt('stock', 0)

console.log('\n-- Productos --')
console.log('Total:', totalProductos)
console.log('Con stock = 0:', stockCero)
console.log('Con stock > 0:', stockPositivo)

// 2. Kardex: total y agrupado por motivo
const { data: kardexRows, error: kardexErr } = await admin
    .from('kardex').select('motivo, tipo_movimiento, cantidad')
    .eq('empresa_id', empresa.id)

if (kardexErr) { console.error('Error consultando kardex:', kardexErr.message); process.exit(1) }

console.log('\n-- Kardex --')
console.log('Total de movimientos:', kardexRows.length)
const porMotivo = new Map()
for (const r of kardexRows) {
    const key = r.motivo || '(sin motivo)'
    porMotivo.set(key, (porMotivo.get(key) || 0) + 1)
}
for (const [motivo, n] of porMotivo) console.log(`  "${motivo}": ${n}`)

// 3. Stock_bodega: suma de cantidad y cuántas filas en 0
const { data: stockBodegaRows, error: sbErr } = await admin
    .from('stock_bodega').select('cantidad')
    .eq('empresa_id', empresa.id)

if (sbErr) { console.error('Error consultando stock_bodega:', sbErr.message); process.exit(1) }

const sumaCantidad = stockBodegaRows.reduce((s, r) => s + Number(r.cantidad || 0), 0)
const filasEnCero = stockBodegaRows.filter(r => Number(r.cantidad || 0) === 0).length

console.log('\n-- Stock Bodega --')
console.log('Total de filas:', stockBodegaRows.length)
console.log('Filas con cantidad = 0:', filasEnCero)
console.log('Suma total de cantidad:', sumaCantidad)

// 4. Muestra de 5 productos con stock 0 para revisar a mano
const { data: muestra } = await admin
    .from('productos').select('codigo, nombre, stock, costo_promedio')
    .eq('empresa_id', empresa.id).eq('stock', 0)
    .limit(5)

console.log('\n-- Muestra de productos con stock 0 --')
console.table(muestra)
