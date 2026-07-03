# MANUAL DE USUARIO — QUICKINVOICE ERP
**Versión 2026 · Usuario Oficina / Administrador**

---

## ÍNDICE
1. [Introducción](#1-introducción)
2. [Acceso al Sistema](#2-acceso-al-sistema)
3. [Navegación y Menú Principal](#3-navegación-y-menú-principal)
4. [FACTURACIÓN](#4-facturación)
5. [MANEJO DE CLIENTES](#5-manejo-de-clientes)
6. [PRODUCTOS E INVENTARIO](#6-productos-e-inventario)
7. [COMPRAS Y PROVEEDORES](#7-compras-y-proveedores)
8. [TESORERÍA](#8-tesorería)
9. [CONTABILIDAD](#9-contabilidad)
10. [TALENTO HUMANO Y NÓMINAS](#10-talento-humano-y-nóminas)
11. [GERENCIA](#11-gerencia)
12. [CONSULTAS Y REPORTES](#12-consultas-y-reportes)
13. [AJUSTES Y CONFIGURACIÓN](#13-ajustes-y-configuración)
14. [Preguntas Frecuentes](#14-preguntas-frecuentes)

---

## 1. Introducción

**QuickInvoice** es un sistema ERP (Enterprise Resource Planning) en la nube diseñado para empresas ecuatorianas. Integra facturación electrónica SRI, inventario, cartera, tesorería, contabilidad y nómina en una sola plataforma accesible desde cualquier navegador.

### Características principales
- Facturación electrónica certificada SRI (RIDE + XML)
- Inventario con kardex automático
- Cartera y gestión de cobros
- Tesorería y conciliación bancaria
- Integración contable (LedgerPro)
- Talento Humano y Rol de Pagos Ecuador
- Módulo Gerencial con KPIs y semáforo financiero
- Multi-empresa y multi-usuario con permisos granulares
- Funciona 100% online y en dispositivos móviles

---

## 2. Acceso al Sistema

### Ingreso
1. Abrir el navegador y acceder a la URL del sistema
2. Ingresar **correo electrónico** y **contraseña**
3. Hacer clic en **Ingresar**

### Perfil de Usuario
El sistema maneja los siguientes roles:
- **Super Admin:** gestiona empresas y usuarios globalmente
- **Oficina:** administrador de la empresa — acceso completo a todos los módulos según sus permisos
- **Cajero:** acceso limitado a facturación y cierre de caja

### Cambiar contraseña
Ajustes → Mi Perfil → Cambiar Contraseña

---

## 3. Navegación y Menú Principal

El menú lateral (sidebar) organiza los módulos por secciones. Cada sección puede expandirse o contraerse haciendo clic en su título.

### Secciones del Menú
| Sección | Módulos |
|---|---|
| **Facturación** | Dashboard, Nueva Factura, Proformas, Comprobantes, Notas de Crédito, Anulación, Cierres, Consulta Ventas, Ventas por Cliente |
| **Manejo de Clientes** | Clientes, Cartera/Abonos, Gestión de Cartera, Consulta Cartera, Estado de Cuenta |
| **Inventario** | Productos, Importar Artículos, Bodegas, Kardex |
| **Compras / Proveedores** | Proveedores, Compras, Cuentas por Pagar, Reportes Compras |
| **Tesorería** | Cuentas Bancarias, Egresos, Cheques, Movimientos Bancarios, Conciliación, Cierre Caja General |
| **Contabilidad** | Plan de Cuentas, Diarios/Asientos, Reportes, Tributario |
| **Talento Humano** | Empleados, Estructura Organizativa, Períodos/Rol de Pagos, Conceptos, Parámetros |
| **Gerencia** | Resumen Operacional |
| **Ajustes** | Configuración SRI, Puntos de Emisión, Permisos de Usuario, Parámetros |

> Los módulos visibles dependen de los permisos asignados a cada usuario por el administrador.

---

## 4. FACTURACIÓN

### 4.1 Dashboard
La pantalla principal muestra:
- **Ventas del día**: total facturado en tiempo real
- **KPIs**: facturas emitidas, valores cobrados, pendientes
- **Gráficos**: evolución de ventas del período

### 4.2 Nueva Factura
**Ruta:** Facturación → Nueva Factura

#### Pasos para emitir una factura:
1. **Cliente:** escribir nombre o cédula/RUC en el buscador. El sistema busca automáticamente en los clientes registrados. Si no existe, usar el botón **"+ Nuevo Cliente"**
   - El sistema selecciona **Consumidor Final** (9999999999999) por defecto
2. **Vendedor:** seleccionar el vendedor responsable (opcional)
3. **Productos:** buscar por nombre o código; escribir al menos 2 caracteres para activar la búsqueda
   - El buscador soporta búsqueda con asterisco (*) como comodín: `*RIEL*`
   - Hacer clic en **"Ver todos"** para ver todos los resultados
   - Ingresar cantidad, precio unitario y descuento por línea
4. **Forma de Pago:** seleccionar el método (Efectivo, Transferencia, Crédito, Cheque, Tarjeta, Otros)
   - Para pago a crédito: ingresar los días de plazo
5. **Emisión:** hacer clic en **Emitir Factura**
   - El sistema envía automáticamente al SRI si la firma electrónica está configurada
   - Se genera e imprime el ticket de 80mm automáticamente

#### Campos de la línea de detalle:
- Fila superior: **Descripción** (editable, ancho completo)
- Fila inferior: Cantidad · Precio · Descuento% · IVA% · Total

### 4.3 Proformas
**Ruta:** Facturación → Proformas

Las proformas son cotizaciones previas a la factura. Se puede:
- Crear, editar y eliminar proformas
- **Convertir a Factura** con un clic
- Imprimir en formato A4 o ticket 80mm

### 4.4 Comprobantes (Consulta de Facturas)
**Ruta:** Facturación → Comprobantes

Listado de todas las facturas emitidas. Permite:
- Filtrar por fecha, cliente, estado SRI
- Ver el detalle completo de cada factura
- Re-imprimir el comprobante
- Ver estado de autorización SRI (AUTORIZADO / PENDIENTE / ERROR)
- Anular una factura (requiere permiso)

### 4.5 Notas de Crédito
**Ruta:** Facturación → Notas de Crédito

Para devolver total o parcialmente una venta:
1. Seleccionar la factura de origen
2. Indicar el motivo de la nota de crédito
3. Seleccionar los productos o monto a devolver
4. El sistema genera el XML y lo envía al SRI

### 4.6 Anulación de Facturas
**Ruta:** Facturación → Anulación Facturas

Solo para facturas que no pueden anularse mediante nota de crédito. Requiere un motivo obligatorio y el permiso `perm_anulacion_facturas`.

### 4.7 Cierres de Caja (Cajero)
**Ruta:** Facturación → Cierres de Caja

El cajero cierra su turno registrando:
- Efectivo contado en caja
- Ventas por tarjeta
- Descuadres o diferencias con observaciones

### 4.8 Cierre de Caja General
**Ruta:** Tesorería → Cierre Caja General

Ver sección **8.6** de este manual.

---

## 5. MANEJO DE CLIENTES

### 5.1 Clientes
**Ruta:** Clientes → Clientes

Registro y gestión del catálogo de clientes. Campos:
- Tipo de identificación: RUC / Cédula / Pasaporte
- Nombre / Razón Social
- Email, Teléfono, Dirección
- Límite de crédito (para control de ventas a crédito)
- Estado: activo / bloqueado

> **Consumidor Final:** el cliente con identificación `9999999999999` es el predeterminado para ventas al contado sin datos del comprador.

### 5.2 Cartera / Abonos
**Ruta:** Clientes → Cartera / Abonos

Gestión de cuentas por cobrar generadas por ventas a crédito:
- Ver el saldo pendiente de cada factura
- Registrar abonos (parciales o totales)
- Formas de pago disponibles: Efectivo, Cheque, Transferencia, Tarjeta, Nota de Crédito
- El sistema actualiza automáticamente el saldo de la cartera

### 5.3 Gestión de Cartera *(Módulo Nuevo)*
**Ruta:** Clientes → Gestión de Cartera

Módulo avanzado de cobros. Proporciona:

#### Panel de KPIs
| Indicador | Descripción |
|---|---|
| Total Cartera | Suma de todos los saldos pendientes |
| Total Vencido | Facturas con fecha de vencimiento superada |
| Por Vencer | Facturas con vencimiento futuro |
| Clientes en Mora | Cantidad de clientes con saldo vencido |
| Prom. Días de Mora | Promedio de días de atraso |
| Rotación de Cartera | Días promedio de cobro (menor = mejor) |

#### Filtros disponibles
- **Cliente**: buscar por nombre, RUC o cédula
- **Vendedor**: filtrar por vendedor responsable
- **Estado**: Todas / Vencidas / Por Vencer
- **Fecha de corte**: el semáforo se calcula a esta fecha

#### Semáforo de antigüedad
| Color | Condición |
|---|---|
| 🟢 Verde | Por vencer o menos de 30 días vencida |
| 🟡 Amarillo | 30 a 90 días vencida |
| 🔴 Rojo | 90 a 180 días vencida |
| ⚫ Negro | Más de 180 días vencida |

#### Registrar una Gestión de Cobro
Hacer clic en el ícono 📋 de cualquier fila para abrir el panel lateral:

1. **Historial:** ver todas las gestiones previas (canal, fecha, observación, estado)
2. **Nueva Gestión:**
   - Seleccionar canal: Llamada / Email / WhatsApp / Visita / Carta / Otro
   - Estado resultante: En negociación / Promesa de pago / Acuerdo de pago / Incobrable
   - Observación libre
   - Próxima fecha de seguimiento
   - ¿Hubo promesa de pago? → indicar fecha y monto comprometido

#### Comunicación con el cliente
- **WhatsApp:** botón que abre wa.me/ con mensaje pre-redactado (3 niveles: 1er aviso / 2do aviso / Prejudicial)
- **Email:** abre cliente de correo con asunto y cuerpo predefinido
- **Carta:** imprime carta formal de cobro con datos del cliente y la deuda

#### Score de Riesgo Crediticio
Cada cliente tiene un **Score 0–100** calculado automáticamente:
| Score | Clasificación |
|---|---|
| 80–100 | 🟢 Buen pagador |
| 50–79 | 🟡 Pagador irregular |
| 20–49 | 🔴 Alto riesgo |
| 0–19 | ⚫ Incobrable |

#### Reportes de Cartera (botón "Reportes")
| Reporte | Descripción |
|---|---|
| R1 · Aging | Antigüedad de saldos: 0-30 / 31-60 / 61-90 / 91-180 / +180 días |
| R2 · Por Vendedor | Total, vencido, por vencer y días mora por vendedor |
| R3 · Efectividad Cobrador | Gestiones, promesas y % cumplimiento por usuario (con rango de fechas) |
| R4 · Promesas de Pago | Listado de promesas con estado cumplida/pendiente/incumplida |
| R5 · Acuerdos en Cuotas | Detalle de planes de pago con cada cuota |
| R6 · Comparativo 12 meses | Evolución mensual de cartera, vencido y clientes en mora |
| R7 · Alto Riesgo | Clientes con score < 50 o bloqueados |

### 5.4 Consulta Cartera
**Ruta:** Clientes → Consulta Cartera

Vista simplificada de saldos pendientes por cliente, con filtros de fecha y estado.

### 5.5 Estado de Cuenta
**Ruta:** Clientes → Estado de Cuenta

Genera el estado de cuenta de un cliente específico con todas sus facturas y pagos, disponible para imprimir o enviar por email.

---

## 6. PRODUCTOS E INVENTARIO

### 6.1 Productos
**Ruta:** Ajustes → Productos (o desde el buscador en Factura)

Catálogo de artículos y servicios:
- Código, nombre, descripción
- Precio de venta, costo promedio
- IVA aplicable (0% / 15%)
- Categoría, bodega principal
- Estado: activo / inactivo
- **Subproductos** (variantes de talla, color, etc.)
- **Precios por volumen** (descuentos automáticos por cantidad)

### 6.2 Importación Masiva de Artículos
**Ruta:** Inventario → Importar Artículos

Para cargar cientos de productos desde un archivo CSV:
1. Preparar el archivo CSV con separador `;` (punto y coma)
2. Columnas requeridas: código, nombre, precio, costo, categoría, stock
3. Subir el archivo y previsualizar los primeros 20 registros
4. El sistema importa en lotes de 50 registros
5. Se crean automáticamente entradas en kardex tipo ENTRADA

> Los productos duplicados se omiten automáticamente. Stocks negativos se convierten a 0.

### 6.3 Kardex (Movimientos de Inventario)
**Ruta:** Inventario → Kardex

Registro histórico de todos los movimientos de stock:
- **ENTRADA:** compras, ajustes de inventario, importaciones
- **SALIDA:** ventas, ajustes negativos

Cada movimiento registra: fecha, tipo, motivo, cantidad, costo unitario, saldo.

---

## 7. COMPRAS Y PROVEEDORES

### 7.1 Proveedores
Catálogo de proveedores con datos fiscales (RUC, nombre, dirección, teléfono, email).

### 7.2 Compras (Ingresos de Inventario)
**Ruta:** Compras → Compras

Para registrar una compra:
1. Seleccionar proveedor
2. Ingresar número de factura del proveedor
3. Agregar los productos comprados con cantidad y precio
4. El sistema actualiza automáticamente:
   - Stock en bodega (kardex ENTRADA)
   - Costo promedio del producto
   - Asiento contable (si contabilidad está activa)

> También permite registrar compras de **servicios** (sin movimiento de inventario).

### 7.3 Cuentas por Pagar (CxP)
**Ruta:** Compras → Cuentas por Pagar

Gestión de pagos a proveedores:
- Ver saldos pendientes con cada proveedor
- Registrar pagos (parciales o totales)
- Estado: pendiente / parcial / pagada

---

## 8. TESORERÍA

### 8.1 Cuentas Bancarias
Registro de cuentas bancarias de la empresa:
- Banco, tipo (corriente / ahorros), número de cuenta
- Cuenta contable vinculada (para asientos automáticos)
- Saldo inicial

### 8.2 Egresos
Registro de pagos y desembolsos:
- Pago a proveedores
- Pago de nómina
- Gastos operacionales varios
- Cada egreso genera asiento contable automático

### 8.3 Cheques
Módulo de gestión de cheques emitidos:
- Registro de cheques con fecha, banco, beneficiario, valor
- Seguimiento de estado: emitido / cobrado / protestado / anulado

### 8.4 Movimientos Bancarios
Registro de todos los movimientos por cuenta bancaria:
- Débitos y créditos
- Referencia y descripción
- Preparación para conciliación

### 8.5 Conciliación Bancaria
Proceso mensual para cuadrar el libro banco del sistema contra el extracto del banco:
1. Seleccionar cuenta bancaria y período
2. El sistema muestra movimientos del sistema vs. extracto
3. Marcar como conciliados los ítems que coinciden
4. Los pendientes quedan para investigación

### 8.6 Cierre de Caja General
**Ruta:** Tesorería → Cierre Caja General

Herramienta diaria para que la administración controle el dinero físico en caja.

> **Importante:** esta pantalla debe dejarse **abierta todo el día**. Los datos se auto-guardan en la base de datos cada 800ms — al regresar de otras pantallas, el trabajo está intacto.

#### Indicadores en el header
- **Badge "Abierto — auto-guardado":** confirma que el proceso está activo
- **Selector de fecha:** permite consultar cualquier día pasado

#### Tabs disponibles
| Tab | Descripción |
|---|---|
| Movimientos | Ingresos y egresos extra de caja (fondos, retiros, gastos) |
| Ventas del Día | Facturas del día con formas de pago (EF / TR / CD / etc.) |
| Rec. Cartera | Cobros de cartera del día |
| Cierre | Resumen consolidado + depósitos bancarios |
| Histórico | Cierres de días anteriores con opción de reverso |

#### Proceso de cierre
1. Verificar que las ventas y cobranza del día estén correctas
2. Registrar movimientos extra si aplica (ingresos por préstamos, pagos de gastos, etc.)
3. Ir al tab **Cierre** y configurar la Base de Caja (billetes que quedan en caja para el día siguiente) — hacer clic en **Guardar base**
4. Agregar los depósitos bancarios: banco destino, tipo (efectivo/cheque), valor, nro. comprobante
5. Revisar el resumen: Efectivo Total / Cheques Total / Base / A Depositar
6. Hacer clic en **Ejecutar Cierre Definitivo**

#### Reporte de cierre 80mm
El botón **Imprimir Reporte** genera un ticket con:
- Detalle de ventas (una fila por cada forma de pago)
- Detalle de cobros de cartera
- Movimientos extra (ingresos y egresos)
- Resumen final con totales
- Depósitos bancarios
- Firma del cajero

---

## 9. CONTABILIDAD

> **Nota:** La contabilidad está integrada con el sistema **LedgerPro**. Para usar este módulo debe tener LedgerPro configurado y los períodos contables abiertos.

### 9.1 Plan de Cuentas
Catálogo de cuentas contables organizado jerárquicamente:
- Activos (1.xx), Pasivos (2.xx), Patrimonio (3.xx)
- Ingresos (4.xx), Costos (5.01.xx), Gastos (5.02.xx)

> Para buscar una cuenta, siempre use el **buscador interactivo** (escriba código o nombre). Nunca ingrese manualmente un código.

### 9.2 Asientos Automáticos
Cuando está activa la integración contable, los siguientes procesos generan asientos automáticamente:
- Emisión de facturas → Débito CxC / Crédito Ventas
- Cobros de cartera → Débito Banco/Caja / Crédito CxC
- Compras → Débito Inventario o Gasto / Crédito CxP
- Pagos a proveedores → Débito CxP / Crédito Banco
- Nómina → Débito Sueldos / Crédito por pagar

### 9.3 Diarios / Asientos Manuales
Para asientos que no se generan automáticamente:
1. Seleccionar tipo de comprobante
2. Ingresar fecha, glosa y líneas DEBE/HABER
3. El sistema valida que el asiento cuadre antes de confirmar

### 9.4 Tributario
**Ruta:** Contabilidad → Tributario

#### Consulta de Compras (Retenciones)
- Lee directamente de los ingresos de inventario registrados en el período
- Muestra base 0%, base IVA, IVA pagado

#### Consulta de Ventas
- Facturas emitidas con bases y valores de IVA

#### ATS (Anexo Transaccional Simplificado)
- Genera automáticamente el XML del ATS para declarar al SRI
- Consolida compras (proveedores) y ventas (clientes) del período
- Permite descargar el archivo XML para subirlo al portal del SRI

---

## 10. TALENTO HUMANO Y NÓMINAS

### 10.1 Empleados
Registro del personal de la empresa:
- Datos personales y de contacto
- Datos laborales: cargo, departamento, fecha de ingreso, tipo de contrato
- Sueldo base, banco y cuenta para pago

### 10.2 Estructura Organizativa
Definición de cargos, departamentos y jerarquía organizacional.

### 10.3 Conceptos de Nómina
Catálogo de rubros que componen el rol de pagos:
- **Ingresos:** Sueldo Base, Horas Extra 50%, Horas Extra 100%, Horas Nocturnas 25%, Comisiones, Bonificaciones
- **Descuentos:** IESS Personal (9.45%), Multas, Préstamos, Otros

### 10.4 Parámetros de Nómina Ecuador
Valores configurables:
- Fondos de Reserva (aplicable desde el 13er mes)
- Porcentajes IESS Patronal y Personal
- Salario Básico Unificado vigente

### 10.5 Períodos / Rol de Pagos
**Proceso mensual:**

1. **Crear Período:** seleccionar mes y año
2. **Generar Roles:** el sistema crea automáticamente el rol para cada empleado activo con todos los conceptos configurados
3. **Editar Detalle:** en el modal de cada empleado, ajustar:
   - Horas extra: ingresar las horas y el sistema calcula el monto automáticamente con la fórmula `(Sueldo/240) × factor × horas`
   - Descuentos variables del período
4. **Cerrar Período:** genera el asiento contable en LedgerPro (si aplica) y bloquea el período para edición
5. **Imprimir Roles individuales:** ticket o formato A4 para cada empleado

> Para deshacer un período cerrado: botón **Deshacer Cierre** — revierte el asiento contable y reabre el período.

---

## 11. GERENCIA

### 11.1 Resumen Operacional
**Ruta:** Gerencia → Resumen Operacional

Panel ejecutivo para que el empresario vea rápidamente la situación financiera del período.

> **Nota:** Este NO es un Estado de Resultados contable formal. Es un resumen gerencial ejecutivo, ideal para empresas sin contabilidad completa.

#### Modos de período
| Modo | Selector | Comparativo |
|---|---|---|
| Día | Fecha puntual | vs. mismo día semana anterior |
| Mes | Mes + Año | vs. mismo mes año anterior + Acumulado YTD |
| Año | Año | vs. año anterior |

#### Estructura del Resumen en Cascada
```
(+) Ingresos por Ventas        (facturas válidas - notas de crédito)
(-) Costo de lo Vendido        (kardex de salidas O cuentas 5.01 si hay contabilidad)
(=) UTILIDAD BRUTA             → % margen bruto

(-) Gastos Operacionales       (ingresados manualmente O cuentas 5.02 si hay contabilidad)
(=) RESULTADO OPERACIONAL      → % sobre ingresos

(-) 15% Participación Trabajadores
(=) BASE IMPONIBLE

(-) 25% Impuesto a la Renta
(=) RESULTADO NETO             → % margen neto
```

La tabla comparativa muestra: Período Actual | Período Anterior | Variación $ | Variación %

#### Semáforo de Salud Financiera
| Estado | Condición |
|---|---|
| 🟢 Saludable | Margen neto > 15% |
| 🟡 En observación | Margen neto entre 5% y 15% |
| 🔴 En riesgo | Margen neto < 5% |
| ⚫ Pérdida | Resultado neto negativo |

> Los umbrales del semáforo son **configurables** — clic en el botón ⚙️ **Semáforo** para ajustarlos.

#### Gráficos
- **Barras:** comparativo Ingresos / Costo / Gastos / Resultado Neto entre períodos
- **Dona:** composición de egresos (qué % representa cada rubro de las ventas totales)

#### Top 5 Clientes y Top 5 Productos
Por ingresos del período seleccionado, con barra visual de participación relativa.

#### Sin módulo contable (modo manual)
Si no tiene LedgerPro configurado, aparece la sección **Gastos Operacionales del Período** donde puede ingresar manualmente sus gastos por categoría. Estos se guardan en la base de datos y están disponibles al siguiente acceso.

#### Exportar
- **Excel:** hoja de resumen con cascada + hoja de Top 5
- **Imprimir:** reporte formateado con empresa, período, cascada y top clientes/productos

---

## 12. CONSULTAS Y REPORTES

### 12.1 Consulta de Ventas
**Ruta:** Facturación → Consulta Ventas

Reporte de facturas por período con:
- Filtros: fecha desde/hasta, vendedor
- Columnas: base IVA, base 0%, suma bases, IVA, total, formas de pago
- Exportar a Excel o imprimir

### 12.2 Ventas por Cliente
**Ruta:** Facturación → Ventas por Cliente

Reporte enfocado en un cliente específico:
1. Buscar el cliente por nombre o cédula/RUC (campo de búsqueda interactivo)
2. Seleccionar el período (atajos: Hoy, Esta semana, Este mes, Mes anterior, Este año)
3. Hacer clic en **Consultar**

**Columnas:** No. Factura · Fecha · Total · Pagado · Saldo · **Estado** · SRI

**Estado de cada factura:**
| Estado | Significado |
|---|---|
| 🟢 CANCELADA | Factura totalmente pagada |
| 🟡 CRÉDITO | Saldo pendiente sin pagos parciales |
| 🟠 PARCIAL | Saldo pendiente con pagos parciales |
| 🔴 ANULADA | Factura anulada |

**Detalle expandible:** hacer clic en cualquier fila para ver:
- Formas de pago utilizadas
- Detalle de productos (nombre, cantidad, precio, IVA, total)

**Exportar:**
- **Excel:** hoja de resumen + hoja de detalle de productos por línea
- **Imprimir:** reporte formal con nombre de empresa, cliente, período y totales

---

## 13. AJUSTES Y CONFIGURACIÓN

### 13.1 Configuración SRI
**Ruta:** Ajustes → Configuración

Datos necesarios para la facturación electrónica:
- **RUC** de la empresa
- **Razón Social**
- **Dirección** y datos de contacto
- **Ambiente:** Pruebas o Producción
- **Régimen:** RIMPE / Régimen General
- **Firma Electrónica:** cargar el archivo `.p12` y contraseña

> La firma electrónica es el certificado digital emitido por el BCE (Banco Central del Ecuador) o entidades autorizadas. Sin ella, las facturas se guardan como PENDIENTES pero no se autoriza en el SRI.

### 13.2 Puntos de Emisión
**Ruta:** Ajustes → Puntos de Emisión

Cada punto de venta tiene su propio secuencial de facturas:
- Establecimiento (3 dígitos): ej. `001`
- Punto de Emisión (3 dígitos): ej. `001`
- **Secuencial actual:** editable — permite iniciar desde cualquier número

### 13.3 Permisos de Usuario
**Ruta:** Ajustes → Permisos de Usuario

El administrador puede controlar exactamente qué ve y hace cada usuario:

**Módulos configurables:**

| Módulo | Permisos disponibles |
|---|---|
| Facturación | Dashboard, Nueva Factura, Comprobantes, Notas de Crédito, Anulación, Cierres, Consulta Ventas |
| Manejo de Clientes | Clientes, Cartera/Abonos, Gestión de Cartera, Consulta Cartera, Estado de Cuenta |
| Compras | Proveedores, Compras, CxP, Reportes Compras |
| Tesorería | Cuentas Bancarias, Egresos, Cheques, Movimientos, Conciliación, Cierre Caja General |
| Gerencia | Resumen Operacional |
| Contabilidad | Plan de Cuentas, Asientos, Reportes, Tributario |
| Talento Humano | Empleados, Estructura, Períodos/Nómina, Conceptos, Parámetros |

**Pasos:**
1. Ir a Ajustes → Permisos de Usuario
2. Seleccionar el usuario de la lista
3. Activar o desactivar los toggles por módulo
4. Hacer clic en **Guardar**
5. El usuario verá los cambios en su próximo inicio de sesión

---

## 14. Preguntas Frecuentes

### ¿Por qué la factura queda en estado PENDIENTE?
La firma electrónica no está configurada o el SRI está fuera de línea. La factura es válida internamente; se autoriza automáticamente cuando se restablezca la conexión.

### ¿Cómo cambio el número de secuencial de facturas?
Ajustes → Puntos de Emisión → Editar el punto de emisión → campo **Secuencial FACTURA**.

### ¿Puedo tener más de un punto de emisión?
Sí. Cree un punto de emisión por cada caja o dispositivo de facturación.

### ¿Los datos del Cierre de Caja General se pierden si navego a otra pantalla?
No. El sistema auto-guarda depósitos y observaciones cada 800ms en la base de datos. Al volver, toda la información está intacta.

### ¿Cómo funciona el cliente Consumidor Final?
Es un cliente especial (cédula 9999999999999) preregistrado. Se selecciona automáticamente al crear una nueva factura cuando no se especifica un comprador.

### ¿La búsqueda de productos soporta búsqueda parcial?
Sí. Use el símbolo `*` como comodín: `*RIEL*` encuentra todos los productos que contengan la palabra "RIEL".

### ¿Cuántos productos puede manejar el sistema?
El sistema está optimizado para manejar catálogos de más de 5.000 artículos. La búsqueda es del lado del servidor (no descarga todos los productos al navegador).

### ¿El WhatsApp del módulo de Cartera tiene costo?
No. Usa el enlace `wa.me/` que abre WhatsApp del celular del cobrador — él solo hace clic en Enviar. No se cobra nada.

### ¿Cómo exportar a Excel?
Casi todos los módulos tienen botón **Excel** o **Reportes → Exportar**. Los archivos se descargan directamente al computador en formato `.xlsx`.

### ¿Puedo usar el sistema desde un celular?
Sí. La interfaz es responsiva y funciona en tablets y teléfonos. El módulo de Gestión de Cartera está optimizado para uso de cobradores en campo.

---

*Manual actualizado: Julio 2026 · QuickInvoice ERP · Billennium*
