/*
  # Add RPC function to delete articulos by empresa_id

  1. Problem
    - articulos table has composite primary key (id, empresa_id)
    - PostgREST cannot handle DELETE operations with only empresa_id filter
    - VB6 sync code gets 404 error when trying to delete
    
  2. Solution
    - Create RPC function to delete all articulos for a specific empresa_id
    - VB6 will call this function instead of direct DELETE
    
  3. Security
    - Function executes with SECURITY DEFINER (as owner)
    - Returns count of deleted rows
*/

-- Create function to delete all articulos for a specific empresa
CREATE OR REPLACE FUNCTION delete_articulos_by_empresa(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete all articulos for the given empresa_id
  DELETE FROM articulos 
  WHERE empresa_id = p_empresa_id;
  
  -- Get count of deleted rows
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION delete_articulos_by_empresa(UUID) TO anon;
GRANT EXECUTE ON FUNCTION delete_articulos_by_empresa(UUID) TO authenticated;