-- Candado por contraseña para cambiar precios en Factura Directa y
-- Proformas -- exclusivo de admin_plataforma (mismo patrón que
-- permite_imagenes_cedulas_productos / habilita_ventas_electrodomesticos_credito):
-- apagado por defecto, cualquier UPDATE de estos 2 campos sin ser
-- admin_plataforma se rechaza. La clave se guarda en texto plano a
-- propósito -- el super-admin pidió poder verla siempre, no solo
-- resetearla (no es una credencial de acceso al sistema, es un PIN
-- operativo tipo caja registradora).

ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS requiere_clave_cambio_precio BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS clave_cambio_precio TEXT;

CREATE OR REPLACE FUNCTION facturacion.fn_bloquear_toggle_clave_cambio_precio()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.requiere_clave_cambio_precio IS DISTINCT FROM OLD.requiere_clave_cambio_precio
        OR NEW.clave_cambio_precio IS DISTINCT FROM OLD.clave_cambio_precio)
       AND NOT facturacion.es_admin_plataforma() THEN
        RAISE EXCEPTION 'Solo un administrador de plataforma puede cambiar requiere_clave_cambio_precio / clave_cambio_precio';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_toggle_clave_cambio_precio ON facturacion.empresas;
CREATE TRIGGER trg_bloquear_toggle_clave_cambio_precio
    BEFORE UPDATE ON facturacion.empresas
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_bloquear_toggle_clave_cambio_precio();

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT requiere_clave_cambio_precio, clave_cambio_precio FROM facturacion.empresas LIMIT 5;
--   -- debe salir "false" / null en todas
