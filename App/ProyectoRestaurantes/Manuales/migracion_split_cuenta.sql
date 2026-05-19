-- =====================================================
-- MIGRACIÓN: FUNCIONALIDAD DIVIDIR CUENTA (SPLIT CHECK)
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Agregar configuración a tabla EMPRESAS
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresas' AND column_name = 'habilitar_division_cuenta') THEN
        ALTER TABLE public.empresas ADD COLUMN habilitar_division_cuenta BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 2. Agregar columnas a tabla PEDIDOS para manejar sub-pedidos
DO $$ 
BEGIN 
    -- Nombre del cliente específico para este sub-pedido (ej. "Juan", "María")
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pedidos' AND column_name = 'nombre_cliente_mesa') THEN
        ALTER TABLE public.pedidos ADD COLUMN nombre_cliente_mesa TEXT;
    END IF;

    -- Flag para identificar si es un pedido resultante de una división
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pedidos' AND column_name = 'es_division') THEN
        ALTER TABLE public.pedidos ADD COLUMN es_division BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Referencia al pedido original (opcional, útil para trazabilidad)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pedidos' AND column_name = 'pedido_padre_id') THEN
        ALTER TABLE public.pedidos ADD COLUMN pedido_padre_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Actualizar la empresa por defecto para habilitar la función (OPCIONAL, para pruebas)
UPDATE public.empresas 
SET habilitar_division_cuenta = TRUE 
WHERE ruc = '1790000000001'; -- Empresa Billennium por defecto

-- 4. Recargar esquema
NOTIFY pgrst, 'reload schema';
