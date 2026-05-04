/*
  # Corrección de Políticas de Seguridad RLS

  ## Resumen
  Esta migración corrige graves problemas de seguridad en las políticas RLS.
  
  ## Problemas Encontrados
  - Múltiples políticas con `USING (true)` que permiten acceso sin restricciones
  - Políticas públicas que exponen datos sensibles de todas las empresas
  - Riesgo de que usuarios anónimos accedan a datos de cualquier empresa
  
  ## Cambios Aplicados
  
  ### 1. Tabla vendedores
  - ❌ ELIMINADAS todas las políticas públicas inseguras
  - ✅ MANTIENEN solo políticas para administradores autenticados
  
  ### 2. Tabla articulos  
  - ❌ ELIMINADAS políticas públicas con `USING (true)`
  - ✅ MANTIENEN políticas authenticated restrictivas
  - ✅ MANTIENEN políticas anon para VB6 (sincronización)
  
  ### 3. Tabla clientes
  - ❌ ELIMINADAS políticas públicas con `USING (true)`
  - ✅ MANTIENEN políticas authenticated restrictivas
  - ✅ MANTIENEN política anon de lectura restrictiva
  
  ### 4. Tablas proforma_cabecera y proforma_detalle
  - ❌ ELIMINADAS todas las políticas públicas inseguras
  - ✅ MANTIENEN solo políticas authenticated
  
  ### 5. Tablas pedido_cabecera y pedido_detalle
  - ✅ MANTIENEN políticas anon necesarias para VB6
  - ✅ MANTIENEN políticas authenticated
  
  ## Seguridad
  - Todas las operaciones ahora requieren autenticación o validación de empresa
  - Se eliminaron accesos sin restricciones
  - Se mantiene compatibilidad con sincronización VB6
*/

-- =====================================================
-- TABLA: vendedores
-- Eliminar políticas públicas inseguras
-- =====================================================

DROP POLICY IF EXISTS "Allow public insert to vendedores" ON vendedores;
DROP POLICY IF EXISTS "Allow public read access to vendedores" ON vendedores;
DROP POLICY IF EXISTS "Allow public update to vendedores" ON vendedores;

-- =====================================================
-- TABLA: articulos  
-- Eliminar políticas públicas, mantener anon para VB6
-- =====================================================

DROP POLICY IF EXISTS "Allow public insert to articulos" ON articulos;
DROP POLICY IF EXISTS "Allow public read access to articulos" ON articulos;
DROP POLICY IF EXISTS "Allow public update to articulos" ON articulos;

-- =====================================================
-- TABLA: clientes
-- Eliminar políticas públicas inseguras
-- =====================================================

DROP POLICY IF EXISTS "Service can insert clients" ON clientes;
DROP POLICY IF EXISTS "Service can update clients" ON clientes;

-- =====================================================
-- TABLA: proforma_cabecera
-- Eliminar TODAS las políticas públicas
-- =====================================================

DROP POLICY IF EXISTS "Allow public insert to proforma_cabecera" ON proforma_cabecera;
DROP POLICY IF EXISTS "Allow public read access to proforma_cabecera" ON proforma_cabecera;
DROP POLICY IF EXISTS "Allow public update to proforma_cabecera" ON proforma_cabecera;

-- =====================================================
-- TABLA: proforma_detalle
-- Eliminar TODAS las políticas públicas
-- =====================================================

DROP POLICY IF EXISTS "Allow public insert to proforma_detalle" ON proforma_detalle;
DROP POLICY IF EXISTS "Allow public read access to proforma_detalle" ON proforma_detalle;
DROP POLICY IF EXISTS "Allow public update to proforma_detalle" ON proforma_detalle;

-- =====================================================
-- Resumen de seguridad
-- =====================================================

-- Las siguientes políticas SE MANTIENEN porque son seguras:
-- 
-- ✅ vendedores: Solo políticas Admin (authenticated)
-- ✅ articulos: Políticas authenticated + anon para VB6
-- ✅ clientes: Políticas authenticated + anon lectura activos
-- ✅ proforma_*: Solo políticas authenticated
-- ✅ pedido_*: Políticas authenticated + anon para VB6
-- ✅ empresas: Políticas Admin y lectura propia empresa
