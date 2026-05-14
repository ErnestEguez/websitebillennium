Actúa como:
1) desarrollador senior full stack (mismo stack que mi App Contable/QuickInvoice),
2) arquitecto de integraciones contables,
3) y consultor funcional con experiencia en contabilidad de Ecuador y uso del portal SRI.

Objetivo:
Quiero un módulo dentro de mi App Contable que se conecte al SRI, permita seleccionar un periodo (año/mes) y un tipo de comprobante (facturas de compras, retenciones, notas de crédito, notas de débito), descargue automáticamente el archivo correspondiente (por ejemplo CSV o el formato que ofrezca el SRI) y procese esa información para mostrarla en un grid amigable. Desde ese grid quiero poder asignar cuentas contables la primera vez y que en importaciones futuras el sistema aplique automáticamente esas cuentas para generar los diarios contables.

Contexto:
- El SRI, en su portal, permite consultar “comprobantes electrónicos recibidos” y descargar un reporte (normalmente CSV) filtrado por periodo y tipo de comprobante. 
- Muchas soluciones en el mercado automatizan este proceso mediante bots / automatización del acceso web al SRI (por ejemplo, extensiones o servicios que se loguean, seleccionan año/mes y tipo de comprobante, y descargan el archivo en la nube). Asume un enfoque similar, pero integrándolo a mi App Contable.
- Mi App Contable está en el mismo proyecto Supabase que QuickInvoice, en un schema contable separado (por ejemplo `conta`).
- La app es multiempresa (multi-tenant) con `empresa_id` en todas las tablas.
- Necesito soportar al menos estos “productos” del SRI:
  - Facturas de compras,
  - Retenciones,
  - Notas de crédito,
  - Notas de débito.

Requerimientos funcionales:

1) Selección de periodo y tipo de comprobante:
   - En la App Contable, el usuario elige:
     - Periodo: año y mes,
     - Producto / tipo de comprobante: Facturas (compras), Retenciones, Notas de Crédito, Notas de Débito.
   - La UI debe ser clara para seleccionar ambas cosas (ej. combos de año, mes, tipo de comprobante).

2) Descarga automática desde el SRI:
   - A partir de esos parámetros (empresa, año, mes, tipo), el sistema debe:
     - conectarse al SRI con las credenciales del contribuyente (RUC, usuario, clave), usando la estrategia que sea viable (por ejemplo:
       - automatización del portal web,
       - bot/headless browser o
       - consumo de servicios si existieran),
     - navegar a la sección de “comprobantes electrónicos recibidos” o equivalente,
     - aplicar los filtros de periodo y tipo de comprobante,
     - descargar el archivo de reporte (normalmente CSV) correspondiente.
   - Quiero que propongas una arquitectura realista para esto, por ejemplo:
     - un servicio backend que se encargue de la automatización del login y descarga,
     - manejo seguro de credenciales del SRI por empresa,
     - y registro de auditoría (qué se descargó, cuándo, para qué empresa y para qué periodo).
   - Si es necesario, asume que la automatización se hace con un componente tipo “bot”/headless browser en el backend y descríbelo claramente.

3) Procesamiento del archivo descargado:
   - Una vez descargado el archivo del SRI (CSV u otro), el sistema debe:
     - parsearlo,
     - identificar y mapear las columnas importantes según el tipo de comprobante:
       - Facturas: proveedor (RUC, nombre), fecha, número, tipo, base imponible, IVA, retenciones, total, etc.
       - Retenciones: agente, sujeto retenido, tipo de retención, base, porcentaje, valor retenido, etc.
       - Notas de crédito / débito: datos de la nota, comprobante relacionado, montos.
     - normalizarlo y guardarlo en tablas internas en el schema contable (`conta`) con `empresa_id`.

