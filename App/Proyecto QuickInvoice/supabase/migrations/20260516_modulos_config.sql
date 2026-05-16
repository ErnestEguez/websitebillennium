-- Configuración de módulos por empresa en QuickInvoice
-- Permite al admin activar/desactivar módulos que se gestionan en otras apps

ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS usar_vendor_management  BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS usar_modulo_mesas       BOOLEAN DEFAULT true;

-- Registros existentes mantienen el comportamiento actual
UPDATE facturacion.empresas
    SET usar_vendor_management = false
    WHERE usar_vendor_management IS NULL;
