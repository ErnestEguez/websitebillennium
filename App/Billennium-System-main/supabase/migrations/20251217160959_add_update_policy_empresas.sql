/*
  # Agregar política UPDATE para empresas

  1. Políticas
    - Permite a usuarios autenticados actualizar empresas de su propia empresa
    - Necesario para que el Admin Panel pueda guardar cambios
  
  2. Seguridad
    - Solo usuarios autenticados pueden actualizar
    - Valida que el usuario pertenezca a la empresa que está actualizando
*/

-- Política para UPDATE de empresas
CREATE POLICY "Users can update own empresa"
  ON empresas 
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT empresa_id 
      FROM vendedores 
      WHERE id = auth.uid()::text
    )
  )
  WITH CHECK (
    id IN (
      SELECT empresa_id 
      FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );
