# -*- coding: utf-8 -*-
"""Datos estructurados para el Manual de Usuario de QuickInvoice.

Cada elemento de MODULOS describe una pantalla del sistema, con su título,
sección, descripción, elementos de la interfaz, pasos de uso y notas.
"""

MODULOS = [
    {
        "numero": 1,
        "archivo": "01_dashboard",
        "titulo": "Dashboard Gerencial",
        "seccion": "Facturación y Ventas",
        "descripcion": (
            "El Dashboard Gerencial es un tablero de control estratégico que muestra en tiempo "
            "real el desempeño de la empresa: ventas, costos, margen, proyecciones, rendimiento "
            "de vendedores y de productos, durante un período que usted puede seleccionar. "
            "Es la pantalla ideal para tener una visión rápida y completa del estado del negocio "
            "sin necesidad de revisar reportes individuales."
        ),
        "elementos": [
            "Selector de período (Este mes, Mes anterior, Trimestre, Este año, Año anterior)",
            "Botón de actualización manual",
            "6 tarjetas KPI principales: Ventas Netas, Costo de Ventas, Margen Bruto, Facturas, Ticket Promedio, Clientes Únicos",
            "Gráfico de Evolución de Ventas (últimos 12 meses: ventas, costo, margen)",
            "Gráfico de Formas de Cobro (distribución en pastel)",
            "Gráfico de Rendimiento por Vendedor (barras horizontales)",
            "Tabla Top 10 Artículos por Ventas",
            "Tabla de Análisis de Rentabilidad por Producto (con opciones de ordenamiento)",
            "Gráfico de Proyección del Siguiente Mes",
            "Lista de Artículos de Baja Rotación",
            "Gráfico comparativo Ventas vs Costos mensual",
        ],
        "pasos": [
            "Seleccione el período deseado usando los botones en el encabezado (Este mes, Año actual, etc.).",
            "Revise las 6 tarjetas KPI principales para obtener una visión rápida de los números clave (la tendencia aparece en porcentaje).",
            "Analice el gráfico 'Evolución de Ventas - Últimos 12 Meses' para identificar tendencias mensuales.",
            "Consulte 'Formas de Cobro' para ver que métodos de pago predominan.",
            "En 'Rendimiento por Vendedor', identifique al mejor desempeño (marcado con una estrella) y revise su tabla de detalle.",
            "Para productos, use los botones 'Ordenar por' (Ventas, Margen %, Unidades, Rotación) para encontrar los más rentables o problemáticos.",
            "Haga clic en 'Ver todos' si necesita analizar más de 10 productos.",
            "En 'Artículos de Baja Rotación', revise si hay stock sin movimiento importante para tomar decisiones de inventario.",
            "Utilice 'Proyección - Siguiente Mes' para anticiparse a la demanda futura basada en los últimos 6 meses.",
            "Presione el botón de actualización (icono de flecha) si los datos parecen desactualizados.",
        ],
        "notas": [
            "La proyección requiere al menos 3 meses de datos históricos.",
            "Los porcentajes de margen se colorean: verde (igual o mayor a 30%), ámbar (igual o mayor a 15%), rojo (menor a 15%).",
            "La rotación infinita (símbolo de infinito) indica que un producto se vendió en mayor cantidad que el stock actual.",
            "Si hay artículos de baja rotación, considere ajustar inventario o precios.",
        ],
    },
    {
        "numero": 2,
        "archivo": "02_nueva_factura",
        "titulo": "Nueva Factura",
        "seccion": "Facturación y Ventas",
        "descripcion": (
            "Este módulo permite crear y emitir facturas electronicas de forma rápida y segura, "
            "con soporte para productos de inventario, servicios, multiples formas de pago y "
            "generación automática de comprobantes para impresora POS. Es la pantalla de uso "
            "diario para registrar las ventas del negocio y enviarlas automáticamente al SRI."
        ),
        "elementos": [
            "Sección Cliente (colapsable): búsqueda/selección de cliente existente, opción para crear cliente nuevo, consulta SRI",
            "Sección Vendedor (colapsable): selector de vendedor, selección de bodega de despacho, plazo de crédito (visible si hay pago a crédito)",
            "Sección Detalle de Artículos/Servicios: tabla con campos Descripción, Cantidad, Precio Unitario, Descuento %, IVA %, Total",
            "Interruptor 'Factura de Servicios' para cambiar entre modo inventario/servicios",
            "Botones 'Agregar línea' (en encabezado y pie)",
            "Formas de Pago (derecha): selector de método, campo de monto, agregación de multiples formas de pago",
            "Campo 'Efectivo Recibido del Cliente' (solo si hay pago en efectivo) y cálculo automático de vuelto",
            "Resumen de totales: Subtotal, Descuentos, IVA, TOTAL, monto Distribuido, estado (Cubierto o Pendiente)",
            "Botón 'Completar pago automáticamente'",
            "Botón principal 'Generar Factura'",
            "Indicador de caja abierta con nombre de usuario",
        ],
        "pasos": [
            "Seleccione cliente: escriba en el campo de búsqueda para encontrar un cliente existente por nombre o RUC, o presione 'Nuevo' para agregar uno nuevo. Si es consumidor final, aparecera por defecto.",
            "Para un cliente nuevo: ingrese la Identificación, presione el botón de búsqueda SRI para autocompletar el nombre, complete Email, Teléfono y Dirección, y presione 'Guardar'.",
            "Asigne vendedor (opcional): despliegue la sección Vendedor, seleccione de la lista o deje sin asignar.",
            "Seleccione bodega (si aplica): en modo inventario, elija la bodega de despacho del selector disponible.",
            "Elija el modo de facturación: active el interruptor 'Factura de Servicios' si factura solo servicios; desactivelo para productos.",
            "Agregue productos o servicios: presione 'Agregar línea'.",
            "En modo inventario: busque el producto en el campo Descripción (aparecera un listado desplegable), seleccionelo y la cantidad/precio se autocompletaran.",
            "En modo servicios: escriba la descripción manual, cantidad y precio.",
            "Complete cantidad y precio: modifique la cantidad (recalcula el precio por volumen automáticamente), ajuste el Descuento % y el IVA % según corresponda.",
            "Agregue presentaciones (si el producto tiene): si hay subproductos, aparecera un selector naranja para elegir la presentación y el factor de conversión.",
            "Configure las formas de pago (lado derecho): presione 'Agregar' para añadir multiples formas.",
            "Para cada forma de pago: seleccione el método (Efectivo, Tarjeta D/C, Transferencia, Crédito, Cheque, etc.).",
            "Ingrese el monto. Si es Transferencia, elija la Cuenta Bancaria destino. Si es Cheque, ingrese el número de cheque.",
            "Calcule el vuelto (si hay efectivo): ingrese el 'Efectivo Recibido del Cliente' y el sistema mostrara automáticamente el vuelto a entregar.",
            "Verifique los totales: el Resumen muestra Subtotal, Descuentos, IVA y TOTAL. Compruebe que el monto 'Distribuido' sea mayor o igual al TOTAL (debe marcar 'Cubierto').",
            "Complete automáticamente si falta: presione 'Completar pago automáticamente' si tiene un pago incompleto (rellena el faltante en el método principal).",
            "Emita la factura: presione 'Generar Factura'. El sistema válida que haya cliente y detalle válido, válida que haya caja abierta (requisito obligatorio en línea; en modo sin conexión se guarda en cola), emite la factura al SRI automáticamente, imprime el comprobante POS automáticamente y muestra una ventana de éxito con el vuelto y la opción de reimprimir o crear una nueva factura.",
        ],
        "notas": [
            "Se requiere una caja abierta para emitir la factura (en línea). Si no hay conexión, se guarda en una cola para sincronizar después.",
            "El consumidor final (RUC 9999999999999) no puede eliminarse.",
            "El modo Servicios limpia las líneas actuales al activarse o desactivarse.",
            "Los precios por volumen se aplican automáticamente al cambiar la cantidad, si están configurados.",
            "Si factura a crédito, aparece un selector de plazo (15/30/45/60/90/120 días).",
            "Funciona sin conexión a internet: se guarda en una cola y se sincroniza automáticamente al recuperar la conexión.",
        ],
    },
    {
        "numero": 3,
        "archivo": "03_facturacion",
        "titulo": "Facturación Electrónica",
        "seccion": "Facturación y Ventas",
        "descripcion": (
            "Este módulo es el centro de gestión de los comprobantes electronicos emitidos. "
            "Permite monitorear el estado de cada comprobante ante el SRI, descargar archivos, "
            "reimprimir, anular facturas y diagnosticar problemas de configuración del SRI. "
            "Es la pantalla de referencia para verificar que todas las ventas hayan sido "
            "correctamente autorizadas por la autoridad tributaria."
        ),
        "elementos": [
            "4 tarjetas de estadisticas: Autorizados, Pendientes, Enviados, Rechazados",
            "Tabla de Cola sin conexión (si hay facturas pendientes de sincronización): muestra Cliente, Fecha guardada, Total, Estado (PENDIENTE/SINCRONIZANDO/ERROR), Error (si aplica), botones Reintentar y Descartar",
            "Barra de filtros: búsqueda por Secuencial/Cliente, selector de Fecha",
            "Tabla principal de Comprobantes: Secuencial, Cliente, Fecha, Total, Estado SRI, Observaciones/Error, Acciones",
            "Botón 'Configurar SRI' (abre ventana de configuración)",
            "Botón 'Panel Técnico' (muestra diagnóstico de configuración)",
            "Iconos de estado: Pendiente (reloj), Enviado (icono de envío), Autorizado (marca de verificación), Rechazado (X)",
        ],
        "pasos": [
            "Revise las estadisticas en tiempo real: las 4 tarjetas muestran los conteos de facturas por estado. Verifique si hay facturas Rechazadas que requieran atención.",
            "Sincronice facturas sin conexión (si existen): en la tabla 'Facturas pendientes de sincronización', presione Reintentar (icono de flecha) para resincronizar una factura en error, o Descartar (X) si desea eliminarla de la cola.",
            "Busque una factura específica: escriba el Secuencial o el nombre del Cliente en el campo de búsqueda.",
            "Filtre por fecha: use el selector de fecha para consultar comprobantes de un día específico.",
            "Consulte el estado ante el SRI: si el Estado es PENDIENTE o ENVIADO, presione el botón Reintentar (flecha) para consultar el estado actual y la autorización.",
            "Si el Estado es AUTORIZADO, verifique el número de autorización en la columna Estado.",
            "Para descargar archivos: presione el botón XML (llave) para descargar el XML del comprobante.",
            "Presione el botón PDF (documento) para ver el RIDE (Representación Impresa).",
            "Presione el botón Ticket (página) para imprimir el comprobante en formato POS.",
            "Consulte el portal SRI oficial: presione el botón de búsqueda (lupa) para copiar la clave de acceso y abrir el portal SRI oficial en una nueva pestana.",
            "Anule una factura: presione el botón de anulación (icono de prohibido), ingrese el motivo obligatorio y confirme. Aparecera la etiqueta ANULADA en el secuencial.",
            "Configure el SRI (si aun no esta configurado): presione 'Configurar SRI'.",
            "Seleccione el Ambiente (PRUEBAS o PRODUCCIÓN).",
            "Ingrese si la empresa esta Obligada a Contabilidad (SI/NO según el SRI).",
            "Ingrese el Secuencial Inicio (número de inicio de secuencia).",
            "Ingrese el Establecimiento (3 digitos, por ejemplo 001).",
            "Ingrese el Punto de Emisión (3 digitos, por ejemplo 001).",
            "Suba el archivo de firma electrónica (.p12) e ingrese la contraseña de la firma.",
            "(Opcional) Configure el Servidor SMTP para notificaciones.",
            "Presione 'Guardar Cambios'.",
            "Diagnóstico técnico: presione 'Panel Técnico' para ver la configuración guardada (Ruta de Firma, Ambiente, Establecimiento, contraseña, identificador de empresa).",
        ],
        "notas": [
            "La firma electrónica (.p12) es obligatoria. Debe ser válida ante el SRI (si aparece error de firma inválida, revise la contraseña o el archivo).",
            "En PRUEBAS puede realizar pruebas sin afectar datos reales. En PRODUCCIÓN se envia al SRI real.",
            "Las facturas RECHAZADAS muestran el detalle del error en la columna 'Observaciones/Error'.",
            "Sin conexión: si se corto el internet, las facturas quedan en la Cola sin conexión y se sincronizaran al restaurar la conexión.",
            "Requisito previo: debe haber una caja abierta para emitir una factura.",
        ],
    },
    {
        "numero": 4,
        "archivo": "04_clientes",
        "titulo": "Maestro de Clientes",
        "seccion": "Facturación y Ventas",
        "descripcion": (
            "Es la base de datos centralizada de clientes para facturación, donde se registran "
            "y administran la identificación, datos de contacto y datos comerciales de personas "
            "o empresas. Esta información se utiliza en toda la plataforma, especialmente al "
            "momento de buscar y seleccionar un cliente en el módulo de Nueva Factura."
        ),
        "elementos": [
            "Botón 'Nuevo Cliente' (esquina superior derecha)",
            "Campo de búsqueda por nombre o RUC/Cédula",
            "Tabla con columnas: Cliente, Identificación, Email, Teléfono, Acciones",
            "Iconos de acción por fila: Editar (lápiz), Eliminar (papelera)",
        ],
        "pasos": [
            "Cree un cliente nuevo: presione 'Nuevo Cliente'.",
            "Ingrese la Identificación (RUC/Cédula de 10 a 13 digitos, o pasaporte).",
            "Presione el botón de búsqueda SRI (al lado del campo) para autocompletar el nombre desde el SRI si la identificación es válida.",
            "Ingrese el Nombre Completo o Razón Social (obligatorio).",
            "Ingrese el Email (opcional).",
            "Ingrese la Dirección (opcional).",
            "Ingrese el Teléfono Móvil (opcional).",
            "Presione 'Guardar'.",
            "Busque un cliente: escriba el nombre o RUC/Cédula en el campo de búsqueda. La tabla se filtra automáticamente.",
            "Edite un cliente: presione el icono Editar (lápiz) en la fila correspondiente. Modifique los campos y presione 'Guardar'.",
            "Elimine un cliente: presione el icono Eliminar (papelera). Se pedira confirmación. Nota: el Consumidor Final (RUC 9999999999999) no puede eliminarse.",
        ],
        "notas": [
            "Identificación válida: 10 digitos (Cédula), 13 digitos (RUC), o Pasaporte.",
            "La búsqueda SRI requiere conexión a internet y una identificación válida de 10 o más digitos.",
            "El cliente 'Consumidor Final' es obligatorio en el sistema y no puede eliminarse.",
            "Los datos registrados aquí se usan en toda la plataforma para facturación (aparecen en la búsqueda de Nueva Factura).",
        ],
    },
    {
        "numero": 5,
        "archivo": "05_productos",
        "titulo": "Maestro de Productos",
        "seccion": "Facturación y Ventas",
        "descripcion": (
            "Catálogo centralizado de productos (artículos y servicios), donde se definen precios, "
            "categorías, presentaciones multiples (subproductos), rangos de precio por volumen y "
            "el mapeo contable correspondiente. Es la base para que la facturación y el control "
            "de inventario funcionen correctamente."
        ),
        "elementos": [
            "Botón 'Nuevo Producto' (esquina superior derecha)",
            "Campo de búsqueda por nombre/código",
            "Selector de categoría (filtrado)",
            "Tabla con columnas: Código, Producto, Categoría, Precio, IVA %, Acciones",
            "Iconos de acción por fila: Presentaciones (capas), Precios por Volumen (gráfico), Editar (lápiz), Eliminar (papelera)",
        ],
        "pasos": [
            "Cree un producto nuevo: presione 'Nuevo Producto'.",
            "Ingrese el Código (máximo 25 caracteres, se convierte automáticamente a mayúscula, por ejemplo P-001).",
            "Ingrese el Nombre (obligatorio).",
            "Ingrese el Precio Venta (obligatorio, admite decimales).",
            "Seleccione el IVA % (0%, 5%, 15%).",
            "Marque 'Controlar Stock (Kardex)' si el producto manejara inventario.",
            "Seleccione la Categoría (obligatorio).",
            "Ingrese la Descripción (opcional).",
            "(Avanzado) Asigne las Cuentas Contables correspondientes si el módulo de Contabilidad esta disponible.",
            "Presione 'Guardar'.",
            "Busque un producto: escriba el nombre o código en el campo de búsqueda.",
            "Filtre por categoría: use el selector 'Todas las categorías' para filtrar.",
            "Gestione presentaciones (subproductos): presione el icono Presentaciones (capas naranjas) para abrir el panel.",
            "Presione 'Agregar presentación'.",
            "Ingrese el Nombre (por ejemplo 'Galón', 'Medio Litro').",
            "Ingrese el Precio sin IVA.",
            "Ingrese el Factor de conversión (fracción del producto maestro, por ejemplo 0.5 si es la mitad).",
            "Presione 'Guardar'. Puede activar o desactivar la presentación con el interruptor correspondiente.",
            "Configure precios por volumen: presione el icono Precios por Volumen (gráfico).",
            "Defina rangos de cantidad (desde/hasta) con su precio especial. Estos se aplicaran automáticamente al facturar en Nueva Factura.",
            "Edite un producto: presione el icono Editar (lápiz). Modifique los campos y presione 'Guardar'.",
            "Elimine un producto: presione el icono Eliminar (papelera). Se pedira confirmación.",
        ],
        "notas": [
            "Los subproductos (presentaciones) tienen factores de conversión; por ejemplo, si vende en galones y botellas, 1 galón equivale a 4 botellas (factor 0.25 por botella).",
            "Si un producto tiene subproductos, los detalles de la factura le pediran elegir la presentación.",
            "Los precios por volumen requieren una cantidad mayor a 0 para aplicarse.",
            "La opción 'Controlar Stock' determina si se actualiza el Kardex en cada factura.",
            "El mapeo contable (cuentas de Ingreso/Costo) es opcional pero recomendado para los reportes de Contabilidad.",
            "El campo Código es opcional pero recomendado para una identificación rápida.",
        ],
    },
    {
        "numero": 6,
        "archivo": "06_proveedores",
        "titulo": "Proveedores",
        "seccion": "Facturación y Ventas",
        "descripcion": (
            "Registro maestro de proveedores (empresas o personas naturales a las que la empresa "
            "compra), con datos tributarios, condiciones de pago y control de estado activo o "
            "inactivo. Esta información alimenta los módulos de compras, retenciones y reportes "
            "fiscales."
        ),
        "elementos": [
            "Botón 'Nuevo Proveedor' (esquina superior derecha)",
            "Campo de búsqueda por nombre o RUC",
            "Filtros de estado: botones ACTIVO / TODOS / INACTIVO",
            "Cuadrícula de tarjetas (3 columnas en escritorio): nombre, RUC, tipo, estado, contacto, botones de acción",
            "Cada tarjeta muestra: icono de empresa, nombre, RUC, teléfono, email, dirección, etiquetas (Tipo Proveedor, Condición Pago, Contribuyente Especial), botones Editar y Desactivar/Activar",
        ],
        "pasos": [
            "Cree un proveedor nuevo: presione 'Nuevo Proveedor'. Se abre una ventana con 3 pestanas.",
            "En la pestana 'Datos básicos': seleccione el Tipo de Identificación (RUC, Cédula, Pasaporte, Exterior).",
            "Ingrese el Número (obligatorio, máximo 13 digitos).",
            "Seleccione el Tipo de proveedor: Sociedad o Persona Natural.",
            "Seleccione el Estado: Activo o Inactivo.",
            "Ingrese la Razón social / Nombre (obligatorio).",
            "Ingrese el Nombre del encargado o contacto.",
            "Ingrese Teléfono, Email y Dirección.",
            "Ingrese Ciudad, Provincia (lista desplegable) y País.",
            "En la pestana 'Tributario / SRI': seleccione el Régimen tributario entre las opciones disponibles (General, Simplificado, etc.).",
            "Marque las casillas correspondientes si el proveedor es Contribuyente especial o Agente de retención.",
            "En la pestana 'Condiciones de pago': seleccione Contado o Crédito.",
            "Si selecciona Crédito, ingrese los Días de crédito (entre 1 y 365).",
            "Presione 'Guardar' al finalizar.",
            "Busque un proveedor: escriba el nombre o RUC en el campo de búsqueda.",
            "Filtre por estado: presione ACTIVO para ver solo los activos, TODOS para verlos todos, o INACTIVO para los inactivos.",
            "Edite un proveedor: presione el botón 'Editar' en la tarjeta. Modifique los datos en las pestanas correspondientes y presione 'Guardar'.",
            "Desactive o reactive un proveedor: presione el botón 'Desactivar' (si esta Activo) o 'Activar' (si esta Inactivo). Se pedira confirmación.",
        ],
        "notas": [
            "El RUC y el Nombre de la Empresa son obligatorios.",
            "Los datos tributarios (régimen, contribuyente especial, agente de retención) afectan la generación del ATS y de las retenciones.",
            "Condición de pago: Contado significa pago inmediato; Crédito define los días de vencimiento de las facturas.",
            "Los proveedores inactivos no aparecen en las busquedas de compras, pero se conservan en el historial.",
            "Se pueden tener multiples proveedores con diferentes regimenes y condiciones de pago.",
        ],
    },
    {
        "numero": 8,
        "archivo": "07_inventario",
        "titulo": "Ingreso de Inventario",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Módulo para registrar las compras de productos a proveedores y actualizar el "
            "inventario automáticamente. Cada ingreso genera, al mismo tiempo, una cuenta por "
            "pagar asociada al proveedor."
        ),
        "elementos": [
            "Formulario de datos de compra: proveedor (obligatorio), número de factura, fecha de vencimiento (obligatoria), observaciones",
            "Tabla de productos: selector de producto, cantidad, costo unitario, porcentaje de IVA (0%, 5% o 15%)",
            "Cálculo automático: subtotal sin IVA, total IVA, total general",
            "Botón 'Agregar Producto' y botón 'Registrar Ingreso'",
            "Panel lateral: historial de ingresos recientes con monto y proveedor",
        ],
        "pasos": [
            "Seleccione un Proveedor en el campo correspondiente (obligatorio).",
            "Ingrese (opcional) el Número de Factura del proveedor (por ejemplo 001-001-000123).",
            "Seleccione la Fecha de Vencimiento de la factura (obligatoria; afecta la cuenta por pagar).",
            "Agregue sus Observaciones si es necesario.",
            "Haga clic en 'Agregar Producto' para incluir cada artículo.",
            "En cada fila de producto, seleccione el producto del listado desplegable.",
            "Ingrese la Cantidad recibida.",
            "Ingrese el Costo Unitario.",
            "Elija el IVA % (0%, 5% o 15%).",
            "Verifique el cálculo: el sistema muestra el subtotal, el IVA y el total automáticamente.",
            "Haga clic en 'Registrar Ingreso' para guardar.",
        ],
        "notas": [
            "Todos los campos requeridos están marcados con un asterisco rojo (*).",
            "Debe agregar al menos un producto válido (con cantidad y costo mayores a 0) antes de registrar.",
            "Se registran dos documentos de forma simultánea: el ingreso de inventario y la cuenta por pagar.",
            "La fecha de ingreso se asigna automáticamente (la fecha actual).",
        ],
    },
    {
        "numero": 9,
        "archivo": "08_inventario_valorizado",
        "titulo": "Inventario Valorado",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Reporte del inventario con valoración (costo total de cada producto en stock), con "
            "opciones para consultar por fecha histórica, bodega específica o categoría de "
            "productos. Permite conocer cuanto vale el inventario disponible en cualquier momento."
        ),
        "elementos": [
            "Filtros: tipo de costo (Costo Promedio o Último Costo), categoría, bodega (si existen), mostrar código, fecha de corte y botón 'Aplicar'",
            "Botones: 'Actualizar', 'Excel', 'Imprimir'",
            "Tarjetas de resumen: número de artículos, unidades en stock, valor total",
            "Tabla con columnas: Código (opcional), Descripción, Categoría, Costo (Promedio o Último), Cantidad, Costo Total",
        ],
        "pasos": [
            "Seleccione el Tipo de Valoración: 'Costo Promedio' (recomendado) o 'Último Costo'.",
            "Filtre por Categoría (por defecto 'Todas').",
            "Si su empresa tiene bodegas, seleccione una Bodega o deje 'Todas las bodegas'.",
            "Active o desactive la columna Código con el interruptor correspondiente.",
            "Modifique la Fecha de Corte (por defecto la fecha actual) para ver el inventario en una fecha pasada.",
            "Haga clic en 'Aplicar' para actualizar los datos.",
            "Consulte la tabla y los totales (artículos, unidades, valor total resaltado en rojo).",
            "Para exportar: haga clic en 'Excel' para descargar un archivo .xlsx.",
            "Para imprimir: haga clic en 'Imprimir' para ver la versión imprimible.",
        ],
        "notas": [
            "La fecha de corte permite consultar como era el inventario en fechas pasadas (basado en el kardex).",
            "Si selecciona una bodega, solo se muestra el stock de esa bodega.",
            "El archivo Excel incluye una fila de TOTALES al final.",
            "Los productos sin stock en la bodega seleccionada se filtran automáticamente.",
        ],
    },
    {
        "numero": 10,
        "archivo": "09_kardex",
        "titulo": "Kardex de Inventario",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Historial detallado de todos los movimientos (entradas y salidas) de un producto "
            "específico, con saldo acumulado y costo unitario en cada movimiento. Permite "
            "rastrear con precisión como ha variado el stock de un artículo a lo largo del "
            "tiempo."
        ),
        "elementos": [
            "Filtros: selector de producto (obligatorio), bodega, fechas de inicio y fin",
            "Botón 'Consultar' (se habilita cuando hay un producto seleccionado)",
            "Botones: 'Excel', 'Imprimir' (solo si hay movimientos)",
            "Tarjetas de resumen: stock actual en bodega/total, costo promedio, valor en stock, totales del período (entradas/salidas)",
            "Tabla con columnas: Fecha, Bodega (si se eligio todas), Tipo (Entrada/Salida), Motivo, Documento, Entrada, Salida, Saldo, Costo Unit., Valor Total",
        ],
        "pasos": [
            "Seleccione el Producto del listado desplegable (obligatorio); se mostrara el stock actual.",
            "(Opcional) Seleccione una Bodega o deje 'Todas las bodegas'.",
            "Ingrese la Fecha Inicio del rango a consultar (por defecto, el primer día del mes actual).",
            "Ingrese la Fecha Fin (por defecto, la fecha actual).",
            "Haga clic en 'Consultar' para cargar el kardex.",
            "Revise las tarjetas de resumen (stock, costo promedio, valor en stock).",
            "Consulte la tabla de movimientos en orden cronológico.",
            "Para exportar: haga clic en 'Excel' (disponible solo si hay movimientos).",
            "Para imprimir: haga clic en 'Imprimir'.",
        ],
        "notas": [
            "El saldo mostrado es acumulativo en orden cronológico (saldo inicial más los movimientos del período).",
            "Si no hay movimientos en el rango seleccionado, aparece un mensaje 'Sin movimientos'.",
            "La columna 'Bodega' solo se muestra si se selecciono 'Todas las bodegas'.",
            "Las columnas 'Costo Unit.' y 'Valor Total' pueden estar vacias si el movimiento no tiene costo registrado.",
        ],
    },
    {
        "numero": 11,
        "archivo": "10_vendedores",
        "titulo": "Vendedores",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Módulo para la gestión del equipo de vendedores: crear, editar, dar de baja y "
            "reactivar. Los vendedores se asocian a las transacciones de venta y permiten "
            "analizar el rendimiento de cada uno en los reportes."
        ),
        "elementos": [
            "Botón 'Nuevo Vendedor'",
            "Filtros: 'Activos', 'Dados de baja', 'Todos'",
            "Tabla con columnas: Nombre, Iniciales (círculo de color con siglas), Email, Teléfono, Estado (etiqueta verde/roja)",
            "Botones por fila: Editar, Dar de baja (para activos) / Reactivar (para dados de baja)",
            "Ventana de creación/edición con campos: Nombre (obligatorio), Iniciales, Email, Teléfono",
        ],
        "pasos": [
            "Haga clic en 'Nuevo Vendedor' para crear uno.",
            "En la ventana que aparece, ingrese el Nombre (obligatorio).",
            "Ingrese las Iniciales (máximo 4 caracteres; se convierten a mayusculas automáticamente).",
            "Ingrese el Email (opcional).",
            "Ingrese el Teléfono (opcional).",
            "Haga clic en 'Guardar' para registrar.",
            "Para editar: haga clic en el icono de lápiz en la fila del vendedor.",
            "Para dar de baja: haga clic en el icono de usuario tachado; confirme en el diálogo.",
            "Para reactivar un vendedor dado de baja: haga clic en el icono de marca de verificación verde.",
            "Use los filtros ('Activos', 'Dados de baja') para ver solo los que necesita.",
        ],
        "notas": [
            "Los vendedores dados de baja se muestran con 50% de opacidad en la tabla.",
            "El historial de facturas asociadas a un vendedor se preserva al darlo de baja.",
            "Las iniciales se usan para mostrar avatares en las transacciones.",
        ],
    },
    {
        "numero": 13,
        "archivo": "11_cartera_cxc",
        "titulo": "Cartera por Cobrar",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Módulo para la gestión de facturas a crédito pendientes de cobro. Permite registrar "
            "abonos (pagos individuales o multiples), imprimir comprobantes, revertir pagos y "
            "generar los asientos contables automáticos correspondientes."
        ),
        "elementos": [
            "Filtros de estado: 'Activos (Pendiente+Parcial)', 'Pendiente', 'Parcial', 'Pagada', 'Todos'",
            "Buscador de cliente (por nombre o identificación)",
            "Botones: 'Cobro a Cliente' (pago multi-factura), 'Imprimir Cartera'",
            "Tarjetas de resumen: número de facturas, valor original total, saldo pendiente",
            "Tabla expandible con: Factura, Cliente, Emisión, Vencimiento, Original, Saldo, Estado",
            "Botón 'Abonar' por factura (solo si esta pendiente o parcial)",
            "Al expandir: historial de pagos con método, referencia, valor, estado contable",
        ],
        "pasos": [
            "Para un pago individual: haga clic en 'Abonar' en la fila de la factura.",
            "Ingrese el Valor del abono (como máximo, el saldo pendiente).",
            "Seleccione el Método de pago: Efectivo, Transferencia, Cheque, Tarjeta, Nota de Crédito, Otros.",
            "Si es cheque, ingrese el Banco emisor del cheque.",
            "Si es transferencia, seleccione la Cuenta destino de la empresa y, opcionalmente, una referencia.",
            "Ingrese la Referencia o número de comprobante.",
            "Haga clic en 'Registrar y Comprobante' para guardar e imprimir el recibo.",
            "Para un pago múltiple (varias facturas): haga clic en el botón 'Cobro a Cliente'.",
            "Busque y seleccione el cliente por nombre o RUC.",
            "Vera sus facturas pendientes con sus saldos.",
            "Ingrese el Valor total a pagar.",
            "El sistema distribuye automáticamente el monto siguiendo el orden FIFO (primero las facturas más antiguas).",
            "Seleccione el Método de pago y los datos asociados.",
            "Haga clic en 'Registrar y Comprobante'.",
            "Gestión avanzada: expanda una factura para ver el Historial de pagos.",
            "Si un pago tiene estado 'Sin asiento', haga clic en 'Generar' para crear el asiento contable.",
            "Para reversar un pago: haga clic en 'Reversar', ingrese el motivo y confirme.",
        ],
        "notas": [
            "Las facturas vencidas se destacan en rojo; el sistema muestra cuantos días están vencidas.",
            "El comprobante se imprime en dos formatos: A4 (completo) y 80mm (ticket).",
            "Si la contabilidad en línea esta desactivada, aparece una advertencia que no bloquea la operación.",
            "La reversión de un pago anula el asiento contable vinculado y restaura el saldo de la factura.",
            "El método de pago 'Nota de Crédito' permite aplicar notas de crédito contra facturas.",
        ],
    },
    {
        "numero": 14,
        "archivo": "12_estado_cuenta_cliente",
        "titulo": "Estado de Cuenta por Cliente",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Permite consultar el historial completo de facturas y pagos de un cliente "
            "específico, mostrando los saldos pendientes y el detalle de los pagos registrados. "
            "Es útil para responder consultas de clientes sobre su cuenta y para dar seguimiento "
            "a la cartera."
        ),
        "elementos": [
            "Buscador de cliente (por nombre o identificación; con autocompletado)",
            "Lista desplegable de los primeros 20 clientes si no hay búsqueda",
            "Tarjetas de resumen (cuando hay cliente seleccionado): nombre/RUC, número de facturas, total pagado, saldo pendiente",
            "Botón 'Imprimir Estado de Cuenta'",
            "Tabla expandible con: No. Factura, Emisión, Vencimiento, Valor, Pagado, Saldo, Estado",
            "Al expandir cada factura: detalle de los pagos registrados (fecha, método, referencia, valor)",
        ],
        "pasos": [
            "En el campo 'Seleccionar cliente', escriba el nombre o RUC del cliente para filtrar.",
            "Seleccione de la lista que aparece, o si no hay búsqueda, haga clic en un cliente de la lista rápida que se muestra abajo.",
            "El sistema carga el estado de cuenta del cliente, mostrando tarjetas con los totales: facturas, pagado, saldo pendiente.",
            "Se muestra también la tabla con todas las facturas del cliente.",
            "Haga clic en una fila de factura para expandirla y ver el Historial de pagos.",
            "Cada pago muestra: fecha, método (efectivo, transferencia, etc.), referencia, valor.",
            "Para imprimir: haga clic en 'Imprimir Estado de Cuenta'. Se abrira una ventana con el reporte en PDF.",
            "Para limpiar la búsqueda: haga clic en el icono de X o borre el campo.",
        ],
        "notas": [
            "Si el cliente no tiene facturas registradas, aparece un mensaje indicandolo.",
            "Las facturas pagadas se destacan con fondo verde claro.",
            "El saldo pendiente aparece en rojo si es mayor a 0, y en verde si la factura esta pagada.",
            "El estado mostrado puede ser: 'pendiente', 'parcial' (con abonos) o 'pagada'.",
        ],
    },
    {
        "numero": 15,
        "archivo": "13_notas_credito",
        "titulo": "Notas de Crédito",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Módulo para la gestión de notas de crédito (devoluciones, descuentos, correcciones) "
            "autorizadas por el SRI. Permite crear nuevas notas, reintentar envíos al SRI, "
            "imprimir el comprobante RIDE y descargar el archivo XML."
        ),
        "elementos": [
            "Botón 'Nueva Nota de Crédito' (abre el formulario para emitir una nueva)",
            "Tarjetas de estadisticas: Autorizadas, Pendientes, Rechazadas, Monto Total (de notas de crédito autorizadas)",
            "Buscador: por número de nota de crédito, cliente o factura origen",
            "Tabla con: Secuencial NC, Factura Origen, Cliente, Tipo/Motivo, Fecha, Total, Estado SRI",
            "Botones por fila: Reintentar (si no esta autorizada), Imprimir RIDE 80mm, Ver RIDE A4, Descargar XML (si esta firmado)",
            "Fila adicional: muestra mensajes del SRI o resultados de reintentos",
        ],
        "pasos": [
            "Para crear una nota de crédito: haga clic en 'Nueva Nota de Crédito'.",
            "Siga el flujo de captura: seleccione la factura origen, el tipo de nota, el motivo, los productos, etc.",
            "Para reintentar el envío al SRI: si una nota de crédito esta en estado 'PENDIENTE' o 'RECHAZADO', vera el botón de reintentar.",
            "Haga clic en el icono de actualizar para reenviar al SRI; el sistema actualizara el estado automáticamente.",
            "Si es una devolución y se autoriza, el inventario se actualiza automáticamente.",
            "Para imprimir el comprobante RIDE: haga clic en el icono de impresora para el formato 80mm (ticket).",
            "O haga clic en el icono de archivo para ver el RIDE en formato A4 (completo). Se abrira en una ventana nueva para imprimir.",
            "Para descargar el XML: haga clic en el icono de descarga. Solo esta disponible si la nota de crédito esta firmada.",
            "Use el buscador para filtrar por número de nota de crédito, cliente o factura relacionada.",
        ],
        "notas": [
            "Los estados SRI son: PENDIENTE (gris), ENVIADO (naranja), AUTORIZADO (verde), RECHAZADO (rojo).",
            "Si es una nota de crédito de devolución y se autoriza, el sistema genera automáticamente un movimiento de ENTRADA en el kardex.",
            "Los tipos de nota de crédito son: Devolución, Descuento, Corrección.",
            "El archivo XML solo se puede descargar si el documento esta firmado.",
        ],
    },
    {
        "numero": 16,
        "archivo": "14_anulacion_facturas",
        "titulo": "Anulación de Facturas",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Módulo para la gestión de anulación de facturas. Permite anular facturas vigentes "
            "(marcandolas como no válidas), revertir los pagos asociados y acceder a los datos "
            "del SRI necesarios para reportar la anulación en el portal oficial del SRI."
        ),
        "elementos": [
            "Buscador: por factura, cliente o identificación",
            "Filtros: 'Vigentes', 'Anuladas', 'Todas'",
            "Tabla con: Factura (tachada si anulada), Fecha, Cliente, Total, Estado SRI, Sistema (VIGENTE/ANULADA)",
            "Botón 'Anular' por fila (solo disponible para facturas vigentes)",
            "Al expandir: datos SRI (factura, autorización, RUC del cliente, clave de acceso) para copiar; cartera y pagos registrados",
        ],
        "pasos": [
            "Busque la factura por número, cliente o identificación.",
            "Use los filtros para ver las facturas 'Vigentes' (sin anular) o 'Anuladas'.",
            "Haga clic en 'Anular' en la fila de la factura que desea anular.",
            "En la ventana que aparece, lea la advertencia: la acción es irreversible.",
            "Si la factura tiene pagos, expanda la fila original para revertir cada pago antes de anular.",
            "Ingrese el Motivo de anulación (obligatorio; por ejemplo 'Error en datos', 'Devolución', 'Duplicado').",
            "Haga clic en 'Confirmar Anulación'.",
            "La factura aparecera tachada con el estado ANULADA.",
            "Al expandir una factura anulada, vera los datos SRI (puede copiar el número de factura, autorización, etc.).",
            "Use esta información para reportar la anulación en el portal del SRI del Ecuador.",
            "Aparecera el motivo de anulación y la fecha/hora correspondiente.",
        ],
        "notas": [
            "No se puede anular una factura si tiene pagos pendientes: debe revertir todos los pagos antes.",
            "Los botones de copiar le permiten copiar rápidamente los datos para el portal del SRI.",
            "Las facturas anuladas se excluyen de los totales de ventas en los reportes.",
            "La fecha de anulación se registra automáticamente.",
            "Si la factura aun no esta autorizada por el SRI, aparece 'No autorizada' en el campo de autorización.",
        ],
    },
    {
        "numero": 18,
        "archivo": "15_cierres",
        "titulo": "Historial de Cierres de Caja",
        "seccion": "Consultas, Compras y Cartera por Pagar",
        "descripcion": (
            "Pantalla de consulta del histórico de cierres y arqueos de caja realizados. Permite "
            "visualizar los detalles de cada cierre (base inicial, recaudado, total) y gestionar "
            "el registro de turnos completados por los cajeros."
        ),
        "elementos": [
            "Campo de búsqueda por nombre de cajero",
            "Tabla con columnas: Fecha Apertura, Cajero, Estado (abierta/cerrada), Base Fija, Recaudado, Total Caja",
            "Botón de eliminar registro (icono de papelera) para cada cierre",
            "Estados visuales: las cajas 'abierta' se muestran en verde, 'cerrada' en gris",
        ],
        "pasos": [
            "La pantalla carga automáticamente el historial de todos los cierres de la empresa, ordenados por fecha más reciente.",
            "Use el campo 'Buscar por cajero...' para filtrar los cierres por nombre del vendedor.",
            "Observe la tabla: cada fila muestra la fecha y hora de apertura y cierre, el nombre del cajero, el estado y los montos de caja.",
            "Para eliminar un cierre: haga clic en el icono de papelera en la columna Acciones y confirme en el diálogo de advertencia.",
            "El total de caja equivale a la base inicial más lo recaudado (suma de efectivo, tarjetas, transferencias y otros pagos).",
        ],
        "notas": [
            "Los administradores de plataforma no pueden ver el historial de otros usuarios (acceso restringido por empresa).",
            "El botón de eliminar requiere confirmación explícita antes de ejecutarse.",
            "Esta es solo una vista de consulta; el registro de nuevos cierres se realiza desde otra pantalla (Caja/Tesorería).",
        ],
    },
    {
        "numero": 19,
        "archivo": "16_consulta_ventas",
        "titulo": "Ventas por Período",
        "seccion": "Consultas, Compras y Cartera por Pagar",
        "descripcion": (
            "Reporte de consulta de facturas emitidas en un rango de fechas. Detalla el desglose "
            "de bases de IVA, impuestos, formas de pago y estado de autorización del SRI de cada "
            "factura."
        ),
        "elementos": [
            "Filtros: rango de fechas (Desde/Hasta), filtro por vendedor",
            "Tabla con columnas: Nro Factura, Fecha, Cliente, Vendedor, Base IVA, Base 0%, Suma Bases, IVA, Total, Efectivo, Tarjeta, Transferencia, Cheque, Crédito, Otros, Estado SRI",
            "Fila de totales al pie de la tabla",
            "Botones: Consultar, Excel (descarga), Imprimir",
        ],
        "pasos": [
            "Defina el rango de fechas: por defecto, desde el día 1 del mes en curso hasta hoy.",
            "Opcionalmente, seleccione un vendedor específico en el listado desplegable 'Vendedor' (dejelo vacio para incluir a todos).",
            "Haga clic en 'Consultar' para ejecutar la búsqueda.",
            "Revise la tabla: las facturas anuladas se muestran con fondo rojo y el número tachado.",
            "Use 'Excel' para descargar los datos en formato XLSX.",
            "Use 'Imprimir' para abrir la vista de impresión con encabezado y totales.",
        ],
        "notas": [
            "Las facturas ANULADAS muestran 0 en todas las columnas de dinero (no se contabilizan).",
            "El estado SRI puede ser: AUTORIZADO (verde), PENDIENTE (amarillo), RECHAZADO (rojo).",
            "Los totales incluyen únicamente las facturas vigentes (no anuladas).",
            "Si no hay resultados, se muestra un mensaje indicando que seleccione un período e intente nuevamente.",
        ],
    },
    {
        "numero": 21,
        "archivo": "17_cxp",
        "titulo": "Cuentas por Pagar",
        "seccion": "Consultas, Compras y Cartera por Pagar",
        "descripcion": (
            "Permite dar seguimiento a todas las obligaciones pendientes con proveedores. "
            "Muestra las facturas de compra con su estado de pago (pendiente, parcialmente "
            "pagado, pagado) y permite consultar el historial de pagos de cada cuenta."
        ),
        "elementos": [
            "Tres tarjetas de resumen: Total pendiente, Total vencido, Cantidad de documentos",
            "Filtros: botones para Pendientes, Vencidas, Todas",
            "Tabla expandible con columnas: Proveedor, Factura, Emisión, Vencimiento, Original, Saldo, Estado",
            "Icono de flecha para expandir/contraer el detalle de pagos de cada fila",
            "Mensaje informativo sobre donde registrar pagos (en Tesorería)",
        ],
        "pasos": [
            "Observe las tarjetas de resumen para una vista rápida del estado de pagos.",
            "Use los botones de filtro: 'Pendientes' (no pagadas ni anuladas), 'Vencidas' (con fecha de vencimiento anterior a hoy), o 'Todas'.",
            "Haga clic en cualquier fila de la tabla para expandirla y ver el 'Historial de pagos'.",
            "En el detalle expandido, visualice cada pago registrado: fecha, forma de pago (efectivo/transferencia/etc.), referencia, monto y estado contable.",
            "Para registrar un nuevo pago, vaya a 'Tesorería > Nuevo Egreso' (enlace en el mensaje informativo).",
        ],
        "notas": [
            "Los pagos se generan desde Tesorería, no desde esta pantalla (esta pantalla es solo de consulta).",
            "Las facturas vencidas se resaltan con fondo rojo y un símbolo de advertencia.",
            "El estado del asiento contable puede ser: 'Contabilizado', 'Sin asiento' o 'Reversado'.",
            "Los estados de Cuentas por Pagar son: PENDIENTE, PARCIALMENTE_PAGADO, PAGADO, ANULADO.",
        ],
    },
    {
        "numero": 22,
        "archivo": "18_compras",
        "titulo": "Compras (Inventario y Servicios)",
        "seccion": "Consultas, Compras y Cartera por Pagar",
        "descripcion": (
            "Gestión centralizada de compras a proveedores. Permite consultar, filtrar, anular y "
            "ver el detalle de todas las compras de inventario y servicios. Incluye opciones de "
            "exportación a Excel e impresión."
        ),
        "elementos": [
            "Campo de búsqueda: factura, proveedor, clave de acceso",
            "Botón 'Filtros' desplegable con opciones: Tipo (Inventario/Servicio), Estado (Activo/Anulado/Devuelto), Proveedor, Desde, Hasta",
            "Cuatro tarjetas de resumen: Total comprado, IVA en compras, cantidad Inventario, cantidad Servicios",
            "Tabla con columnas: Fecha, Tipo, Proveedor, Factura, Base, IVA, Total, Pago, Estado",
            "Acciones: ver detalle en ventana (icono de ojo), anular (icono de prohibido), ver motivo de anulación (icono de información)",
            "Fila de totales al pie",
            "Botones: Imprimir, Exportar XLSX",
        ],
        "pasos": [
            "Use el campo de búsqueda rápida en la parte superior para hallar una factura o proveedor específico.",
            "Haga clic en 'Filtros' para expandir las opciones avanzadas (tipo, estado, proveedor, rango de fechas).",
            "Aplique los filtros deseados y haga clic en 'Aplicar filtros' para actualizar la tabla.",
            "Para ver el detalle completo de una compra: haga clic en el icono de ojo. Se abrira una ventana con toda la información.",
            "Para anular una compra activa: haga clic en el icono de prohibido, ingrese el motivo cuando se le solicite y confirme.",
            "Descargue a Excel con el botón 'Exportar XLSX' o visualice la impresión con 'Imprimir'.",
        ],
        "notas": [
            "Las compras anuladas aparecen con opacidad reducida (50%) en la tabla.",
            "El detalle muestra: datos del comprobante, items (de inventario o servicios), retenciones aplicadas y datos de la cuenta por pagar si existe.",
            "Solo se pueden anular compras en estado ACTIVO (no las ya anuladas o devueltas).",
            "El tipo de sustento (ATS) se identifica por código (01-05); la forma de pago puede ser CONTADO o CRÉDITO con fecha de vencimiento.",
        ],
    },
    {
        "numero": 23,
        "archivo": "19_compras_nueva_inventario",
        "titulo": "Nueva Compra de Inventario",
        "seccion": "Consultas, Compras y Cartera por Pagar",
        "descripcion": (
            "Formulario para registrar una nueva factura de compra de inventario con ingreso "
            "automático al kardex. Permite agregar productos, calcular impuestos, registrar "
            "retenciones y generar el asiento contable correspondiente."
        ),
        "elementos": [
            "Botón Atrás (flecha) para regresar al listado de compras",
            "Sección opcional: Vincular Orden de Compra (carga automáticamente proveedor y productos)",
            "Sección 'Datos del comprobante': Proveedor (obligatorio), Bodega (obligatorio), Fecha emisión, campos Establecimiento/Punto de Emisión/Secuencial, Número de Factura (automático), Clave de acceso, Tipo de sustento, Forma de pago, Fecha de vencimiento (si es crédito), Observaciones",
            "Sección 'Productos': tabla con Producto, Cantidad, Costo unitario, Subtotal, más el botón 'Agregar' y el botón de eliminar por fila",
            "Sección 'Impuestos': casilla para ingresar bases manualmente o usar el cálculo automático",
            "Sección 'Retenciones': panel desplegable con editor de retenciones (tipo, código, base, porcentaje, valor)",
            "Resumen de totales: Subtotal, IVA, Total retenciones, Total factura",
            "Botones: Cancelar, Registrar compra",
        ],
        "pasos": [
            "Si hay ordenes de compra pendientes, seleccione una en 'Vincular Orden de Compra' (carga automáticamente el proveedor y los productos).",
            "Complete los 'Datos del comprobante': seleccione el Proveedor (obligatorio).",
            "Seleccione la Bodega destino (obligatorio).",
            "Ingrese la Fecha de emisión.",
            "Complete Establecimiento, Punto de Emisión y Secuencial (el Número de Factura se genera automáticamente).",
            "Opcionalmente, ingrese la Clave de acceso y el Tipo de sustento (ATS), y seleccione la Forma de pago.",
            "Si la Forma de pago es Crédito, ingrese la Fecha de vencimiento (obligatoria).",
            "En 'Productos': haga clic en 'Agregar', seleccione el producto, la cantidad y el costo unitario. Repita para más líneas.",
            "En 'Impuestos': mantenga la casilla desmarcada para el cálculo automático (15%), o marquela para ingresar las bases manualmente desde la factura.",
            "Opcionalmente, en 'Retenciones': expanda la sección y agregue las retenciones (tipo, código, base, porcentaje).",
            "Revise el resumen de totales y haga clic en 'Registrar compra'.",
            "El sistema genera el asiento contable automático (si la Contabilidad en línea esta activa).",
        ],
        "notas": [
            "Los campos marcados con asterisco son obligatorios.",
            "La bodega marcada como principal se preselecciona automáticamente.",
            "Si el proveedor tiene condición de pago CRÉDITO en su ficha, la forma de pago se preselecciona automáticamente como CRÉDITO.",
            "Si falla la generación del asiento contable, la compra se guarda igualmente, pero se muestra una alerta (revisar la sección de Ajustes de Contabilidad).",
            "El formulario conserva los datos como borrador en la sesión si abandona la pantalla y regresa sin guardar.",
        ],
    },
    {
        "numero": 24,
        "archivo": "20_estado_cuenta_proveedor",
        "titulo": "Estado de Cuenta por Proveedor",
        "seccion": "Consultas, Compras y Cartera por Pagar",
        "descripcion": (
            "Reporte detallado del movimiento de cuentas por pagar con un proveedor específico. "
            "Muestra el historial de facturas, pagos y retenciones, con el saldo corriente. "
            "Incluye opciones de impresión y exportación a Excel."
        ),
        "elementos": [
            "Filtros: Proveedor (obligatorio, listado desplegable), Desde, Hasta (rango de fechas)",
            "Botón 'Generar estado de cuenta'",
            "Tarjeta de resumen con datos del proveedor: Razón social, RUC, Totales (Cargos, Abonos, Saldo final)",
            "Tabla con columnas: Fecha, Tipo (Factura/Pago/Retención), Descripción, Cargo (+), Abono (-), Saldo",
            "Fila de totales al pie",
            "Botones: Exportar Excel, Imprimir",
        ],
        "pasos": [
            "Seleccione un Proveedor en el listado desplegable (obligatorio).",
            "Defina el rango de fechas (Desde/Hasta); por defecto, desde el 1 de enero del año hasta hoy.",
            "Haga clic en 'Generar estado de cuenta'.",
            "Una vez generado, observe la tarjeta resumen con los datos del proveedor y los totales del período.",
            "Revise la tabla con los movimientos ordenados cronológicamente.",
            "Cada tipo de movimiento se identifica con una etiqueta de color: Factura (rojo), Pago (verde), Retención (azul).",
            "Revise la columna 'Saldo' para ver el saldo acumulado en cada fecha.",
            "Exporte a Excel con el botón 'Excel' o imprima con el botón 'Imprimir' (genera un reporte con formato listo para impresión).",
        ],
        "notas": [
            "Solo se incluyen compras con estado ACTIVO (no anuladas).",
            "Las facturas de CONTADO no generan saldo (cargo = 0, no afectan la cuenta por pagar).",
            "Solo las facturas de CRÉDITO generan cargo en el saldo adeudado.",
            "Los abonos incluyen tanto los pagos como las retenciones aplicadas.",
            "El saldo se calcula de forma corriente: saldo anterior más cargo menos abono.",
            "Si el saldo final es mayor a 0, se indica 'Saldo pendiente' (en amarillo/ámbar); si es menor o igual a 0, se indica 'Al día' (en verde).",
            "El reporte impreso incluye el encabezado de la empresa, la ficha detallada del proveedor, la tabla, una caja de resumen y el pie de página.",
        ],
    },
    {
        "numero": 25,
        "archivo": "21_teso_cuentas_bancarias",
        "titulo": "Gestión de Cuentas Bancarias",
        "seccion": "Tesorería",
        "descripcion": (
            "Módulo para registrar y administrar todas las cuentas bancarias de la empresa, "
            "vinculandolas con el banco, indicando su tipo (corriente o ahorros), saldo inicial, "
            "y configurando el talonario de cheques para las cuentas corrientes."
        ),
        "elementos": [
            "Botón 'Nueva cuenta' (esquina superior derecha)",
            "Tabla con columnas: Banco, Número de cuenta, Tipo, Saldo inicial, Cuenta Contable, Estado, Acciones (editar)",
            "Contador de cuentas activas frente al total",
            "Ventana de creación/edición con campos para banco, número de cuenta, tipo, saldo inicial, fecha de apertura, descripción, estado, y casilla 'Participa en conciliación'",
            "Sección especial para el talonario de cheques (solo visible si selecciona 'Corriente'): campos Desde N°, Hasta N°, Siguiente N°",
        ],
        "pasos": [
            "Haga clic en 'Nueva cuenta'.",
            "Seleccione el banco del catálogo (obligatorio).",
            "Ingrese el número de cuenta (obligatorio).",
            "Elija el tipo de cuenta: 'Corriente' o 'Ahorros'.",
            "Ingrese el saldo inicial y la fecha de apertura.",
            "Añada una descripción si lo desea.",
            "Marque 'Participa en conciliación' si desea incluir esta cuenta en futuras conciliaciones bancarias.",
            "Si selecciono 'Corriente', complete el talonario: número desde, hasta, y el próximo cheque a emitir.",
            "Haga clic en 'Crear cuenta' para guardar.",
            "Para editar una cuenta existente, haga clic en el icono de lápiz en la fila correspondiente.",
        ],
        "notas": [
            "El banco es obligatorio; debe seleccionarse de un catálogo predeterminado.",
            "Si planea usar cheques, debe marcar el tipo 'Corriente' y completar los números de secuencia de cheques.",
            "Las cuentas pueden tener tres estados: 'Activa', 'Bloqueada' o 'Cerrada'.",
            "Puede asociar la cuenta a una Cuenta Contable del módulo de Contabilidad si lo tiene configurado.",
        ],
    },
    {
        "numero": 26,
        "archivo": "22_teso_egresos",
        "titulo": "Listado de Comprobantes de Egreso",
        "seccion": "Tesorería",
        "descripcion": (
            "Pantalla principal que muestra todos los comprobantes de egreso (pagos a "
            "proveedores) emitidos, permitiendo filtrar por período y estado, buscar por número, "
            "imprimir comprobantes individuales, exportar a Excel y anular egresos si es "
            "necesario."
        ),
        "elementos": [
            "Botón 'Nuevo egreso' (navega al formulario de nuevo egreso)",
            "Filtros: fecha 'Desde', 'Hasta', 'Estado' (Todos | Emitido | Anulado), campo de búsqueda por número",
            "Botones de exportación: 'Imprimir' y 'Excel'",
            "Tarjetas de resumen: Egresos emitidos, Total del período, Anulados",
            "Tabla con columnas: Número, Fecha, Forma de pago, Cuenta bancaria, Referencia, Monto, Estado, Acciones",
            "Acciones por fila: 'Ver' (para imprimir el comprobante) y 'Anular' (para egresos emitidos)",
            "Pie de tabla con el total de emitidos",
        ],
        "pasos": [
            "Seleccione el rango de fechas en los campos 'Desde' y 'Hasta' para filtrar los egresos.",
            "Elija el estado (Todos, Emitido, Anulado) para ver egresos especificos.",
            "Busque por número de egreso en el campo 'Buscar número' si lo necesita.",
            "Haga clic en 'Imprimir' para imprimir el reporte de la lista actual.",
            "Haga clic en 'Excel' para descargar los datos en formato Excel.",
            "En la tabla, haga clic en 'Ver' para abrir e imprimir el comprobante detallado de un egreso.",
            "Si el egreso esta en estado 'Emitido', puede hacer clic en 'Anular' para anularlo (requiere motivo).",
            "Haga clic en 'Nuevo egreso' para crear un nuevo comprobante de egreso.",
        ],
        "notas": [
            "Al anular un egreso se revierte automáticamente el movimiento bancario y se reabren las cuentas por pagar relacionadas.",
            "Debe ingresar un motivo de anulación obligatoriamente.",
            "Solo los egresos en estado 'Emitido' pueden ser anulados.",
            "Los egresos anulados aparecen con opacidad reducida en la tabla.",
        ],
    },
    {
        "numero": 27,
        "archivo": "23_teso_egresos_nuevo",
        "titulo": "Crear Nuevo Comprobante de Egreso",
        "seccion": "Tesorería",
        "descripcion": (
            "Formulario de 3 pasos para registrar un nuevo pago a proveedor: primero "
            "seleccionar el proveedor, luego elegir las facturas pendientes a pagar y los "
            "anticipos a cruzar, y finalmente indicar la forma de pago y los datos bancarios o "
            "de cheque."
        ),
        "elementos": [
            "Indicador visual de pasos completados (1. Proveedor | 2. Facturas | 3. Pago)",
            "Paso 1: campo de búsqueda de proveedor con filtro por nombre o RUC, lista desplegable con proveedores activos, botón 'Continuar'",
            "Paso 2: lista de facturas pendientes del proveedor con casilla de selección, campo de monto a pagar editable, sección 'Anticipos disponibles' para cruzar con casilla y montos, botones 'Volver' y 'Continuar', resumen de montos",
            "Paso 3: selector 'Forma de pago' (Transferencia, Cheque, Cheque postfechado, Efectivo, etc.), selector de 'Cuenta bancaria origen', campos de cheque (número, beneficiario, fecha de cobro si es postfechado), campos 'Número de referencia' y 'Concepto/Detalle', resumen final, botones 'Volver' y 'Confirmar egreso'",
        ],
        "pasos": [
            "Escriba o filtre el nombre/RUC del proveedor en el campo de búsqueda (Paso 1).",
            "Seleccione el proveedor de la lista desplegable.",
            "Haga clic en 'Continuar' para avanzar al Paso 2.",
            "Marque la casilla de cada factura pendiente que desea pagar (Paso 2).",
            "Edite el 'Monto a pagar' si no desea pagar el saldo total de la factura.",
            "Opcionalmente, marque los anticipos disponibles para cruzar contra este pago.",
            "Verifique el resumen: subtotal de facturas, anticipos a deducir, y total a pagar en banco.",
            "Haga clic en 'Continuar' para ir al Paso 3.",
            "Seleccione la 'Forma de pago' (transferencia, cheque, etc.).",
            "Si requiere cuenta bancaria (transferencia o cheque), seleccione la 'Cuenta bancaria origen'.",
            "Si elige cheque, ingrese el 'Número de cheque' (se autocompleta con la siguiente secuencia disponible).",
            "Ingrese el 'Beneficiario' (se prellena con el nombre del proveedor).",
            "Si es postfechado, marque la casilla correspondiente y especifique la 'Fecha de cobro'.",
            "Opcionalmente, ingrese el 'Número de referencia' (para transferencias, el código de referencia).",
            "Ingrese un 'Concepto/Detalle' si desea especificarlo (se genera automáticamente si lo deja vacio).",
            "Revise el resumen final y haga clic en 'Confirmar egreso'.",
        ],
        "notas": [
            "El sistema autocompleta el número de cheque según la secuencia configurada en la cuenta bancaria.",
            "Los anticipos disponibles solo aparecen si el proveedor tiene anticipos sin aplicar.",
            "Al confirmar, el sistema crea automáticamente el egreso, registra los cheques si aplica, incrementa la secuencia de cheques, aplica los anticipos cruzados y genera el asiento contable (si esta configurado).",
            "El comprobante se crea directamente como 'Emitido' (no existe un estado de borrador en este flujo).",
            "Si hay un aviso de configuración contable pendiente, se muestra al finalizar, pero el pago se registra de todas formas.",
        ],
    },
    {
        "numero": 28,
        "archivo": "24_teso_cheques",
        "titulo": "Gestión de Cheques Emitidos",
        "seccion": "Tesorería",
        "descripcion": (
            "Pantalla que lista todos los cheques emitidos para control, permitiendo filtrar por "
            "cuenta bancaria y estado, marcarlos como cobrados indicando la fecha real de cobro, "
            "anular cheques, e imprimir o exportar el listado."
        ),
        "elementos": [
            "Botones 'Imprimir' y 'Excel' (esquina superior)",
            "Filtros: 'Cuenta' (Todas | seleccione una cuenta bancaria) y 'Estado' (Todos | Emitido | Cobrado | Anulado | En tránsito)",
            "Tabla con columnas: N° Cheque, Cuenta, Beneficiario, Fecha Emisión, Fecha Cobro, Monto, Postfechado, Estado, Acciones",
            "Acciones por fila (solo si esta en 'Emitido'): 'Cobrado' (marca como cobrado) y 'Anular'",
            "Ventana 'Marcar cheque cobrado' con campo de fecha de cobro real",
            "Ventana 'Anular cheque' con campo de motivo/notas",
        ],
        "pasos": [
            "Use los filtros de 'Cuenta' y 'Estado' para ver cheques especificos.",
            "Haga clic en 'Imprimir' para imprimir el reporte de los cheques visibles.",
            "Haga clic en 'Excel' para exportar los datos a un archivo Excel.",
            "Para marcar un cheque como cobrado: haga clic en el botón 'Cobrado' en la fila del cheque.",
            "Ingrese la 'Fecha de cobro real'.",
            "Haga clic en 'Confirmar cobro'.",
            "Para anular un cheque: haga clic en el botón 'Anular' en la fila del cheque.",
            "Ingrese el 'Motivo / Notas' (opcional).",
            "Haga clic en 'Anular cheque'.",
        ],
        "notas": [
            "Solo los cheques en estado 'Emitido' pueden ser marcados como cobrados o anulados.",
            "Los cheques postfechados se muestran con 'Si' en la columna 'Postfechado'; los que no lo son muestran un guión.",
            "Los cheques anulados aparecen con opacidad reducida en la tabla.",
            "Los estados disponibles son: Emitido, Cobrado, Anulado, En tránsito.",
        ],
    },
    {
        "numero": 29,
        "archivo": "25_teso_conciliacion",
        "titulo": "Conciliación Bancaria",
        "seccion": "Tesorería",
        "descripcion": (
            "Pantalla principal para iniciar y visualizar las conciliaciones bancarias mensuales, "
            "donde se reconcilian los saldos según el banco con los saldos en los libros de la "
            "empresa. Permite filtrar por cuenta bancaria, crear nuevas conciliaciones y acceder "
            "al detalle de cada una para su edición y confirmación."
        ),
        "elementos": [
            "Botón 'Nueva conciliación' (esquina superior derecha)",
            "Filtro: 'Cuenta bancaria' (Todas | seleccione una)",
            "Tabla con columnas: Cuenta, Período, Fechas, Saldo Banco, Saldo Libros, Diferencia, Estado, Acción",
            "Ventana 'Nueva Conciliación' con campos: 'Cuenta bancaria' (obligatorio, selector), 'Año' (obligatorio, selector), 'Mes' (obligatorio, selector con nombres de meses)",
            "Botones de acción por fila: 'Ver' (si esta Confirmada) o 'Abrir' (si esta en Borrador)",
        ],
        "pasos": [
            "Haga clic en 'Nueva conciliación'.",
            "Seleccione la 'Cuenta bancaria' a conciliar (solo aparecen las cuentas activas con conciliación habilitada).",
            "Elija el 'Año' (año actual más o menos 1).",
            "Elija el 'Mes' del período que desea conciliar.",
            "Haga clic en 'Crear conciliación'.",
            "Sera redirigido a la página de detalle de conciliación, donde puede ingresar el saldo según el banco, registrar movimientos pendientes y confirmar la conciliación cuando los saldos coincidan.",
            "Desde la tabla principal, use el filtro 'Cuenta bancaria' para ver las conciliaciones de una cuenta específica.",
            "Haga clic en 'Ver' (si esta confirmada) o 'Abrir' (si esta en borrador) para editar o ver el detalle.",
        ],
        "notas": [
            "Una conciliación se crea en estado 'Borrador' y pasa a 'Confirmada' una vez que los saldos coinciden.",
            "Solo las cuentas activas y marcadas con 'Participa en conciliación' pueden ser conciliadas.",
            "La diferencia se calcula automáticamente y se muestra en verde si es cero o muy pequeña (menor a 0.01), o en rojo si hay discrepancia.",
            "La página de detalle es donde se efectua el reconciliamiento real de los movimientos.",
        ],
    },
    {
        "numero": 31,
        "archivo": "26_conta_dashboard",
        "titulo": "Dashboard Contable",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Pantalla principal del módulo de Contabilidad que muestra un resumen ejecutivo de "
            "la empresa contable activa, incluyendo cuentas activas, comprobantes registrados, y "
            "los totales de debe y haber del período actual."
        ),
        "elementos": [
            "Encabezado: nombre de la empresa (razón social) con enlace a sus detalles",
            "Período activo: indicador visual del período actual (mes/año) y su estado",
            "4 tarjetas KPI: Cuentas activas (número), Comprobantes (número), Total Debe acumulado (en moneda), Total Haber acumulado (en moneda)",
            "Accesos rápidos: enlaces directos a Nuevo Asiento, Plan de Cuentas y Balance de Comprobación",
        ],
        "pasos": [
            "Ingrese al Dashboard Contable desde el menu principal de Contabilidad.",
            "Verifique el período activo mostrado en el aviso azul superior.",
            "Revise los cuatro indicadores (KPIs) para obtener un resumen rápido del estado contable.",
            "Utilice los botones de 'Accesos rápidos' para navegar a las funciones principales (crear asientos, ver el plan de cuentas, generar el balance).",
            "Los datos se cargan automáticamente según la empresa activa seleccionada en su sesión.",
        ],
        "notas": [
            "Si su usuario no tiene una empresa asignada, vera un mensaje 'Sin empresa asignada' con opciones para reintentar, ir a Administración o cerrar sesión.",
            "Los totales mostrados solo incluyen comprobantes confirmados (estado 'confirmado').",
        ],
    },
    {
        "numero": 32,
        "archivo": "27_conta_plan_cuentas",
        "titulo": "Plan de Cuentas",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Módulo para gestionar el catálogo completo de cuentas contables de la empresa, "
            "permitiendo crear, editar, eliminar y organizar las cuentas en una estructura "
            "jerárquica (un árbol de cuentas con cuentas padre e hijas)."
        ),
        "elementos": [
            "Encabezado: título 'Plan de Cuentas' con contador de cuentas registradas",
            "Botones de acción: 'Exportar' (descarga CSV), 'Importar Plantilla' (solo si no hay cuentas), 'Nueva Cuenta' (abre ventana)",
            "Buscador: búsqueda por código o nombre de cuenta",
            "Controles del árbol: botones 'Expandir todo' y 'Colapsar' (cuando no hay búsqueda activa)",
            "Tabla jerárquica: columnas para Código, Nombre, Tipo, Naturaleza, Movimientos, Código SRI, Acciones (editar/eliminar)",
            "Mensaje inicial (sin cuentas): opción para importar la plantilla 'Ecuador NIIF PYMES' automáticamente",
        ],
        "pasos": [
            "Ingrese a la pantalla de Plan de Cuentas.",
            "Si no hay cuentas registradas, haga clic en 'Importar Ecuador NIIF PYMES' para cargar una plantilla predefinida, o en 'Nueva Cuenta' para crear una manualmente.",
            "Para crear una nueva cuenta: haga clic en 'Nueva Cuenta'.",
            "Ingrese el Código (por ejemplo 1.01.01.01), el Tipo (activo/pasivo/patrimonio/ingreso/gasto) y el Nombre.",
            "Seleccione la Naturaleza (deudora/acreedora) y la Cuenta Padre (si es una subcuenta).",
            "Marque 'Acepta movimientos' si esta cuenta debe registrar transacciones.",
            "Opcionalmente, ingrese los códigos SRI y de Superintendencia.",
            "Haga clic en 'Crear'.",
            "Para buscar: use el cuadro de búsqueda (busca por código o nombre).",
            "Para expandir o colapsar: haga clic en los iconos de flecha junto a las cuentas padre.",
            "Para editar: haga clic en el icono de edición (lápiz).",
            "Para eliminar: haga clic en el icono de basura (disponible solo si la cuenta no tiene subcuentas).",
            "Para exportar: haga clic en 'Exportar' para descargar el plan en formato CSV.",
        ],
        "notas": [
            "La cuenta padre se asigna automáticamente según el código si este contiene un punto (por ejemplo, 1.01 detecta como padre a 1).",
            "No se pueden eliminar cuentas que tengan subcuentas.",
            "Las cuentas que 'Aceptan movimientos' son donde se registran las transacciones reales; las que no aceptan movimientos son solo organizativas.",
            "La estructura jerárquica usa niveles detectados automáticamente según la cantidad de puntos en el código.",
        ],
    },
    {
        "numero": 33,
        "archivo": "28_conta_diarios",
        "titulo": "Diarios Contables (Comprobantes)",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Módulo para visualizar, crear y gestionar todos los asientos contables "
            "(comprobantes) de la empresa, con funciones para confirmar, anular y filtrar por "
            "período, tipo y estado."
        ),
        "elementos": [
            "Encabezado: título 'Diarios Contables' con contador de comprobantes filtrados",
            "Botón principal: 'Nuevo Asiento' (navega a la pantalla de creación)",
            "Barra de filtros: selector de Año (lista desplegable con años disponibles), selector de Mes (depende del año elegido), selector de Tipo de Comprobante (todos los tipos activos), botones de estado 'Todos', 'Borrador', 'Confirmado', 'Anulado', buscador de número, glosa o tipo de comprobante",
            "Tabla: columnas para Número, Fecha, Tipo, Glosa, Estado, Debe, Haber, Acciones",
            "Ordenamiento: encabezados de tabla con flechas para ordenar por Número, Fecha o Tipo (ascendente/descendente)",
        ],
        "pasos": [
            "Ingrese a la pantalla de Diarios Contables.",
            "Para filtrar comprobantes: seleccione el Año deseado.",
            "(Opcional) Seleccione el Mes.",
            "(Opcional) Seleccione el Tipo de Comprobante.",
            "Haga clic en uno de los botones de estado (Confirmado, Borrador, Anulado).",
            "Para buscar por texto: escriba en el campo de búsqueda (busca número, glosa o tipo).",
            "Para ordenar: haga clic en los encabezados (Número, Fecha, Tipo) para cambiar el orden.",
            "Para crear un nuevo asiento: haga clic en 'Nuevo Asiento'.",
            "Para ver detalles: haga clic en el icono de ojo (ver).",
            "Para confirmar (si esta en Borrador): haga clic en el icono de círculo con marca de verificación (confirmar).",
            "Para anular: haga clic en el icono de prohibido (anular).",
        ],
        "notas": [
            "Solo los comprobantes confirmados afectan los saldos de las cuentas.",
            "La anulación no elimina el asiento, solo lo marca como anulado (es reversible contablemente).",
            "Los borradores no se cuentan en los reportes de balance.",
            "El filtro de estado por defecto muestra solo los comprobantes 'Confirmado'.",
        ],
    },
    {
        "numero": 34,
        "archivo": "29_conta_balance_comprobacion",
        "titulo": "Balance de Comprobación",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Reporte que verifica que el total de débitos coincida con el total de créditos en "
            "cada cuenta contable, mostrando saldos iniciales, movimientos y saldos finales por "
            "período."
        ),
        "elementos": [
            "Encabezado: título 'Balance de Comprobación' con subtítulo (período y número de cuentas, una vez generado)",
            "Botones de acción (tras generar): 'Imprimir' (abre vista de impresión), 'Exportar CSV' (descarga archivo)",
            "Filtros: selector de Período (lista de periodos disponibles), interruptor 'Mes' / 'Acumulado' (vista mensual frente a vista acumulada hasta el período), botón 'Generar'",
            "Tabla (tras generar): columnas para Código, Nombre de Cuenta, Saldo Inicial (Debe/Haber), Movimientos (Debe/Haber), Saldo Final (Debe/Haber)",
            "Verificación de cuadre: fila de resumen inferior que indica si 'Cuadra' o 'No cuadra' para cada columna",
        ],
        "pasos": [
            "Ingrese a la pantalla de Balance de Comprobación.",
            "Seleccione un Período del listado desplegable.",
            "Elija entre 'Mes' (solo ese mes) o 'Acumulado' (desde el inicio del año hasta ese mes).",
            "Haga clic en 'Generar' para calcular el reporte.",
            "Revise la tabla: verifique que los Saldos Iniciales, Movimientos y Saldos Finales cuadren (Debe igual a Haber).",
            "(Opcional) Haga clic en 'Imprimir' para obtener una vista de impresión.",
            "(Opcional) Haga clic en 'Exportar CSV' para descargar los datos.",
        ],
        "notas": [
            "Solo se incluyen las cuentas que aceptan movimientos.",
            "El cuadre es fundamental: si no cuadra, hay un error de registro contable.",
            "La vista acumulada es más útil para el análisis de periodos; la vista mensual, para auditoria detallada.",
            "Los valores marcados con un guión indican que la cuenta no tiene saldo positivo en esa columna.",
        ],
    },
    {
        "numero": 35,
        "archivo": "30_conta_balance_general",
        "titulo": "Estado de Situación Financiera (Balance General)",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Reporte que muestra la posición financiera de la empresa en una fecha específica, "
            "presentando Activos, Pasivos y Patrimonio en formato estandar (Activo = Pasivo + "
            "Patrimonio)."
        ),
        "elementos": [
            "Encabezado: título 'Estado de Situación Financiera' con la fecha (al mes/año seleccionado)",
            "Botones de acción (tras generar): 'Imprimir', 'Exportar CSV'",
            "Filtro: selector de Período, botón 'Generar'",
            "Estructura (tras generar) en dos columnas: columna izquierda con la tarjeta 'Activos' (tabla de cuentas de activo); columna derecha con la tarjeta 'Pasivos' (tabla de cuentas de pasivo) y la tarjeta 'Patrimonio' (cuentas de patrimonio más la Utilidad/Perdida del período)",
            "Verificación: sección inferior que compara el Total de Activos contra el Total de Pasivos más Patrimonio, con indicador de si el 'Balance cuadra' o 'no cuadra'",
        ],
        "pasos": [
            "Ingrese a la pantalla de Estado de Situación Financiera.",
            "Seleccione el Período deseado.",
            "Haga clic en 'Generar'.",
            "Revise la estructura: verifique que el Total de Activos coincida con el Total de Pasivos más Patrimonio.",
            "Observe la 'Utilidad del Período' o 'Perdida del Período' incluida en Patrimonio.",
            "(Opcional) Haga clic en 'Imprimir' para la vista de impresión.",
            "(Opcional) Haga clic en 'Exportar CSV' para descargar los datos.",
        ],
        "notas": [
            "El balance general siempre es acumulado, desde el inicio del ejercicio hasta la fecha seleccionada.",
            "Solo se incluyen las cuentas con saldo positivo.",
            "La 'Utilidad/Perdida del Período' se calcula como la diferencia entre los ingresos y los gastos del período.",
            "Si el balance no cuadra, existe un error en la contabilización que debe revisarse.",
        ],
    },
    {
        "numero": 36,
        "archivo": "31_conta_estado_resultados",
        "titulo": "Estado de Resultados",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Reporte que muestra los ingresos y gastos de la empresa en un período, calculando "
            "la utilidad o perdida neta del período."
        ),
        "elementos": [
            "Encabezado: título 'Estado de Resultados' con el período y el modo (mes/acumulado) una vez generado",
            "Botones de acción (tras generar): 'Imprimir', 'Exportar CSV'",
            "Filtros: selector de Período, interruptor 'Mes' / 'Acumulado', botón 'Generar'",
            "Tabla (tras generar): sección 'Ingresos' con encabezado verde (lista de cuentas de ingreso con sus montos) y Total Ingresos; sección '(-) Gastos' con encabezado ámbar (lista de cuentas de gasto con sus montos) y Total Gastos; sección 'Resultado' (verde si es utilidad, rojo si es perdida) que muestra la Utilidad o Perdida del Período",
        ],
        "pasos": [
            "Ingrese a la pantalla de Estado de Resultados.",
            "Seleccione el Período.",
            "Elija 'Mes' (solo ese período) o 'Acumulado' (desde el inicio del año hasta el período seleccionado).",
            "Haga clic en 'Generar'.",
            "Revise la estructura: Ingresos (en verde), suma de todas las cuentas de ingreso.",
            "Revise Gastos (en ámbar), suma de todas las cuentas de gasto.",
            "Revise el Resultado (al pie): Utilidad (positiva, en verde) o Perdida (negativa, en rojo).",
            "(Opcional) Haga clic en 'Imprimir' para la vista de impresión.",
            "(Opcional) Haga clic en 'Exportar CSV' para descargar los datos.",
        ],
        "notas": [
            "Solo se incluyen las cuentas de tipo 'ingreso' y 'gasto' que tengan movimiento positivo.",
            "Si no hay ingresos ni gastos, se muestra un mensaje indicando que no hay datos para ese criterio.",
            "La vista acumulada es la más común para el análisis fiscal y financiero.",
            "Este reporte es útil para auditoria y análisis de rentabilidad.",
        ],
    },
    {
        "numero": 37,
        "archivo": "32_retenciones",
        "titulo": "Comprobantes de Retención",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Módulo para gestionar los comprobantes de retención (IVA y de renta) emitidos a "
            "proveedores, mostrando el estado de autorización ante el SRI, permitiendo "
            "autorizar en línea y descargar los archivos XML correspondientes."
        ),
        "elementos": [
            "Encabezado: título 'Comprobantes de Retención' con subtítulo descriptivo",
            "Aviso de mensajes SRI: muestra la respuesta exitosa o el error de las autorizaciones (se puede cerrar)",
            "4 tarjetas KPI: Total retenido (suma de los valores retenidos), Documentos (cantidad), Autorizadas SRI (cantidad con estado 'AUTORIZADO'), Pendientes de firma (cantidad sin autorizar)",
            "Filtros: rango de fechas (Desde - Hasta), selector de Proveedor, botón 'Buscar', buscador por proveedor, RUC, número de retención o factura relacionada, botones 'Imprimir' y 'Exportar'",
            "Lista de comprobantes: cada retención se presenta como una tarjeta expandible (encabezado y detalles al expandir)",
        ],
        "pasos": [
            "Ingrese a la pantalla de Comprobantes de Retención.",
            "Para filtrar: seleccione las fechas (Desde - Hasta; por defecto, desde el primer día del mes hasta hoy).",
            "(Opcional) Seleccione un Proveedor específico.",
            "Haga clic en 'Buscar'.",
            "Para buscar por texto: escriba en el campo de búsqueda (proveedor, RUC, número de retención, factura).",
            "Para ver los detalles de una retención: haga clic en la tarjeta de la retención para expandirla.",
            "Vera el estado SRI (etiqueta), la tabla de líneas de retención (tipo, código, base, porcentaje, valor) y el total retenido.",
            "Para autorizar en el SRI (si no esta autorizada): abra la retención y haga clic en 'Autorizar SRI'.",
            "Espere la respuesta; el aviso superior mostrara el resultado.",
            "Para descargar el XML (si esta autorizada): abra la retención y haga clic en 'Descargar XML'.",
            "Para reintentar (si fue rechazada): abra la retención y haga clic en 'Reintentar SRI'.",
            "(Opcional) Haga clic en 'Imprimir' para la vista de impresión.",
            "(Opcional) Haga clic en 'Exportar' para descargar en Excel.",
        ],
        "notas": [
            "Los estados SRI son: 'Pendiente SRI', 'Enviada SRI', 'Autorizada SRI', 'Rechazada SRI'.",
            "Solo las retenciones autorizadas son válidas ante la autoridad tributaria.",
            "Las retenciones anuladas no pueden ser autorizadas ni reintentadas.",
            "Se requiere estar conectado a internet para autorizar en el SRI.",
        ],
    },
    {
        "numero": 38,
        "archivo": "33_ajustes",
        "titulo": "Ajustes de Contabilidad",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Módulo para configurar la plantilla base de cuentas contables que se usa al generar "
            "asientos automáticos a partir de compras y ventas (mapeo de cuentas para "
            "inventario, IVA, cuentas por pagar, retenciones, etc.)."
        ),
        "elementos": [
            "Encabezado: título 'Ajustes de Contabilidad' con descripción",
            "Avisos iniciales: notificación si hay una actualización pendiente de la base de datos, o si la integración contable aun no ha sido activada por el contador",
            "Tarjeta 'Plantilla base de cuentas' (visible si la integración esta activada y existe un plan de cuentas): explicación de funcionamiento y 6 selectores de cuenta para Inventarios/Mercaderias (Activo), IVA Crédito Fiscal en Compras (Activo), Cuentas por Pagar Proveedores (Pasivo), Efectivo/Banco (Activo), Retenciones en la Fuente por Pagar (Pasivo) y Retenciones de IVA por Pagar (Pasivo)",
            "Botón 'Guardar plantilla'",
            "Tarjeta informativa: explicación del flujo de contabilización automática",
        ],
        "pasos": [
            "Ingrese a la pantalla de Ajustes de Contabilidad.",
            "Requisitos previos: un contador debe activar la integración contable en la Configuración general, y debe existir un plan de cuentas en el módulo de Contabilidad.",
            "Para configurar la plantilla: para cada concepto contable (Inventarios, IVA Crédito, Cuentas por Pagar, Efectivo, Retenciones Fuente, Retenciones IVA), haga clic en el selector desplegable correspondiente.",
            "Elija la cuenta contable correspondiente del plan de cuentas.",
            "Haga clic en 'Guardar plantilla'.",
            "(Opcional) Lea la tarjeta informativa para entender como funcionan las contabilizaciones automáticas.",
        ],
        "notas": [
            "Esta es una configuración avanzada que solo el contador debe modificar.",
            "Si no se completan todos los mapeos, algunos asientos automáticos podrian fallar.",
            "Para las compras de servicio, cada línea puede tener su propia cuenta de gasto (configurable en el formulario de compra).",
            "La integración solo esta disponible si el contador activo la opción correspondiente en Configuración.",
        ],
    },
    {
        "numero": 39,
        "archivo": "34_configuracion",
        "titulo": "Configuración General del Sistema",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Es el centro administrativo para gestionar los datos de la empresa, el personal "
            "(staff), las mesas (si es un restaurante), las categorías de productos, las "
            "bodegas, y la configuración contable avanzada (para usuarios con rol de oficina). "
            "Incluye una sección separada de administración de plataforma para el "
            "administrador de plataforma."
        ),
        "elementos": [
            "Encabezado: título 'Configuración' con el rol del usuario",
            "Pestanas principales (usuarios de oficina): Empresa (datos legales, logo, SRI), Categorías (clasificación de productos), Bodegas (almacenes), Contabilidad (mapeo de cuentas contables)",
            "Sección Empresa: formulario con Razón Social, RUC (solo lectura), Dirección, Teléfono; subida de Logo (se recomienda PNG); configuración SRI (Establecimiento, Punto Emisión, Ambiente PRUEBAS/PRODUCCIÓN, Secuencial Inicial, Firma .p12, Contraseña de la Firma); botón 'Guardar Configuración'; panel derecho con resumen de datos actuales (RUC, Ambiente, Serie, Estado de la Firma)",
            "Sección Categorías: botón 'Nueva Categoría'; cuadrícula de tarjetas, cada una con nombre, descripción, y botones de editar y dar de baja; indicador 'Inactiva' si la categoría fue dada de baja",
            "Sección Bodegas: botón 'Nueva Bodega'; tabla con Nombre, Código, Dirección, Principal (estrella), Estado, Acciones; botones para editar y dar de baja (excepto la bodega principal); las bodegas dadas de baja se conservan en el historial",
            "Sección Contabilidad: panel de configuración contable (ver detalle en los pasos)",
            "Sección Plataforma (solo para administrador de plataforma): sub-pestanas 'Empresas' y 'Personal'. Sub-pestana Empresas: tabla de todas las empresas con RUC, Dirección, IVA, Propina, Estado, Acciones (Reinicio de datos, Editar, Desactivar). Sub-pestana Personal: tabla de usuarios con rol de oficina (Nombre, Email, Empresa, Estado, Acciones para editar/eliminar), botón 'Dar Acceso vía Portal', botón 'Nuevo Usuario Oficina'",
        ],
        "pasos": [
            "Para actualizar los datos de la empresa: haga clic en la pestana 'Empresa'.",
            "Edite los campos: Razón Social, Dirección, Teléfono.",
            "(Opcional) Suba un logo nuevo.",
            "(Opcional) Configure el SRI: Establecimiento, Punto Emisión, Ambiente, Firma.",
            "Haga clic en 'Guardar Configuración'.",
            "Para gestionar categorías: haga clic en la pestana 'Categorías'.",
            "Haga clic en 'Nueva Categoría'.",
            "Ingrese el Nombre y, opcionalmente, la Descripción.",
            "Haga clic en 'Guardar'.",
            "Para editar una categoría: haga clic en el icono de lápiz.",
            "Para dar de baja una categoría: haga clic en el icono de basura (confirme en el diálogo).",
            "Para gestionar bodegas: haga clic en la pestana 'Bodegas'.",
            "Haga clic en 'Nueva Bodega'.",
            "Ingrese el Nombre (obligatorio), Código, Descripción, Dirección.",
            "Marque 'Principal' si esta sera la bodega por defecto.",
            "Haga clic en 'Guardar'.",
            "Para editar una bodega: haga clic en el icono de lápiz.",
            "Para dar de baja (inactivar) una bodega: haga clic en el icono correspondiente (disponible solo si no es la bodega principal).",
            "Para configurar contabilidad: haga clic en la pestana 'Contabilidad'.",
            "(Opcional) Active el interruptor 'Contabilización en Línea' para generar asientos al guardar (en lugar de hacerlo por lotes).",
            "Asigne cada concepto contable a una cuenta del plan de cuentas: en Ventas, asigne Cartera, Ingresos base 0%, Ingresos gravados, IVA cobrado, Descuentos, Costo de Ventas e Inventarios.",
            "En Compras, asigne Proveedores (cuentas por pagar), Inventarios, Gastos/Servicios, IVA pagado y Retención en la Fuente.",
            "En Cobros, asigne las cuentas por cada forma de pago: Efectivo, Cheque, Cheque a fecha, Tarjeta, Banco, Nota de Crédito, Crédito.",
            "En Pagos, asigne las cuentas por cada forma de pago: Efectivo, Tarjeta, Nota de Crédito, Otros.",
            "Haga clic en 'Guardar Configuración Contable'.",
            "Para administración de plataforma (administrador de plataforma): se abre automáticamente la pestana 'Plataforma'.",
            "Para gestionar empresas: en la sub-pestana 'Empresas', haga clic en Editar para cambiar datos, o en Reinicio de datos para limpiar datos de prueba.",
            "Para gestionar personal de oficina: en la sub-pestana 'Personal', haga clic en 'Dar Acceso vía Portal' para conceder acceso a un usuario del Portal Billennium, o en 'Nuevo Usuario Oficina' para crear uno nuevo.",
        ],
        "notas": [
            "El RUC no es modificable (solo lectura).",
            "Solo una bodega puede estar marcada como 'Principal'.",
            "La firma electrónica SRI (.p12) es obligatoria para emitir comprobantes en producción.",
            "Los cambios en la configuración SRI (ambiente, serie) afectan la emisión de comprobantes posteriores.",
            "Las categorías y bodegas dadas de baja siguen visibles en el historial, pero no aparecen en formularios nuevos.",
            "El interruptor de 'Contabilización en Línea' requiere que todas las cuentas esten asignadas.",
            "La administración de empresas y de personal es exclusiva del administrador de plataforma.",
            "Dentro de la pestana 'Contabilidad' de Configuración se incluyen, además, un indicador visual (punto verde si esta asignado, gris si no) para cada concepto contable mapeado.",
        ],
    },

    # ─── NUEVOS MÓDULOS 2026 ──────────────────────────────────────────────────

    {
        "numero": 7,
        "archivo": "35_proformas",
        "titulo": "Proformas (Cotizaciones)",
        "seccion": "Facturación y Ventas",
        "descripcion": (
            "Módulo para crear cotizaciones (proformas) previas a la factura. Una proforma es "
            "un documento no oficial que presenta al cliente los productos o servicios con sus "
            "precios, y que puede convertirse en factura con un solo clic una vez que el cliente "
            "apruebe. Permite imprimir en formato A4 o ticket de 80mm térmico."
        ),
        "elementos": [
            "Botón 'Nueva Proforma'",
            "Tabla de proformas existentes: número, fecha, cliente, total, estado, acciones",
            "Acciones por fila: Ver/Editar, Convertir a Factura, Imprimir A4, Imprimir 80mm, Eliminar",
            "Formulario idéntico al de Nueva Factura: cliente, productos, formas de pago tentativas",
            "Número de proforma generado automáticamente",
            "Estado: BORRADOR o CONVERTIDA (cuando ya se facturó)",
        ],
        "pasos": [
            "Haga clic en 'Nueva Proforma'.",
            "Complete los datos igual que en Nueva Factura: seleccione el cliente, agregue productos con cantidades y precios.",
            "Haga clic en 'Guardar Proforma'. El sistema asigna un número automático.",
            "Para imprimir la proforma: haga clic en el icono de impresora A4 o 80mm en la fila.",
            "Para convertir a factura definitiva: haga clic en el icono 'Convertir a Factura'.",
            "El sistema abre el formulario de Nueva Factura con los datos de la proforma precargados.",
            "Verifique los datos, agregue la forma de pago real y haga clic en 'Generar Factura'.",
            "La proforma queda marcada como CONVERTIDA y no se puede editar.",
        ],
        "notas": [
            "La proforma NO es un documento tributario válido ante el SRI; solo la factura lo es.",
            "Una proforma convertida no puede volver a convertirse (evita duplicados).",
            "Se pueden imprimir múltiples copias de la proforma sin límite.",
            "El número de proforma es independiente al secuencial de facturas.",
            "Las proformas no afectan el inventario; solo la factura final lo hace.",
        ],
    },
    {
        "numero": 12,
        "archivo": "36_importar_articulos",
        "titulo": "Importación Masiva de Artículos",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Herramienta para cargar cientos o miles de productos al catálogo desde un archivo "
            "CSV, ideal para empresas que migran desde otro sistema o que reciben catálogos de "
            "proveedores en formato electrónico. El sistema crea automáticamente los productos, "
            "el saldo inicial en bodega y el registro de kardex."
        ),
        "elementos": [
            "Botón 'Seleccionar archivo CSV'",
            "Área de arrastre (drag & drop) para soltar el archivo",
            "Vista previa de los primeros 20 registros antes de importar",
            "Selector de empresa y bodega destino",
            "Botón 'Importar' (visible tras seleccionar el archivo)",
            "Barra de progreso durante la importación",
            "Resumen final: registros importados, omitidos (duplicados), errores",
        ],
        "pasos": [
            "Prepare el archivo CSV con separador punto y coma (;).",
            "Columnas requeridas: código, nombre, precio, costo, categoría, stock.",
            "Ingrese al módulo Inventario → Importar Artículos.",
            "Haga clic en 'Seleccionar archivo CSV' o arrastre el archivo al área indicada.",
            "Revise la vista previa de los primeros 20 registros para verificar que el formato es correcto.",
            "Seleccione la bodega destino donde se registrará el saldo inicial.",
            "Haga clic en 'Importar'.",
            "Espere a que el sistema procese los datos (se importan en lotes de 50).",
            "Revise el resumen: productos creados, omitidos (código ya existente) y errores.",
        ],
        "notas": [
            "El separador del CSV debe ser punto y coma (;), no coma.",
            "Las categorías se buscan por nombre; deben existir previamente en el catálogo.",
            "Los stocks negativos se convierten automáticamente a 0.",
            "Los productos con código duplicado se omiten (no se sobreescriben).",
            "Se crean entradas de kardex tipo ENTRADA con el stock inicial.",
            "Para catálogos de más de 5.000 artículos, el proceso puede tomar varios minutos.",
        ],
    },
    {
        "numero": 40,
        "archivo": "37_permisos_usuario",
        "titulo": "Permisos de Usuario",
        "seccion": "Contabilidad y Configuración",
        "descripcion": (
            "Módulo de administración para controlar exactamente qué módulos y funciones puede "
            "ver y usar cada usuario de la empresa. El administrador activa o desactiva "
            "permisos individuales para cada usuario mediante toggles. Los cambios se aplican "
            "inmediatamente en el menú lateral del usuario afectado."
        ),
        "elementos": [
            "Lista de usuarios de la empresa (panel izquierdo)",
            "Secciones de permisos agrupadas por módulo (panel derecho)",
            "Toggle (interruptor) por cada permiso: verde = activo, gris = inactivo",
            "Botón 'Guardar' por usuario",
            "Botones 'Activar todos' y 'Desactivar todos' por sección",
            "Botones 'Activar todo el sistema' y 'Desactivar todo el sistema'",
        ],
        "pasos": [
            "Ir a Ajustes → Permisos de Usuario.",
            "Seleccionar el usuario al que se desea configurar los permisos.",
            "Revisar cada sección de módulos y activar o desactivar los permisos necesarios.",
            "Usar 'Activar todos' en una sección para dar acceso completo a ese módulo.",
            "Hacer clic en 'Guardar' para aplicar los cambios.",
            "El usuario verá los cambios la próxima vez que refresque la pantalla.",
        ],
        "notas": [
            "Solo el administrador (rol oficina) puede modificar permisos.",
            "Los permisos disponibles cubren: Dashboard, Facturación, Clientes, Cartera, "
            "Gestión de Cartera, Compras, Tesorería, Cierre Caja General, Gerencia, "
            "Contabilidad y Talento Humano.",
            "Un permiso desactivado oculta el ítem del menú lateral y bloquea el acceso directo a la URL.",
            "Por defecto, todos los permisos están activados para usuarios nuevos.",
            "El permiso 'Gerencia → Resumen Operacional' es nuevo y controla el módulo ejecutivo.",
            "El permiso 'Clientes → Gestión de Cartera' controla el módulo avanzado de cobros.",
        ],
    },
    {
        "numero": 30,
        "archivo": "38_cierre_caja_general",
        "titulo": "Cierre de Caja General",
        "seccion": "Tesorería",
        "descripcion": (
            "Herramienta diaria de control de caja para la administración. Consolida todas las "
            "ventas del día, los cobros de cartera y los movimientos extra de efectivo, calcula "
            "el total de efectivo y cheques disponibles, permite registrar los depósitos bancarios "
            "y ejecutar el cierre definitivo del día. Los datos se auto-guardan en la base de "
            "datos cada 800ms, por lo que la cajera puede navegar a otras pantallas y volver "
            "sin perder nada."
        ),
        "elementos": [
            "Badge 'Abierto — auto-guardado': confirma que el proceso del día está activo",
            "Selector de fecha: permite consultar cualquier día (hoy o días pasados)",
            "Indicador de estado de cajeros: si hay cajas de cajero abiertas, se muestra alerta",
            "Tab 'Movimientos': registro de ingresos y egresos extra de caja (fondos, gastos menores)",
            "Tab 'Ventas del Día': facturas del día con detalle de formas de pago (EF/TR/CD/CRE/TC)",
            "Tab 'Rec. Cartera': cobros de cartera registrados en el día",
            "Tab 'Cierre': resumen consolidado + configuración de base de caja + depósitos bancarios",
            "Tab 'Histórico': listado de cierres anteriores con opción de reverso",
            "Botón 'Guardar base': persiste el monto de billetes que quedan en caja",
            "Selector de cuenta bancaria para depósitos (buscador interactivo)",
            "Botón 'Ejecutar Cierre Definitivo'",
            "Botón 'Imprimir Reporte': genera ticket 80mm con detalle completo",
        ],
        "pasos": [
            "Abrir Tesorería → Cierre Caja General. El sistema crea automáticamente el borrador del día.",
            "Durante el día, registrar movimientos extra en el tab 'Movimientos': fondos adicionales, pagos de gastos menores, etc.",
            "Al final del día, ir al tab 'Ventas del Día' para verificar que las facturas del día están correctas.",
            "Verificar el tab 'Rec. Cartera' para confirmar los cobros registrados.",
            "Ir al tab 'Cierre':",
            "  a) Configurar la Base de Caja (billetes que quedan en caja para el día siguiente) y hacer clic en 'Guardar base'.",
            "  b) Agregar los depósitos bancarios: buscar la cuenta bancaria destino, seleccionar tipo (Efectivo o Cheque), ingresar el valor y el número de comprobante.",
            "  c) Revisar el resumen: Efectivo Total, Cheques Total, Base, A Depositar.",
            "Hacer clic en 'Ejecutar Cierre Definitivo'.",
            "El sistema bloquea el día y genera el registro en el histórico.",
            "Imprimir el reporte 80mm con el botón 'Imprimir Reporte'.",
        ],
        "notas": [
            "La pantalla debe mantenerse abierta todo el día; los datos se guardan automáticamente cada 800ms.",
            "Al navegar a otras pantallas y regresar, todos los depósitos y observaciones están intactos.",
            "El reporte 80mm incluye: detalle de ventas por forma de pago, cobros de cartera, movimientos extra, resumen final, depósitos y firma del cajero.",
            "Para reversar un cierre ya ejecutado: ir al tab 'Histórico', encontrar el día y hacer clic en 'Reversar'.",
            "La Base de Caja nunca se deposita; es el fondo permanente en caja.",
            "El cierre no se puede ejecutar si hay cajeros con sesión aún abierta (se muestra una alerta).",
        ],
    },
    {
        "numero": 20,
        "archivo": "39_ventas_cliente",
        "titulo": "Ventas por Cliente",
        "seccion": "Consultas, Compras y Cartera por Pagar",
        "descripcion": (
            "Reporte ejecutivo de todas las facturas de un cliente específico en un período, "
            "mostrando el estado de pago de cada una (si está cancelada, en crédito o parcialmente "
            "pagada). Permite ver el detalle de productos vendidos al hacer clic sobre cualquier "
            "factura, y exportar tanto el resumen como el detalle de productos a Excel."
        ),
        "elementos": [
            "Buscador de cliente: campo con autocompletado por nombre o RUC/cédula",
            "Selector de período con accesos rápidos: Hoy, Esta semana, Este mes, Mes anterior, Este año",
            "Selectores de fecha Desde/Hasta para períodos personalizados",
            "Botón 'Consultar'",
            "Tabla de facturas: No. Factura, Fecha, Total, Pagado, Saldo, Estado, Estado SRI",
            "Clic en fila: expande el detalle con formas de pago y líneas de productos",
            "Fila de totales al pie: Total, Pagado, Saldo",
            "Botón 'Excel': exporta a dos hojas (Resumen + Detalle de Productos)",
            "Botón 'Imprimir': reporte formal con nombre de empresa, cliente y período",
        ],
        "pasos": [
            "Escribir el nombre o RUC del cliente en el buscador; seleccionarlo de la lista.",
            "Usar un acceso rápido de período o ingresar las fechas manualmente.",
            "Hacer clic en 'Consultar'.",
            "Revisar la tabla: cada fila es una factura con su estado.",
            "Hacer clic en cualquier fila para expandir y ver los productos vendidos y las formas de pago.",
            "Hacer clic en 'Excel' para exportar (hoja 'Ventas por Cliente' + hoja 'Detalle Productos').",
            "Hacer clic en 'Imprimir' para el reporte formal imprimible.",
        ],
        "notas": [
            "Estado CANCELADA (verde): factura totalmente pagada.",
            "Estado CRÉDITO (amarillo): factura en crédito, sin pagos parciales.",
            "Estado PARCIAL (naranja): factura con pagos parciales pero saldo pendiente.",
            "Estado ANULADA (rojo): factura anulada, no cuenta en los totales.",
            "El saldo en color ámbar indica que hay deuda pendiente.",
            "El Excel incluye dos hojas: resumen de facturas y detalle de productos por línea.",
        ],
    },
    {
        "numero": 17,
        "archivo": "40_gestion_cartera",
        "titulo": "Gestión de Cartera y Cobros",
        "seccion": "Inventario y Cartera por Cobrar",
        "descripcion": (
            "Módulo avanzado de gestión de cobros que consolida toda la cartera pendiente de la "
            "empresa con semáforo de antigüedad, KPIs ejecutivos, herramientas de comunicación "
            "directa con el cliente (WhatsApp, email, carta) y registro histórico de cada gestión "
            "de cobro realizada. Incluye score de riesgo crediticio por cliente y siete reportes "
            "especializados de cartera."
        ),
        "elementos": [
            "Panel de 6 KPIs: Total Cartera, Total Vencido, Por Vencer, Clientes en Mora, Promedio Días Mora, Rotación de Cartera (días)",
            "Filtros: cliente (buscador), vendedor, estado (todas/vencidas/por vencer), fecha de corte",
            "Tabs: Toda la cartera / 0-365 días / Más de 1 año",
            "Tabla con semáforo visual por antigüedad de deuda:",
            "  • Verde: por vencer o < 30 días",
            "  • Amarillo: 30–90 días vencida",
            "  • Rojo: 90–180 días vencida",
            "  • Negro: más de 180 días vencida",
            "Score crediticio del cliente: badge verde/amarillo/rojo/negro",
            "Acciones por fila: Gestión (📋), WhatsApp (💬), Email (✉️), Llamada (📞)",
            "Totales al pie de tabla",
            "Dropdown 'Reportes' con 7 reportes exportables a Excel",
        ],
        "pasos": [
            "Ingresar a Clientes → Gestión de Cartera.",
            "Revisar los 6 KPIs en la parte superior para tener una visión general.",
            "Usar los filtros para enfocarse en un cliente, vendedor o rango de antigüedad.",
            "Hacer clic en el ícono 📋 de una factura para abrir el panel lateral de gestión:",
            "  a) Revisar el historial de gestiones anteriores en el tab 'Historial'.",
            "  b) Ir al tab 'Nueva Gestión' para registrar la acción actual.",
            "  c) Seleccionar el canal (Llamada/Email/WhatsApp/Visita/Carta).",
            "  d) Indicar el estado resultante y escribir la observación.",
            "  e) Si hubo promesa de pago, activar el toggle y registrar fecha y monto.",
            "  f) Indicar la próxima fecha de seguimiento.",
            "  g) Hacer clic en 'Guardar Gestión'.",
            "Para enviar WhatsApp: hacer clic en 💬; elegir el nivel (1er aviso/2do aviso/Prejudicial); se abre WhatsApp con el mensaje pre-redactado; hacer clic en Enviar.",
            "Para generar carta de cobro: hacer clic en 'Carta' dentro del panel; se abre la vista de impresión con el formato formal.",
            "Para reportes: hacer clic en el botón 'Reportes' en el header y seleccionar el reporte deseado.",
        ],
        "notas": [
            "El Score crediticio (0-100) se calcula automáticamente con 4 factores: promedio días retraso, % promesas cumplidas, frecuencia de mora y monto máximo de deuda.",
            "Los 7 reportes disponibles son: Aging (antigüedad), Cartera actual, Por Vendedor, Efectividad del Cobrador, Promesas de Pago, Acuerdos en Cuotas, Comparativo 12 meses, Clientes Alto Riesgo.",
            "El mensaje de WhatsApp es un enlace wa.me/ que abre el WhatsApp del cobrador en su celular; no tiene costo adicional.",
            "Las plantillas de WhatsApp (1er aviso, 2do aviso, Prejudicial) son configurables por la empresa.",
            "El índice de Rotación de Cartera indica cuántos días en promedio tarda la empresa en cobrar (menor = mejor).",
            "La próxima fecha de seguimiento aparece en la tabla para planificar el trabajo de cobros.",
        ],
    },
    {
        "numero": 41,
        "archivo": "41_resumen_operacional",
        "titulo": "Resumen Operacional (Gerencia)",
        "seccion": "Gerencia",
        "descripcion": (
            "Panel ejecutivo gerencial que presenta un resumen financiero simplificado del "
            "negocio en cascada: Ingresos → Costo → Utilidad Bruta → Gastos → Resultado "
            "Operacional → 15% PT → Base Imponible → 25% IR → Resultado Neto. Incluye "
            "comparativo automático con el período anterior, semáforo de salud financiera, "
            "gráficos interactivos y top 5 de clientes y productos. Ideal para empresas sin "
            "contabilidad formal que quieren conocer sus números clave."
        ),
        "elementos": [
            "Selector de modo: Día / Mes / Año con selector de fecha correspondiente",
            "Semáforo de salud financiera: Verde (margen > 15%), Amarillo (5-15%), Rojo (< 5%), Negro (pérdida)",
            "Mensaje explicativo del semáforo con el margen neto calculado",
            "Tabla comparativa: Período actual vs. Período anterior con Variación $ y %",
            "Cascada P&L con 9 líneas (ingresos, costos, gastos, impuestos, resultado neto)",
            "% sobre ingresos para cada línea",
            "Fila YTD (acumulado enero–mes seleccionado) vs. mismo período año anterior (solo modo Mes)",
            "Gráfico de barras: comparativo Ingresos/Costo/Gastos/Neto entre períodos",
            "Gráfico de dona: composición de egresos (qué % de las ventas se va a cada rubro)",
            "Top 5 Clientes por ingresos del período con barra visual",
            "Top 5 Productos por ingresos del período con barra visual",
            "Editor de Gastos Manuales (visible si la empresa no tiene contabilidad)",
            "Botón ⚙️ Semáforo: configura los umbrales de salud financiera",
            "Botones Excel e Imprimir",
        ],
        "pasos": [
            "Ir a Gerencia → Resumen Operacional.",
            "Seleccionar el modo de período: Día, Mes o Año.",
            "Elegir la fecha o período con el selector correspondiente.",
            "Hacer clic en 'Generar'.",
            "Leer el semáforo de salud en la parte superior: indica si la empresa está sana, en observación, en riesgo o con pérdida.",
            "Revisar la tabla comparativa para ver la evolución respecto al período anterior.",
            "Si la empresa no tiene contabilidad (modo sin contabilidad), aparece la sección 'Gastos Operacionales del Período': ingresar los gastos por categoría y hacer clic en 'Guardar'. El sistema los guardará para no tener que reingresarlos.",
            "Revisar los gráficos: barras para comparar períodos y dona para ver a dónde se va el dinero.",
            "Consultar el Top 5 de Clientes y Productos para saber quiénes y qué generan más ingresos.",
            "Exportar a Excel o imprimir el reporte.",
            "(Opcional) Configurar los umbrales del semáforo haciendo clic en ⚙️ Semáforo.",
        ],
        "notas": [
            "IMPORTANTE: Este NO es un Estado de Resultados contable formal. Es un resumen ejecutivo de gestión.",
            "Con módulo contable activo: el costo de ventas se toma automáticamente de las cuentas del grupo 5.01 y los gastos del grupo 5.02 de LedgerPro.",
            "Sin módulo contable: el costo se toma del kardex de salidas; los gastos se ingresan manualmente y se guardan en la base de datos.",
            "La cascada calcula automáticamente: 15% Participación Trabajadores y 25% Impuesto a la Renta (Ecuador).",
            "En modo Mes: se incluye la fila YTD (acumulado del año hasta el mes seleccionado).",
            "Los umbrales del semáforo (15% y 5%) son configurables por la empresa.",
            "El índice de Rotación de Cartera en los KPIs indica los días promedio de cobro.",
        ],
    },
]
