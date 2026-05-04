# 📦 Instrucciones para subir el proyecto a GitHub

## Opción A: Si tienes Git instalado en tu PC

### Paso 1: Descargar el proyecto
Necesitas descargar todos los archivos a tu computadora. La forma más fácil:

1. Pídele a Claude Code que te cree un archivo con todo el código
2. O descarga archivo por archivo (tedioso pero funciona)

### Paso 2: Subir a GitHub
```bash
cd ruta/a/tu/proyecto
git init
git add .
git commit -m "Initial commit - Sistema de Proformas"
git branch -M main
git remote add origin https://github.com/ErnestEguez/billennium-proformas.git
git push -u origin main
```

---

## Opción B: Sin Git (usar GitHub Web)

### Paso 1: Crear repositorio vacío en GitHub
1. Ve a https://github.com/new
2. Nombre: `billennium-proformas`
3. Crea el repositorio

### Paso 2: Subir archivos manualmente
1. En tu repositorio, click en "Add file" → "Upload files"
2. Arrastra todos los archivos del proyecto
3. Commit changes

---

## ⚠️ IMPORTANTE: Archivo .env

El archivo `.env` contiene información sensible (claves de Supabase).

**NUNCA lo subas a GitHub público.**

En el proyecto ya hay un `.gitignore` que lo excluye automáticamente.

Contenido de tu `.env`:
```
VITE_SUPABASE_URL=tu_url_aqui
VITE_SUPABASE_ANON_KEY=tu_clave_aqui
```

Guarda esto en un lugar seguro, lo necesitarás después.
