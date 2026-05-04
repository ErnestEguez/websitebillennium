# Sistema de Proformas en la Nube

Sistema moderno de gestión de proformas que funciona en tablets y se sincroniza con un ERP en Visual Basic 6.0.

## Características

- **Aplicación Web Progresiva (PWA)**: Funciona en tablets Android/iOS
- **Interfaz Moderna**: Diseño responsive y fácil de usar
- **Base de Datos en la Nube**: Supabase (PostgreSQL) gratuita
- **Sincronización Automática**: Integración con ERP VB6/MSSQL
- **Cálculo de Utilidad**: Muestra porcentaje de ganancia en tiempo real
- **Múltiples Opciones de Envío**: Email y WhatsApp
- **Búsqueda Inteligente**: Encuentra artículos rápidamente
- **Vista de Proformas**: Consulta historial completo

## Tecnologías Utilizadas

- **Frontend**: React 18 + TypeScript + Vite
- **Estilos**: Tailwind CSS
- **Base de Datos**: Supabase (PostgreSQL)
- **Iconos**: Lucide React
- **Deploy**: Vercel / Netlify (recomendado)

## Estructura de la Base de Datos

### Tablas Principales

1. **vendedores**: Información de vendedores
2. **articulos**: Catálogo de productos (hasta 5000 artículos)
3. **proforma_cabecera**: Encabezado de proformas
4. **proforma_detalle**: Líneas de detalle de cada proforma

## Configuración

### 1. Configurar Supabase

1. Crear cuenta en https://supabase.com (gratuito)
2. Crear un nuevo proyecto
3. Copiar credenciales desde Settings → API:
   - Project URL
   - Anon/Public Key

### 2. Configurar Variables de Entorno

Editar el archivo `.env`:

```env
VITE_SUPABASE_URL=https://nxcngfxiubexepmintwf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Y25nZnhpdWJleGVwbWludHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ0MzM4NzMsImV4cCI6MjA1MDAwOTg3M30.cPQ0eXOyC8Sh5h5XXL7QZhxj2aT5JpGBZP6kZLe46jI
```

**IMPORTANTE**: Este proyecto ya está configurado con la instancia de Supabase: `nxcngfxiubexepmintwf.supabase.co`. Si el archivo `.env` se revierte a credenciales antiguas, asegúrate de usar estas credenciales correctas.

### 3. Instalar Dependencias

```bash
npm install
```

### 4. Ejecutar en Desarrollo

```bash
npm run dev
```

### 5. Compilar para Producción

```bash
npm run build
```

## Integración con Visual Basic 6.0

Ver documentación completa en: [DOCUMENTACION_VB6.md](./DOCUMENTACION_VB6.md)

### Proceso de Sincronización

#### De ERP a Nube (Diario)
1. VB6 lee vendedores y artículos desde MSSQL
2. Envía datos a Supabase mediante API REST
3. Actualiza catálogo en la nube

#### De Nube a ERP (Cada 5 minutos)
1. VB6 consulta proformas con `sincronizada=false`
2. Descarga proformas nuevas
3. Inserta en base de datos local
4. Marca como sincronizada en Supabase

## Funcionalidades de la Aplicación

### Crear Proforma
1. Ingresar RUC y nombre del cliente
2. Seleccionar vendedor
3. Buscar y agregar artículos
4. Ajustar cantidad y precio
5. Ver cálculo automático de utilidad
6. Guardar proforma

### Ver Proformas
- Lista de todas las proformas
- Filtro por estado (pendiente/sincronizada)
- Ver detalles completos
- Opción de envío por email/WhatsApp

### Cálculo de Utilidad
- Muestra porcentaje de ganancia en tiempo real
- Fórmula: `((Precio - Costo) / Costo) * 100`
- Indicador visual (verde/rojo)

## Deploy en Producción

### Opción 1: Vercel (Recomendado)

```bash
npm install -g vercel
vercel login
vercel
```

### Opción 2: Netlify

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

### Opción 3: Servidor Propio

```bash
npm run build
# Copiar carpeta 'dist' a tu servidor web
```

## Costos

### Supabase (Gratis)
- 500 MB de base de datos
- 2 GB de transferencia/mes
- 50,000 usuarios activos/mes
- Suficiente para 5000 artículos y miles de proformas

### Hosting (Gratis)
- Vercel: Free tier ilimitado para proyectos personales
- Netlify: 100 GB/mes de ancho de banda

## Mejoras Futuras

- [ ] Generación de PDF desde la aplicación
- [ ] Envío automático de email con PDF adjunto
- [ ] Modo offline (PWA completo)
- [ ] Firma digital del vendedor
- [ ] Fotos de productos
- [ ] Historial de precios
- [ ] Dashboard de estadísticas
- [ ] Notificaciones push

## Soporte

Para dudas o consultas sobre la integración con VB6, revisar:
- [DOCUMENTACION_VB6.md](./DOCUMENTACION_VB6.md)
- Documentación de Supabase: https://supabase.com/docs

## Licencia

MIT
