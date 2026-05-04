/*
  # Create RPC function to delete articulos by empresa_id

  1. New Functions
    - `delete_articulos_empresa(p_empresa_id uuid)` - Deletes all articulos for a given empresa
  
  2. Security
    - Grant EXECUTE permission to anon and authenticated roles
    - Function uses SECURITY DEFINER to bypass RLS
*/

-- Create function to delete articulos by empresa_id
CREATE OR REPLACE FUNCTION public.delete_articulos_empresa(p_empresa_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete all articulos for the given empresa
  DELETE FROM public.articulos 
  WHERE empresa_id = p_empresa_id;
  
  -- Get the count of deleted rows
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Return result as JSON
  RETURN json_build_object(
    'success', true,
    'deleted_count', deleted_count,
    'empresa_id', p_empresa_id
  );
END;
$$;

-- Grant execute permission to anon and authenticated
GRANT EXECUTE ON FUNCTION public.delete_articulos_empresa(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_articulos_empresa(uuid) TO authenticated;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
