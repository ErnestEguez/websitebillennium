/*
  # Trigger de Protección para Usuario Administrador

  1. Propósito
    - Proteger al usuario administrador principal de ser eliminado accidentalmente
    - Implementa protección a nivel de base de datos que no puede ser eludida desde el código

  2. Funcionalidad
    - Función: `prevent_admin_deletion()`
      - Verifica si el ID que se intenta eliminar corresponde al admin protegido
      - Lanza una excepción si se intenta eliminar al administrador
      - Permite eliminación de cualquier otro usuario

  3. Triggers Creados
    - `protect_admin_vendedor`: Protege la tabla vendedores
    - `protect_admin_auth_user`: Protege la tabla auth.users

  4. Usuario Protegido
    - ID: fc111af9-ad57-4cba-b406-cc842b118689
    - Email: admin@billennium.com
    - Nombre: Administrador Billennium

  5. Seguridad
    - La protección funciona incluso con operaciones SQL directas
    - No puede ser deshabilitada desde el código de la aplicación
    - Solo puede ser modificada mediante una nueva migración
*/

-- Crear función que previene la eliminación del administrador
CREATE OR REPLACE FUNCTION prevent_admin_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.id = 'fc111af9-ad57-4cba-b406-cc842b118689' THEN
    RAISE EXCEPTION 'No se puede eliminar el usuario administrador protegido. Este usuario está protegido contra eliminación accidental.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger para proteger la tabla vendedores
DROP TRIGGER IF EXISTS protect_admin_vendedor ON vendedores;
CREATE TRIGGER protect_admin_vendedor
  BEFORE DELETE ON vendedores
  FOR EACH ROW
  EXECUTE FUNCTION prevent_admin_deletion();

-- Crear trigger para proteger la tabla auth.users
DROP TRIGGER IF EXISTS protect_admin_auth_user ON auth.users;
CREATE TRIGGER protect_admin_auth_user
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_admin_deletion();

-- Comentario descriptivo
COMMENT ON FUNCTION prevent_admin_deletion() IS 
  'Función de protección que previene la eliminación del usuario administrador principal (ID: fc111af9-ad57-4cba-b406-cc842b118689). Esta protección es permanente y solo puede ser modificada mediante una migración de base de datos.';
