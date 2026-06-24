-- Agregar columna talento_humano a user_modules para control per-usuario
-- del módulo Talento Humano y Nóminas (análogo a vendor/finance/ledgerpro).
--
-- Antes: la visibilidad dependía solo de empresas.usar_talento_humano
-- (flag per-empresa). Ahora también requiere user_modules.talento_humano
-- = true (flag per-usuario), dando control granular por usuario.

ALTER TABLE facturacion.user_modules
    ADD COLUMN IF NOT EXISTS talento_humano BOOLEAN NOT NULL DEFAULT true;

-- Rollback:
-- ALTER TABLE facturacion.user_modules DROP COLUMN IF EXISTS talento_humano;
