/*
  # Función RPC para eliminar artículos por empresa (VB6)

  1. Nueva Función
    - `delete_articulos_by_empresa(p_empresa_id uuid)`
    - Permite eliminar todos los artículos de una empresa específica
    - Accesible desde VB6 con rol anon
  
  2. Seguridad
    - Valida que el empresa_id exista
    - Solo elimina artículos de la empresa especificada
    - Retorna el número de registros eliminados
*/

-- Función para eliminar artículos por empresa
CREATE OR REPLACE FUNCTION delete_articulos_by_empresa(p_empresa_id uuid)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Verificar que la empresa existe
  IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa no existe: %', p_empresa_id;
  END IF;

  -- Eliminar artículos de la empresa
  DELETE FROM articulos 
  WHERE empresa_id = p_empresa_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Permitir acceso público a la función
GRANT EXECUTE ON FUNCTION delete_articulos_by_empresa(uuid) TO anon;
GRANT EXECUTE ON FUNCTION delete_articulos_by_empresa(uuid) TO authenticated;
