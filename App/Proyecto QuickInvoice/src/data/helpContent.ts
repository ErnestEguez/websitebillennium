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

    // ─── NOTAS DE CRÉDITO DE PROVEEDORES ────────────────────────────────────
    'nc-proveedores': {
        titulo: 'Notas de Crédito de Proveedores',
        subtitulo: 'Registra devoluciones de mercadería y ajustes de valor recibidos de tus proveedores',
        secciones: [
            {
                titulo: '1. Selecciona la factura de compra origen',
                texto: 'Busca por número de factura del proveedor. Toda N/C debe referenciar la compra a la que corresponde.',
            },
            {
                titulo: '2. Elige el tipo de N/C',
                texto: '• Devolución de Mercadería: cuando devuelves productos al proveedor — afecta el Kardex (sale el stock) y reduce el inventario contablemente.\n• N/C Valor: un descuento o ajuste de valor del proveedor, sin devolver mercadería — no toca el Kardex.',
                tips: [
                    'En Devolución, la cantidad máxima a devolver por línea está limitada a lo que aún no se haya devuelto antes.',
                    'Las bases (0%/5%/15%) se capturan a mano según el documento del proveedor.',
                ],
            },
            {
                titulo: '3. Aplicación a la Cuenta por Pagar',
                texto: 'Si la factura origen ya no tiene saldo pendiente, o el valor de la N/C lo supera, el sistema te deja elegir otra factura pendiente del mismo proveedor para aplicar el valor.',
            },
            {
                titulo: 'Ver N/C ya registradas',
                texto: 'Usa el botón "Ver N/C Registradas" para buscar y revisar notas de crédito ya ingresadas sin perder lo que estás digitando en el formulario actual.',
            },
            {
                titulo: 'Salir sin guardar',
                texto: 'Si te equivocaste al elegir la factura o el tipo, usa "Finalizar Sin Grabar" para volver al listado sin registrar nada.',
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

    // ════════════════════════════════════════════════════════════════════════
    //  INVENTARIO — PROCESOS INDIVIDUALES
    // ════════════════════════════════════════════════════════════════════════

    'compras-inventario': {
        titulo: 'Compras de Inventario',
        subtitulo: 'Ingreso de mercadería con impacto en stock y cuentas por pagar',
        secciones: [
            {
                titulo: '¿Qué es y por qué es importante?',
                texto: 'Una compra de inventario es la transacción mediante la cual la empresa adquiere bienes físicos (mercadería, materias primas, insumos) que se incorporan al stock. Contablemente genera un débito en la cuenta de Inventario y un crédito en Cuentas por Pagar (si es a crédito) o en Bancos/Caja (si es al contado). El IVA pagado en la compra constituye crédito tributario que se acumula para compensar el IVA cobrado en ventas. Cada compra mal registrada distorsiona el inventario, el balance y la declaración de IVA.',
                tips: [
                    'Toda compra debe estar respaldada por la factura física del proveedor.',
                    'El número de factura del proveedor es obligatorio para el ATS tributario.',
                    'Verifica que el RUC del proveedor sea válido antes de guardar.',
                ],
                alerta: 'Si el proveedor no emite factura válida (con autorización SRI), no puedes tomar el crédito tributario del IVA ni deducir el gasto en Renta.',
            },
            {
                titulo: 'Cabecera de la compra',
                texto: 'Selecciona el proveedor del catálogo. Ingresa: número de factura del proveedor, fecha de emisión de la factura (no la fecha de hoy, sino la del documento físico), número de autorización SRI del documento y la fecha de vencimiento del pago si es a crédito.',
            },
            {
                titulo: 'Detalle de productos',
                texto: 'Agrega cada artículo comprado: selecciona del catálogo de productos, ingresa cantidad y precio unitario de costo (sin IVA). El sistema calcula el subtotal, el IVA y el total. Si el artículo no está en el catálogo, puedes crearlo desde la misma pantalla.',
                tips: [
                    'El precio de costo ingresado actualiza el costo promedio del artículo en inventario.',
                    'Revisa bien las cantidades — un error aquí desajusta el stock.',
                ],
            },
            {
                titulo: 'IVA y retención',
                texto: 'El sistema calcula el IVA automáticamente según la tarifa del artículo. Si aplica retención en la fuente o retención de IVA, se genera el comprobante de retención correspondiente en el módulo de Retenciones.',
            },
            {
                titulo: 'Guardar y efectos',
                texto: 'Al guardar la compra: (1) el stock de cada artículo aumenta en la cantidad comprada, (2) el costo promedio se recalcula, (3) se registra la cuenta por pagar al proveedor, (4) se graba en el Kardex como movimiento de entrada. Si la compra es al contado, el saldo bancario baja inmediatamente.',
            },
        ],
    },

    'ajuste-inventario': {
        titulo: 'Ajuste de Inventario',
        subtitulo: 'Corrección de existencias por diferencias entre stock físico y sistema',
        secciones: [
            {
                titulo: '¿Qué es y por qué es importante?',
                texto: 'Un ajuste de inventario es un movimiento contable que corrige la diferencia entre el stock registrado en el sistema y el stock físico real. Estas diferencias surgen por mermas, robos, productos vencidos, errores de digitación o faltantes detectados en conteos físicos. Contablemente, un ajuste de ingreso (aumenta stock) debita Inventario y acredita Utilidad por Ajuste; un ajuste de egreso (reduce stock) debita Gasto por Pérdida de Inventario y acredita Inventario. Son movimientos auditables y deben estar justificados.',
                alerta: 'Los ajustes de inventario afectan directamente la utilidad de la empresa. Un ajuste de egreso es un gasto; un ajuste de ingreso es un ingreso extraordinario. Úsalos solo cuando haya una justificación real, no para corregir errores de facturación (eso se hace con notas de crédito).',
            },
            {
                titulo: 'Cuándo hacer un ajuste',
                texto: 'Situaciones válidas para ajustar inventario:\n• Resultado de conteo físico (inventario anual o periódico).\n• Merma por vencimiento, daño o rotura de productos.\n• Faltante por robo o pérdida.\n• Ingreso de mercadería sin factura (donaciones, muestras).\n• Sobrante detectado en conteo (diferencia positiva).',
            },
            {
                titulo: 'Proceso de ajuste',
                texto: 'Haz clic en "+ Nuevo Ajuste". Selecciona el artículo a ajustar. Elige el tipo: INGRESO (aumenta stock) o EGRESO (reduce stock). Ingresa la cantidad del ajuste (siempre positiva, el tipo define la dirección). Escribe el motivo con detalle suficiente para auditoría. Selecciona la bodega si tienes varias. Guarda.',
                tips: [
                    'El motivo es obligatorio y queda en el Kardex — escríbelo descriptivo.',
                    'Adjunta evidencia física cuando sea posible (conteo firmado, foto de producto dañado).',
                ],
            },
            {
                titulo: 'Efectos en el sistema',
                texto: 'El ajuste se registra inmediatamente en el Kardex con tipo de movimiento "AJUSTE". El stock del artículo se actualiza al instante. Si el módulo de contabilidad está activo, genera el asiento contable correspondiente automáticamente.',
            },
        ],
    },

    'transferencia-bodega': {
        titulo: 'Transferencia entre Bodegas',
        subtitulo: 'Movimiento de mercadería entre ubicaciones sin afectar el stock total',
        secciones: [
            {
                titulo: '¿Qué es y por qué es importante?',
                texto: 'Una transferencia entre bodegas es el movimiento interno de mercadería de una ubicación (bodega, sucursal, punto de venta) a otra dentro de la misma empresa. Contablemente no genera ingreso ni gasto: el inventario total de la empresa no cambia. Sin embargo, es crítico registrarlo correctamente para saber qué stock hay en cada ubicación, especialmente cuando distintos puntos de venta tienen acceso a sus propias existencias. Una transferencia sin registrar genera sobrantes en el origen y faltantes en el destino.',
                tips: [
                    'Las transferencias no afectan el valor total del inventario en el balance.',
                    'Son útiles para "abastecer" una tienda desde la bodega central.',
                ],
            },
            {
                titulo: 'Cómo registrar una transferencia',
                texto: 'Haz clic en "+ Nueva Transferencia". Selecciona la bodega de ORIGEN (de donde sale la mercadería) y la bodega de DESTINO (donde llega). Agrega los artículos a transferir con sus cantidades. Verifica que el origen tenga stock suficiente antes de guardar. Guarda la transferencia.',
                alerta: 'No se puede transferir más cantidad de la disponible en la bodega origen. El sistema bloqueará el guardado si el stock es insuficiente.',
            },
            {
                titulo: 'Efectos en el sistema',
                texto: 'Al guardar: la bodega origen registra una salida en su Kardex y la bodega destino registra una entrada. El stock total de la empresa permanece igual. Puedes consultar el Kardex de cada bodega para ver el historial de movimientos.',
            },
        ],
    },

    'inventario-valorizado': {
        titulo: 'Inventario Valorado',
        subtitulo: 'Reporte del valor económico del inventario actual a costo',
        secciones: [
            {
                titulo: '¿Qué es y para qué sirve?',
                texto: 'El inventario valorado es un reporte financiero que muestra el valor monetario del stock disponible. Para cada artículo multiplica la cantidad existente por su costo promedio unitario. La suma total representa el activo "Inventario" que debería aparecer en el Balance General de la empresa. Este reporte es fundamental para: cierres contables, declaraciones de impuesto a la renta (determinación del costo de ventas), auditorías financieras y control de capital invertido en mercadería.',
                tips: [
                    'Compara este valor con la cuenta contable de inventario para verificar consistencia.',
                    'Un inventario valorado al cierre del año es requisito para la declaración de Renta.',
                ],
            },
            {
                titulo: 'Cómo interpretar el reporte',
                texto: 'El reporte muestra por cada artículo: código, descripción, unidad, stock actual, costo promedio unitario y valor total (stock × costo). Al pie aparece el TOTAL GENERAL que es el valor del activo inventario. Los artículos con stock cero aparecen con valor $0.',
            },
            {
                titulo: 'Exportar y usar el reporte',
                texto: 'Usa el botón "Exportar Excel" para descargar el reporte en .xlsx. Comparte con tu contador para el cierre contable. La fecha del reporte es siempre la del día actual — para un cierre histórico, genera el reporte en la fecha correspondiente.',
            },
        ],
    },

    // ════════════════════════════════════════════════════════════════════════
    //  CLIENTES — PROCESOS AVANZADOS
    // ════════════════════════════════════════════════════════════════════════

    'gestion-cartera': {
        titulo: 'Gestión de Cartera',
        subtitulo: 'Análisis de vencimientos y seguimiento de cuentas por cobrar',
        secciones: [
            {
                titulo: '¿Qué es la gestión de cartera?',
                texto: 'La gestión de cartera es el proceso de monitoreo, seguimiento y cobro de las cuentas por cobrar a clientes. Es uno de los procesos más críticos en la administración financiera porque determina el flujo de caja real de la empresa: vender a crédito sin cobrar a tiempo equivale a financiar al cliente de forma gratuita. Este módulo permite ver la cartera segmentada por antigüedad (vencida, por vencer, corriente), identificar clientes morosos y registrar gestiones de cobro.',
                tips: [
                    'Una cartera sana tiene menos del 10% vencida sobre el total.',
                    'Contacta a los clientes con deuda vencida +30 días de manera proactiva.',
                    'Considera provisionar como incobrable la cartera mayor a 180 días vencida.',
                ],
                alerta: 'Las cuentas por cobrar vencidas más de 5 años pierden acción legal de cobro (prescripción). No dejes acumular cartera antigua sin gestionar.',
            },
            {
                titulo: 'Vista de cartera por antigüedad',
                texto: 'El módulo muestra la cartera clasificada en rangos: Corriente (no vencida), 1-30 días, 31-60 días, 61-90 días y más de 90 días vencida. Esta clasificación "aging" permite priorizar la gestión de cobros: las deudas más antiguas requieren atención urgente.',
            },
            {
                titulo: 'Registrar gestión de cobro',
                texto: 'Al contactar a un cliente para cobrar, puedes dejar una nota de gestión en su cuenta: fecha de contacto, resultado (promesa de pago, sin respuesta, disputa) y fecha comprometida de pago. Esto permite dar seguimiento sistemático.',
            },
            {
                titulo: 'Aplicar un abono',
                texto: 'Cuando el cliente realiza un pago parcial o total, selecciona la(s) factura(s) a abonar, ingresa el monto recibido y la forma de cobro. El sistema actualiza el saldo de cada factura y registra el movimiento en el historial del cliente.',
            },
        ],
    },

    // ════════════════════════════════════════════════════════════════════════
    //  COMPRAS / CUENTAS POR PAGAR
    // ════════════════════════════════════════════════════════════════════════

    'proveedores': {
        titulo: 'Proveedores',
        subtitulo: 'Catálogo maestro de proveedores de bienes y servicios',
        secciones: [
            {
                titulo: '¿Por qué mantener un catálogo de proveedores?',
                texto: 'El catálogo de proveedores es la base de datos de todas las empresas o personas de quienes adquieres bienes o servicios. Mantenerlo actualizado es obligatorio para: emitir retenciones en la fuente correctamente (el porcentaje depende del tipo de proveedor y actividad), declarar el ATS tributario (anexo transaccional que exige el SRI con detalle de cada proveedor), y generar el estado de cuenta de cada proveedor para control de pagos.',
                tips: [
                    'Ingresa el RUC y el sistema consulta automáticamente el nombre en el SRI.',
                    'El tipo de proveedor (persona natural/jurídica) determina los porcentajes de retención aplicables.',
                    'Mantén actualizado el correo para enviar comprobantes de retención.',
                ],
            },
            {
                titulo: 'Crear nuevo proveedor',
                texto: 'Haz clic en "+ Nuevo Proveedor". Ingresa el RUC del proveedor en el campo de identificación — el sistema consulta el SRI y completa el nombre automáticamente. Completa: correo electrónico, teléfono, dirección y tipo de contribuyente. Guarda el registro.',
                alerta: 'Un proveedor con RUC inválido o suspendido en el SRI no te permite deducir el gasto ni tomar crédito tributario. Verifica su estado en el portal del SRI antes de registrarlo.',
            },
            {
                titulo: 'Editar y desactivar',
                texto: 'Haz clic en el ícono de edición para modificar datos de un proveedor. Para desactivar un proveedor que ya no usas, haz clic en el ícono de desactivar — ya no aparecerá en las búsquedas de compras pero su historial se conserva intacto.',
            },
        ],
    },

    'compras-servicios': {
        titulo: 'Compras de Servicios',
        subtitulo: 'Registro de gastos por servicios adquiridos (no generan inventario)',
        secciones: [
            {
                titulo: '¿Qué diferencia a una compra de servicio?',
                texto: 'A diferencia de una compra de inventario que aumenta el stock de un artículo, una compra de servicio registra un gasto operativo: honorarios profesionales, arrendamiento, publicidad, mantenimiento, servicios básicos, etc. Contablemente debita una cuenta de Gasto (5.x.x) y acredita Cuentas por Pagar o Bancos. No afecta el inventario. Es igualmente importante para el ATS tributario y para declarar el gasto como deducible en el Impuesto a la Renta.',
                tips: [
                    'Clasifica el gasto en la cuenta contable correcta para estados financieros precisos.',
                    'Los servicios profesionales generalmente aplican retención en la fuente del 10%.',
                    'Servicios de personas naturales no obligadas a llevar contabilidad: retención 10% renta y 30% IVA.',
                ],
                alerta: 'Para que el gasto sea deducible en renta, la factura del proveedor debe estar autorizada por el SRI y el pago bancarizado (si supera $1.000 debe ser por medios electrónicos).',
            },
            {
                titulo: 'Registrar la compra',
                texto: 'Selecciona el proveedor. Ingresa número de factura, fecha de emisión y número de autorización SRI. En el detalle, describe el servicio adquirido, el valor y el IVA. Indica si aplica retención — el sistema generará el comprobante de retención automáticamente.',
            },
            {
                titulo: 'Cuenta contable del gasto',
                texto: 'Selecciona la cuenta del plan de cuentas que corresponde al tipo de gasto (ej: 5.1.1.01 Sueldos, 5.2.1.01 Arrendamiento, 5.2.2.01 Publicidad). Esta clasificación es crítica para el Estado de Resultados.',
            },
        ],
    },

    'retenciones': {
        titulo: 'Retenciones en la Fuente',
        subtitulo: 'Comprobantes de retención de IVA e Impuesto a la Renta a proveedores',
        secciones: [
            {
                titulo: '¿Qué es una retención y por qué se aplica?',
                texto: 'La retención en la fuente es un mecanismo mediante el cual la empresa compradora (agente de retención) descuenta un porcentaje del valor a pagar al proveedor y lo entrega directamente al SRI en nombre de ese proveedor. Se aplica sobre el Impuesto a la Renta (IR) y sobre el IVA. El objetivo es asegurar el recaudo anticipado de impuestos. Como agente de retención, la empresa tiene la obligación legal de emitir el comprobante de retención al proveedor dentro de los 5 días hábiles siguientes a la recepción de la factura. La retención pagada por el proveedor le sirve como crédito tributario en sus propias declaraciones.',
                tips: [
                    'Retención IR: varía según el tipo de bien/servicio (1%, 2%, 8%, 10%).',
                    'Retención IVA: 30% bienes, 70% servicios, 100% servicios profesionales y honorarios.',
                    'No todas las compras aplican retención — depende del tipo de proveedor y del bien/servicio.',
                    'Las personas naturales no obligadas a llevar contabilidad aplican mayores porcentajes.',
                ],
                alerta: 'Emitir la retención fuera del plazo de 5 días hábiles genera una multa del 5% del valor retenido. Emite siempre dentro del plazo.',
            },
            {
                titulo: 'Generación automática',
                texto: 'Al guardar una compra con retención marcada, el sistema genera automáticamente el comprobante de retención con los porcentajes correctos según el tipo de proveedor y concepto. El comprobante se firma y autoriza en el SRI igual que una factura.',
            },
            {
                titulo: 'Listado de retenciones',
                texto: 'En este módulo ves todas las retenciones emitidas. Puedes filtrar por fecha y estado. Desde cada retención puedes: descargar el XML, descargar el RIDE, reenviar por correo al proveedor o reintentar la autorización si hubo error.',
                tips: [
                    'El RIDE de la retención es el documento que el proveedor usa como crédito tributario.',
                    'Guarda copias de todas las retenciones autorizadas para el ATS mensual.',
                ],
            },
        ],
    },

    'cxp': {
        titulo: 'Cuentas por Pagar (CxP)',
        subtitulo: 'Control de obligaciones con proveedores y fechas de vencimiento',
        secciones: [
            {
                titulo: '¿Qué son las cuentas por pagar?',
                texto: 'Las cuentas por pagar representan las deudas de la empresa hacia sus proveedores por compras realizadas a crédito. En el balance, son un pasivo corriente. Una gestión eficiente de CxP implica: pagar en las fechas acordadas para mantener buenas relaciones comerciales y evitar recargos, aprovechar descuentos por pronto pago cuando existen, y planificar el flujo de caja para tener los fondos disponibles en los vencimientos. Las CxP se originan automáticamente cada vez que se registra una compra a crédito.',
                tips: [
                    'Ordena la vista por fecha de vencimiento para priorizar los pagos más urgentes.',
                    'Las CxP vencidas pueden generar intereses moratorios según lo pactado con el proveedor.',
                ],
            },
            {
                titulo: 'Ver el estado de deudas',
                texto: 'El módulo muestra todas las facturas de compra pendientes de pago con su proveedor, monto original, monto pagado, saldo pendiente y fecha de vencimiento. Los registros vencidos aparecen resaltados para facilitar la priorización.',
            },
            {
                titulo: 'Registrar un pago',
                texto: 'Selecciona la deuda a pagar (una o varias facturas del mismo proveedor). Haz clic en "Registrar Pago". Ingresa: monto pagado, fecha del pago, cuenta bancaria desde la que se paga y referencia (número de transferencia, cheque, etc.). El saldo se actualiza inmediatamente y se genera el comprobante de egreso correspondiente.',
            },
        ],
    },

    // ════════════════════════════════════════════════════════════════════════
    //  TESORERÍA — PROCESOS INDIVIDUALES
    // ════════════════════════════════════════════════════════════════════════

    'egresos': {
        titulo: 'Comprobantes de Egreso',
        subtitulo: 'Registro de todos los pagos realizados por la empresa',
        secciones: [
            {
                titulo: '¿Qué es un comprobante de egreso?',
                texto: 'El comprobante de egreso (CE) es el documento interno que respalda cada salida de dinero de la empresa, ya sea en efectivo, cheque o transferencia bancaria. Es el equivalente de la factura en el lado de los pagos: toda salida de fondos debe tener su CE con el detalle de a quién se pagó, cuánto, por qué concepto y desde qué cuenta bancaria. Contablemente, un egreso débita la cuenta de gasto o pasivo (CxP) y acredita la cuenta bancaria o caja. Sin este registro, el saldo bancario del sistema difiere del saldo real.',
                tips: [
                    'Crea el CE en la misma fecha que realizas el pago, no después.',
                    'El número de referencia (transferencia, cheque) es clave para la conciliación bancaria.',
                    'Asocia el CE a la factura del proveedor que estás pagando cuando aplique.',
                ],
            },
            {
                titulo: 'Crear un nuevo egreso',
                texto: 'Haz clic en "+ Nuevo Egreso". Selecciona: beneficiario (proveedor del catálogo o libre), cuenta bancaria origen, forma de pago (efectivo, transferencia, cheque), monto, fecha y concepto/descripción. Si el pago corresponde a una CxP registrada, selecciona la factura vinculada para cerrar automáticamente esa deuda.',
            },
            {
                titulo: 'Imprimir el comprobante',
                texto: 'Una vez guardado, puedes imprimir el CE para que sea firmado por quien autoriza el pago y quien lo recibe. Esto crea una pista de auditoría física. El CE impreso debe archivarse junto con la factura del proveedor.',
            },
        ],
    },

    'cheques': {
        titulo: 'Cheques Emitidos',
        subtitulo: 'Control de cheques girados a proveedores y terceros',
        secciones: [
            {
                titulo: '¿Por qué controlar los cheques?',
                texto: 'Un cheque es un documento de pago que puede ser cobrado inmediatamente o en una fecha futura. El control de cheques es indispensable porque un cheque emitido no cobrado aún es una obligación real aunque el banco no lo haya debitado todavía. Muchas empresas tienen saldos bancarios que no coinciden con el estado de cuenta del banco precisamente porque hay cheques girados y no cobrados, conocidos como "cheques en tránsito". Sin este registro, el saldo del sistema puede parecer mayor al disponible real, lo que lleva a sobregiros.',
                tips: [
                    'Registra cada cheque en el momento de emitirlo, no cuando se cobra.',
                    'Los cheques sin cobrar por más de 6 meses pueden perder validez legal.',
                    'Concilia mensualmente los cheques en tránsito contra el extracto bancario.',
                ],
                alerta: 'Emitir un cheque sin fondos suficientes es un delito en Ecuador. Verifica siempre el saldo disponible real (deduciendo cheques en tránsito) antes de girar.',
            },
            {
                titulo: 'Registrar un cheque',
                texto: 'Haz clic en "+ Nuevo Cheque". Ingresa: número de cheque, beneficiario, cuenta bancaria, monto, fecha de emisión, fecha de postdata (si aplica) y concepto del pago. El sistema reduce el saldo disponible de la cuenta inmediatamente.',
            },
            {
                titulo: 'Estados del cheque',
                texto: 'Un cheque puede estar en uno de estos estados:\n• EMITIDO: girado pero no cobrado en banco aún.\n• COBRADO: el banco ya lo debitó (se confirma en conciliación).\n• ANULADO: el cheque no será cobrado (se devuelve el saldo).\n• PROTESTADO: el banco lo rechazó por fondos insuficientes o firma.',
            },
        ],
    },

    'cheques-a-fecha': {
        titulo: 'Cheques a Fecha (Posfechados)',
        subtitulo: 'Gestión de cheques posdatados recibidos de clientes',
        secciones: [
            {
                titulo: '¿Qué son los cheques a fecha?',
                texto: 'Los cheques a fecha o posdatados son cheques recibidos de clientes con una fecha de cobro futura. Son una forma de crédito informal muy común en el comercio ecuatoriano: el cliente entrega el cheque hoy pero se acuerda cobrarlo en una fecha específica. Aunque técnicamente un cheque es pagadero a la vista, la costumbre comercial es respetarlos. Contablemente, un cheque a fecha recibido es un activo financiero "Documentos por Cobrar" que se convierte en efectivo en la fecha de cobro. Llevar un control riguroso evita que se olviden cobrar o que se cobren antes de tiempo.',
                tips: [
                    'Ordena la vista por fecha de cobro para saber qué cheques vencen cada día.',
                    'Deposita el cheque 1-2 días antes de la fecha para prever problemas de fondos.',
                    'Si el cliente solicita cambio de fecha, registra la novedad en el sistema.',
                ],
                alerta: 'Depositar un cheque a fecha antes de la fecha acordada puede dañar la relación comercial y el cheque podría ser protestado si el cliente no tiene fondos aún. Respeta la fecha acordada.',
            },
            {
                titulo: 'Registrar un cheque recibido',
                texto: 'Haz clic en "+ Nuevo Cheque a Fecha". Ingresa: cliente que lo emite, número de cheque, banco emisor, monto, fecha de recepción y fecha de cobro acordada. El sistema calcula automáticamente los días faltantes para el vencimiento.',
            },
            {
                titulo: 'Flujo de cobro',
                texto: 'Cuando llega la fecha de cobro: selecciona el cheque, haz clic en "Marcar como Cobrado" e indica la cuenta bancaria donde se depositó. El sistema registra el ingreso bancario y cierra el documento.',
            },
        ],
    },

    'movimientos-bancos': {
        titulo: 'Movimientos Bancarios',
        subtitulo: 'Registro completo de entradas y salidas por cuenta bancaria',
        secciones: [
            {
                titulo: '¿Para qué sirve este módulo?',
                texto: 'El módulo de movimientos bancarios consolida todos los registros de entradas y salidas de dinero en cada cuenta bancaria: cobros de clientes (depósitos), pagos a proveedores (egresos y cheques), transferencias entre cuentas propias y ajustes manuales. Es el equivalente digital del "libro banco" que los contadores llevan en Excel. Mantener este registro actualizado y cuadrado con el extracto bancario es la base de la conciliación bancaria mensual y del reporte de flujo de caja.',
                tips: [
                    'El saldo del sistema debe coincidir con el saldo del banco + cheques en tránsito.',
                    'Registra las transferencias entre cuentas propias como movimiento de salida en una y de entrada en la otra.',
                ],
            },
            {
                titulo: 'Consultar movimientos',
                texto: 'Selecciona la cuenta bancaria y el rango de fechas. El sistema muestra el saldo inicial, todos los movimientos del período con su fecha, concepto, tipo (ingreso/egreso) y monto, y el saldo final. Puedes exportar a Excel para análisis externo.',
            },
            {
                titulo: 'Registrar un movimiento manual',
                texto: 'Para movimientos no generados automáticamente (comisiones bancarias, intereses ganados, notas de débito/crédito del banco), usa "+ Nuevo Movimiento". Indica tipo (ingreso/egreso), cuenta, monto, fecha y descripción detallada.',
            },
        ],
    },

    'conciliacion': {
        titulo: 'Conciliación Bancaria',
        subtitulo: 'Verificación y cuadre entre el sistema y el extracto bancario',
        secciones: [
            {
                titulo: '¿Qué es la conciliación bancaria?',
                texto: 'La conciliación bancaria es el proceso periódico (generalmente mensual) de comparar los movimientos registrados en el sistema contable contra los movimientos que aparecen en el extracto del banco. El objetivo es confirmar que ambos registros coinciden o, si hay diferencias, identificar y explicar cada una. Las diferencias legítimas incluyen: cheques emitidos aún no cobrados, depósitos en tránsito, notas de débito/crédito bancarias no contabilizadas aún, y errores en cualquiera de los dos lados. Una conciliación limpia es señal de que los registros contables son confiables.',
                tips: [
                    'Concilia mensualmente — entre más tiempo pasa, más difícil se vuelve.',
                    'El extracto bancario en PDF lo descargas desde el portal de tu banco.',
                    'Marca como conciliado solo lo que tiene contrapartida en el extracto.',
                ],
                alerta: 'Si hay un movimiento en el extracto del banco que no está en el sistema, puede indicar un pago no registrado, un cargo bancario desconocido o incluso una transacción no autorizada. Investiga toda diferencia sin excepción.',
            },
            {
                titulo: 'Proceso de conciliación',
                texto: 'Crea una nueva conciliación para el mes a conciliar. Ingresa el saldo según el extracto bancario. El sistema muestra todos los movimientos del sistema para ese período. Marca como "conciliado" cada movimiento que aparezca en el extracto. Los no marcados son las partidas en tránsito. Al final, el sistema calcula si cuadra.',
            },
            {
                titulo: 'Partidas de conciliación',
                texto: 'Las partidas que explican la diferencia entre el saldo del banco y el saldo del sistema pueden ser:\n• Cheques emitidos no cobrados (restan al saldo banco).\n• Depósitos en tránsito (suman al saldo banco).\n• Notas de débito bancarias no registradas (restan al saldo sistema).\n• Notas de crédito bancarias no registradas (suman al saldo sistema).',
            },
        ],
    },

    // ════════════════════════════════════════════════════════════════════════
    //  CONTABILIDAD — PROCESOS INDIVIDUALES
    // ════════════════════════════════════════════════════════════════════════

    'plan-cuentas': {
        titulo: 'Plan de Cuentas',
        subtitulo: 'Estructura contable de la empresa (SRI Ecuador)',
        secciones: [
            {
                titulo: '¿Qué es el plan de cuentas?',
                texto: 'El plan de cuentas es el catálogo ordenado y codificado de todas las cuentas contables que usa la empresa para registrar sus operaciones. Es la columna vertebral de la contabilidad: sin un plan bien estructurado no existen estados financieros confiables. En Ecuador, el SRI establece la estructura mínima obligatoria. QuickInvoice implementa esta estructura con 5 niveles: Clase (1 dígito), Grupo (2 dígitos), Subgrupo (4 dígitos), Cuenta (6 dígitos) y Subcuenta (8+ dígitos). Solo las cuentas de nivel subcuenta admiten movimientos en asientos.',
                tips: [
                    'Las clases son fijas: 1-Activo, 2-Pasivo, 3-Patrimonio, 4-Ingresos, 5-Gastos, 6-Costos.',
                    'Crea subcuentas auxiliares para mayor detalle (ej: 1.1.1.01.001 - Banco Pichincha cta. corriente).',
                    'No elimines cuentas que ya tienen movimientos — mejor desactívalas.',
                ],
            },
            {
                titulo: 'Agregar una cuenta',
                texto: 'Haz clic en "+ Nueva Cuenta". Selecciona la cuenta padre (nivel superior). El código se sugiere automáticamente como el siguiente número disponible. Ingresa el nombre descriptivo de la cuenta. Marca si admite movimiento (subcuenta) o es solo para agrupación. Guarda.',
                alerta: 'El código de la cuenta no se puede cambiar después de tener asientos registrados. Piensa bien el nombre y código antes de crear.',
            },
            {
                titulo: 'Buscador de cuentas',
                texto: 'Usa el buscador para encontrar una cuenta por nombre o código. Escribe parte del nombre (ej: "banco", "iva", "cxc") y el sistema filtra en tiempo real. Al seleccionar una cuenta puedes ver su saldo actual, sus movimientos y su posición en la jerarquía.',
            },
        ],
    },

    'diarios': {
        titulo: 'Libro Diario — Asientos Contables',
        subtitulo: 'Registro cronológico de todas las transacciones en partida doble',
        secciones: [
            {
                titulo: '¿Qué es el libro diario?',
                texto: 'El libro diario es el registro primario de la contabilidad por partida doble: cada transacción se registra como un asiento que tiene débitos y créditos que siempre deben sumar igual. Es el origen de todos los saldos contables: el balance general y el estado de resultados se construyen a partir de los saldos acumulados de cada cuenta en el diario. En QuickInvoice, muchos asientos se generan automáticamente (facturas de venta, compras, nóminas) pero también puedes crear asientos manuales para ajustes, provisiones, depreciaciones y otros movimientos no transaccionales.',
                tips: [
                    'Todo asiento debe estar equilibrado: suma de débitos = suma de créditos.',
                    'El concepto del asiento debe ser descriptivo: "Fact. 001-001-000001234 cliente XYZ".',
                    'Un asiento mal contabilizado afecta todos los estados financieros.',
                ],
                alerta: 'En períodos cerrados no se deben crear asientos — usa el período correcto. Modificar o crear asientos en períodos cerrados puede invalidar declaraciones ya presentadas.',
            },
            {
                titulo: 'Crear un asiento manual',
                texto: 'Haz clic en "+ Nuevo Asiento". Selecciona la fecha del asiento (debe ser dentro del período abierto). Escribe el concepto. En el detalle, agrega líneas: para cada línea selecciona la cuenta contable (solo subcuentas de movimiento), el valor y si es DÉBITO o CRÉDITO. El sistema muestra en tiempo real si el asiento está cuadrado. Guarda cuando los totales coincidan.',
            },
            {
                titulo: 'Tipos de asientos automáticos',
                texto: 'Los siguientes procesos generan asientos automáticos:\n• Facturas de venta → débito CxC / crédito Ventas e IVA cobrado.\n• Compras → débito Inventario / crédito CxP o Bancos.\n• Nómina → débito Sueldos y Beneficios / crédito IESS por pagar, IR retención, Sueldos por pagar.\n• Cierres de caja → débito Bancos / crédito CxC.\nPuedes revisar y editar estos asientos antes del cierre del período.',
            },
        ],
    },

    'presupuesto': {
        titulo: 'Presupuesto Anual',
        subtitulo: 'Planificación financiera y análisis real vs. presupuestado',
        secciones: [
            {
                titulo: '¿Para qué sirve el presupuesto?',
                texto: 'El presupuesto es la proyección financiera de lo que la empresa espera ingresar y gastar en un período (generalmente el año fiscal). Permite fijar metas, controlar el cumplimiento mensual y tomar decisiones correctivas a tiempo. El análisis "Real vs. Presupuesto" muestra la variación entre lo planificado y lo ejecutado en cada cuenta contable: variaciones positivas en ingresos o negativas en gastos son favorables; las negativas en ingresos o positivas en gastos son desfavorables y requieren atención gerencial.',
                tips: [
                    'Construye el presupuesto con el historial del año anterior como base.',
                    'Revisa las variaciones mensualmente, no solo al cierre del año.',
                    'Un presupuesto irreal (muy optimista o muy conservador) pierde utilidad como herramienta de control.',
                ],
            },
            {
                titulo: 'Ingresar el presupuesto',
                texto: 'Para cada cuenta contable relevante (ventas, costos, gastos), ingresa el valor mensual presupuestado para cada mes del año. Puedes distribuir un valor anual en partes iguales o asignar montos diferentes por estacionalidad. El sistema compara automáticamente estos valores con los saldos reales del diario.',
            },
            {
                titulo: 'Análisis de variaciones',
                texto: 'El reporte "Real vs. Presupuesto" muestra para cada cuenta: presupuesto del mes, ejecución real del mes, variación en monto y variación en porcentaje. Filtrable por período y nivel del plan de cuentas. Exportable a Excel para presentación gerencial.',
            },
        ],
    },

    'cierre-contable': {
        titulo: 'Cierre Contable',
        subtitulo: 'Proceso de cierre del período para bloquear movimientos y generar saldos iniciales',
        secciones: [
            {
                titulo: '¿Qué es el cierre contable?',
                texto: 'El cierre contable es el proceso mediante el cual se "congela" un período contable (generalmente un mes o un año): a partir del cierre, no se pueden agregar, modificar ni eliminar asientos en ese período. Esto garantiza la integridad de los estados financieros históricos y cumple con la normativa contable. El cierre anual incluye adicionalmente el traslado del resultado del ejercicio (utilidad o pérdida) al patrimonio, y la apertura del período siguiente con los saldos finales del período cerrado como saldos iniciales.',
                alerta: 'El cierre es irreversible. Una vez cerrado un período, no podrás modificar ningún asiento en él. Verifica que todos los registros estén completos y correctos ANTES de cerrar.',
                tips: [
                    'Antes del cierre mensual: verifica que todas las facturas del mes estén contabilizadas.',
                    'Antes del cierre anual: registra depreciaciones, provisiones y ajustes de fin de año.',
                    'Comparte el balance de comprobación con tu contador antes de cerrar el año.',
                ],
            },
            {
                titulo: 'Proceso de cierre mensual',
                texto: 'Verifica el balance de comprobación del mes (todos los saldos deben ser coherentes). Revisa que no haya asientos descuadrados o pendientes. Haz clic en "Cerrar Período". Confirma el cierre. El sistema bloquea el mes y los saldos finales pasan como saldos iniciales del mes siguiente.',
            },
            {
                titulo: 'Proceso de cierre anual',
                texto: 'Al cerrar el año contable, el sistema realiza automáticamente el asiento de cierre: traslada los saldos de las cuentas de ingresos y gastos (resultado del ejercicio) a la cuenta de Utilidad/Pérdida del ejercicio en el patrimonio. Las cuentas de balance (activos, pasivos, patrimonio) continúan con sus saldos. Es la base del balance general del siguiente año.',
            },
        ],
    },

    'integracion-qi': {
        titulo: 'Integración QuickInvoice → Contabilidad',
        subtitulo: 'Generación automática de asientos desde facturas y compras',
        secciones: [
            {
                titulo: '¿Qué hace esta integración?',
                texto: 'La integración QI-Contabilidad automatiza la generación de asientos contables a partir de los comprobantes de facturación y compras registrados en QuickInvoice. Sin esta integración, el contador debería re-digitar en contabilidad cada factura emitida o recibida — un proceso manual propenso a errores y duplicación de trabajo. Con la integración activa, cada factura autorizada genera su asiento en el diario de forma automática con las cuentas contables correctas según la configuración.',
                tips: [
                    'Configura correctamente el mapeo de cuentas (venta con IVA → qué cuenta, sin IVA → qué cuenta, etc.) antes de activar.',
                    'Revisa periódicamente los asientos generados para verificar que sean correctos.',
                ],
            },
            {
                titulo: 'Configurar el mapeo de cuentas',
                texto: 'En la pantalla de configuración, define qué cuenta contable corresponde a cada tipo de movimiento: ventas gravadas 15%, ventas 0%, IVA cobrado, IVA pagado, cuentas por cobrar, inventario, costo de ventas, etc. Este mapeo se hace una sola vez.',
            },
            {
                titulo: 'Generar asientos',
                texto: 'Selecciona el rango de fechas de los comprobantes que deseas integrar. El sistema lista todos los comprobantes del período que aún no tienen asiento contable. Haz clic en "Generar Asientos" para procesar el lote. Puedes revisar cada asiento generado antes de confirmarlo definitivamente.',
            },
        ],
    },

    'integracion-sri': {
        titulo: 'Integración SRI — Compras del Portal',
        subtitulo: 'Importación de facturas de compra desde el portal del SRI',
        secciones: [
            {
                titulo: '¿Para qué sirve?',
                texto: 'El portal del SRI registra todas las facturas que tus proveedores han emitido a tu RUC. Esta integración permite importar esas facturas directamente al módulo de compras y contabilidad de QuickInvoice sin digitarlas manualmente. Es especialmente útil para conciliar que todas las facturas de proveedores están registradas y para la elaboración del ATS (Anexo Transaccional Simplificado) mensual que se declara ante el SRI.',
                tips: [
                    'Descarga el archivo de compras del portal SRI en formato XML o Excel.',
                    'Revisa cada compra importada para verificar que las cuentas contables sean las correctas.',
                ],
            },
            {
                titulo: 'Proceso de importación',
                texto: 'Descarga del portal SRI (sri.gob.ec → Servicios en línea → Comprobantes Electrónicos) el archivo de facturas recibidas para el período. En QuickInvoice, haz clic en "Importar desde SRI", selecciona el archivo descargado y el sistema leerá cada comprobante. Revisa la lista y confirma los que deseas registrar.',
            },
        ],
    },

    'excel-ventas': {
        titulo: 'Integración Excel — Ventas Históricas',
        subtitulo: 'Importación de ventas desde archivo Excel para contabilización masiva',
        secciones: [
            {
                titulo: '¿Para qué sirve?',
                texto: 'Permite importar un archivo Excel con el resumen de ventas de un período para generar los asientos contables correspondientes de forma masiva. Es útil cuando hay ventas de períodos anteriores (migración de otro sistema) o cuando se tienen ventas de puntos externos que se consolidan en contabilidad.',
            },
            {
                titulo: 'Formato del archivo',
                texto: 'El archivo Excel debe tener el formato descargable desde esta pantalla. Las columnas requeridas son: fecha, número de factura, RUC cliente, base imponible 15%, base 0%, IVA y total. No modifiques los encabezados del template.',
                tips: [
                    'Descarga el template antes de preparar el archivo.',
                    'Cada fila es una factura.',
                    'Las fechas deben estar en formato DD/MM/YYYY.',
                ],
                alerta: 'Este módulo es para uso contable, no reemplaza la emisión electrónica de facturas al SRI. Las facturas importadas son solo para contabilización interna.',
            },
        ],
    },

    // ════════════════════════════════════════════════════════════════════════
    //  TALENTO HUMANO
    // ════════════════════════════════════════════════════════════════════════

    'vacantes': {
        titulo: 'Reclutamiento y Vacantes',
        subtitulo: 'Gestión del proceso de selección de personal',
        secciones: [
            {
                titulo: '¿Qué es y para qué sirve?',
                texto: 'El módulo de vacantes gestiona el proceso de reclutamiento desde la apertura de la posición hasta la contratación. Un proceso de selección documentado protege a la empresa: evidencia que se cumplió con igualdad de oportunidades, facilita el análisis del costo de reclutamiento y crea un banco de candidatos para futuras contrataciones. Contablemente, los costos de reclutamiento (publicidad, honorarios de consultoras) son gastos deducibles del período.',
                tips: [
                    'Define el perfil del cargo (funciones, requisitos) antes de abrir la vacante.',
                    'Registra a todos los candidatos aunque no sean seleccionados — crean el banco de talentos.',
                ],
            },
            {
                titulo: 'Crear una vacante',
                texto: 'Haz clic en "+ Nueva Vacante". Ingresa: título del cargo, departamento, número de plazas requeridas, salario referencial, descripción de funciones y requisitos mínimos. Activa la vacante para comenzar a recibir candidatos.',
            },
            {
                titulo: 'Gestionar candidatos',
                texto: 'Para cada vacante puedes registrar los candidatos que aplican, moverlos a través de las etapas del proceso (preselección, entrevista, pruebas, oferta) y registrar notas de evaluación. Al seleccionar al candidato final, el sistema facilita el traspaso a Empleados.',
            },
        ],
    },

    'empleados': {
        titulo: 'Empleados',
        subtitulo: 'Ficha maestra del personal con datos laborales y contractuales',
        secciones: [
            {
                titulo: '¿Por qué es crítica la ficha del empleado?',
                texto: 'La ficha del empleado es el registro central de la relación laboral. Contiene los datos necesarios para: calcular la nómina correctamente (salario, jornada, fecha de ingreso para décimos y vacaciones), realizar aportes al IESS (aviso de entrada/salida, matrícula de trabajo), emitir el formulario 107 de retención de impuesto a la renta del trabajador, y calcular la liquidación en caso de salida. Un dato incorrecto en la ficha (especialmente fecha de ingreso o salario base) puede generar errores en todos los cálculos laborales.',
                alerta: 'Al registrar un empleado, recuerda notificar su ingreso al IESS dentro de los primeros 3 días de trabajo mediante el Aviso de Entrada. El incumplimiento genera multas.',
                tips: [
                    'La fecha de ingreso determina el cálculo de vacaciones y décimos.',
                    'El cargo y departamento deben coincidir con el contrato de trabajo.',
                    'La cuenta bancaria del empleado es necesaria para el pago de nómina por transferencia.',
                ],
            },
            {
                titulo: 'Registrar un nuevo empleado',
                texto: 'Haz clic en "+ Nuevo Empleado". Completa: datos personales (cédula, nombre, dirección, teléfono, correo), datos laborales (cargo, departamento, tipo de contrato, jornada), datos económicos (salario base, forma de pago) y datos del IESS (número de afiliado si ya lo tiene). Adjunta el contrato digitalizado si deseas tenerlo en el sistema.',
            },
            {
                titulo: 'Proceso de salida',
                texto: 'Cuando un empleado se desvincula (renuncia, despido, conclusión de contrato): activa el proceso de salida para calcular los valores a liquidar (haberes pendientes, décimos proporcionales, vacaciones no gozadas, fondos de reserva) y registra el aviso de salida al IESS dentro de los 3 días hábiles.',
            },
        ],
    },

    'plantillas-checklist': {
        titulo: 'Plantillas de Checklist',
        subtitulo: 'Modelos reutilizables de tareas para onboarding y offboarding',
        secciones: [
            {
                titulo: '¿Para qué sirven las plantillas?',
                texto: 'Las plantillas de checklist son modelos predefinidos de listas de tareas que se aplican en procesos repetitivos como la incorporación de un nuevo empleado (onboarding) o la salida de uno (offboarding). Garantizan que ningún paso se omita: entregar credenciales, configurar el email corporativo, registrar en el IESS, firmar el contrato, recuperar equipos al salir, etc. Crea una plantilla una vez y reutilízala en cada proceso.',
            },
            {
                titulo: 'Crear una plantilla',
                texto: 'Haz clic en "+ Nueva Plantilla". Asigna un nombre descriptivo (ej: "Onboarding Vendedor", "Offboarding Administrativo"). Agrega las tareas en el orden en que deben ejecutarse: título de la tarea, descripción, responsable (Recursos Humanos, TI, Gerencia) y días hábiles límite para completarla desde el inicio del proceso.',
            },
        ],
    },

    'onboarding': {
        titulo: 'Onboarding y Offboarding',
        subtitulo: 'Proceso de incorporación o salida de empleados con seguimiento de tareas',
        secciones: [
            {
                titulo: '¿Por qué documentar estos procesos?',
                texto: 'Un onboarding bien estructurado reduce el tiempo de adaptación del nuevo empleado, disminuye la rotación temprana (los empleados que se sienten bien recibidos permanecen más tiempo) y asegura el cumplimiento de obligaciones legales. Un offboarding documentado protege a la empresa de olvidos costosos: recuperar activos, revocar accesos, calcular liquidación correctamente y evitar contingencias laborales futuras.',
            },
            {
                titulo: 'Iniciar un proceso',
                texto: 'Selecciona el empleado y el tipo de proceso (Onboarding o Offboarding). Elige la plantilla de checklist a aplicar. El sistema crea una instancia del checklist con todas las tareas asignadas a los responsables correspondientes. Cada responsable puede marcar sus tareas como completadas.',
            },
            {
                titulo: 'Seguimiento',
                texto: 'El dashboard muestra los procesos activos con su porcentaje de avance. Las tareas vencidas se destacan en rojo. El responsable de RRHH puede ver en tiempo real qué está pendiente y hacer seguimiento con los responsables de cada área.',
            },
        ],
    },

    'evaluacion-desempeno': {
        titulo: 'Evaluación de Desempeño',
        subtitulo: 'Medición periódica del rendimiento del personal',
        secciones: [
            {
                titulo: '¿Por qué evaluar el desempeño?',
                texto: 'La evaluación de desempeño es la herramienta que mide objetivamente qué tan bien está cumpliendo cada empleado con sus funciones y metas. Es la base de decisiones justas y documentadas sobre: incrementos salariales, bonos por desempeño, promociones, capacitación necesaria y, en casos extremos, desvinculación por bajo rendimiento. Sin evaluaciones formales, estas decisiones se toman subjetivamente, lo que genera conflictos laborales y desmotivación.',
                tips: [
                    'Define criterios de evaluación específicos y medibles antes de evaluar.',
                    'Comparte los resultados con el empleado en una reunión de retroalimentación.',
                    'Las evaluaciones quedan en el historial del empleado como evidencia.',
                ],
            },
            {
                titulo: 'Crear una evaluación',
                texto: 'Selecciona el empleado a evaluar, el período de evaluación y el evaluador. Define o selecciona los criterios a evaluar (puntualidad, cumplimiento de metas, trabajo en equipo, etc.) con sus ponderaciones. El evaluador completa la calificación para cada criterio. El sistema calcula el puntaje final.',
            },
        ],
    },

    'capacitacion': {
        titulo: 'Capacitación y Formación',
        subtitulo: 'Registro y seguimiento de programas de capacitación del personal',
        secciones: [
            {
                titulo: '¿Por qué registrar capacitaciones?',
                texto: 'La capacitación del personal es una inversión en capital humano. Registrarla en el sistema permite: demostrar cumplimiento del Plan Mínimo de Capacitación que exige el Ministerio del Trabajo (al menos el 1% de la masa salarial anual), evaluar el retorno de inversión, planificar futuras necesidades de formación y contar con el historial de cada empleado para ascensos o cambios de cargo.',
                tips: [
                    'El costo de la capacitación es deducible del Impuesto a la Renta.',
                    'Solicita certificados de asistencia para el expediente del empleado.',
                ],
            },
            {
                titulo: 'Registrar un evento de capacitación',
                texto: 'Haz clic en "+ Nueva Capacitación". Ingresa: nombre del curso/taller, proveedor/instructor, fechas, número de horas, costo y los empleados que participaron. Al guardar, el historial de capacitación de cada empleado se actualiza automáticamente.',
            },
        ],
    },

    'clima': {
        titulo: 'Clima Organizacional',
        subtitulo: 'Medición de la satisfacción y ambiente laboral',
        secciones: [
            {
                titulo: '¿Por qué medir el clima?',
                texto: 'El clima organizacional refleja la percepción de los empleados sobre su ambiente de trabajo: liderazgo, comunicación, reconocimiento, carga laboral, trabajo en equipo. Un mal clima se traduce en alta rotación, ausentismo y baja productividad. Las encuestas periódicas permiten identificar problemas antes de que escalen y demuestran a los empleados que su opinión importa.',
            },
            {
                titulo: 'Crear y aplicar una encuesta',
                texto: 'Crea una encuesta con las preguntas del modelo de clima (escala Likert recomendada del 1 al 5). Asigna los empleados que la responderán. El sistema envía la encuesta y consolida los resultados en un dashboard con promedios por categoría y comparativas entre períodos.',
            },
        ],
    },

    'finiquito': {
        titulo: 'Finiquitos y Liquidaciones',
        subtitulo: 'Cálculo y registro de liquidaciones al término de la relación laboral',
        secciones: [
            {
                titulo: '¿Qué es el finiquito?',
                texto: 'El finiquito es el documento que registra los valores a pagar al empleado al término de la relación laboral y la renuncia mutua de reclamaciones entre las partes. Su cálculo correcto es crítico: un error puede derivar en demandas laborales o pagos indebidos. Los componentes son: sueldo proporcional del mes, vacaciones no gozadas proporcionales, décimo tercero proporcional, décimo cuarto proporcional, fondos de reserva (si aplica) y desahucio o indemnización según el tipo de terminación.',
                alerta: 'El finiquito debe firmarse ante el Inspector de Trabajo del MRL o notario para tener plena validez legal. Sin este trámite, el empleado puede reclamar los valores en años posteriores.',
                tips: [
                    'El tipo de terminación (renuncia voluntaria, despido intempestivo, mutuo acuerdo) determina si aplica indemnización y de cuánto.',
                    'El plazo de pago del finiquito es hasta el primer día hábil siguiente a la terminación.',
                ],
            },
            {
                titulo: 'Calcular el finiquito',
                texto: 'Selecciona el empleado y la fecha de salida. Indica el tipo de terminación. El sistema calcula automáticamente todos los componentes a partir de los datos de la ficha del empleado (fecha de ingreso, salario, período de vacaciones pendientes). Revisa cada rubro y confirma.',
            },
        ],
    },

    'estructura': {
        titulo: 'Estructura Organizativa',
        subtitulo: 'Organigrama y jerarquía de la empresa',
        secciones: [
            {
                titulo: '¿Para qué sirve?',
                texto: 'La estructura organizativa define las jerarquías, departamentos y líneas de reporte de la empresa. Mantenerla actualizada facilita: asignar correctamente los gastos de personal a cada departamento en contabilidad, definir responsables de aprobación en distintos procesos, y comunicar a los empleados quién reporta a quién.',
            },
            {
                titulo: 'Crear la estructura',
                texto: 'Define los departamentos o áreas de la empresa (Ventas, Contabilidad, Producción, etc.). Asigna el responsable de cada área. Asocia cada empleado al departamento correspondiente. El sistema genera un organigrama visual que puedes exportar.',
            },
        ],
    },

    // ════════════════════════════════════════════════════════════════════════
    //  NÓMINAS
    // ════════════════════════════════════════════════════════════════════════

    'periodos-nomina': {
        titulo: 'Períodos y Rol de Pagos',
        subtitulo: 'Generación del rol de pagos mensual con todos los ingresos y deducciones',
        secciones: [
            {
                titulo: '¿Qué es el rol de pagos?',
                texto: 'El rol de pagos (también llamado nómina) es el documento contable-laboral que detalla los ingresos y descuentos de cada empleado en un período (generalmente mensual). Es la base de: el pago de sueldos, la planilla de aportes al IESS, la retención de impuesto a la renta mensual (si aplica), la contabilización del gasto de personal y la elaboración del formulario 107 anual. En Ecuador, el empleador debe pagar los sueldos hasta el último día del mes o el primer día hábil del mes siguiente. El incumplimiento genera recargo del 15% sobre el monto adeudado y puede ser denunciado al MRL.',
                tips: [
                    'Cierra el período de novedades antes de generar el rol para que todos los descuentos estén incluidos.',
                    'Verifica el rol con RRHH y con el contador antes de procesar el pago.',
                    'Guarda el rol firmado por el empleado como comprobante de pago.',
                ],
                alerta: 'Una vez aprobado el rol, los cambios deben hacerse mediante ajustes en el período siguiente. Evita modificar un rol ya pagado.',
            },
            {
                titulo: 'Crear un nuevo período',
                texto: 'Haz clic en "+ Nuevo Período". Selecciona el mes y año. El sistema carga automáticamente todos los empleados activos con sus salarios base. Antes de procesar, asegúrate de haber registrado todas las novedades del mes (horas extras, faltas, permisos, anticipos). Haz clic en "Generar Rol" para calcular los valores de cada empleado.',
            },
            {
                titulo: 'Revisar el rol individual',
                texto: 'Para cada empleado el rol muestra: ingresos (sueldo base, horas extras, bonos, comisiones, subsidios), deducciones (aporte personal IESS 9.45%, impuesto a la renta retención, anticipos, descuentos varios) y el neto a pagar. Verifica cada empleado antes de aprobarlo.',
            },
            {
                titulo: 'Aprobar y contabilizar',
                texto: 'Una vez revisado el rol, haz clic en "Aprobar Período". Esto bloquea el rol y genera automáticamente el asiento contable: débito a la cuenta de Sueldos y Salarios, crédito a IESS por pagar, Retenciones por pagar y Sueldos por pagar. El rol aprobado se puede imprimir en formato individual o consolidado.',
            },
        ],
    },

    'novedades-nomina': {
        titulo: 'Novedades de Nómina',
        subtitulo: 'Registro de variables mensuales que afectan el cálculo del rol',
        secciones: [
            {
                titulo: '¿Qué son las novedades?',
                texto: 'Las novedades son todas las variaciones que modifican el sueldo base de un empleado en un período específico: horas extras trabajadas, faltas injustificadas, permisos con o sin goce de sueldo, multas y sanciones, comisiones por ventas, bonos extraordinarios o descuentos por anticipos ya entregados. Sin registrar las novedades antes de procesar el rol, el cálculo será incorrecto. Las novedades son el "diferenciador" entre el sueldo fijo del contrato y lo que realmente corresponde pagar ese mes.',
                tips: [
                    'Las horas extras deben estar autorizadas por escrito antes de trabajarse.',
                    'Las horas 25% (diurnas) se pagan al 125% del valor hora; las 50% (nocturnas/feriados) al 150%.',
                    'Las faltas injustificadas descuentan el proporcional diario del sueldo.',
                ],
            },
            {
                titulo: 'Registrar una novedad',
                texto: 'Haz clic en "+ Nueva Novedad". Selecciona el empleado, el período al que aplica, el tipo de novedad (hora extra, falta, bono, descuento, etc.), la cantidad o monto y la fecha. El sistema calculará el impacto monetario según el tipo de novedad y el salario del empleado.',
            },
            {
                titulo: 'Novedades masivas',
                texto: 'Para registrar el mismo tipo de novedad para varios empleados a la vez (ej: bono navideño para todo el equipo), usa la opción "Novedad masiva": selecciona el tipo, ingresa el monto fijo o el porcentaje del sueldo, selecciona los empleados y confirma.',
            },
        ],
    },

    'capacidad-pago': {
        titulo: 'Estado Económico / Capacidad de Pago',
        subtitulo: 'Análisis de la situación financiera del empleado y nivel de endeudamiento',
        secciones: [
            {
                titulo: '¿Para qué sirve?',
                texto: 'El estado económico del empleado documenta su situación financiera para dos propósitos principales: (1) evaluar si puede soportar descuentos adicionales en nómina (anticipos, préstamos empresariales) sin afectar su ingreso mínimo de subsistencia, y (2) cumplir con la normativa del IESS que prohíbe descontar cuotas de préstamos IESS si el neto resultante es menor al salario básico. En Ecuador, el descuento máximo permitido sobre el sueldo es del 50% del neto, con excepciones.',
                tips: [
                    'No autorices anticipos o préstamos que lleven el neto del empleado por debajo del salario básico unificado.',
                    'Documenta la solicitud del empleado por escrito antes de aprobar cualquier descuento.',
                ],
            },
            {
                titulo: 'Consultar estado económico',
                texto: 'Selecciona el empleado. El sistema muestra el resumen de su situación: salario neto después de deducciones fijas (IESS, IR), descuentos activos (préstamos, anticipos en curso), cuota máxima disponible para nuevos descuentos y su historial de anticipos anteriores.',
            },
        ],
    },

    'decimos': {
        titulo: 'Liquidación de Décimos 13° y 14°',
        subtitulo: 'Cálculo y pago de los beneficios sociales anuales obligatorios',
        secciones: [
            {
                titulo: '¿Qué son los décimos?',
                texto: 'Los décimos son beneficios sociales obligatorios establecidos en el Código del Trabajo ecuatoriano:\n\n• Décimo Tercer Sueldo (Bono Navideño): equivale a la doceava parte de la remuneración total recibida en el período del 1 de diciembre al 30 de noviembre. Se paga hasta el 24 de diciembre o puede acumularse mensualmente.\n\n• Décimo Cuarto Sueldo: equivale a un Salario Básico Unificado (SBU) vigente al momento del pago. Período de cálculo: 1 de marzo al 28 de febrero (Sierra y Amazonía) o 1 de marzo al 28 de febrero (Costa y Galápagos). Se paga en agosto (Sierra) o abril (Costa).\n\nAmbos pueden ser acumulados mensualmente en el rol de pagos si el empleado así lo solicita.',
                tips: [
                    'El SBU para el décimo cuarto es el vigente en la fecha de pago, no del período de cálculo.',
                    'Si el empleado sale antes del período de pago, se le liquida el proporcional devengado.',
                    'Los décimos son no gravables con Impuesto a la Renta si se pagan en los montos y plazos legales.',
                ],
                alerta: 'El pago tardío de los décimos genera el 15% de recargo sobre el valor adeudado más las acciones del Ministerio del Trabajo. Programa el pago con anticipación.',
            },
            {
                titulo: 'Calcular y procesar',
                texto: 'El sistema calcula el décimo correspondiente a cada empleado con base en los roles de pago procesados en el período. Revisa el cálculo de cada empleado, ajusta si hay empleados con tiempo parcial o jornada reducida, y aprueba el lote para generar el pago y el asiento contable.',
            },
        ],
    },

    'vacaciones-nomina': {
        titulo: 'Liquidación de Vacaciones',
        subtitulo: 'Cálculo de vacaciones anuales y liquidación de días no gozados',
        secciones: [
            {
                titulo: '¿Cómo se calculan las vacaciones en Ecuador?',
                texto: 'El empleado tiene derecho a 15 días de vacaciones anuales remuneradas a partir del primer año de trabajo. A partir del sexto año, se acumula un día adicional por año de servicio (máximo 15 días adicionales). Las vacaciones se pagan con la remuneración promedio de los últimos tres meses. Si el empleado no goza de sus vacaciones, la empresa debe pagarlas liquidadas. Si el empleado sale de la empresa con vacaciones pendientes, se liquidan en el finiquito.',
                tips: [
                    'El período de vacaciones se cuenta desde la fecha de ingreso, no por año calendario.',
                    'El empleado puede acordar con el empleador tomar las vacaciones en períodos fraccionados.',
                    'Las vacaciones no usadas en más de 3 años prescriben legalmente.',
                ],
                alerta: 'No se puede acumular vacaciones indefinidamente. El empleador tiene la obligación de programar el goce de vacaciones y puede fijar las fechas si el empleado no las solicita.',
            },
            {
                titulo: 'Registrar vacaciones gozadas',
                texto: 'Cuando un empleado toma vacaciones, registra las fechas de inicio y fin en este módulo. El sistema descuenta los días del saldo acumulado disponible del empleado y genera el comprobante de vacaciones.',
            },
            {
                titulo: 'Liquidar vacaciones no gozadas',
                texto: 'Si el empleado solicita la liquidación de días acumulados (o al terminar la relación laboral), el sistema calcula el valor a pagar: (salario diario promedio últimos 3 meses) × número de días a liquidar. Genera el pago y actualiza el saldo de días disponibles.',
            },
        ],
    },

    'conceptos-nomina': {
        titulo: 'Conceptos de Nómina',
        subtitulo: 'Configuración de rubros de ingresos y descuentos del rol de pagos',
        secciones: [
            {
                titulo: '¿Qué son los conceptos?',
                texto: 'Los conceptos son los distintos rubros que componen el rol de pagos de un empleado, más allá del sueldo base. Pueden ser ingresos (bonos de alimentación, movilización, comisiones, subsidios) o descuentos (préstamos internos, multas, cuotas de cooperativa). Cada concepto tiene su propia configuración contable y tributaria: algunos son gravables con IR, otros no; algunos son base del IESS, otros no. Configurarlos correctamente es fundamental para que los cálculos de nómina, IESS e impuesto a la renta sean precisos.',
                tips: [
                    'Los beneficios en especie (alimentación, transporte) tienen límites no gravables según la ley.',
                    'Las comisiones son ingresos gravables con IR y base del IESS.',
                    'Los bonos por resultados pueden ser gravables o no, según su naturaleza y monto.',
                ],
            },
            {
                titulo: 'Crear un concepto',
                texto: 'Haz clic en "+ Nuevo Concepto". Define: nombre (ej: "Bono de Alimentación"), tipo (ingreso/descuento), si es fijo o variable, si es base IESS (afecta el cálculo del aporte), si es gravable con IR, la cuenta contable donde se registra y el método de cálculo (monto fijo, porcentaje del sueldo, o valor variable por novedad).',
            },
        ],
    },

    'cuentas-nomina': {
        titulo: 'Cuentas Contables de Nómina',
        subtitulo: 'Mapeo entre los rubros de nómina y el plan de cuentas contable',
        secciones: [
            {
                titulo: '¿Para qué sirve?',
                texto: 'Cuando se aprueba un rol de pagos, el sistema debe generar el asiento contable automáticamente: el gasto de personal se acredita a distintas cuentas del pasivo (IESS por pagar, retenciones IR por pagar, anticipos descontados, sueldos por pagar). Este módulo configura exactamente a qué cuenta del plan de cuentas va cada rubro de la nómina. Sin esta configuración, el asiento de nómina no se puede generar y deberá hacerse manualmente.',
                tips: [
                    'Cuenta de gasto: 5.1.x.x.x Sueldos, Beneficios Sociales, Aporte Patronal.',
                    'IESS por pagar (personal + patronal): 2.1.x.x Aporte IESS por pagar.',
                    'Sueldos por pagar: 2.1.x.x Sueldos y salarios por pagar.',
                ],
            },
            {
                titulo: 'Configurar el mapeo',
                texto: 'Para cada concepto de nómina (sueldo base, horas extras, aporte IESS, retención IR, etc.), selecciona la cuenta débito y la cuenta crédito correspondiente en el plan de cuentas. Haz esto una sola vez y el sistema usará esta configuración en cada asiento de nómina que genere.',
            },
        ],
    },

    'parametros-nomina': {
        titulo: 'Parámetros de Nómina',
        subtitulo: 'Configuración de tasas, límites y valores legales del período',
        secciones: [
            {
                titulo: '¿Qué son los parámetros?',
                texto: 'Los parámetros de nómina son los valores legales que determinan los cálculos laborales: Salario Básico Unificado (SBU), porcentaje de aporte personal al IESS (9.45%), porcentaje de aporte patronal (12.15%), fracción básica desgravada para IR, base de cálculo de horas extras, etc. Estos valores cambian anualmente por decreto gubernamental. Actualizarlos al inicio de cada año es obligatorio para que los cálculos de nómina, IESS e IR sean correctos.',
                tips: [
                    'Actualiza el SBU en enero de cada año cuando el gobierno lo decrete.',
                    'Actualiza las tablas del Impuesto a la Renta con los valores que publica el SRI en diciembre.',
                    'El aporte IESS no ha cambiado en varios años pero verifica anualmente.',
                ],
                alerta: 'Procesar nómina con parámetros desactualizados genera diferencias en las planillas del IESS y en las declaraciones de IR. Mantén siempre los parámetros del año vigente antes de procesar el primer rol del año.',
            },
            {
                titulo: 'Actualizar parámetros',
                texto: 'Al inicio de cada año, ingresa en este módulo: el nuevo SBU, las tablas actualizadas de IR (tramos y porcentajes), el valor del aporte patronal si cambió y cualquier otro límite legal vigente. Guarda los parámetros y el sistema los usará en todos los cálculos del período.',
            },
        ],
    },

    // ─── LIQUIDACIÓN DE COMPRA ──────────────────────────────────────────────
    'nueva-lc': {
        titulo: 'Nueva Liquidación de Compra',
        subtitulo: 'Comprobante electrónico codDoc=03 para compras a personas naturales sin RUC',
        secciones: [
            {
                titulo: '¿Cuándo emitir una Liquidación de Compra?',
                texto: 'La LC (codDoc=03) se emite cuando la empresa compra bienes o servicios a una persona natural que NO está obligada a emitir comprobante (sin RUC, con cédula, pasaporte, etc.). Ejemplos: jornaleros, artesanos, personas en zonas rurales, pagos por servicios ocasionales. El SRI exige que el comprador (la empresa) emita este documento en lugar del vendedor.',
                tips: [
                    'No uses LC cuando el proveedor tiene RUC — en ese caso pide factura.',
                    'El SRI limita a $50.000 por beneficiario al año y $200.000 en total de LC.',
                    'Las LC se autorizan en línea igual que las facturas (firma + envío al SRI).',
                ],
                alerta: 'Si el proveedor tiene RUC, el documento correcto es una Factura de Proveedor, no una LC. Emitir LC a alguien con RUC es incorrecto ante el SRI.',
            },
            {
                titulo: '1. Punto de emisión y fechas',
                texto: 'Selecciona el punto de emisión (establecimientos registrados en el SRI). La fecha de emisión por defecto es hoy. El tipo de sustento identifica la naturaleza del gasto (servicios, bienes, etc.) y es relevante para el crédito tributario de IVA.',
                tips: [
                    'Tipo sustento 02 = Compra de bienes y servicios (el más común).',
                    'Si la compra genera crédito tributario de IVA, usa el tipo adecuado.',
                ],
            },
            {
                titulo: '2. Beneficiario',
                texto: 'Ingresa la identificación (cédula o pasaporte) y el nombre completo del vendedor. Puedes buscarlo en el catálogo de proveedores si ya fue registrado, o ingresarlo manualmente. Si el beneficiario no existe en proveedores, el sistema lo crea automáticamente.',
                tips: [
                    'El sistema acepta cédula (10 dígitos), pasaporte o SIN_RUC.',
                    'La dirección y correo son opcionales pero recomendados para el RIDE.',
                ],
            },
            {
                titulo: '3. Detalle de bienes / servicios',
                texto: 'Agrega cada concepto de la compra con descripción, cantidad, precio unitario y si aplica IVA. Para empresas con contabilidad habilitada, asigna una cuenta contable a cada línea (o configura una cuenta genérica de gastos en Ajustes). El IVA se calcula automáticamente al 15% para los ítems marcados.',
                tips: [
                    'Marca "IVA" en los ítems que generan crédito tributario.',
                    'Asigna cuenta contable por línea para desglosar el asiento por tipo de gasto.',
                    'Si no asignas cuenta por línea, se usará la cuenta "Gastos de Servicios" de Ajustes.',
                ],
            },
            {
                titulo: '4. Retenciones (solo agentes de retención)',
                texto: 'Si tu empresa es Agente de Retención designado por el SRI, la sección de Retenciones aparece activa. Agrega las retenciones de IR e IVA según los códigos SRI aplicables. Las retenciones se generan como un comprobante separado (codDoc=07) y aparecen en la sección "Comprobantes de Retención".',
                tips: [
                    'Los códigos de retención para LC son los mismos que para compras normales.',
                    'El comprobante de retención debe autorizarse independientemente desde "Comprobantes de Retención".',
                    'La LC y el comprobante de retención son dos documentos electrónicos distintos.',
                ],
                alerta: 'Las retenciones aplican sobre la base antes de IVA (para IR) o sobre el IVA (para retención de IVA). Verifica los porcentajes vigentes en la tabla del SRI.',
            },
            {
                titulo: '5. Contabilización automática',
                texto: 'Al guardar la LC, el sistema genera automáticamente el asiento contable en LedgerPro si la integración está activa. El asiento registra: DEBE en las cuentas de gasto por línea + IVA crédito fiscal; HABER en Cuentas por Pagar (crédito) o Efectivo (contado) + Retenciones a pagar.',
                tips: [
                    'Para que el asiento se genere, configura las cuentas en Compras → Ajustes.',
                    'La cuenta "Gastos de Servicios (fallback)" es esencial si no asignas cuenta por línea.',
                    'El período contable debe estar abierto en LedgerPro para el mes de la LC.',
                ],
                alerta: 'Si aparece el mensaje "Asiento contable NO generado", revisa: (1) que el período esté abierto en LedgerPro, (2) que esté configurada la cuenta Cuentas por Pagar y la cuenta de Gastos en Ajustes.',
            },
            {
                titulo: '6. Guardar y autorizar',
                texto: '"Guardar borrador" crea la LC en estado PENDIENTE sin enviarla al SRI. "Guardar y Autorizar SRI" hace todo en un paso: crea la LC, la firma electrónicamente y la envía al SRI para autorización inmediata. Una vez autorizada, aparece en la lista con el número de autorización del SRI y puedes descargar el RIDE (PDF) y el XML.',
                tips: [
                    'Usa "Guardar borrador" si quieres revisar los datos antes de autorizar.',
                    'La LC autorizada puede verse y descargarse desde la lista de Liquidaciones de Compra.',
                    'El RIDE de la LC es el documento oficial para sustentar el gasto.',
                ],
            },
        ],
    },

    // ─── LOPDP: REGISTRO DE ACTIVIDADES DE TRATAMIENTO (RAT) ────────────────
    'lopdp-rat': {
        titulo: 'Registro de Actividades de Tratamiento (RAT)',
        subtitulo: 'Documenta cómo tu empresa trata datos personales, según la LOPDP de Ecuador',
        secciones: [
            {
                titulo: '¿Qué es el RAT y por qué lo pide la ley?',
                texto: 'El Registro de Actividades de Tratamiento (RAT) es un documento obligatorio del Art. 38 del Reglamento a la LOPDP. Lista cada "actividad" en la que tu empresa usa datos personales (ej. "Nómina de empleados", "Facturación a clientes", "Gestión de proveedores") y explica para qué, con qué base legal, cuánto tiempo se conservan y si se comparten con terceros. Es lo primero que pide la Superintendencia de Protección de Datos (SPDP) si hay una auditoría o una queja.',
                tips: [
                    'Piensa en "actividades" separadas por proceso de negocio, no por cada dato individual: una actividad agrupa varios campos con la misma finalidad.',
                    'Si no sabes por dónde empezar, registra primero: Nómina, Facturación/Clientes y Proveedores — son las tres que casi toda empresa tiene.',
                ],
            },
            {
                titulo: '1. Nombre y finalidad',
                texto: 'El "Nombre" es solo para identificar la actividad en tu lista (ej. "Gestión de nómina de empleados"). La "Finalidad" debe explicar en una frase para qué usas esos datos — esto es lo que la SPDP y tus propios titulares (clientes/empleados) leerán para entender por qué tienes su información.',
            },
            {
                titulo: '2. Categorías de datos y de titulares',
                texto: 'Marca qué TIPOS de datos maneja esta actividad (ej. Identificación, Contacto, Financieros, Laborales, Salud) y de QUIÉNES son esos datos (Clientes, Empleados, Proveedores, etc.). Hay sugerencias rápidas con un clic, pero también puedes escribir un valor propio si no está en la lista y presionar Enter.',
                tips: [
                    'Si la actividad incluye datos de salud, biométricos o de menores de edad, es especialmente sensible — sé preciso al elegir estas categorías.',
                ],
            },
            {
                titulo: '3. Base legal (Art. 7 LOPDP)',
                texto: 'Toda actividad de tratamiento necesita una justificación legal para existir. Las más comunes:\n• Consentimiento: el titular aceptó explícitamente (ej. marketing).\n• Ejecución de un contrato: es necesario para cumplir lo pactado (ej. nómina, facturación).\n• Obligación legal: una norma te obliga a guardar esos datos (ej. retenciones tributarias).\n• Interés legítimo: un interés justificado del negocio que no perjudica al titular.',
                tips: [
                    'La mayoría de procesos internos (nómina, facturación a clientes con contrato) usan "Ejecución de contrato" u "Obligación legal", no "Consentimiento".',
                    'Reserva "Consentimiento" para usos que el titular podría rechazar sin afectar el servicio (ej. enviarle publicidad).',
                ],
            },
            {
                titulo: '4. Plazo de retención',
                texto: 'Describe cuánto tiempo guardas estos datos y por qué (ej. "5 años tras finalizar la relación laboral, por obligación del Código de Trabajo"). La LOPDP prohíbe guardar datos indefinidamente sin justificación.',
            },
            {
                titulo: '5. Transferencias a terceros / internacionales',
                texto: 'Activa "¿Hay transferencia a terceros?" si compartes estos datos con alguien fuera de tu empresa (ej. una aseguradora, el SRI, un proveedor de nómina externo) y describe con quién. Activa "¿Hay transferencia internacional?" si esos datos salen de Ecuador (ej. un servidor o proveedor en el extranjero) e indica el país.',
                alerta: 'QuickInvoice, como tu proveedor tecnológico, ya actúa como encargado del tratamiento de estos datos — no necesitas declararlo aquí como "tercero", eso se documenta en la Política de Privacidad (Fase 3 del módulo).',
            },
            {
                titulo: '6. Archivar en vez de eliminar',
                texto: 'El botón "Archivar" no borra la actividad — la oculta del listado activo pero la conserva como evidencia histórica de cumplimiento. Nunca se elimina físicamente un registro del RAT, ya que podrías necesitar demostrar qué política tenías vigente en una fecha pasada.',
            },
            {
                titulo: '7. Exportar',
                texto: 'Usa el botón "Excel" para descargar el RAT completo en una hoja de cálculo con el encabezado de tu empresa (útil para un asesor legal o para revisión interna). Usa "Reporte RAT" para generar un documento formal — un bloque estructurado por actividad, con los datos de tu empresa y la referencia legal al Art. 38 del Reglamento — listo para imprimir o guardar como PDF desde el navegador y entregar a la Superintendencia (SPDP) si te lo solicitan.',
            },
        ],
    },

    // ─── LOPDP: SOLICITUDES ARCO-POL ────────────────────────────────────────
    'lopdp-solicitudes': {
        titulo: 'Solicitudes ARCO-POL',
        subtitulo: 'Gestiona los reclamos de tus clientes, empleados o proveedores sobre sus datos personales',
        secciones: [
            {
                titulo: '¿Qué es "ARCO-POL"?',
                texto: 'Es el conjunto de derechos que la LOPDP (Arts. 11 al 24) le da a cualquier persona sobre sus propios datos. Cuando alguien te escribe pidiendo algo relacionado a su información personal, casi siempre cae en uno de estos 6 tipos:',
                tips: [
                    'Acceso: "¿Qué datos míos tienen?"',
                    'Rectificación: "Este dato mío está mal, corríjanlo."',
                    'Cancelación: "Borren mis datos."',
                    'Oposición: "No quiero que usen mis datos para X."',
                    'Portabilidad: "Denme mis datos para llevármelos a otro proveedor."',
                    'Limitación: "No borren nada, pero dejen de usar mis datos mientras resolvemos esto."',
                ],
                alerta: 'La ley te da 15 días hábiles para responder — no 15 días corridos. El sistema calcula esto automáticamente usando el calendario oficial de feriados de Ecuador (incluye Carnaval, Semana Santa y los feriados con traslado de la Ley de Fines de Semana).',
            },
            {
                titulo: '1. Registrar una solicitud nueva',
                texto: 'Registra la solicitud el mismo día que la recibes (por correo, verbal, WhatsApp, donde sea) — la "Fecha de recepción" es el punto de partida legal del plazo, así que debe ser real, no la fecha en que por fin tuviste tiempo de anotarla. Elige el tipo correcto de la lista (cada uno muestra una explicación corta debajo del selector) y describe con tus palabras qué pidió el titular.',
                tips: [
                    'Si tienes la cédula o RUC del titular, regístrala — permite exportar automáticamente sus datos reales del sistema (clientes/proveedores/empleados) al resolver una solicitud de Acceso o Portabilidad.',
                ],
            },
            {
                titulo: '2. Fecha límite y alertas',
                texto: 'El sistema calcula solo: la fecha límite (15 días hábiles desde recepción) y una fecha de "por vencer" (3 días hábiles antes del límite). Verás una etiqueta ámbar "Por vencer" en el listado cuando quede poco tiempo, y las tarjetas de arriba resumen cuántas están por vencer o ya vencidas.',
                alerta: 'Si una solicitud pasa la fecha límite sin que la hayas marcado como resuelta, el sistema la pasa automáticamente a "Vencida sin resolver" — esto queda registrado para siempre como parte del historial de cumplimiento, no se puede "deshacer" editando la fecha.',
            },
            {
                titulo: '3. Prórroga (10 días hábiles adicionales)',
                texto: 'Si genuinamente necesitas más tiempo, usa el botón "Prórroga" antes de que venza el plazo original. Debes escribir un motivo — queda guardado como respaldo. La nueva fecha límite pasa a ser 25 días hábiles desde la recepción (15 + 10). Solo se puede aplicar una vez por solicitud.',
            },
            {
                titulo: '4. Marcar como resuelta',
                texto: 'Usa el botón "Resolver" y escribe la respuesta real que le diste al titular (o un resumen fiel). El sistema NO te deja elegir manualmente si quedó "a tiempo" o "fuera de plazo" — lo decide automáticamente comparando la fecha de hoy contra la fecha límite vigente. Esto es intencional: es lo que le da valor real al indicador ante una eventual auditoría de la SPDP.',
            },
            {
                titulo: '5. Exportar datos del titular (Portabilidad / Acceso)',
                texto: 'Los botones "JSON" y "CSV" en cada solicitud generan un paquete con los datos que el sistema tiene de esa persona: los datos propios de la solicitud, más — si registraste su cédula/RUC — lo que exista en Clientes, Proveedores o Empleados con esa misma identificación. Esto es lo que le entregas al titular para cumplir su derecho de acceso o portabilidad.',
                tips: [
                    'Si no aparece nada en "Como cliente/proveedor/empleado", revisa que la identificación registrada en la solicitud coincida exactamente con la de su ficha en el sistema.',
                ],
            },
            {
                titulo: '6. Archivar',
                texto: 'Igual que en el RAT, "Archivar" no borra la solicitud — la oculta del listado activo pero se conserva como evidencia histórica. Útil para casos duplicados o registrados por error.',
            },
        ],
    },

    // ─── LOPDP: POLÍTICA DE PRIVACIDAD PÚBLICA ──────────────────────────────
    'lopdp-politica-privacidad': {
        titulo: 'Política de Privacidad Pública',
        subtitulo: 'La página que cualquier persona puede ver para saber cómo tratas sus datos',
        secciones: [
            {
                titulo: '¿Para qué sirve esta página?',
                texto: 'La LOPDP (Art. 10) exige que toda empresa informe de forma clara y accesible cómo trata los datos personales que recibe. Lo que armas aquí se publica en una URL pública (sin necesidad de iniciar sesión) para que tus clientes, empleados o proveedores puedan consultarla en cualquier momento — por ejemplo, enlazándola desde tu sitio web o desde el pie de tus facturas.',
                alerta: 'Tu empresa es la "Responsable del tratamiento" — la que legalmente responde ante la Superintendencia (SPDP) por estos datos. QuickInvoice/Billennium System solo aparece como "Encargado de tratamiento" (el proveedor tecnológico que procesa los datos por instrucción tuya). Esto queda explícito en la página pública y no se puede quitar ni editar — es un requisito legal, no una opción de personalización.',
            },
            {
                titulo: '1. Borrador vs. Publicado — la diferencia importa',
                texto: 'Todo lo que edites en este formulario es un BORRADOR — nadie fuera de tu empresa lo ve todavía. "Guardar borrador" solo guarda tu progreso. La página pública real solo se actualiza cuando presionas "Publicar".',
                tips: [
                    'Usa "Vista previa" cuantas veces quieras antes de publicar — te muestra exactamente cómo se vería la página pública con los datos actuales.',
                    'Una vez publicada, esa versión queda congelada para siempre (no se puede editar ni borrar) — es lo que garantiza que un aviso legal impreso en una factura antigua siga siendo verificable contra el texto vigente en esa fecha.',
                ],
            },
            {
                titulo: '2. Finalidades del tratamiento',
                texto: 'Enumera para qué usa tu empresa los datos personales que recibe (facturación, nómina, marketing, etc.). Esto es lo primero que un titular necesita saber al leer tu política.',
            },
            {
                titulo: '3. Delegado de Protección de Datos (DPD)',
                texto: 'Si tu empresa designó formalmente un DPD (obligatorio para algunas empresas según su tamaño/actividad, opcional para otras), actívalo aquí y registra cómo contactarlo. Si no tienes uno, deja la opción apagada — la página pública lo indicará correctamente.',
            },
            {
                titulo: '4. Encargados de tratamiento',
                texto: 'Aquí declaras a qué terceros les compartes datos para que los procesen en tu nombre (tu contador externo, un courier, una aseguradora, etc.). QuickInvoice ya aparece de forma fija como encargado tecnológico — no se puede quitar ni editar, pero puedes agregar los propios de tu negocio.',
            },
            {
                titulo: '5. Email para ARCO-POL',
                texto: 'Este es el correo que la página pública muestra para que cualquier persona ejerza sus derechos (acceso, rectificación, cancelación, oposición, portabilidad, limitación) — debe ser una cuenta que realmente revises, ya que de ahí saldrán las solicitudes que gestionas en la pantalla "Solicitudes ARCO-POL".',
            },
            {
                titulo: '6. Historial de versiones',
                texto: 'Cada vez que publicas, se crea una nueva versión numerada con la fecha exacta. Puedes revisar el contenido completo de cualquier versión anterior desde "Ver contenido" — es de solo lectura, ninguna versión publicada puede modificarse. La página pública, en cambio, solo muestra la versión más reciente.',
            },
        ],
    },
}
