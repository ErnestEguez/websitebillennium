# Manual de Usuario — QuickInvoice
**Sistema de Facturación Electrónica integrado con SRI Ecuador**

---

> **Cómo usar las imágenes de este manual**
>
> Todas las capturas de pantalla deben guardarse en la carpeta:
> ```
> Docs/imagenes/
> ```
> Nombre sugerido para cada imagen: `##_nombre-seccion.png`
> Por ejemplo: `01_login.png`, `02_dashboard.png`, `10_factura-nueva.png`
>
> Para insertar una imagen en este archivo use:
> `![Descripción](imagenes/##_nombre-seccion.png)`

---

## Tabla de Contenidos

1. [Acceso al sistema](#1-acceso-al-sistema)
2. [Pantalla principal (Dashboard)](#2-pantalla-principal-dashboard)
3. [Facturación Electrónica](#3-facturación-electrónica)
4. [Comprobantes emitidos](#4-comprobantes-emitidos)
5. [Clientes](#5-clientes)
6. [Productos](#6-productos)
7. [Proveedores](#7-proveedores)
8. [Ingreso de Compras / Inventario](#8-ingreso-de-compras--inventario)
9. [Kardex](#9-kardex)
10. [Vendedores](#10-vendedores)
11. [Cartera por Cobrar (CxC)](#11-cartera-por-cobrar-cxc)
12. [Notas de Crédito](#12-notas-de-crédito)
13. [Anulación de Facturas](#13-anulación-de-facturas)
14. [Cierres de Caja](#14-cierres-de-caja)
15. [Consultas e Informes](#15-consultas-e-informes)
16. [Configuración](#16-configuración)
17. [Modo Offline — Facturación sin internet](#17-modo-offline--facturación-sin-internet)
18. [Preguntas frecuentes](#18-preguntas-frecuentes)

---

## 1. Acceso al sistema

### 1.1 Ingresar al sistema

1. Abra el navegador web (Chrome o Edge recomendado).
2. Ingrese la dirección de la aplicación.
3. Escriba su **correo electrónico** y **contraseña**.
4. Haga clic en **Iniciar Sesión**.

> **Imagen sugerida:** `01_login.png` — pantalla de inicio de sesión

### 1.2 Roles de usuario

| Rol | Acceso |
|-----|--------|
| **Oficina** | Acceso completo a facturación, cartera, reportes y configuración |
| **Mesero / Caja** | Solo pedidos y caja (módulo restaurante) |

### 1.3 Cerrar sesión

En el menú lateral inferior haga clic en **Cerrar Sesión**.

---

## 2. Pantalla principal (Dashboard)

Al ingresar verá el panel principal con:

- **Empresa activa** — nombre y logo en la barra superior
- **Menú lateral** — acceso a todos los módulos
- **Resumen del día** — ventas, caja abierta/cerrada

> **Imagen sugerida:** `02_dashboard.png` — vista general del sistema

---

## 3. Facturación Electrónica

### 3.1 Emitir una nueva factura

Menú: **Facturación**

> **Imagen sugerida:** `03_facturacion-nueva.png` — formulario de factura

**Pasos:**

1. Haga clic en **Nueva Factura** (botón azul superior derecho).
2. **Seleccionar cliente:**
   - Busque por nombre, RUC o cédula.
   - Si el cliente no existe, haga clic en **Nuevo Cliente** para crearlo en el momento.
3. **Agregar productos:**
   - Busque el producto por nombre o código.
   - Ingrese la cantidad.
   - El precio y el IVA se cargan automáticamente.
   - Repita para cada producto.
4. **Forma de pago:**
   - Seleccione: Efectivo, Tarjeta, Transferencia, Cheque o Crédito.
   - Para crédito, seleccione la fecha de vencimiento.
   - Puede combinar varias formas de pago en una misma factura.
5. Haga clic en **Emitir Factura**.

**El sistema automáticamente:**
- Genera la clave de acceso de 49 dígitos.
- Firma el XML con su certificado digital (.p12).
- Envía al SRI (recepción + autorización).
- Actualiza el inventario (Kardex).
- Si es a crédito, registra en Cartera CxC.
- Envía el RIDE y XML al correo del cliente (si tiene correo registrado).

### 3.2 Comprobantes que genera

Después de facturar aparecen dos opciones de impresión:

| Botón | Descripción |
|-------|-------------|
| **Ticket 80mm** | Comprobante provisional para impresora térmica |
| **RIDE A4** | Comprobante oficial SRI en formato A4 |

> **Imagen sugerida:** `03b_factura-impresion.png` — botones de impresión post-factura

### 3.3 Estados de una factura

| Estado SRI | Significado |
|-----------|-------------|
| AUTORIZADO | El SRI autorizó el comprobante — es válido |
| PENDIENTE | Enviado, esperando respuesta del SRI — o guardado offline para enviar al reconectarse |
| RECHAZADO | El SRI rechazó el comprobante — revisar error |

> **Modo offline:** Si pierde internet mientras factura, el sistema guarda la factura localmente y la envía al SRI en cuanto recupere la conexión. Vea la sección [17. Modo Offline](#17-modo-offline--facturación-sin-internet) para más detalles.

### 3.4 Reintentar autorización

Si una factura quedó en estado PENDIENTE o RECHAZADO:

1. Vaya a **Comprobantes**.
2. Busque la factura.
3. Use el botón de reintento (ícono de recarga).

---

## 4. Comprobantes emitidos

Menú: **Comprobantes** (o dentro de Facturación)

Listado de todas las facturas emitidas con opciones de:

- **Buscar** por número, cliente o fecha
- **Ver RIDE** — abre el RIDE en formato A4
- **Descargar XML** — descarga el archivo XML firmado
- **Reenviar correo** — reenvía al cliente

> **Imagen sugerida:** `04_comprobantes-lista.png` — listado de comprobantes

---

## 5. Clientes

Menú: **Clientes**

> **Imagen sugerida:** `05_clientes.png` — listado de clientes

### 5.1 Crear cliente

1. Haga clic en **Nuevo Cliente**.
2. Ingrese:
   - **Identificación** — RUC (13 dígitos), Cédula (10 dígitos) o Pasaporte
   - **Nombre / Razón Social**
   - **Dirección, teléfono, correo** (el correo recibe los comprobantes automáticamente)
3. Haga clic en **Guardar**.

> **Tip:** Al ingresar el RUC o cédula, el sistema puede consultar automáticamente los datos en el SRI.

### 5.2 Editar / Eliminar cliente

- Haga clic en el ícono de edición (lápiz) en la fila del cliente.
- Para eliminar, use el ícono de basura (solo si el cliente no tiene facturas asociadas).

---

## 6. Productos

Menú: **Productos**

> **Imagen sugerida:** `06_productos.png` — listado de productos

### 6.1 Crear producto

1. Haga clic en **Nuevo Producto**.
2. Ingrese:
   - **Código** — código interno (aparece en la factura)
   - **Nombre** — descripción del producto
   - **Precio de venta** — sin IVA
   - **IVA** — 0%, 5%, 12% o 15%
   - **Stock inicial**
   - **Categoría**
3. Haga clic en **Guardar**.

### 6.2 Control de stock

El stock se actualiza automáticamente con cada factura emitida. Para ajustes manuales use el módulo de **Ingreso de Compras**.

### 6.3 Precios por Volumen

QuickInvoice permite configurar rangos de precios especiales que se aplican automáticamente según la cantidad vendida.

> **Imagen sugerida:** `06b_precio-volumen.png` — modal de precios por volumen

**¿Cómo funciona?**

Cuando el vendedor ingresa una cantidad en la factura, el sistema busca si existe un rango activo para ese producto y cantidad. Si lo encuentra, reemplaza automáticamente el precio de lista por el precio especial.

**Configurar precios por volumen:**

1. Vaya a **Productos**.
2. En la fila del producto, haga clic en el ícono de tendencia (gráfico de barras, color violeta).
3. Se abre el modal **Precios por Volumen**.
4. Haga clic en **Agregar Rango**.
5. Ingrese:
   - **Desde** — cantidad mínima (ej: 10)
   - **Hasta** — cantidad máxima (ej: 49)
   - **Precio** — precio unitario sin IVA para ese rango
6. Haga clic en **Guardar**.

**Ejemplo:**

| Desde | Hasta | Precio unitario |
|-------|-------|-----------------|
| 1 | 9 | (precio de lista) |
| 10 | 49 | $8.50 |
| 50 | 999 | $7.00 |

> **Nota:** Los rangos no deben solaparse. El sistema valida esto al guardar y avisa si hay conflicto.

**Activar / desactivar un rango:**

Use el ícono de palanca en cada fila para activar o desactivar un rango sin eliminarlo. Los rangos inactivos no se aplican en la facturación.

---

## 7. Proveedores

Menú: **Proveedores**

Registro de los proveedores de la empresa. Datos:
- RUC / Cédula
- Nombre / Razón Social
- Dirección, teléfono, correo

---

## 8. Ingreso de Compras / Inventario

Menú: **Ingreso de Compras**

> **Imagen sugerida:** `08_ingreso-compras.png` — formulario de ingreso

Permite registrar compras a proveedores y aumentar el stock de productos.

**Pasos:**
1. Seleccione el **proveedor**.
2. Ingrese la **fecha** y **número de factura del proveedor**.
3. Agregue los productos comprados con cantidad y costo.
4. Haga clic en **Registrar Ingreso**.

El sistema actualiza automáticamente el stock en Kardex.

---

## 9. Kardex

Menú: **Kardex**

> **Imagen sugerida:** `09_kardex.png` — movimientos de inventario

Registro de todos los movimientos de inventario:

| Tipo | Origen |
|------|--------|
| ENTRADA | Compra a proveedor |
| SALIDA | Venta (factura) |
| DEVOLUCION\_NC | Nota de crédito (devolución) |

**Filtros disponibles:** por producto, fecha, tipo de movimiento.

---

## 10. Vendedores

Menú: **Vendedores**

> **Imagen sugerida:** `10_vendedores.png` — listado de vendedores

Registro del personal de ventas. Cada vendedor puede asociarse a las facturas para análisis de comisiones y reportes.

**Datos del vendedor:**
- Nombre completo
- Iniciales (aparecen en reportes)
- Email y teléfono
- Estado: Activo / Baja

---

## 11. Cartera por Cobrar (CxC)

Menú: **Cartera CxC**

> **Imagen sugerida:** `11_cartera-lista.png` — listado de cartera

La cartera registra todas las facturas emitidas a **crédito** que tienen saldo pendiente de cobro.

### 11.1 Filtros de la cartera

| Filtro | Muestra |
|--------|---------|
| **Activos (Pend+Parcial)** | Pendientes y con abonos parciales (vista por defecto) |
| Pendiente | Solo facturas sin ningún pago |
| Parcial | Facturas con abonos parciales |
| Pagada | Facturas totalmente canceladas |
| Todos | Historial completo |

### 11.2 Registrar un abono (factura individual)

1. Busque la factura en la lista.
2. Haga clic en **Abonar**.
3. Ingrese el valor del abono, método de pago y referencia (número de cheque, transferencia, etc.).
4. Haga clic en **Registrar y Comprobante**.

Inmediatamente se abre una ventana con el **Comprobante de Pago** para imprimir en **A4** o **80mm**.

> **Imagen sugerida:** `11b_cartera-abono.png` — modal de registro de abono

### 11.3 Cobro a Cliente (un pago para varias facturas)

Cuando un cliente paga con un solo cheque o transferencia varias facturas:

1. Haga clic en **Cobro a Cliente** (botón superior derecho).
2. Busque y seleccione el cliente.
3. El sistema muestra todas sus facturas pendientes con el **total de deuda**.
4. Ingrese el **valor del pago**, método y referencia.
5. El sistema distribuye automáticamente el pago de la factura más antigua a la más reciente (**orden FIFO**).
6. Verá en tiempo real cómo se aplica el pago en cada factura.
7. Haga clic en **Registrar y Comprobante**.

> **Imagen sugerida:** `11c_cobro-cliente.png` — modal de cobro multi-factura

### 11.4 Comprobante de pago

El comprobante muestra:

| Columna | Descripción |
|---------|-------------|
| No. Factura | Número de la factura afectada |
| Deuda | Saldo que tenía antes del pago |
| Abono | Valor aplicado en este pago |
| Saldo | Saldo nuevo (muestra ✓ CANCELADA si quedó en cero) |

Al final: forma de pago, referencia, fecha/hora y total pagado.

**Opciones de impresión:**
- **Imprimir A4** — para archivo o cliente formal
- **Imprimir 80mm** — para impresora térmica de punto de venta

### 11.5 Ver historial de pagos por factura

Haga clic en cualquier fila de la cartera para expandirla y ver todos los pagos registrados con fecha, método y referencia.

### 11.6 Imprimir cartera

El botón **Imprimir Cartera** genera un reporte con el listado actual en pantalla (aplica los filtros activos) con totales de deuda pendiente.

---

## 12. Notas de Crédito

Menú: **Notas de Crédito**

> **Imagen sugerida:** `12_nc-lista.png` — listado de notas de crédito

Las Notas de Crédito permiten registrar **devoluciones** de productos de una factura ya emitida. Son comprobantes electrónicos autorizados por el SRI.

### 12.1 Crear una Nota de Crédito

1. Haga clic en **Nueva Nota de Crédito**.
2. **Paso 1 — Seleccionar factura:**
   - Busque la factura de origen por número o cliente.
   - Haga clic en **Seleccionar** en la factura que corresponde.
3. **Paso 2 — Seleccionar productos a devolver:**
   - Vea los productos de la factura.
   - Ingrese la cantidad a devolver (puede ser parcial).
   - El sistema muestra cuántas unidades ya fueron devueltas en notas anteriores.
4. **Paso 3 — Motivo:**
   - Seleccione el tipo: Devolución, Descuento, Corrección.
   - Ingrese el motivo específico.
5. **Paso 4 — Confirmar y emitir:**
   - Revise los totales.
   - Haga clic en **Emitir Nota de Crédito**.

### 12.2 Comprobantes de la NC

Igual que en facturación, tiene dos formatos:
- **Ticket 80mm** — comprobante para el cliente al momento
- **RIDE A4** — documento oficial SRI (color naranja para diferenciar de facturas)

### 12.3 Acciones disponibles en el listado

| Ícono | Acción |
|-------|--------|
| Recarga | Reintentar autorización SRI |
| Impresora | Imprimir ticket 80mm |
| Documento | Ver RIDE A4 |
| Descarga | Descargar XML firmado |

### 12.4 Estados de una NC

| Estado | Significado |
|--------|-------------|
| AUTORIZADO | NC válida y autorizada por el SRI |
| PENDIENTE | En proceso |
| RECHAZADO | Error en el SRI — ver observaciones en rojo |

> **Nota:** Si una NC queda RECHAZADA, expanda la fila para ver el mensaje de error del SRI, corrija si aplica y use el botón de reintento.

---

## 13. Anulación de Facturas

Menú: **Anulación de Facturas**

> **Imagen sugerida:** `13_anulacion-lista.png` — listado de facturas para anular

Este módulo permite anular facturas que ya no son válidas (errores, duplicados, cancelaciones totales).

> **Importante:** La anulación en QuickInvoice marca la factura como ANULADA en el sistema. La anulación **en el portal del SRI** debe hacerse por separado usando los datos que este módulo le proporciona.

### 13.1 Datos SRI para la anulación en el portal

Al expandir cualquier factura (clic en la fila) verá el panel **Datos SRI**:

| Dato | Uso |
|------|-----|
| No. Factura | Ingresarlo en el portal SRI |
| Nro. Autorización SRI | Número de 49 dígitos para identificar el comprobante |
| RUC / Cédula Cliente | Identificación del receptor |
| Clave de Acceso | Clave completa del comprobante |

Cada campo tiene un botón **Copiar** (📋) para copiar al portapapeles con un clic.

> **Imagen sugerida:** `13b_anulacion-datos-sri.png` — panel con datos SRI copiables

### 13.2 Anular una factura de contado

1. Busque la factura (filtro: **Vigentes**).
2. Haga clic en **Anular** (botón rojo).
3. Ingrese el **motivo** de anulación (obligatorio).
4. Haga clic en **Confirmar Anulación**.

### 13.3 Anular una factura a crédito (con pagos)

Si la factura tiene pagos registrados en cartera, el sistema no permite anularla directamente. Debe:

1. Expandir la fila de la factura.
2. En el panel **Cartera / Pagos**, verá la lista de pagos.
3. Haga clic en **Revertir** para eliminar cada pago.
4. Una vez sin pagos, aparecerá el botón **Anular**.
5. Ingrese el motivo y confirme.

> **Imagen sugerida:** `13c_anulacion-revertir-pago.png` — panel con pagos a revertir

### 13.4 Facturas anuladas en reportes

En el reporte de **Ventas por Período**, las facturas anuladas aparecen:
- Con el número **tachado**
- Badge rojo **ANULADA**
- Valores en **cero** (no afectan los totales)

---

## 14. Cierres de Caja

Menú: **Cierres de Caja**

> **Imagen sugerida:** `14_cierre-caja.png` — pantalla de cierre de caja

### 14.1 Abrir caja

Al inicio del turno:
1. Haga clic en **Abrir Caja**.
2. Ingrese el **fondo inicial** (dinero en efectivo con que inicia).
3. Confirme la apertura.

### 14.2 Movimientos de caja

Durante el turno puede registrar:
- **Ingresos adicionales** — ventas extras, otros ingresos
- **Egresos** — pagos a proveedores, gastos del día

### 14.3 Cerrar caja

1. Haga clic en **Cerrar Caja**.
2. El sistema muestra el resumen:
   - Ventas del turno (por forma de pago)
   - Ingresos y egresos adicionales
   - Fondo inicial + entradas - salidas = **Total esperado**
3. Ingrese el **dinero contado** en físico.
4. El sistema calcula la **diferencia**.
5. Confirme el cierre.

---

## 15. Consultas e Informes

### 15.1 Ventas por Período

Menú: **Consultas → Ventas por Período**

> **Imagen sugerida:** `15a_ventas-periodo.png` — reporte de ventas

**Filtros:**
- Fecha inicio y fecha fin
- Vendedor (opcional)

**Columnas del reporte:**

| Columna | Descripción |
|---------|-------------|
| Nro. Factura | Número del comprobante |
| Fecha | Fecha de emisión |
| Cliente | Nombre del cliente |
| Identificación | RUC o cédula |
| Vendedor | Vendedor asignado |
| Base IVA | Subtotal con IVA |
| Base 0% | Subtotal sin IVA |
| Suma Bases | Total base imponible |
| IVA | Valor del impuesto |
| Total | Total de la factura |
| Efectivo / Tarjeta / Transferencia / Cheque / Crédito | Desglose por forma de pago |
| Estado | Estado SRI (AUTORIZADO / PENDIENTE) o ANULADA |

**Opciones:**
- **Imprimir** — genera reporte imprimible
- **Exportar CSV** — descarga en Excel

> **Nota:** Las facturas anuladas aparecen con sus valores en cero y no se incluyen en los totales.

### 15.2 Deudas Clientes (Cartera por Vendedor)

Menú: **Consultas → Deudas Clientes**

> **Imagen sugerida:** `15b_deudas-clientes.png` — reporte de deudas

Muestra la cartera pendiente agrupada por vendedor, con:
- Filtro por fecha de corte y vendedor
- Subtotales por vendedor
- Total general

### 15.3 Estado de Cuenta por Cliente

Menú: **Consultas → Estado de Cuenta**

> **Imagen sugerida:** `15c_estado-cuenta.png` — estado de cuenta

Muestra el historial completo de un cliente:

1. Busque y seleccione el cliente.
2. Verá todas sus facturas con el detalle de cada pago.
3. Haga clic en una factura para expandir y ver los pagos individuales.

**Resumen superior:**
- Total de facturas emitidas
- Total pagado
- Saldo pendiente actual

**Botón Imprimir Estado de Cuenta:** genera un documento con toda la información para entregarlo al cliente.

---

## 16. Configuración

Menú: **Configuración**

> **Imagen sugerida:** `16_configuracion.png` — pantalla de configuración

### 16.1 Datos de la empresa

- **Nombre / Razón Social**
- **RUC**
- **Dirección**
- **Teléfono**
- **Logo** — sube la imagen del logo (aparece en facturas y comprobantes)

### 16.2 Configuración SRI / Facturación Electrónica

| Campo | Descripción |
|-------|-------------|
| **Establecimiento** | Código de 3 dígitos del establecimiento (ej: 001) |
| **Punto de Emisión** | Código de 3 dígitos del punto de emisión (ej: 001) |
| **Ambiente** | PRUEBAS o PRODUCCION |
| **Secuencial Inicial** | Número desde el cual inicia la secuencia de facturas |
| **Firma Electrónica (.p12)** | Archivo del certificado digital |
| **Contraseña de firma** | Clave del certificado .p12 |

> **Importante:** Para emitir facturas en **PRODUCCION** debe tener:
> - Certificado digital (.p12) vigente
> - RUC activo en el SRI
> - Autorización de facturación electrónica en el SRI

### 16.3 Secuencial inicial

El campo **Secuencial Inicial Facturas** define desde qué número inicia la secuencia cuando no hay facturas previas en el sistema.

**Ejemplo:** Si migra desde otro sistema con 459 facturas, ponga `460` y la primera factura de QuickInvoice será `001-001-000000460`.

> **Nota:** Si ya existen facturas emitidas, el sistema continúa automáticamente desde el último número registrado, ignorando este campo.

### 16.4 Cambiar entre PRUEBAS y PRODUCCIÓN

1. Vaya a **Configuración**.
2. Cambie el campo **Ambiente** de `PRUEBAS` a `PRODUCCION`.
3. Haga clic en **Guardar**.
4. Verifique que el certificado .p12 sea el de producción (no el de pruebas).

---

## 17. Modo Offline — Facturación sin internet

QuickInvoice puede seguir emitiendo facturas aunque se corte el internet. Las facturas se guardan localmente y se envían al SRI en cuanto se restablece la conexión.

> **Imagen sugerida:** `17_offline-banner.png` — banner de modo offline en la parte superior de la pantalla

### 17.1 ¿Qué funciona sin internet?

| Función | Sin internet |
|---------|-------------|
| Emitir facturas | ✅ Sí (se guardan localmente) |
| Ver lista de clientes | ✅ Sí (caché local) |
| Ver lista de productos | ✅ Sí (caché local) |
| Crear cliente nuevo | ✅ Sí |
| Autorización SRI | ❌ No (se hace al reconectarse) |
| Cartera CxC (abonos, cobros) | ❌ No |
| Ingreso de compras | ❌ No |
| Reportes y consultas | ❌ No |

### 17.2 Banner de modo offline

Cuando el sistema detecta que no hay internet, aparece un **banner ámbar** en la parte superior de la pantalla:

> **Sin conexión · Modo offline** — Las facturas se guardarán localmente y se enviarán al SRI al reconectarse.

Mientras el banner esté visible, puede seguir operando con normalidad. Las facturas que emita quedarán en cola.

### 17.3 Emitir una factura sin internet

El proceso es idéntico al normal:

1. Vaya a **Facturación → Nueva Factura**.
2. Seleccione el cliente y agregue productos.
3. Elija la forma de pago y haga clic en **Emitir Factura**.
4. Aparecerá una confirmación ámbar: **"Factura guardada offline"**.

La factura queda guardada localmente con estado **PENDIENTE** hasta que el sistema la envíe al SRI.

> **Importante:** Las facturas offline no tienen número de autorización SRI hasta que se sincronicen. No entregue el RIDE al cliente hasta que el estado cambie a AUTORIZADO.

### 17.4 Sincronización automática

En cuanto el sistema detecta que recuperó internet:

1. El banner cambia a azul: **"Sincronizando facturas pendientes..."**
2. El sistema envía las facturas en orden (la más antigua primero).
3. Cada factura que se autoriza cambia su estado a **AUTORIZADO** en Comprobantes.
4. El banner desaparece cuando no quedan pendientes.

### 17.5 Ver facturas pendientes de sincronizar

En la pantalla de **Comprobantes** (Facturación) aparece una sección ámbar en la parte superior con las facturas que están esperando sincronizarse. Para cada una puede ver:

- Nombre del cliente
- Fecha y hora en que se guardó
- Total de la factura
- Estado actual

**Acciones disponibles:**

| Botón | Acción |
|-------|--------|
| Reintentar (ícono ↺) | Vuelve a intentar enviar al SRI manualmente |
| Descartar (ícono ✕) | Elimina la factura offline (se le pedirá confirmación) |

> **Imagen sugerida:** `17b_offline-queue.png` — sección de facturas pendientes en Comprobantes

### 17.6 Errores permanentes

Si después de 3 intentos el sistema no puede enviar una factura al SRI, la marca como **Error permanente** (badge rojo). Esto puede ocurrir si:

- Los datos del cliente o empresa no son válidos para el SRI.
- El certificado digital (.p12) está vencido.
- Hay un problema de configuración SRI.

En este caso, use el botón **Reintentar** después de corregir el problema, o **Descartar** si la factura no debe emitirse.

### 17.7 Actualizar el catálogo de clientes

El catálogo de clientes se guarda en caché por **15 minutos**. Si creó un cliente nuevo en otro equipo y no aparece, use el botón de recarga (ícono ↺) que está junto al selector de cliente en la pantalla de facturación.

> **Nota:** El botón de recarga solo aparece cuando hay conexión a internet.

### 17.8 Actualizar el catálogo de productos

El catálogo de productos se guarda en caché por **45 minutos**. Si agrega productos nuevos y no aparecen en la factura, espere a que expire el caché o recargue la página con internet.

---

## 18. Preguntas frecuentes

### ¿Por qué mi factura quedó en estado PENDIENTE?

El SRI puede tardar unos segundos en procesar. Use el botón de reintento en **Comprobantes**. Si persiste, revise la conexión a internet y que su certificado .p12 no esté vencido.

### ¿Puedo emitir facturas si el internet se corta?

Sí. QuickInvoice tiene **modo offline**: las facturas se guardan localmente y se envían automáticamente al SRI cuando se recupera la conexión. Vea la sección [17. Modo Offline](#17-modo-offline--facturación-sin-internet) para todos los detalles.

### ¿Cómo anulo una factura en el SRI?

1. Vaya a **Anulación de Facturas**.
2. Expanda la factura y copie los datos del panel **Datos SRI**.
3. Ingrese al portal del SRI (sri.gob.ec) con su clave.
4. Use los datos copiados para completar la anulación en el portal.
5. En QuickInvoice haga clic en **Anular** para marcarla como anulada en el sistema.

### ¿Qué hago si el SRI rechaza una Nota de Crédito?

1. Vaya a **Notas de Crédito**.
2. Expanda la NC rechazada para ver el mensaje de error del SRI (aparece en rojo).
3. Corrija el problema (datos del cliente, RUC de la empresa, etc.).
4. Use el botón de reintento (ícono de recarga).

### ¿Cómo registro un pago con cheque de una deuda de varias facturas?

Use **Cobro a Cliente** en la pantalla de **Cartera CxC**:
1. Seleccione el cliente.
2. Ingrese el valor total del cheque.
3. El sistema distribuye automáticamente entre las facturas más antiguas primero.
4. Ingrese el número de cheque en el campo **Referencia**.

### ¿Puedo imprimir en impresora térmica de 80mm?

Sí. Todos los comprobantes tienen opción de impresión en 80mm:
- Facturas: botón **Ticket 80mm** después de emitir
- Notas de Crédito: botón **Ticket 80mm** en el paso 4
- Comprobantes de pago: botón **Imprimir 80mm** en la ventana del comprobante

### ¿Qué pasa con el inventario al anular una factura?

Al anular una factura, el sistema marca el comprobante como ANULADA pero **no revierte automáticamente el Kardex**. Si necesita devolver el stock, use el módulo de **Notas de Crédito** antes de anular, o haga un ajuste manual en Ingreso de Compras.

### ¿Cómo sé cuánto debe un cliente?

Use **Consultas → Estado de Cuenta**, seleccione el cliente y verá el resumen completo con el detalle de cada factura y sus pagos.

---

## Apéndice — Glosario

| Término | Significado |
|---------|-------------|
| **SRI** | Servicio de Rentas Internas (autoridad tributaria del Ecuador) |
| **RIDE** | Representación Impresa del Documento Electrónico |
| **XML** | Archivo del comprobante electrónico firmado |
| **Clave de acceso** | Número único de 49 dígitos que identifica cada comprobante |
| **XAdES-BES** | Estándar de firma electrónica usado en Ecuador |
| **RUC** | Registro Único de Contribuyentes (13 dígitos) |
| **Cartera CxC** | Cuentas por cobrar — facturas pendientes de pago |
| **FIFO** | Primero en entrar, primero en salir — método de aplicación de pagos |
| **Kardex** | Registro de movimientos de inventario |
| **NC** | Nota de Crédito |

---

*Manual de Usuario — QuickInvoice v1.0*
*Actualizado: Abril 2026*
