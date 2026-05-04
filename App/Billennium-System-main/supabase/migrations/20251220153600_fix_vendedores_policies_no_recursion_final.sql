/*
  # Arreglar políticas de vendedores sin recursión

  1. Problema
    - Las políticas actuales causan recursión infinita porque verifican is_admin 
      consultando la misma tabla vendedores que están protegiendo
    - Esto bloquea el acceso incluso a los administradores

  2. Solución
    - Crear una función SECURITY DEFINER que se salta RLS para verificar is_admin
    - Eliminar todas las políticas actuales
    - Recrear políticas simples usando la función is_admin()

  3. Políticas
    - SELECT: Los usuarios ven su propio registro, los admins ven todos
    - INSERT/UPDATE/DELETE: Solo administradores
*/

-- Eliminar todas las políticas actuales de vendedores
DROP POLICY IF EXISTS "Users can read own vendedor record" ON vendedores;
DROP POLICY IF EXISTS "Admin can view all vendedores" ON vendedores;
DROP POLICY IF EXISTS "Admin can insert vendedores" ON vendedores;
DROP POLICY IF EXISTS "Admin can update vendedores" ON vendedores;
DROP POLICY IF EXISTS "Admin can delete vendedores" ON vendedores;

-- Crear función que verifica si el usuario actual es admin
-- SECURITY DEFINER permite que se salte RLS y evita recursión
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  admin_status BOOLEAN;
BEGIN
  SELECT is_admin INTO admin_status
  FROM vendedores
  WHERE id = auth.uid()::text
  LIMIT 1;
  
  RETURN COALESCE(admin_status, false);
END;
$$;

-- Política SELECT: Ver propio registro o todos si eres admin
CREATE POLICY "Vendedores can view own or admin views all"
  ON vendedores
  FOR SELECT
  TO authenticated
  USING (
    auth.uid()::text = id OR is_admin()
  );

-- Política INSERT: Solo admins pueden crear vendedores
CREATE POLICY "Only admins can insert vendedores"
  ON vendedores
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Política UPDATE: Solo admins pueden actualizar vendedores
CREATE POLICY "Only admins can update vendedores"
  ON vendedores
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Política DELETE: Solo admins pueden eliminar vendedores
CREATE POLICY "Only admins can delete vendedores"
  ON vendedores
  FOR DELETE
  TO authenticated
  USING (is_admin());
