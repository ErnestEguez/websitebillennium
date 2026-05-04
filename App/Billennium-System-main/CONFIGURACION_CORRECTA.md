# Configuración Correcta de Supabase

## IMPORTANTE: Instancia de Producción

Este proyecto usa la siguiente instancia de Supabase:

```
URL: https://nxcngfxiubexepmintwf.supabase.co
ANON KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Y25nZnhpdWJleGVwbWludHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ0MzM4NzMsImV4cCI6MjA1MDAwOTg3M30.cPQ0eXOyC8Sh5h5XXL7QZhxj2aT5JpGBZP6kZLe46jI
```

## Configuración del Archivo .env

El archivo `.env` DEBE contener exactamente:

```env
VITE_SUPABASE_URL=https://nxcngfxiubexepmintwf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Y25nZnhpdWJleGVwbWludHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ0MzM4NzMsImV4cCI6MjA1MDAwOTg3M30.cPQ0eXOyC8Sh5h5XXL7QZhxj2aT5JpGBZP6kZLe46jI
```

## Instancias Antiguas (NO USAR)

Las siguientes instancias están desactualizadas y NO deben usarse:

- ❌ `dzxcwrussqiyfibbyrru.supabase.co` (instancia antigua)

## Verificar Configuración

Para verificar que la aplicación está usando la instancia correcta:

1. Abrir las herramientas de desarrollador del navegador (F12)
2. Ir a la pestaña "Network" o "Red"
3. Recargar la página
4. Verificar que las peticiones van a `nxcngfxiubexepmintwf.supabase.co`

## Si el .env se Revierte

Si el archivo `.env` vuelve a las credenciales antiguas:

1. Abrir el archivo `.env`
2. Reemplazar con las credenciales correctas mostradas arriba
3. Ejecutar `npm run build`
4. Hacer un hard refresh del navegador (Ctrl+Shift+R o Cmd+Shift+R)
