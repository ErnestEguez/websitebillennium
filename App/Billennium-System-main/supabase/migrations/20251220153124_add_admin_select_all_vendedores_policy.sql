/*
  # Agregar política de SELECT para administradores

  1. Cambios
    - Se agrega una nueva política que permite a los administradores ver todos los vendedores
    - Esto soluciona el problema donde los administradores no pueden ver la lista completa de vendedores en el panel

  2. Seguridad
    - Solo usuarios con is_admin = true pueden ver todos los vendedores
    - Los usuarios normales siguen viendo solo su propio registro
*/

-- Agregar política para que los administradores puedan ver todos los vendedores
CREATE POLICY "Admin can view all vendedores"
  ON vendedores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM vendedores v 
      WHERE v.id = auth.uid()::text 
      AND v.is_admin = true
    )
  );
