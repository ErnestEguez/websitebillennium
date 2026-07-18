// Obtiene las credenciales de envío de correo (SMTP) configuradas en
// Facturación >> Comprobantes >> Configuración (guardadas en empresas.config_sri).
//
// Uso:
//   QI_SERVICE_KEY=xxxx node get_mail_config.mjs <ruc_o_id_empresa>
//
// QI_SERVICE_KEY debe ser el service_role key de Supabase (nunca el anon key,
// porque config_sri no es legible con el anon key por RLS).

import { createClient } from '@supabase/supabase-js'

const URL = 'https://ietsocfibsoclienqafq.supabase.co'
const SERVICE_KEY = process.env.QI_SERVICE_KEY
const empresaRef = process.argv[2]

if (!SERVICE_KEY) {
    console.error('Falta la variable de entorno QI_SERVICE_KEY (service_role key de Supabase).')
    process.exit(1)
}
if (!empresaRef) {
    console.error('Uso: node get_mail_config.mjs <ruc_o_id_empresa>')
    process.exit(1)
}

const admin = createClient(URL, SERVICE_KEY, {
    db:   { schema: 'facturacion' },
    auth: { autoRefreshToken: false, persistSession: false },
})

const isUuid = /^[0-9a-f-]{36}$/i.test(empresaRef)
const query = admin.from('empresas').select('id, nombre, ruc, config_sri')

const { data, error } = await (isUuid
    ? query.eq('id', empresaRef).single()
    : query.eq('ruc', empresaRef).single())

if (error) {
    console.error('Error consultando empresa:', error.message)
    process.exit(1)
}

const cfg = data.config_sri || {}

console.log('Empresa:', data.nombre, '(RUC', data.ruc + ')')
console.log('--- Credenciales SMTP ---')
console.log('Host:', cfg.mail_host || '(no configurado)')
console.log('Puerto:', cfg.mail_port || '(no configurado)')
console.log('Usuario/Email:', cfg.mail_user || '(no configurado)')
console.log('Password:', cfg.mail_pass || '(no configurado)')
console.log('SSL/TLS:', cfg.mail_ssl === true ? 'sí (465)' : 'no (STARTTLS 587)')
console.log('CC (copia):', cfg.mail_cc || '(sin copia)')
