-- ============================================================
-- QuickInvoice: Agregar columnas activo y descripcion a categorias
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Agregar columna activo (baja lógica) si no existe
ALTER TABLE categorias 
ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- Agregar columna descripcion si no existe  
ALTER TABLE categorias
ADD COLUMN IF NOT EXISTS descripcion text;

-- Activar todas las categorías existentes (por si acaso)
UPDATE categorias SET activo = true WHERE activo IS NULL;

-- Verificar resultado
SELECT id, nombre, tipo, activo, descripcion, empresa_id 
FROM categorias 
ORDER BY empresa_id, nombre;
