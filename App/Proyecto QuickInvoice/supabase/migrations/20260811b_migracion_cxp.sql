-- PUNTO 7 — Migración de deuda de proveedores desde CSV.
--
-- cuentas_por_pagar no tenía forma de distinguir deuda migrada (sin
-- compra_id) de deuda generada por una compra o liquidación real — mismo
-- patrón que ya usa cartera_cxc.origen (ver 20260710_migracion_cartera.sql).

ALTER TABLE facturacion.cuentas_por_pagar
    ADD COLUMN IF NOT EXISTS numero_documento_externo TEXT,
    ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'COMPRA'
        CHECK (origen IN ('COMPRA', 'LIQUIDACION', 'MIGRACION'));

-- Permiso de Ajustes para la nueva página, mismo patrón que perm_migracion_cartera.
ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_migracion_cxp BOOLEAN NOT NULL DEFAULT true;
