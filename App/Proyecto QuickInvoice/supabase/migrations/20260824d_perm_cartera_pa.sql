-- Permiso dedicado para Cartera Plan Acumulativo — mismo patrón que
-- perm_cartera_cxc, pero separado a propósito (CR y PA deben poder
-- restringirse de forma independiente, ya que son conceptos distintos).
ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_cartera_pa BOOLEAN NOT NULL DEFAULT true;
