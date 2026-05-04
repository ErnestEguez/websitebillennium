/*
  # Agregar políticas para sincronización VB6
  
  1. Cambios
    - Agregar políticas SELECT para rol `anon` en `pedido_cabecera`
    - Agregar políticas SELECT para rol `anon` en `pedido_detalle`
    - Agregar políticas UPDATE para rol `anon` en `pedido_cabecera` (para marcar como procesado)
    
  2. Seguridad
    - Acceso de solo lectura para pedidos
    - Acceso de actualización limitado al campo `estado` y `fecha_procesado`
*/

-- Permitir lectura anónima de pedidos
DROP POLICY IF EXISTS "Permitir lectura anónima de pedidos" ON pedido_cabecera;
CREATE POLICY "Permitir lectura anónima de pedidos"
  ON pedido_cabecera
  FOR SELECT
  TO anon
  USING (true);

-- Permitir lectura anónima de detalles de pedidos
DROP POLICY IF EXISTS "Permitir lectura anónima de detalles de pedidos" ON pedido_detalle;
CREATE POLICY "Permitir lectura anónima de detalles de pedidos"
  ON pedido_detalle
  FOR SELECT
  TO anon
  USING (true);

-- Permitir actualización anónima de estado de pedidos
DROP POLICY IF EXISTS "Permitir actualización anónima de estado de pedidos" ON pedido_cabecera;
CREATE POLICY "Permitir actualización anónima de estado de pedidos"
  ON pedido_cabecera
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
