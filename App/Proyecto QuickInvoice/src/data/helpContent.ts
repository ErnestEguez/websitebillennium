export interface SeccionAyuda {
    titulo: string
    texto: string
    tips?: string[]
    alerta?: string
}

export interface PaginaAyuda {
    titulo:    string
    subtitulo: string
    secciones: SeccionAyuda[]
}

export const AYUDA: Record<string, PaginaAyuda> = {

    // ─── FACTURACIÓN DIRECTA ────────────────────────────────────────────────
    'factura-directa': {
        titulo: 'Facturación Directa',
        subtitulo: 'Emite facturas electrónicas autorizadas por el SRI',
        secciones: [
            {
                titulo: '1. Selección de cliente',
                texto: 'Escribe el nombre, RUC o cédula en el buscador de la sección Cliente. El sistema filtra en tiempo real desde el catálogo. Si el cliente no existe, haz clic en "+ Nuevo" para registrarlo: ingresa el RUC/cédula y el sistema consulta automáticamente al SRI para completar nombre y dirección.',
                tips: [
                    'Usa "Consumidor Final" (clic en el botón rápido) para ventas sin datos del comprador.',
                    'Puedes facturar a crédito solo a clientes con identificación registrada.',
                ],
            },
            {
                titulo: '2. Agregar productos',
                texto: 'En la sección Productos, escribe el código o nombre del artículo para buscarlo. Selecciona el artículo de la lista, ajusta la cantidad y el descuento si aplica. El IVA se calcula automáticamente según la tarifa configurada en el artículo (15%, 5% o 0%).',
                tips: [
                    'Puedes agregar múltiples artículos antes de emitir.',
                    'Los artículos se descuentan del inventario automáticamente al emitir.',
                ],
            },
            {
                titulo: '3. Formas de pago',
                texto: 'Distribiye el cobro entre efectivo, tarjeta de crédito/débito, transferencia, cheque, crédito o varios métodos a la vez. La suma de los pagos debe igualar el total de la factura. El botón "Completar automáticamente" rellena el primer método con el valor faltante.',
                tips: [
                    'Si cobras en efectivo, ingresa el monto recibido para calcular el vuelto.',
                    'Las ventas a crédito quedan registradas en Cartera CxC para seguimiento.',
                ],
                alerta: 'No se puede facturar a crédito a "Consumidor Final". Cambia la forma de pago antes de emitir.',
            },
            {
                titulo: '4. Emitir la factura',
                texto: 'Al presionar "Generar Factura" el sistema: (1) firma el XML con tu certificado electrónico, (2) envía al SRI para recepción, (3) espera la autorización y (4) imprime el ticket POS automáticamente si tienes configurada la impresora.',
                tips: [
                    'Con conexión: la autorización es inmediata (segundos).',
                    'Sin conexión: la factura queda en cola de sincronización y se procesa al reconectarse.',
                    'El RIDE (factura oficial PDF) y el XML se guardan y pueden descargarse desde Comprobantes.',
                ],
            },
            {
                titulo: '5. Impresión de ticket',
                texto: 'El ticket de 80mm se imprime automáticamente tras autorizar. Si no se imprimió, ve a Comprobantes y usa el botón de impresión. Para evitar el diálogo "Guardar como PDF" de Chrome, configura la impresión directa en Ajustes → Configuración → sección "Impresión Directa POS".',
            },
        ],
    },

    // ─── COMPROBANTES ───────────────────────────────────────────────────────
    'comprobantes': {
        titulo: 'Comprobantes',
        subtitulo: 'Gestiona todas las facturas emitidas',
        secciones: [
            {
                titulo: 'Estados de una factura',
                texto: 'Cada factura puede estar en uno de estos estados:\n• AUTORIZADO: el SRI aceptó y autorizó la factura.\n• PENDIENTE: enviada pero sin respuesta del SRI aún.\n• RECHAZADO: el SRI rechazó el comprobante (ver observación).\n• ERROR: fallo de comunicación o de firma.\n• ANULADA: cancelada internamente.',
            },
            {
                titulo: 'Acciones disponibles',
                texto: 'Desde el listado puedes: (1) Descargar el XML firmado, (2) Descargar el RIDE en PDF (documento oficial SRI), (3) Reenviar el correo al cliente con el RIDE y XML adjunto, (4) Imprimir el ticket POS nuevamente, (5) Reintentar la autorización en facturas con error.',
                tips: [
                    'El RIDE es el único documento válido ante el SRI como comprobante de venta.',
                    'Filtra por fecha para encontrar facturas de períodos anteriores.',
                ],
            },
            {
                titulo: 'Filtros y búsqueda',
                texto: 'Usa los selectores de fecha (Desde / Hasta) para acotar el período. El campo de búsqueda permite encontrar por número de factura, nombre de cliente o RUC.',
            },
        ],
    },

    // ─── CLIENTES ───────────────────────────────────────────────────────────
    'clientes': {
        titulo: 'Gestión de Clientes',
        subtitulo: 'Catálogo de clientes para facturación',
        secciones: [
            {
                titulo: 'Búsqueda de clientes',
                texto: 'Escribe el nombre, RUC o cédula en el campo de búsqueda y presiona Enter o el botón Buscar. El sistema filtra los resultados del catálogo. Usa el asterisco (*) como comodín para búsquedas parciales. Ejemplo: "GARCIA*" encuentra todos los clientes cuyo nombre empieza con "GARCIA".',
            },
            {
                titulo: 'Crear nuevo cliente',
                texto: 'Haz clic en "+ Nuevo Cliente". Ingresa el RUC, cédula o pasaporte en el primer campo. Si el cliente tiene RUC/cédula ecuatoriana, el sistema consulta al SRI automáticamente para completar el nombre y dirección. Revisa y completa los datos faltantes (correo, teléfono) y guarda.',
                tips: [
                    'RUC: 13 dígitos, termina en 001.',
                    'Cédula: 10 dígitos.',
                    'Pasaporte: texto libre (extranjeros).',
                    'El correo electrónico es necesario para el envío automático del RIDE.',
                ],
            },
            {
                titulo: 'Editar y desactivar',
                texto: 'Haz clic en el ícono de edición (lápiz) en la fila del cliente para modificar sus datos. Para desactivar un cliente (dado de baja) usa el ícono de papelera: el cliente deja de aparecer en búsquedas pero sus facturas históricas se conservan intactas. Para restaurar un cliente desactivado, activa el filtro "Ver dados de baja".',
                alerta: 'No se puede eliminar un cliente que tenga facturas emitidas. Solo se puede desactivar.',
            },
        ],
    },

    // ─── ARTÍCULOS ──────────────────────────────────────────────────────────
    'articulos': {
        titulo: 'Catálogo de Artículos',
        subtitulo: 'Productos y servicios disponibles para facturar',
        secciones: [
            {
                titulo: 'Campos principales',
                texto: 'Cada artículo tiene: Código (identificador interno, máx 25 caracteres, en mayúsculas), Nombre/Descripción (texto que aparece en la factura), Precio de venta (sin IVA), Tarifa de IVA (15%, 5% o 0%) y Stock (cantidad disponible en inventario).',
                tips: [
                    'El código es único por empresa. Se puede usar el código de barra.',
                    'Los servicios se pueden registrar como artículos con IVA 15% o 0% según corresponda.',
                ],
                alerta: 'La tarifa de IVA debe ser la correcta según la naturaleza del bien/servicio. Una tarifa incorrecta implica errores tributarios ante el SRI.',
            },
            {
                titulo: 'Control de inventario',
                texto: 'Al emitir una factura, el sistema descuenta automáticamente la cantidad vendida del stock del artículo. Los ajustes manuales de inventario se realizan en Inventarios → Ajuste de Inventario. El Kardex registra todos los movimientos de entrada y salida.',
                tips: [
                    'Los artículos con stock en 0 siguen apareciendo en el catálogo pero conviene mantener el inventario actualizado.',
                    'Las transferencias entre bodegas no afectan el stock total.',
                ],
            },
            {
                titulo: 'Subproductos y precios por volumen',
                texto: 'Los subproductos permiten agrupar artículos en combos o kits (ej: "Combo Pizza + Bebida"). Los precios por volumen permiten definir descuentos automáticos según la cantidad comprada.',
            },
        ],
    },

    // ─── CONSULTA VENTAS ────────────────────────────────────────────────────
    'consulta-ventas': {
        titulo: 'Consulta de Ventas',
        subtitulo: 'Reporte de facturas con detalle por formas de pago',
        secciones: [
            {
                titulo: 'Filtros disponibles',
                texto: 'Selecciona el rango de fechas (Desde / Hasta) y opcionalmente el vendedor. Por defecto muestra el mes actual. Presiona "Consultar" para cargar los resultados. El reporte incluye: número de factura, fecha, cliente, base imponible, IVA, total y desglose por formas de pago.',
                tips: [
                    'Para ver solo las ventas de hoy: ajusta Desde y Hasta a la fecha actual.',
                    'Para ventas del mes anterior: primer y último día del mes pasado.',
                ],
            },
            {
                titulo: 'Detalle por factura',
                texto: 'Haz clic en la fila de cualquier factura para expandir el detalle: productos vendidos con cantidades y precios, y desglose exacto de pagos recibidos por método.',
            },
            {
                titulo: 'Exportar e imprimir',
                texto: 'El botón "Exportar Excel" descarga el reporte completo en formato .xlsx con todas las columnas visibles. El botón "Imprimir" abre el reporte en modo impresión optimizado para papel carta (A4).',
            },
        ],
    },

    // ─── CARTERA CXC ────────────────────────────────────────────────────────
    'cartera-cxc': {
        titulo: 'Cartera de Clientes (CxC)',
        subtitulo: 'Control de cuentas por cobrar y abonos',
        secciones: [
            {
                titulo: '¿Qué es la cartera?',
                texto: 'La cartera registra las facturas emitidas a crédito que aún no han sido pagadas en su totalidad. Cada vez que emites una factura con forma de pago "Crédito", QuickInvoice crea automáticamente un registro de deuda en la cartera del cliente.',
            },
            {
                titulo: 'Registrar un abono o pago',
                texto: 'Busca la deuda del cliente (por nombre, RUC o número de factura). Haz clic en "Abonar" en la fila correspondiente. Ingresa el monto del pago, la fecha y la forma de cobro (efectivo, transferencia, cheque). Si el monto cubre el total, la deuda queda saldada.',
                tips: [
                    'Puedes registrar múltiples abonos parciales hasta completar el saldo.',
                    'Los pagos quedan registrados en el historial de movimientos de cartera.',
                ],
            },
            {
                titulo: 'Estado de cuenta',
                texto: 'En Clientes → Estado de Cuenta puedes ver el historial completo de deudas y pagos de un cliente específico, con saldo acumulado y fechas de vencimiento.',
            },
        ],
    },

    // ─── NOTAS DE CRÉDITO ───────────────────────────────────────────────────
    'notas-credito': {
        titulo: 'Notas de Crédito',
        subtitulo: 'Devoluciones y ajustes sobre facturas autorizadas',
        secciones: [
            {
                titulo: '¿Cuándo emitir una nota de crédito?',
                texto: 'La nota de crédito se emite cuando necesitas:\n• Devolver mercadería a un cliente.\n• Corregir un error en precio o cantidad de una factura autorizada.\n• Aplicar un descuento posterior a la venta.\nSiempre referencia a la factura original.',
                alerta: 'La nota de crédito no "anula" la factura en el sistema del SRI; reduce el valor del comprobante original. Si necesitas anulación total, emite una nota de crédito por el valor exacto de la factura.',
            },
            {
                titulo: 'Proceso de emisión',
                texto: 'Haz clic en "+ Nueva N/C". Ingresa el número de la factura de sustento y el sistema cargará los datos. Selecciona los productos o el monto a devolver, indica el motivo y emite. El SRI debe autorizar la nota de crédito igual que una factura.',
                tips: [
                    'El comprobante de sustento (factura original) debe estar AUTORIZADO.',
                    'La nota de crédito reduce el saldo en cartera si la factura estaba a crédito.',
                ],
            },
        ],
    },

    // ─── GUÍAS DE REMISIÓN ──────────────────────────────────────────────────
    'guias-remision': {
        titulo: 'Guías de Remisión',
        subtitulo: 'Comprobante electrónico para transporte de bienes',
        secciones: [
            {
                titulo: '¿Cuándo se requiere?',
                texto: 'La guía de remisión es obligatoria cuando transportas bienes entre localidades dentro del Ecuador. Acompaña físicamente la mercadería durante el traslado. El SRI la identifica con el código de documento 06.',
            },
            {
                titulo: 'Datos necesarios',
                texto: '• Transportista: nombre, cédula/RUC y placa del vehículo.\n• Fechas: inicio y fin del transporte.\n• Dirección de salida: punto de origen de los bienes.\n• Destinatario: empresa o persona que recibe (nombre, identificación, dirección).\n• Documento de sustento: número de la factura de venta que ampara los bienes.',
                tips: [
                    'Puedes registrar transportistas frecuentes en el catálogo para seleccionarlos rápidamente.',
                    'El motivo de traslado más común es VENTA, pero puede ser TRASLADO INTERNO, DEVOLUCIÓN, etc.',
                ],
            },
            {
                titulo: 'Autorización SRI',
                texto: 'Al generar la guía, el sistema la firma y envía al SRI para autorización. Solo una guía AUTORIZADA es válida para amparar el transporte. Descarga el RIDE o el XML desde el listado de guías.',
            },
        ],
    },

    // ─── PROFORMAS ──────────────────────────────────────────────────────────
    'proformas': {
        titulo: 'Proformas / Cotizaciones',
        subtitulo: 'Cotizaciones no vinculantes que se convierten en facturas',
        secciones: [
            {
                titulo: '¿Qué es una proforma?',
                texto: 'Una proforma es una cotización formal que se entrega al cliente antes de la venta. No se envía al SRI ni tiene validez tributaria. Sirve para que el cliente conozca los precios antes de confirmar la compra.',
            },
            {
                titulo: 'Crear y enviar',
                texto: 'El formulario es idéntico al de Factura Directa. Ingresa cliente, productos y condiciones. Puedes imprimir la proforma o enviarla por correo al cliente directamente desde el sistema.',
                tips: [
                    'Las proformas no descuentan del inventario.',
                    'Puedes crear varias proformas para un mismo cliente.',
                ],
            },
            {
                titulo: 'Convertir en factura',
                texto: 'Desde el listado de proformas, haz clic en "Facturar" en la fila deseada. El sistema carga todos los datos de la proforma en el formulario de facturación directa para que confirmes y emitas.',
            },
        ],
    },

    // ─── CIERRES DE CAJA ────────────────────────────────────────────────────
    'cierres': {
        titulo: 'Cierres de Caja',
        subtitulo: 'Apertura, control y arqueo de la sesión de caja',
        secciones: [
            {
                titulo: 'Apertura de caja',
                texto: 'Al inicio del turno, el cajero debe abrir una sesión de caja ingresando el fondo de cambio inicial (dinero físico disponible para dar vuelto). El sistema registra la hora de apertura y todos los cobros que se realicen durante la sesión quedarán asociados a este cierre.',
            },
            {
                titulo: 'Durante la jornada',
                texto: 'Cada factura cobrada actualiza automáticamente los totales de la caja: efectivo, tarjeta, transferencia, cheque y crédito. Puedes consultar el estado actual de la caja en cualquier momento desde el menú Cierres → Ver estado actual.',
            },
            {
                titulo: 'Cierre y arqueo',
                texto: 'Al final del turno, el cajero ingresa el efectivo físico contado, los vouchers de tarjetas y depósitos. El sistema compara contra los cobros registrados y muestra las diferencias. Completa el cierre para liberar la caja.',
                tips: [
                    'El ticket de cierre se puede imprimir en la impresora de 80mm.',
                    'Los cierres quedan almacenados para auditoría histórica.',
                ],
                alerta: 'Solo un cierre de caja puede estar abierto por usuario a la vez. Si hay un cierre abierto de una sesión anterior sin cerrar, debe cerrarse primero.',
            },
        ],
    },

    // ─── CONFIGURACIÓN ──────────────────────────────────────────────────────
    'configuracion': {
        titulo: 'Configuración de Empresa',
        subtitulo: 'Datos, firma electrónica, logotipo y puntos de emisión',
        secciones: [
            {
                titulo: 'Datos de la empresa',
                texto: 'En el tab "Empresa" completa: Razón social, nombre comercial, RUC, dirección del establecimiento principal, teléfono y correo de contacto. El correo se usa como remitente en el envío automático de facturas al cliente.',
                tips: [
                    'El nombre comercial es el que aparecerá en encabezados de facturas y tickets.',
                    'La dirección debe coincidir con la registrada en el SRI.',
                ],
            },
            {
                titulo: 'Firma electrónica (.p12)',
                texto: 'La firma electrónica es obligatoria para emitir comprobantes al SRI. Haz clic en el campo "Firma (.p12)" y selecciona el archivo de certificado emitido por el BCE o entidad autorizada. Ingresa la contraseña de la firma. Una vez cargada, el sistema la usa en cada emisión sin pedirte la contraseña cada vez.',
                alerta: 'El certificado tiene fecha de vencimiento. Si la firma vence, las facturas no podrán autorizarse. Renueva con anticipación en el BCE o tu banco.',
            },
            {
                titulo: 'Ambiente SRI',
                texto: '• PRUEBAS: los comprobantes se procesan en el servidor de pruebas del SRI. Úsalo durante la configuración inicial y testeo. Las facturas de prueba no son documentos válidos.\n• PRODUCCIÓN: los comprobantes son oficiales, válidos para clientes y autoridades tributarias.',
                alerta: 'Una vez en PRODUCCIÓN, cada factura emitida es un documento oficial. Verifica que todos los datos estén correctos antes de cambiar al ambiente de Producción.',
            },
            {
                titulo: 'Puntos de emisión',
                texto: 'Cada terminal o caja debe tener un punto de emisión registrado en el SRI: establecimientos (3 dígitos, ej: 001) y punto de emisión (3 dígitos, ej: 001). La secuencia de facturas es independiente por cada punto.',
            },
            {
                titulo: 'Logotipo',
                texto: 'Sube el logotipo de tu empresa (PNG recomendado, máx 1 MB). Aparecerá en el encabezado del RIDE y en el ticket de 80mm. Si el logo no aparece en el ticket, revisa que tenga fondo transparente o blanco.',
            },
            {
                titulo: 'Impresión directa POS (Chrome)',
                texto: 'Para evitar que Chrome muestre el diálogo "Guardar como PDF" al imprimir tickets, descarga el archivo .bat de esta sección y ejecútalo para abrir Chrome en modo kiosk-printing. Con este modo activo, la impresión va directamente a la impresora predeterminada sin ningún diálogo.',
            },
        ],
    },

    // ─── ANULACIÓN ──────────────────────────────────────────────────────────
    'anulacion': {
        titulo: 'Anulación de Facturas',
        subtitulo: 'Cancelación interna de comprobantes emitidos',
        secciones: [
            {
                titulo: '¿Qué significa anular?',
                texto: 'En QuickInvoice, "anular" marca la factura como ANULADA en el sistema interno. El SRI no tiene un proceso de anulación electrónica para facturas autorizadas; la anulación es un control interno. Para efectos tributarios, la forma correcta de revertir una factura es emitir una Nota de Crédito por el valor total.',
                alerta: 'Anula una factura solo si hay un error grave y no puedes emitir nota de crédito. Consulta con tu contador antes de anular.',
            },
            {
                titulo: 'Proceso',
                texto: 'Busca la factura a anular, haz clic en el botón "Anular" y confirma el motivo de anulación. La factura queda marcada como ANULADA, no aparece en los reportes de ventas y el stock se devuelve al inventario.',
            },
        ],
    },

    // ─── CUENTAS POR PAGAR ──────────────────────────────────────────────────
    'cuentas-pagar': {
        titulo: 'Cuentas por Pagar (CxP)',
        subtitulo: 'Gestión de deudas con proveedores',
        secciones: [
            {
                titulo: 'Origen de los registros',
                texto: 'Cada compra registrada a crédito en el módulo de Compras genera automáticamente una cuenta por pagar al proveedor correspondiente.',
            },
            {
                titulo: 'Registrar un pago',
                texto: 'Selecciona la deuda con el proveedor, haz clic en "Pagar" e ingresa el monto, fecha y forma de pago. El saldo se actualiza inmediatamente.',
            },
        ],
    },

    // ─── INVENTARIO / ARTÍCULOS ─────────────────────────────────────────────
    'inventario': {
        titulo: 'Inventario',
        subtitulo: 'Control de stock, Kardex y ajustes',
        secciones: [
            {
                titulo: 'Kardex',
                texto: 'El Kardex muestra el historial de todos los movimientos de un artículo: entradas (compras, ajustes de ingreso), salidas (ventas, ajustes de egreso) y el saldo actual. Filtra por artículo y rango de fechas.',
            },
            {
                titulo: 'Ajuste de inventario',
                texto: 'Usa los ajustes para corregir el stock por merma, pérdida, conteo físico o ingreso de mercadería sin factura. Selecciona el artículo, el tipo de movimiento (ingreso/egreso), la cantidad y la razón del ajuste.',
                alerta: 'Los ajustes quedan registrados en el Kardex y son auditables. No los uses para corregir errores de facturación; usa notas de crédito para eso.',
            },
            {
                titulo: 'Transferencia entre bodegas',
                texto: 'Si tienes varias bodegas o sucursales, puedes transferir stock entre ellas sin afectar el total de la empresa. El artículo sale de la bodega origen y entra a la bodega destino.',
            },
            {
                titulo: 'Inventario valorizado',
                texto: 'Reporte que muestra el valor del inventario actual de todos los artículos (stock × costo unitario). Útil para cierres contables y auditorías.',
            },
        ],
    },

    // ─── TALENTO HUMANO / NÓMINAS ───────────────────────────────────────────
    'talento-humano': {
        titulo: 'Talento Humano y Nóminas',
        subtitulo: 'Gestión de empleados y rol de pagos',
        secciones: [
            {
                titulo: 'Empleados',
                texto: 'Registra todos los datos del empleado: nombre, cédula, cargo, departamento, fecha de ingreso, salario base y datos de contacto. Los empleados activos son los que aparecen en los roles de pago.',
            },
            {
                titulo: 'Períodos de nómina',
                texto: 'Cada período (mensual o quincenal) genera un rol de pagos con los ingresos y descuentos de cada empleado. El sistema calcula automáticamente: horas extras, descuentos IESS (9.45%), aporte patronal (12.15%) e impuesto a la renta si aplica.',
            },
            {
                titulo: 'Conceptos de nómina',
                texto: 'Define los rubros adicionales: bonos, comisiones, horas extras, descuentos por adelanto, etc. Cada concepto se configura como "ingreso" o "descuento" y puede ser fijo o variable por período.',
                tips: [
                    'Los décimos tercero y cuarto se pueden provisionar mensualmente.',
                    'Las vacaciones acumulan desde la fecha de ingreso.',
                ],
            },
        ],
    },

    // ─── CONTABILIDAD ───────────────────────────────────────────────────────
    'contabilidad': {
        titulo: 'Contabilidad',
        subtitulo: 'Plan de cuentas, asientos y reportes financieros',
        secciones: [
            {
                titulo: 'Plan de cuentas',
                texto: 'El plan de cuentas sigue la estructura del SRI Ecuador (clase, grupo, subgrupo, cuenta, subcuenta). Puedes agregar subcuentas auxiliares para mayor detalle. Usa el buscador para encontrar cuentas por código o nombre.',
                tips: [
                    'Las cuentas marcadas como "movimiento" son las que se usan en asientos.',
                    'Las cuentas de nivel superior (clase/grupo) son solo para estructura.',
                ],
            },
            {
                titulo: 'Asientos contables',
                texto: 'Cada factura emitida genera automáticamente su asiento contable (débito en cuentas por cobrar, crédito en ventas e IVA). Puedes revisar y crear asientos manuales en el Libro Diario.',
            },
            {
                titulo: 'Reportes financieros',
                texto: 'Disponibles: Balance de Comprobación, Balance General (Situación Financiera), Estado de Resultados y Estado de Cuenta por cuenta. Todos se pueden exportar a PDF o Excel.',
            },
        ],
    },

    // ─── PREPARACIONES DE PINTURA ───────────────────────────────────────────
    'preparaciones-pintura': {
        titulo: 'Preparaciones de Pintura',
        subtitulo: 'Control de preparados y fórmulas de color',
        secciones: [
            {
                titulo: 'Nueva preparación',
                texto: 'Registra una preparación con: número de orden o factura asociada, color/fórmula, base utilizada, cantidad de insumos por componente y el cliente para el que se prepara. El sistema registra el consumo de insumos en el inventario.',
            },
            {
                titulo: 'Historial de preparaciones',
                texto: 'El listado muestra todas las preparaciones registradas con sus fórmulas. Sirve para repetir colores anteriores de un cliente. Filtra por fecha, cliente o color para encontrar preparaciones históricas.',
                tips: [
                    'Puedes reutilizar una preparación anterior como base para una nueva.',
                    'El historial permite garantizar la consistencia de color entre preparaciones.',
                ],
            },
        ],
    },

    // ─── TESORERÍA ──────────────────────────────────────────────────────────
    'tesoreria': {
        titulo: 'Tesorería',
        subtitulo: 'Cuentas bancarias, egresos, cheques y conciliación',
        secciones: [
            {
                titulo: 'Cuentas bancarias',
                texto: 'Registra las cuentas bancarias de la empresa con su número, banco y tipo. Los egresos, cheques y transferencias se asocian a una cuenta bancaria específica.',
            },
            {
                titulo: 'Egresos',
                texto: 'Registra todos los pagos realizados: proveedor o beneficiario, monto, fecha, concepto y forma de pago (efectivo, transferencia, cheque). Los egresos se reflejan en el saldo de la cuenta bancaria.',
            },
            {
                titulo: 'Cheques',
                texto: 'Gestiona los cheques emitidos: número, beneficiario, monto, fecha de emisión y fecha de cobro. Los cheques posdatados se pueden marcar como "pendientes" hasta su fecha de cobro.',
            },
            {
                titulo: 'Conciliación bancaria',
                texto: 'Compara los movimientos del sistema contra el estado de cuenta del banco. Marca cada movimiento como conciliado cuando coincide con el extracto bancario.',
            },
        ],
    },
}
