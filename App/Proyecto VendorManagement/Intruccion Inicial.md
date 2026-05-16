Actúa como arquitecto de software y desarrollador senior de sistemas administrativos-contables. Quiero que diseñes y me ayudes a evolucionar el MÓDULO DE PROVEEDORES / COMPRAS de mi sistema, llamado QuickInvoice.

No quiero código todavía, primero arquitectura, modelo de datos y flujos.

================================
1. CONTEXTO DEL SISTEMA ACTUAL
================================
Sistema: QuickInvoice.

Ya existen las siguientes tablas y funcionalidades:

TABLAS EXISTENTES
- proveedores
- ingresos_stock
- detalle_ingresos_stock
- kardex (inventario)

FUNCIONALIDAD EXISTENTE
- Apertura de proveedores (maestro de proveedores).
- Grabación de compras de inventario:
  - Cabecera en ingresos_stock.
  - Detalle en detalle_ingresos_stock.
  - Actualización de kardex (inventario).

Además:
- Ya tengo un proceso que descarga COMPRAS desde el SRI (facturas electrónicas de compra) y genera DIARIOS contables en mi sistema contable.
- Ese proceso actualmente cubre:
  - Compras de inventario.
  - Compras de servicios (contablemente), pero aún NO tengo un buen auxiliar de servicios en QuickInvoice.

Tecnología base (para que lo tengas en cuenta al proponer diseño, sin entrar a código todavía):
- Backend / lenguaje: manten el esquema actual
- Base de datos: PostgreSQL de supabase

===============================
2. OBJETIVO DEL MÓDULO NUEVO
===============================
Quiero construir un MÓDULO DE PROVEEDORES (VendorManagement) que integre:

1) Maestro de proveedores.
2) Compras de inventario.
3) Compras de servicios.
4) Cuentas por pagar (auxiliar).
5) Retenciones en la fuente / IVA. (electronicas)
6) Órdenes de compra (para inventarios).
7) Consultas y reportes de compras/proveedores.
8) Base de información para futuro ATS.

Quiero que:
- Todo lo relativo a PROVEEDORES y COMPRAS “cuelgue” del mismo módulo a nivel funcional.
- Internamente reutilicemos lo que ya existe (ingresos_stock, detalle_ingresos_stock, kardex).
- No quiero romper lo que ya funciona, sino ordenarlo y extenderlo.

====================================
3. DECISIÓN IMPORTANTE YA TOMADA
====================================
Sobre el modelo de datos:

- El modelo de DETALLE de inventario (kardex, detalle_ingresos_stock, etc.) YA existe y funciona bien.
- NO me preocupa que en inventario existan campos que no aplican a servicios, porque el kardex es solo para inventario.
- Lo que está en discusión era únicamente la CABECERA de compras.

Decisión que quiero que respetes:

- Quiero tener UNA sola cabecera de compras de proveedor, que represente “facturas de compra”, con un campo de tipo, algo así como:
  - tipo_compra = 'INVENTARIO' / 'SERVICIO' / otros tipos futuros.

- Para inventario:
  - Seguir usando ingresos_stock + detalle_ingresos_stock + kardex, como hasta ahora.
  - Esa cabecera puede alinearse a la nueva cabecera única de compras (o directamente ser la cabecera única, si lo propones así).

- Para servicios:
  - No voy a llevarlos al kardex.
  - Puedo:
    - Usar la misma cabecera de compras con tipo_compra = 'SERVICIO'.
    - Usar una tabla de detalle de servicios separada (si la recomiendas), o incluso solo cabecera, según convenga.

En resumen:
- QUIERO una CABECERA común de COMPRA DE PROVEEDOR, con un indicador de tipo de compra.
- El detalle de inventario se queda como está.
- El detalle de servicios puede ser simple y específico. (puede haber cabecera de servicios sin detalle?)

==============================
4. FUNCIONES QUE DEBE CUBRIR
==============================
Mínimo, el módulo de Proveedores debe incluir:

