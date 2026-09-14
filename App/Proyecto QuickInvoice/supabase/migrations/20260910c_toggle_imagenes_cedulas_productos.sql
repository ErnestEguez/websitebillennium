-- ============================================================
-- Toggle de empresa: permitir o no el ingreso de imágenes
-- (foto de cédula en Clientes hoy; imagen de producto a futuro,
-- cuando exista esa carga). Apagado por defecto — mismo patrón que
-- habilita_ventas_electrodomesticos_credito (20260908): exclusivo de
-- admin_plataforma, cualquier UPDATE que lo cambie sin serlo se rechaza.
-- ============================================================

ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS permite_imagenes_cedulas_productos BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION facturacion.fn_bloquear_toggle_imagenes_cedulas_productos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.permite_imagenes_cedulas_productos IS DISTINCT FROM OLD.permite_imagenes_cedulas_productos
       AND NOT facturacion.es_admin_plataforma() THEN
        RAISE EXCEPTION 'Solo un administrador de plataforma puede cambiar permite_imagenes_cedulas_productos';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_toggle_imagenes_cedulas_productos ON facturacion.empresas;
CREATE TRIGGER trg_bloquear_toggle_imagenes_cedulas_productos
    BEFORE UPDATE ON facturacion.empresas
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_bloquear_toggle_imagenes_cedulas_productos();

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT permite_imagenes_cedulas_productos FROM facturacion.empresas LIMIT 5;
--   -- debe salir "false" en todas
