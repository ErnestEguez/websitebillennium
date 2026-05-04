/*
  # Fix RPC function to delete articulos with cascade

  1. Changes
    - Update `delete_articulos_empresa` to delete proforma_detalle first
    - Then delete articulos
    - Returns counts of both deletions
*/

-- Update function to handle foreign key constraints
CREATE OR REPLACE FUNCTION public.delete_articulos_empresa(p_empresa_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_detalle_count integer;
  deleted_articulos_count integer;
BEGIN
  -- First delete all proforma_detalle that reference articulos from this empresa
  DELETE FROM public.proforma_detalle 
  WHERE articulo_id IN (
    SELECT id FROM public.articulos WHERE empresa_id = p_empresa_id
  );
  
  GET DIAGNOSTICS deleted_detalle_count = ROW_COUNT;
  
  -- Then delete all articulos for the given empresa
  DELETE FROM public.articulos 
  WHERE empresa_id = p_empresa_id;
  
  GET DIAGNOSTICS deleted_articulos_count = ROW_COUNT;
  
  -- Return result as JSON
  RETURN json_build_object(
    'success', true,
    'deleted_articulos', deleted_articulos_count,
    'deleted_detalle', deleted_detalle_count,
    'empresa_id', p_empresa_id
  );
END;
$$;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
