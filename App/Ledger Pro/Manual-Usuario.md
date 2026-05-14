# LEDGER PRO — Manual de Usuario
**Sistema Contable SaaS Multiempresa**
Versión 1.0 · Billennium Systems

---

## Tabla de Contenidos

1. [Introducción](#1-introducción)
2. [Acceso al Sistema](#2-acceso-al-sistema)
3. [Dashboard](#3-dashboard)
4. [Plan de Cuentas](#4-plan-de-cuentas)
5. [Diarios Contables](#5-diarios-contables)
6. [Reportes](#6-reportes)
7. [Integración QuickInvoice](#7-integración-quickinvoice)
8. [Presupuesto](#8-presupuesto)
9. [Cierre Contable](#9-cierre-contable)
10. [Configuración](#10-configuración)

---

## 1. Introducción

Ledger Pro es una aplicación contable completa, basada en la nube, diseñada para Ecuador bajo normas **NIIF para PYMES**. Permite gestionar el plan de cuentas, registrar asientos contables, generar reportes financieros e integrarse con el sistema de facturación **QuickInvoice**.

**Características principales:**
- Multiempresa: cada empresa gestiona su propia contabilidad de forma aislada
- Plan de cuentas con hasta 5 niveles jerárquicos alineado con formulario SRI 101
- Comprobantes contables: CI, CE, CD, ND, NC
- Reportes: Balance de Comprobación, Balance General, Estado de Resultados, Estado de Cuenta
- Integración automática con QuickInvoice para diarios de ventas
- Presupuesto anual con control Real vs. Presupuesto
- Cierre contable anual

---

## 2. Acceso al Sistema

### 2.1 Pantalla de Login

`[IMAGEN: Pantalla de login — logo Ledger Pro centrado, campo email, campo contraseña, botón "Ingresar"]`

1. Abre el navegador e ingresa la URL de Ledger Pro
2. Escribe tu **correo electrónico** y **contraseña**
3. Haz clic en **Ingresar**

> Si olvidas tu contraseña, contacta al administrador del sistema.

### 2.2 Cambio de Empresa

Si tu usuario tiene acceso a más de una empresa, el sistema carga automáticamente la última utilizada. Para cambiar, usa el selector de empresa en la parte superior de la barra lateral.

`[IMAGEN: Barra lateral superior mostrando nombre de empresa activa con ícono LP]`

---

## 3. Dashboard

`[IMAGEN: Dashboard completo — 4 tarjetas KPI en la parte superior, barra de período activo, sección de accesos rápidos]`

El Dashboard es la pantalla de inicio. Muestra:

### Indicadores principales

| Indicador | Qué muestra |
|---|---|
| **Cuentas activas** | Cuentas del plan que aceptan movimientos |
| **Comprobantes** | Total de comprobantes confirmados |
| **Total Debe (acum.)** | Suma del debe de todos los comprobantes confirmados |
| **Total Haber (acum.)** | Suma del haber de todos los comprobantes confirmados |

### Período activo
Barra de color que muestra el mes/año contable actual y su estado (abierto, cerrado o bloqueado).

### Accesos rápidos
Tres botones para ir directamente a: **Nuevo Asiento**, **Plan de Cuentas** y **Bal. Comprobación**.

---

## 4. Plan de Cuentas

Acceso: **Menú lateral → Plan de Cuentas**

`[IMAGEN: Pantalla Plan de Cuentas — árbol jerárquico expandible con cuentas numeradas, botón "+ Agregar Cuenta" en la parte superior derecha]`

### 4.1 Estructura del Plan

El plan sigue la estructura NIIF para PYMES Ecuador con **5 niveles**:

```
1              ACTIVO                                  Nivel 1 (grupo)
1.01           ACTIVO CORRIENTE                        Nivel 2 (grupo)
1.01.01        EFECTIVO Y EQUIVALENTES AL EFECTIVO     Nivel 3 (grupo)
1.01.01.01     CAJA GENERAL                            Nivel 4 (acepta movimientos)
```

**Grupos raíz del plan:**

| Código | Grupo |
|---|---|
| 1 | Activo |
| 2 | Pasivo |
| 3 | Patrimonio Neto |
| 4 | Ingresos |
| 5 | Costos y Gastos |

### 4.2 Crear una Cuenta Nueva

`[IMAGEN: Modal "Nueva Cuenta" con campos: código, nombre, tipo, cuenta padre, switch "acepta movimientos", campos opcionales código SRI y código SUPE]`

1. Clic en **+ Agregar Cuenta**
2. Completa los campos:
   - **Código:** Sigue la numeración del nivel padre (ej: si el padre es `1.01.01`, la subcuenta sería `1.01.01.05`)
   - **Nombre:** Descripción clara de la cuenta
   - **Tipo:** Activo / Pasivo / Patrimonio / Ingreso / Gasto
   - **Cuenta padre:** La cuenta de nivel superior a la que pertenece
   - **Acepta movimientos:** Activa **solo** en cuentas de último nivel (auxiliares)
   - **Código SRI / SUPE:** Opcionales para reportes regulatorios
3. Clic en **Guardar**

> **Regla clave:** Solo las cuentas con "Acepta movimientos" activado aparecen al buscar cuentas en los asientos.

### 4.3 Editar o Desactivar una Cuenta

Haz clic en el ícono **✏️** junto a la cuenta para editar. Para desactivarla, desactiva el switch **Activa**.

> Una cuenta con movimientos registrados no puede eliminarse, solo desactivarse.

---

## 5. Diarios Contables

Acceso: **Menú lateral → Diarios**

`[IMAGEN: Listado de comprobantes — tabla con columnas: número, fecha, tipo, glosa, debe, haber, estado (badge de color)]`

### 5.1 Tipos de Comprobante

| Código | Nombre | Uso típico |
|---|---|---|
| **CI** | Comprobante de Ingreso | Cobros a clientes, ventas |
| **CE** | Comprobante de Egreso | Pagos a proveedores, compras |
| **CD** | Comprobante Diario | Ajustes, depreciaciones, provisiones |
| **ND** | Nota de Débito | Cargos adicionales |
| **NC** | Nota de Crédito | Devoluciones, descuentos |

### 5.2 Numeración Automática

El sistema asigna el número automáticamente según: **TIPO-AÑO-MES-SECUENCIAL**

```
CI-2026-04-000001   (primer CI de abril 2026)
CI-2026-04-000002   (segundo CI de abril 2026)
CE-2026-04-000001   (primer CE de abril 2026)
```

### 5.3 Registrar un Nuevo Asiento

`[IMAGEN: Formulario de nuevo comprobante — parte superior con campos tipo, período, fecha y glosa; parte inferior con tabla de líneas y buscador de cuentas]`

1. Clic en **+ Nuevo Asiento**
2. Completa la **cabecera:**
   - **Tipo:** CI, CE, CD, etc.
   - **Período:** El mes contable debe estar **abierto**
   - **Fecha:** Fecha del documento de respaldo
   - **Glosa:** Descripción del asiento (ej: "Pago factura proveedor 001-001-000123")
3. Agrega **líneas del asiento:**
   - Busca la cuenta por código o nombre
   - Ingresa el valor en **Debe** o **Haber** (nunca ambos en la misma línea)
   - Agrega descripción opcional por línea
4. Verifica que el totalizador muestre **Debe = Haber** (aparece en verde)

`[IMAGEN: Totalizador de asiento mostrando Debe $112,00 = Haber $112,00 en color verde con check ✓]`

5. Clic en **Confirmar** para registrar el asiento

> El sistema bloquea la confirmación si el asiento no cuadra.

### 5.4 Estados del Comprobante

| Estado | Color | Descripción |
|---|---|---|
| **Borrador** | Gris | En edición, no afecta saldos ni reportes |
| **Confirmado** | Verde | Registrado, visible en reportes y saldos |
| **Anulado** | Rojo | Cancelado, no afecta saldos |

### 5.5 Ver un Comprobante

`[IMAGEN: Vista detalle de un comprobante confirmado con tabla de líneas, totales y botones "Anular" e "Imprimir"]`

Desde el listado, haz clic en el número del comprobante. Desde esta vista puedes:
- **Imprimir** el comprobante
- **Anular** si fue confirmado por error (requiere confirmación)

---

## 6. Reportes

Acceso: **Menú lateral → Reportes**

Todos los reportes incluyen:
- Filtros por **empresa** y **período**
- Botón de **exportación CSV**
- Botón de **impresión**

### 6.1 Balance de Comprobación

`[IMAGEN: Balance de comprobación — tabla con columnas: código, cuenta, saldo inicial Debe/Haber, movimientos Debe/Haber, saldo final Debe/Haber, total en el pie]`

Muestra todas las cuentas con movimiento en el período:
- **Saldo inicial** (al inicio del período)
- **Movimientos** (debe y haber del período)
- **Saldo final** (resultado)

Filtros: por mes individual o acumulado del año.

> Base para preparar los demás estados financieros. Si los totales de debe y haber no cuadran, hay un asiento mal ingresado.

### 6.2 Balance General (Estado de Situación Financiera)

`[IMAGEN: Balance General — dos columnas: izquierda Activo con subtotales corriente/no corriente; derecha Pasivo+Patrimonio con subtotales]`

Muestra la situación financiera a la fecha seleccionada.

Verifica la ecuación: **Activo = Pasivo + Patrimonio Neto**

### 6.3 Estado de Resultados

`[IMAGEN: Estado de Resultados — cascada descendente: Ingresos → Costo de Ventas → Utilidad Bruta → Gastos → Utilidad Neta, con montos en cada nivel]`

Muestra el resultado económico del período:

```
  Ingresos de actividades ordinarias        $  xxx,xx
- Costo de ventas y producción              $  xxx,xx
= UTILIDAD BRUTA                            $  xxx,xx
- Gastos de venta                           $  xxx,xx
- Gastos administrativos                    $  xxx,xx
- Gastos financieros                        $  xxx,xx
= UTILIDAD / (PÉRDIDA) NETA DEL PERÍODO    $  xxx,xx
```

### 6.4 Estado de Cuenta

`[IMAGEN: Estado de cuenta — encabezado con cuenta seleccionada y período, tabla con columnas fecha, comprobante, descripción, debe, haber, saldo]`

Movimiento detallado de **una cuenta específica**:
- Cada fila es una línea de asiento
- Saldo acumulado columna a columna
- Útil para: Caja, Bancos, CxC, CxP

**Pasos:**
1. Selecciona la cuenta
2. Selecciona el período
3. Elige modo: **Mes** (solo el período) o **Acumulado** (desde inicio del año)
4. Clic en **Generar**

### 6.5 Real vs. Presupuesto

`[IMAGEN: Real vs Presupuesto — tabla con cuentas en filas y columnas: presupuesto, real, variación $, variación %]`

Compara lo ejecutado contra lo planificado. Requiere haber ingresado un presupuesto previamente (ver sección 8).

---

## 7. Integración QuickInvoice

Acceso: **Menú lateral → Integración QI**

`[IMAGEN: Pantalla Integración QI con tres pestañas: Configuración, Vista Previa, Resultado]`

Genera asientos contables automáticamente a partir de las facturas de ventas emitidas en QuickInvoice.

> **Requisito previo:** El RUC de la empresa en Ledger Pro debe coincidir exactamente con el RUC en QuickInvoice.

### 7.1 Configuración (se hace una sola vez)

`[IMAGEN: Pestaña Configuración — selector de modo (2 botones: "1 asiento por factura" y "1 asiento resumen"), grilla de mapeo de cuentas dividida en HABER-Ingresos y DEBE-Formas de cobro]`

**Paso 1 — Elige el modo de generación:**

| Modo | Cuándo usarlo |
|---|---|
| **1 asiento por factura** | Cuando necesitas trazabilidad completa (se crea un CI por cada factura) |
| **1 asiento resumen** | Cuando prefieres un solo asiento mensual (más simple) |

**Paso 2 — Mapea las cuentas HABER (ingresos):**

| Concepto | Cuenta recomendada |
|---|---|
| Ingresos por Ventas *(obligatorio)* | `4.01.01` Venta de Bienes |
| IVA en Ventas *(opcional)* | `2.01.04.01` Con la Adm. Tributaria |

**Paso 3 — Mapea las cuentas DEBE (cobros):**

| Forma de pago en QI | Cuenta recomendada |
|---|---|
| Efectivo (Caja) | `1.01.01.01` Caja General |
| Transferencia / Cheque | `1.01.01.03` Bancos — Cta. Corriente |
| Tarjeta | `1.01.01.03` Bancos — Cta. Corriente |
| Crédito *(obligatorio)* | `1.01.02.01` Cuentas por Cobrar Clientes |
| Otros | Según criterio del contador |

**Paso 4:** Clic en **Guardar configuración**

### 7.2 Estructura del asiento generado

Ejemplo: Factura $112 (base gravada $100 + IVA 12%), cobrada $50 efectivo y $62 a crédito:

| Cuenta | Debe | Haber |
|---|---:|---:|
| Caja General (efectivo) | $ 50,00 | — |
| Cuentas por Cobrar (crédito) | $ 62,00 | — |
| Ingresos por Ventas | — | $100,00 |
| IVA en Ventas | — | $ 12,00 |
| **TOTAL** | **$112,00** | **$112,00** |

### 7.3 Importar Facturas

`[IMAGEN: Pestaña Vista Previa — filtros en la parte superior (período, fecha desde, fecha hasta, botón "Cargar facturas"), tabla de facturas con columnas secuencial, fecha, cliente, base 0%, base gravada, IVA, total, estado]`

1. Ve a la pestaña **Vista Previa**
2. Selecciona el **período contable** destino
3. Ingresa la **fecha desde** y **fecha hasta**
4. Clic en **Cargar facturas**
5. Revisa la tabla:

| Badge | Significado |
|---|---|
| ✓ **Lista** | El asiento cuadra, listo para generarse |
| ⚠ **Sin cuenta** | Falta asignar una cuenta en la configuración |
| **Ya importada** | Esta factura ya fue contabilizada antes |

6. En modo "por factura": clic en ▼ para ver el asiento detallado de cada factura

`[IMAGEN: Fila expandida mostrando el detalle del asiento DEBE/HABER de una factura individual]`

7. Cuando todo esté en verde, clic en **Generar diarios**

### 7.4 Resultado

`[IMAGEN: Pestaña Resultado — terminal negro con líneas de log en verde mostrando cada CI generado y resumen final]`

El log confirma cada comprobante creado:
```
[14:32:15] Iniciando generación de diarios contables...
[14:32:16] ✓ CI-2026-04-000001 — Venta QI — Fact. 003-002-000044 — Cliente XYZ
[14:32:16] ──────────────────────────────────────
[14:32:16] Completado: 1 asiento(s) generado(s), 0 error(es).
```

> Las facturas ya contabilizadas se detectan automáticamente y no se duplican.

---

## 8. Presupuesto

Acceso: **Menú lateral → Real vs Presupuesto** (dentro de Reportes)

`[IMAGEN: Pantalla de presupuesto — selector de año en la parte superior, grilla con cuentas en filas y meses en columnas, celdas editables]`

### 8.1 Crear el Presupuesto Anual

1. Selecciona el **año**
2. Si no existe presupuesto, clic en **+ Nuevo presupuesto**
3. Escribe un nombre (ej: "Plan 2026")

### 8.2 Ingresar Valores

La grilla muestra cuentas de ingresos y gastos vs. meses con período abierto:
- Haz clic en cualquier celda e ingresa el valor presupuestado
- Las celdas modificadas se resaltan en amarillo
- Clic en **Guardar cambios** cuando termines

### 8.3 Comparativo Real vs. Presupuesto

`[IMAGEN: Reporte Real vs Presupuesto — tabla con columnas: cuenta, presupuesto, real, variación en $, variación en %]`

Ve a **Reportes → Real vs. Presupuesto** para ver:
- Lo que se planeó gastar/ingresar
- Lo que realmente ocurrió
- La variación en monto y porcentaje

---

## 9. Cierre Contable

Acceso: **Menú lateral → Cierre Contable**

`[IMAGEN: Pantalla de cierre contable — selector de año, resumen de saldos de cuentas de resultado, botón "Iniciar Cierre" con advertencia en rojo]`

> ⚠️ **Operación irreversible.** Realícela solo cuando el ejercicio fiscal esté completamente revisado y aprobado.

### 9.1 Qué hace el cierre

1. Verifica que todos los períodos del año estén **cerrados**
2. Genera asientos de **cierre** (tipo CA): cierra ingresos y gastos contra Resultados del Ejercicio
3. Genera el asiento de **apertura** del año siguiente (tipo AP): traslada saldos de balance

### 9.2 Pasos

1. Selecciona el **año** a cerrar
2. Revisa el resumen de utilidad/pérdida neta calculada
3. Clic en **Iniciar Cierre**
4. Confirma en el diálogo de advertencia
5. El sistema genera automáticamente los asientos CA y AP

---

## 10. Configuración

Acceso: **Menú lateral → Configuración** (ícono ⚙️)

`[IMAGEN: Pantalla de configuración — sección superior con datos de la empresa, sección inferior con listado de períodos y botón "Crear período"]`

### 10.1 Información de la Empresa

Muestra los datos de la empresa activa: nombre, razón social, RUC, dirección, moneda.

### 10.2 Gestión de Períodos

Los períodos habilitan los meses para registrar asientos.

**Crear un período:**
1. El sistema puede crear automáticamente los 12 meses del año
2. O crearlos uno a uno seleccionando mes y año
3. Clic en **+ Crear período**

**Estados:**

| Estado | Permite asientos |
|---|---|
| **Abierto** | ✓ Sí |
| **Cerrado** | ✗ No |
| **Bloqueado** | ✗ No |

> **Recomendación:** Cierra cada período mensual una vez el contador haya revisado todos los asientos.

---

## Guía Rápida de Inicio

Para empresas que comienzan desde cero:

```
1. Configuración → Crear períodos del año
2. Plan de Cuentas → Revisar y personalizar cuentas
3. Diarios → Ingresar saldo inicial (asiento de apertura manual CD)
4. Integración QI → Configurar mapeo de cuentas
5. Integración QI → Importar facturas del mes
6. Reportes → Verificar Balance de Comprobación
7. Fin de mes → Cerrar período en Configuración
```

---

## 11. Integración SRI — Compras y Retenciones

Acceso: **Menú lateral → Integración SRI**

`[IMAGEN: Pantalla Integración SRI con tres pestañas: Importar CSV, Comprobantes, Reglas de Mapeo]`

Permite importar los comprobantes electrónicos recibidos desde el SRI (facturas de compras, retenciones, notas de crédito, notas de débito) y generar los asientos contables correspondientes.

> **Requisito previo:** El usuario debe descargar manualmente el archivo TXT/CSV desde el portal del SRI antes de subirlo a Ledger Pro.

---

### 11.1 Cómo descargar el archivo del SRI

1. Ingresa a **SRI en Línea** → `srienlinea.sri.gob.ec`
2. Ve a **Consultas → Comprobantes Electrónicos Recibidos**
3. Filtra por período (año/mes) y tipo de comprobante
4. Haz clic en **Descargar** → guarda el archivo `.txt` en tu computador

---

### 11.2 Importar CSV — Pestaña 1

`[IMAGEN: Pestaña Importar con selectores año/mes/tipo y zona de carga de archivo con vista previa de 10 registros]`

**Paso 1 — Seleccionar período y tipo:**
- **Año / Mes:** El período al que corresponden los comprobantes
- **Tipo de comprobante:**

| Opción | Qué incluye |
|---|---|
| Facturas de Compras | Facturas que te emitieron como comprador |
| Retenciones Recibidas | Retenciones que te hicieron como proveedor |
| Notas de Crédito | NC emitidas a tu favor |
| Notas de Débito | ND emitidas en tu contra |

**Paso 2 — Seleccionar el archivo:**
- Clic en **Seleccionar archivo CSV del SRI**
- Elige el archivo `.txt` descargado del SRI
- El sistema muestra automáticamente una **vista previa** con los primeros 10 registros detectados

`[IMAGEN: Vista previa con columnas RUC, Proveedor, Número, Fecha, Base 0%, Base Grav., IVA, Total]`

**Paso 3 — Confirmar importación:**
- Verifica que los datos se ven correctos en la vista previa
- Clic en **Confirmar importación** (botón verde)
- El sistema importa los registros nuevos (los duplicados se ignoran automáticamente)
- Pasa automáticamente a la pestaña **Comprobantes**

---

### 11.3 Comprobantes — Pestaña 2

`[IMAGEN: Grid de comprobantes con filtros en la parte superior y tabla con columnas: Proveedor, Número, Fecha, Tipo, Bases, IVA, Total, Estado, ícono engranaje]`

Muestra todos los comprobantes importados del SRI con su estado contable.

#### Estados

| Estado | Color | Significado |
|---|---|---|
| **pendiente** | Amarillo | Falta asignar cuentas contables |
| **listo** | Verde | Cuentas asignadas, listo para generar asiento |
| **contabilizado** | Gris | Asiento ya generado en el diario |

#### Filtros disponibles
- Año, mes, tipo de comprobante, estado, búsqueda por RUC o nombre

#### Asignar cuentas a un comprobante

`[IMAGEN: Fila expandida mostrando el formulario de asignación de cuentas con 4 selectores: Gasto/Costo, IVA en Compras, Retención, Cuentas por Pagar]`

1. Haz clic en **▼** en cualquier fila para expandirla
2. Asigna las cuentas contables:

| Campo | Cuenta típica del plan |
|---|---|
| Gasto / Costo | `5.02.xx` Gastos administrativos o de venta |
| IVA en Compras | `1.01.05.01` Crédito tributario IVA |
| Retención *(si aplica)* | `1.01.05.02` Crédito tributario Renta |
| Cuentas por Pagar | `2.01.01.01` Proveedores — Corriente |

3. Marca **"Guardar como regla para futuros comprobantes"** si quieres que el sistema aplique estas cuentas automáticamente la próxima vez que llegue una factura de este mismo proveedor
4. Clic en **Guardar** → el comprobante pasa a estado **listo**

> Puedes asignar cuentas a uno, varios, o todos los comprobantes antes de generar los diarios. No es necesario procesar todos a la vez.

#### Crear regla desde el grid

Clic en el ícono **⚙️** al final de cualquier fila para abrir directamente el formulario de regla de mapeo pre-llenado con el RUC y nombre del proveedor.

#### Aplicar reglas automáticamente

El botón **Aplicar reglas** recorre todos los comprobantes en estado **pendiente** y les asigna automáticamente las cuentas según las reglas guardadas para cada proveedor.

#### Generar diarios contables

`[IMAGEN: Barra verde en la parte inferior del grid mostrando "X comprobantes listos para generar diarios" y botón "Generar diarios"]`

Cuando hay comprobantes en estado **listo**:
1. Aparece una barra verde con el conteo
2. Clic en **Generar diarios**
3. El sistema crea un **Comprobante de Egreso (CE)** por cada comprobante listo
4. El log de resultado muestra cada asiento generado

**Estructura del asiento para facturas de compras:**

```
DEBE:
  Gasto / Costo = base 0% + base gravada
  IVA en Compras = valor IVA

HABER:
  Cuentas por Pagar = total factura
```

**Estructura del asiento para retenciones:**
```
DEBE:
  Crédito Tributario (retención) = valor retenido

HABER:
  Cuentas por Pagar = valor retenido
```

---

### 11.4 Reglas de Mapeo — Pestaña 3

`[IMAGEN: Lista de reglas de mapeo con columnas: Tipo, Proveedor RUC, Cuenta Gasto, Cuenta Proveedor, y botones editar/eliminar]`

Gestiona las reglas que el sistema aplica automáticamente al importar nuevos comprobantes.

#### Crear una regla manualmente

1. Clic en **+ Nueva regla**
2. Selecciona el **tipo** de comprobante
3. Ingresa el **RUC del proveedor** (déjalo vacío para que aplique a todos los proveedores de ese tipo)
4. Asigna las cuentas contables
5. Clic en **Guardar regla**

#### Crear regla desde el grid (recomendado)

En la pestaña Comprobantes, clic en **⚙️** de cualquier fila → se abre el formulario pre-llenado con el RUC y nombre del proveedor.

---

### 11.5 Flujo completo recomendado

```
Cada mes:
1. SRI en Línea → descargar TXT de comprobantes recibidos
2. Integración SRI → Importar CSV → seleccionar período y archivo → Confirmar
3. Comprobantes → revisar registros importados
4. Clic "Aplicar reglas" → los proveedores con regla guardada pasan a "listo" automáticamente
5. Para los que quedan "pendiente" → asignar cuentas manualmente (▼) y guardar regla
6. Cuando todos estén "listo" → Generar diarios
7. Verificar en Reportes → Balance de Comprobación
```

---

## Preguntas Frecuentes

**¿Puedo manejar varias empresas?**
Sí. Cada empresa tiene su plan de cuentas, asientos y reportes completamente independientes.

**¿Qué pasa si confirmo un asiento con error?**
Debes anularlo y crear uno nuevo. No es posible editar un comprobante confirmado.

**¿Por qué no aparece una cuenta al buscar en el asiento?**
La cuenta debe tener activado "Acepta movimientos". Las cuentas de grupo no reciben asientos directamente.

**¿Con qué frecuencia importo facturas de QuickInvoice?**
Lo más común es una vez por mes, antes de cerrar el período. El sistema evita duplicados automáticamente.

**¿Qué es base cero e base gravada en la integración QI?**
- **Base gravada (base IVA):** subtotal de productos con IVA > 0%
- **Base cero:** subtotal de productos exentos de IVA (IVA = 0%)
Ambas van a la misma cuenta de Ingresos por Ventas. Solo el IVA va a una cuenta separada.

---

*Ledger Pro v1.0 — Billennium Systems — Ecuador 2026*
*Para soporte técnico: billenniumsystem@gmail.com*
