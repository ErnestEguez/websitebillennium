# Manual de Usuario - Sistema de Proformas

## Tabla de Contenidos
1. [Introducción](#introducción)
2. [Acceso al Sistema](#acceso-al-sistema)
3. [Panel de Administración](#panel-de-administración)
4. [Gestión de Empresas](#gestión-de-empresas)
5. [Gestión de Vendedores](#gestión-de-vendedores)
6. [Gestión de Clientes](#gestión-de-clientes)
7. [Gestión de Artículos](#gestión-de-artículos)
8. [Crear Proformas](#crear-proformas)
9. [Consultar Proformas](#consultar-proformas)
10. [Generar PDF](#generar-pdf)

---

## Introducción

El Sistema de Proformas es una aplicación web diseñada para gestionar Pedidos de productos de manera profesional. Permite administrar múltiples empresas, vendedores, clientes y artículos, además de generar proformas en formato PDF y se enlaza directamente al ERP de Billennium Sentinel

**Características principales:**
- Multi-empresa (gestiona varias empresas desde una sola cuenta)
- Control de usuarios con permisos (administradores y vendedores)
- Gestión completa de clientes y productos
- Generación automática de proformas numeradas
- Exportación a PDF con logo personalizado
- Acceso desde cualquier dispositivo con internet
- Genera Automaticamente cada dia la Base de Datos de Sentinel y la sube a la nube de supabase
- Se enlaza de manera automatica por cada pedido autorizado por el cliente y se refleja en la empresa para ser:  aprobado y Facturado por el usuario autorizado
- Presenta un dashboard de Ventas para que cada vendedor evalue sus ventas en el mes corriente, tambien consulta meses anteriores

---

## Acceso al Sistema

### URL de Acceso
https://pedidosbillennium.vercel.app/

### Inicio de Sesión

1. Abre tu navegador web (Chrome, Firefox, Safari, Edge)
2. Ingresa la URL en la barra de direcciones
3. Verás la pantalla de inicio de sesión

**Campos requeridos:**
- **Correo electrónico**: Tu email registrado
- **Contraseña**: Tu contraseña personal

**Botones:**
- **Iniciar Sesión**: Accede al sistema con tus credenciales
- **¿No tienes cuenta? Regístrate**: Crea una nueva cuenta

### Registro de Nueva Cuenta

Si es tu primera vez usando el sistema:

1. Haz clic en **"Regístrate"**
2. Completa el formulario:
   - **Nombre completo**: Tu nombre y apellidos
   - **Correo electrónico**: Email válido
   - **Contraseña**: Mínimo 6 caracteres
   - **Empresa**: Selecciona tu empresa de la lista
3. Haz clic en **"Registrarse"**
4. El sistema te creará como vendedor de esa empresa

**Nota importante:** El primer usuario registrado de cada empresa será automáticamente administrador.

---

## Panel de Administración

Una vez iniciada la sesión, verás el panel principal con las siguientes opciones:

### Menú Principal (Vista Administrador)

**Opciones disponibles:**
1. **Crear Proforma**: Genera una nueva cotización
2. **Consultar Proformas**: Ve todas las proformas creadas
3. **Administración**: Acceso a configuración (solo administradores)
4. **Cerrar Sesión**: Sal del sistema de forma segura

### Menú Principal (Vista Vendedor)

**Opciones disponibles:**
1. **Crear Proforma**: Genera una nueva cotización
2. **Consultar Proformas**: Ve tus proformas creadas
3. **Cerrar Sesión**: Sal del sistema

---

## Gestión de Empresas

**Acceso:** Panel Principal → Administración → Empresa

### Configuración de Empresa

En esta sección puedes configurar los datos de tu empresa que aparecerán en las proformas:

**Campos configurables:**
- **Nombre**: Razón social de la empresa
- **Dirección**: Dirección física completa
- **Teléfono**: Número de contacto
- **Email**: Correo electrónico corporativo
- **RNC**: Registro Nacional de Contribuyentes
- **Logo**: Imagen corporativa (formato JPG, PNG)

### Cómo Subir un Logo

1. Haz clic en el botón **"Seleccionar archivo"**
2. Navega en tu computadora y selecciona la imagen
3. Formatos aceptados: JPG, PNG
4. Tamaño recomendado: 300x300 píxeles máximo
5. Haz clic en **"Guardar Cambios"**

**Nota:** El logo aparecerá automáticamente en todas las proformas PDF que generes.

---

## Gestión de Vendedores

**Acceso:** Panel Principal → Administración → Vendedores

### Listar Vendedores

Verás una tabla con todos los vendedores registrados:

**Columnas mostradas:**
- **Nombre**: Nombre completo del vendedor
- **Email**: Correo electrónico de acceso
- **Teléfono**: Número de contacto
- **Celular**: Número móvil
- **Rol**: Administrador o Vendedor
- **Acciones**: Botones para editar o eliminar

### Crear Nuevo Vendedor

1. Haz clic en el botón **"Nuevo Vendedor"** (esquina superior derecha)
2. Completa el formulario:
   - **Nombre**: Nombre completo
   - **Email**: Correo electrónico único
   - **Teléfono**: Número de contacto
   - **Celular**: Número móvil
   - **Contraseña**: Mínimo 6 caracteres
   - **Es Administrador**: Marca si tendrá permisos totales
3. Haz clic en **"Guardar"**

**Permisos:**
- **Administrador**: Acceso completo, puede gestionar todo
- **Vendedor**: Solo puede crear y ver sus propias proformas

### Editar Vendedor

1. Localiza al vendedor en la tabla
2. Haz clic en el botón **"Editar"** (ícono de lápiz)
3. Modifica los campos necesarios
4. Haz clic en **"Guardar"**

### Eliminar Vendedor

1. Localiza al vendedor en la tabla
2. Haz clic en el botón **"Eliminar"** (ícono de papelera)
3. Confirma la eliminación

**Advertencia:** Esta acción no se puede deshacer.

---

## Gestión de Clientes

**Acceso:** Panel Principal → Administración → Clientes

### Listar Clientes

Verás una tabla con todos los clientes registrados:

**Columnas mostradas:**
- **Código**: Identificador único del cliente
- **Nombre**: Nombre del cliente o empresa
- **Nombre Negocio**: Nombre comercial (opcional)
- **RNC**: Registro fiscal
- **Teléfono**: Número de contacto
- **Dirección**: Ubicación física
- **Acciones**: Botones para editar o eliminar

### Crear Nuevo Cliente

1. Haz clic en el botón **"Nuevo Cliente"** (esquina superior derecha)
2. Completa el formulario:
   - **Código**: Identificador único (ej: CLI001)
   - **Nombre**: Nombre completo o razón social
   - **Nombre Negocio**: Nombre comercial (opcional)
   - **RNC**: Número de registro fiscal
   - **Teléfono**: Número de contacto
   - **Dirección**: Dirección completa
3. Haz clic en **"Guardar"**

**Consejo:** Usa códigos secuenciales para facilitar la búsqueda (CLI001, CLI002, etc.)

### Editar Cliente

1. Localiza al cliente en la tabla
2. Haz clic en el botón **"Editar"** (ícono de lápiz)
3. Modifica los campos necesarios
4. Haz clic en **"Guardar"**

### Eliminar Cliente

1. Localiza al cliente en la tabla
2. Haz clic en el botón **"Eliminar"** (ícono de papelera)
3. Confirma la eliminación

**Nota:** No podrás eliminar clientes que tengan proformas asociadas.

---

## Gestión de Artículos

**Acceso:** Panel Principal → Administración → Artículos

### Listar Artículos

Verás una tabla con todos los productos disponibles:

**Columnas mostradas:**
- **Código**: Identificador único del producto
- **Descripción**: Nombre del producto
- **Precio**: Valor unitario
- **Acciones**: Botones para editar o eliminar

### Crear Nuevo Artículo

1. Haz clic en el botón **"Nuevo Artículo"** (esquina superior derecha)
2. Completa el formulario:
   - **Código**: Identificador único (ej: ART001, PROD-001)
   - **Descripción**: Nombre descriptivo del producto
   - **Precio**: Valor unitario sin impuestos
3. Haz clic en **"Guardar"**

**Ejemplo:**
- Código: CABLE-001
- Descripción: Cable UTP Cat6 305m
- Precio: 12500.00

### Editar Artículo

1. Localiza el artículo en la tabla
2. Haz clic en el botón **"Editar"** (ícono de lápiz)
3. Modifica los campos necesarios
4. Haz clic en **"Guardar"**

### Eliminar Artículo

1. Localiza el artículo en la tabla
2. Haz clic en el botón **"Eliminar"** (ícono de papelera)
3. Confirma la eliminación

**Nota:** No podrás eliminar artículos que estén en proformas existentes.

---

## Crear Proformas

**Acceso:** Panel Principal → Crear Proforma

### Paso 1: Información del Cliente

1. Haz clic en **"Seleccionar Cliente"**
2. Elige el cliente de la lista desplegable
3. Los datos del cliente se cargarán automáticamente

### Paso 2: Agregar Artículos

**Para cada producto:**

1. Haz clic en **"Seleccionar Artículo"**
2. Elige el producto de la lista
3. El precio se cargará automáticamente
4. Ingresa la **Cantidad**
5. Haz clic en **"Agregar Artículo"**

**Acciones disponibles:**
- **Agregar más artículos**: Repite el proceso
- **Eliminar artículo**: Haz clic en el ícono de papelera junto al artículo

### Paso 3: Configurar Impuestos y Descuentos

**Campos opcionales:**

- **Descuento (%)**: Porcentaje de descuento sobre el subtotal
  - Ejemplo: 10 = 10% de descuento

- **Impuesto (%)**: Porcentaje de ITBIS o IVA
  - Ejemplo: 18 = 18% de impuesto
  - Valor por defecto: 18%

### Paso 4: Condiciones de Pago

**Campos opcionales:**

- **Forma de Pago**: Describe cómo se debe pagar
  - Ejemplo: "50% anticipo, 50% contra entrega"

- **Tiempo de Entrega**: Plazo de entrega
  - Ejemplo: "15 días hábiles"

- **Condiciones**: Términos adicionales
  - Ejemplo: "Precio sujeto a disponibilidad"

- **Observaciones**: Notas importantes
  - Ejemplo: "No incluye instalación"

### Paso 5: Guardar la Proforma

1. Revisa todos los datos ingresados
2. Verifica el **Total** calculado
3. Haz clic en **"Guardar Proforma"**

**El sistema:**
- Asignará un número de proforma automáticamente
- Guardará la fecha actual
- Te redirigirá a la lista de proformas

---

## Consultar Proformas

**Acceso:** Panel Principal → Consultar Proformas

### Visualización de Proformas

Verás una tabla con todas las proformas creadas:

**Columnas mostradas:**
- **Número**: Número consecutivo de la proforma
- **Fecha**: Fecha de creación
- **Cliente**: Nombre del cliente
- **Total**: Monto total con impuestos
- **Vendedor**: Quién creó la proforma
- **Acciones**: Botones disponibles

### Filtros y Búsqueda

**Filtrar por fecha:**
1. Selecciona **Fecha Desde**
2. Selecciona **Fecha Hasta**
3. Haz clic en **"Filtrar"**

**Limpiar filtros:**
- Haz clic en **"Limpiar Filtros"** para ver todas las proformas

### Acciones Disponibles

**Ver Detalle:**
1. Haz clic en el botón **"Ver"** (ícono de ojo)
2. Se abrirá una ventana con todos los detalles
3. Podrás ver:
   - Información del cliente
   - Lista de artículos con cantidades y precios
   - Subtotal, descuento, impuesto y total
   - Condiciones de pago
   - Observaciones

**Generar PDF:**
1. Desde el detalle, haz clic en **"Generar PDF"**
2. El PDF se descargará automáticamente
3. Nombre del archivo: `Proforma_[NÚMERO].pdf`

**Eliminar Proforma:**
1. Haz clic en el botón **"Eliminar"** (ícono de papelera)
2. Confirma la eliminación
3. **Advertencia:** Esta acción no se puede deshacer

---

## Generar PDF

### Contenido del PDF

Cada PDF de proforma incluye:

**Encabezado:**
- Logo de la empresa (si fue configurado)
- Datos de la empresa
- Número de proforma
- Fecha de emisión

**Información del Cliente:**
- Nombre completo o razón social
- RNC
- Dirección
- Teléfono

**Detalle de Artículos:**
- Código del producto
- Descripción
- Cantidad
- Precio unitario
- Subtotal por línea

**Totales:**
- Subtotal
- Descuento (si aplica)
- Impuesto (ITBIS)
- Total a pagar

**Condiciones Comerciales:**
- Forma de pago
- Tiempo de entrega
- Condiciones generales
- Observaciones

**Pie de página:**
- Datos del vendedor (nombre, teléfono, celular, email)

### Descargar PDF

1. El PDF se descarga automáticamente al hacer clic en **"Generar PDF"**
2. Busca el archivo en tu carpeta de Descargas
3. Nombre: `Proforma_[NÚMERO].pdf`

### Compartir PDF

**Opciones:**
- Enviar por email como archivo adjunto
- Compartir por WhatsApp
- Imprimir para entrega física
- Guardar en sistema de archivos

---

## Preguntas Frecuentes

### ¿Puedo acceder desde mi celular?

Sí, el sistema es completamente responsivo. Puedes acceder desde:
- Computadoras (Windows, Mac, Linux)
- Tablets (iPad, Android)
- Teléfonos móviles (iPhone, Android)

### ¿Se pierden mis datos si cierro el navegador?

No, todos los datos están guardados en la nube. Puedes cerrar el navegador y tus datos estarán seguros.

### ¿Puedo tener varios vendedores?

Sí, como administrador puedes crear todos los vendedores que necesites. Cada vendedor tendrá su propio usuario y contraseña.

### ¿Los vendedores pueden ver proformas de otros vendedores?

No, cada vendedor solo puede ver sus propias proformas. Los administradores pueden ver todas las proformas de la empresa.

### ¿Cómo recupero mi contraseña?

Actualmente debes contactar al administrador de tu empresa para que te restablezca la contraseña.

### ¿Puedo modificar una proforma después de crearla?

No, las proformas no se pueden editar una vez guardadas. Esto garantiza la integridad de los documentos. Si necesitas hacer cambios, debes crear una nueva proforma.

### ¿Qué navegador debo usar?

El sistema funciona en todos los navegadores modernos:
- Google Chrome (recomendado)
- Mozilla Firefox
- Microsoft Edge
- Safari
- Opera

### ¿Los números de proforma son consecutivos?

Sí, el sistema asigna números automáticamente de forma consecutiva por empresa, garantizando que no haya duplicados.

### ¿Puedo usar el sistema sin conexión a internet?

No, necesitas conexión a internet para usar el sistema, ya que todos los datos están en la nube.

### ¿Mis datos están seguros?

Sí, el sistema utiliza:
- Conexión HTTPS encriptada
- Autenticación segura
- Base de datos protegida
- Backup automático

---

## Soporte Técnico

Si tienes problemas técnicos o dudas:

1. Verifica tu conexión a internet
2. Intenta cerrar sesión y volver a iniciar
3. Prueba con otro navegador
4. Limpia la caché del navegador
5. Contacta al administrador del sistema

---

## Consejos de Uso

1. **Mantén actualizados los datos**: Revisa periódicamente que la información de clientes y productos esté correcta
2. **Usa códigos consistentes**: Establece un formato para códigos de clientes y artículos
3. **Configura el logo**: Un logo profesional mejora la presentación de tus proformas
4. **Revisa antes de guardar**: Una vez guardada, la proforma no se puede modificar
5. **Genera backups**: Descarga tus PDFs regularmente como respaldo
6. **Cierra sesión**: Siempre cierra sesión cuando termines, especialmente en computadoras compartidas

---

**Versión del Manual:** 1.0
**Fecha:** Noviembre 2024
**Sistema:** Sapiens Proformas

---

*Fin del Manual de Usuario*