- Maestro de Proveedores:
  - Alta, edición, baja lógica.
  - Datos clave: RUC/CI, nombre, dirección, contactos, condiciones de pago, etc.

- Ingreso de Facturas por Compras:
  1) Compras de Inventario:
     - Registro de factura de compra de inventario.
     - Manejo de retenciones en la fuente y retenciones de IVA (si aplica).
     - Actualización de inventario (kardex) como ya existe.
     - Generación de auxiliar de compras de inventario.

  2) Compras de Servicios:
     - Registro de factura de servicios.
     - Manejo de retenciones en la fuente y retenciones de IVA.
     - NO afecta kardex.
     - Debe generarse un auxiliar de servicios, que sirva para consultas y ATS.

- Anulación de compras:
  - Tanto de inventario como de servicios.
  - Con impacto en:
    - Auxiliares (inventario y servicios).
    - Cuentas por pagar.
    - Potencial ajuste contable si corresponde (aunque la contabilidad se maneje en otro módulo).

- Devolución en Compras de Inventario:
  - Registro de devoluciones a proveedores de items de inventario.
  - Ajuste de kardex.
  - Ajuste de la cuenta por pagar si aplica.

- Consultas de Compras:
  - Consulta general de compras (inventario + servicios).
  - Consulta filtrada por proveedor.
  - Consulta por estado: normal, anulada, devuelta.
  - Consulta de compras pendientes de pago.

- Órdenes de Compra (Inventario):
  - Ingreso de órdenes de compra.
  - Recepción de órdenes de compra (total o parcial) y pase a ingreso_stock / compra confirmada. (Auxiliar, cartera, Kardex)

- Cuentas por Pagar (auxiliar):
  - Cada compra a crédito debe generar una obligación en el auxiliar de CxP.
  - Debe ser posible ver saldos por proveedor, vencimientos, etc.
  - Este diseño debe estar listo para integrarse en el futuro con un módulo de Bancos/Pagos.

=================================
5. INTEGRACIÓN CON SRI Y CONTABILIDAD LEDGERPRO
=================================
Hoy ya tengo un proceso que:
- Descarga facturas electrónicas de comprar desde el SRI.
- Genera los DIARIOS contables correspondientes (compras de inventario y servicios).

Quiero que el nuevo diseño contemple lo siguiente:

- Cuando importo compras desde el SRI:
  - Debe alimentar la CABECERA de compras (inventario o servicios) en el módulo de Proveedores
    Si la misma no ha sido ingresada,   validar por numero de factura y proveedor
  - Debe alimentar el auxiliar de servicios para compras de servicios (misma tabla de cabecera ingresos_stock)  
  - Debe generar la CxP correspondiente (si la compra es a crédito), en el auxiliar de CxP. (si no existe)
  - Debe mantener consistencia con los diarios contables ya generados por otro módulo.

En otras palabras:
- La MISMA fuente (factura SRI) debe alimentar:
  - compras (proveedores),
  - auxiliares (inventario o servicios),
  - cuentas por pagar,
  - contabilidad (en el otro módulo),
  - y más adelante ATS.

Quiero que diseñes este flujo de integración a nivel conceptual, sin código.

=====================
6. ATS A FUTURO
=====================
Aunque no voy a generar ATS ahora, quiero que el diseño de datos YA lo contemple.

- Para inventario:
  - La tabla `ingresos_stock` + detalle ya tiene suficiente base para ATS (fechas, proveedor, bases, IVA, etc.) o se puede ajustar.

- Para servicios:
  - Necesito que el modelo de datos de compras de servicios incluya desde ahora campos suficientes para ATS, por ejemplo:
    - Tipo de gasto / clasificación.
    - País, si aplica.
    - Códigos de retención utilizados.
    - Base imponible 0%, gravada, no objeto, etc.

Quiero que me digas:
- Qué campos mínimos debería tener la cabecera/detalle de compras de servicios para estar listo para ATS.
- Cómo unificar o al menos alinear la estructura de inventario y servicios para que luego el reporte ATS sea relativamente fácil.

=====================================
7. MODELO DE DATOS PROPUESTO
=====================================
Con todo lo anterior, quiero que propongas un modelo de datos donde:

- Exista una CABECERA única de compra de proveedor (facturas de compra), con un campo tipo_compra:
  - 'INVENTARIO'
  - 'SERVICIO'
  - (y potencialmente más tipos en el futuro)

- Lo ya existente de inventario (ingresos_stock, detalle_ingresos_stock) se reutilice, sin romper su diseño, alineándolo a la cabecera común si tiene sentido.

- Se agregue un modelo para compras de servicios:
  - Puede ser:
    - una tabla de detalle específica (si aplica), o
    - solo cabecera si lo ves suficiente.
  - Debe incluir los campos requeridos para ATS y para reportes de compras.

- Se agregue o se describa cómo debería ser el modelo de:
  - Auxiliar de cuentas por pagar (CxP) ligado a las facturas de compra.
  - Estado de la obligación: pendiente, pagada, parcialmente pagada, etc.

==============================
8. FLUJOS FUNCIONALES CLAVE
==============================
Quiero que describas en texto, paso a paso, estos flujos:

1) Ingreso manual de compra de inventario:
   - Desde el módulo de Proveedores.
   - Cómo impacta cabecera compra, ingresos_stock/detalle, kardex, CxP (si crédito), y qué deja listo para contabilidad.

2) Ingreso manual de compra de servicios:
   - Desde el módulo de Proveedores.
   - Cómo impacta cabecera compra, auxiliar de servicios, CxP, y qué deja listo para contabilidad.

3) Importación de compras desde SRI:
   - Cómo detectas si es inventario o servicios (suposiciones aceptables).
   - Cómo llenas cabecera, auxiliares y CxP.
   - Cómo asegurar la consistencia con los diarios contables ya generados por el otro módulo.

4) Anulación de compras:
   - Inventario y servicios.
   - Qué pasa con auxiliares, CxP y vínculo con contabilidad.

5) Devoluciones en compras de inventario:
   - Flujo lógico y efecto en kardex, CxP, etc.

6) Consultas:
   - Por proveedor, por período, por tipo de compra, por estado.
   - Estado de cuenta 
   - Cuáles vistas o reportes clave recomiendas.

========================
9. CRITERIOS DE DISEÑO
========================
- No quiero sobresimplificaciones; debe ser un diseño que funcione en la práctica para una empresa comercial/servicios.
- Tampoco quiero sobreingeniería: prioriza simplicidad y claridad.
- Respeta que ya existe `ingresos_stock`, `detalle_ingresos_stock` y `kardex`, y funcionan bien.
- Acepta que la decisión de “cabecera única con tipo_compra” ya está tomada.
- Favorece consistencia entre:
  - módulo de Proveedores,
  - auxiliares (inventario y servicios),
  - CxP,
  - y contabilidad (aunque esta se maneje en otro módulo).

========================
10. SALIDA QUE ESPERO
========================
Estructura tu respuesta así:

1) Resumen de la propuesta general del módulo Proveedores/Compras.
2) Modelo de datos propuesto (tablas nuevas, cómo se integran con las existentes).
3) Descripción detallada de la cabecera única de compras y el campo tipo_compra.
4) Descripción de cómo se manejan:
   - Compras de inventario.
   - Compras de servicios.
   - Cuentas por pagar (auxiliar).
5) Cómo integrarse con la descarga/contabilización desde SRI.
6) Cómo pensar desde ya en ATS (campos mínimos, enfoque).
7) Listado de pantallas / formularios sugeridos para el módulo.
8) Riesgos o puntos delicados que debería considerar antes de implementar.

Solo después de que esto esté claro, en una siguiente etapa te pediré que generes modelos, scripts SQL o código.