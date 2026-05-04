/*
  # Revert articulos primary key to simple id (handling all dependencies)
  
  1. Problem
    - Composite primary key (id, empresa_id) breaks VB6 DELETE operations
    - Multiple tables reference the composite key
    
  2. Solution
    - Drop all foreign key dependencies first
    - Revert primary key to only id
    - Recreate foreign keys with simple references
    
  3. Dependencies Fixed
    - proforma_detalle
    - pedido_detalle
*/

-- Drop all foreign key constraints that reference articulos
ALTER TABLE proforma_detalle 
  DROP CONSTRAINT IF EXISTS proforma_detalle_articulo_fkey;

ALTER TABLE pedido_detalle 
  DROP CONSTRAINT IF EXISTS pedido_detalle_articulo_id_empresa_id_fkey;

-- Drop composite primary key
ALTER TABLE articulos 
  DROP CONSTRAINT articulos_pkey CASCADE;

-- Recreate simple primary key on id only
ALTER TABLE articulos 
  ADD PRIMARY KEY (id);

-- Add unique constraint to maintain data integrity per company
ALTER TABLE articulos 
  DROP CONSTRAINT IF EXISTS articulos_id_empresa_id_key;
  
ALTER TABLE articulos 
  ADD CONSTRAINT articulos_id_empresa_id_key UNIQUE (id, empresa_id);

-- Restore foreign key from proforma_detalle with simple reference
ALTER TABLE proforma_detalle
  ADD CONSTRAINT proforma_detalle_articulo_id_fkey
  FOREIGN KEY (articulo_id)
  REFERENCES articulos(id)
  ON DELETE RESTRICT;

-- Restore foreign key from pedido_detalle with simple reference
ALTER TABLE pedido_detalle
  ADD CONSTRAINT pedido_detalle_articulo_id_fkey
  FOREIGN KEY (articulo_id)
  REFERENCES articulos(id)
  ON DELETE RESTRICT;