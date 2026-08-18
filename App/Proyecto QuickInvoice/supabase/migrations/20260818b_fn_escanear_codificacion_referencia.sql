-- ============================================================
-- Agrega una columna "referencia" a fn_escanear_codificacion (código de
-- producto / identificación de cliente) para que el admin pueda ubicar el
-- registro real en el maestro (Configuración → Productos/Clientes) al
-- revisar una corrección estimada (ver
-- 20260818_fn_escanear_codificacion_unicode.sql), en vez de solo ver el
-- nombre dañado sin ningún dato para cruzarlo. Las líneas de factura no
-- sirven para esto: no guardan el nombre del producto/cliente como texto,
-- solo la referencia (FK) al registro del maestro.
--
-- CREATE OR REPLACE no permite cambiar las columnas de retorno de una
-- función (el error 42P13 que salió al correr esto la primera vez) — hay
-- que borrarla primero.
-- ============================================================

DROP FUNCTION IF EXISTS facturacion.fn_escanear_codificacion(UUID);

CREATE FUNCTION facturacion.fn_escanear_codificacion(p_empresa_id UUID)
RETURNS TABLE(tabla TEXT, id UUID, campo TEXT, valor_actual TEXT, referencia TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO facturacion
AS $$
BEGIN
    IF NOT facturacion.es_admin_plataforma() THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    RETURN QUERY
    SELECT 'clientes'::TEXT, c.id, 'nombre'::TEXT, c.nombre, c.identificacion
      FROM facturacion.clientes c
     WHERE c.empresa_id = p_empresa_id
       AND c.nombre ~ '[¥¤¢£₧ƒ⌐¬½¼«»ºª‚„…†‡ˆ‰ŠŒ‘’“”•–—˜™š�]'
    UNION ALL
    SELECT 'clientes'::TEXT, c.id, 'direccion'::TEXT, c.direccion, c.identificacion
      FROM facturacion.clientes c
     WHERE c.empresa_id = p_empresa_id
       AND c.direccion ~ '[¥¤¢£₧ƒ⌐¬½¼«»ºª‚„…†‡ˆ‰ŠŒ‘’“”•–—˜™š�]'
    UNION ALL
    SELECT 'productos'::TEXT, pr.id, 'nombre'::TEXT, pr.nombre, pr.codigo
      FROM facturacion.productos pr
     WHERE pr.empresa_id = p_empresa_id
       AND pr.nombre ~ '[¥¤¢£₧ƒ⌐¬½¼«»ºª‚„…†‡ˆ‰ŠŒ‘’“”•–—˜™š�]';
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_escanear_codificacion(UUID) TO authenticated;

-- ============================================================
-- Verificación
-- ============================================================
-- SELECT * FROM facturacion.fn_escanear_codificacion('<EMPRESA_ID>');