4) Grid amigable de comprobantes importados:
   - Quiero una pantalla de grid para cada tipo de comprobante (o una vista unificada con filtros):
     - Facturas de compras SRI,
     - Retenciones SRI,
     - Notas de crédito SRI,
     - Notas de débito SRI.
   - El grid debe mostrar, al menos:
     - proveedor o contraparte,
     - fecha,
     - número de comprobante,
     - tipo,
     - bases, impuestos y totales,
     - estado contable: pendiente de mapeo, listo para generar diario, contabilizado.
   - Filtros:
     - empresa,
     - periodo (año/mes),
     - tipo de comprobante,
     - proveedor,
     - estado contable.

5) Mapeo contable (primera vez):
   - La primera vez que llega un comprobante de cierto proveedor/tipo, necesito poder:
     - asignar una o varias cuentas contables (gasto, IVA compras, retención, etc.),
     - guardar esa “regla de mapeo” para futuras descargas.
   - Las reglas de mapeo deben:
     - ser por empresa,
     - poder basarse en proveedor (RUC), tipo de comprobante, e incluso otras claves si es necesario,
     - almacenar las cuentas contables asociadas.
   - Estas reglas se guardan en una tabla de mapeos (por ejemplo `conta.mapeos_sri_compras` / `conta.mapeos_sri_retenciones`, o un diseño unificado).

6) Aplicación automática de mapeos:
   - Cada vez que se descarguen nuevos comprobantes del SRI:
     - el sistema debe buscar si hay reglas de mapeo para ese proveedor/tipo,
     - aplicar automáticamente las cuentas contables,
     - marcar esos comprobantes como listos para generar asiento contable.
   - Quiero una pantalla de mantenimiento de reglas de mapeo (CRUD) por empresa, para poder revisar y corregir estas reglas.

7) Generación de diarios contables a partir de estas descargas:
   - Desde el grid, quiero poder seleccionar un conjunto de comprobantes (por ejemplo, todo un mes, o un subconjunto) y generar los diarios contables:
     - compras,
     - retenciones,
     - notas de crédito,
     - notas de débito.
   - Debes:
     - usar `empresa_id`,
     - respetar el periodo contable,
     - usar las cuentas del plan contable,
     - cuadrar el debe/haber.
   - Debe ser posible elegir la granularidad:
     - un asiento por comprobante,
     - o asientos resumen por periodo, según una configuración por empresa.

Requerimientos técnicos y de seguridad:
- Usar el mismo stack técnico que la App Contable (frontend + backend + Supabase).
- Mantener el patrón multiempresa: `empresa_id` en todos los registros.
- Diseñar bien el manejo de credenciales SRI:
  - Cada empresa podría guardar sus credenciales SRI de forma segura (proponer enfoque).
  - La descarga y procesamiento puede ejecutarse en backend (job/tarea).
- Las tablas para comprobantes descargados del SRI y mapeos deben estar en el schema contable (ej. `conta`).

Forma de trabajo que quiero:
1) Primero, dame un diseño de arquitectura para la integración con el SRI:
   - dónde vive el componente de descarga (backend, bot, integración),
   - cómo se gestionan credenciales y sesiones,
   - cómo se disparan las descargas (acciones del usuario, jobs programados, etc.).
2) Después, define el modelo de datos:
   - tablas de comprobantes importados,
   - tablas de mapeos contables,
   - relación con diarios contables y `empresa_id`.
3) Luego, describe el flujo de usuario de punta a punta:
   - seleccionar empresa + periodo + tipo,
   - disparar la descarga,
   - ver el grid,
   - mapear la primera vez,
   - guardar reglas,
   - aplicar reglas en descargas futuras,
   - generar diarios.
4) Finalmente, empieza a implementar:
   - endpoints/servicios clave,
   - estructuras de tablas en Supabase,
   - y la UI inicial para selección de periodo/tipo y grid de comprobantes.

Reglas generales:
- No romper lo que ya existe en la App Contable ni en QuickInvoice.
- Encapsular bien este módulo de “Integración SRI Compras/Retenciones/Notas”.
- Si el acceso programático al SRI tiene limitaciones, enumera los supuestos que estás haciendo sobre cómo se realiza la descarga para que yo pueda validarlos.
- Siempre elige soluciones claras y mantenibles, aunque no sean las más “mágicas”.