-- ============================================================
-- Amplía fn_escanear_codificacion (ver 20260817_fn_correccion_codificacion.sql)
-- para detectar también el símbolo de reemplazo Unicode "�" (U+FFFD).
--
-- Ese símbolo aparece cuando un archivo se decodificó forzando UTF-8 en vez
-- de intentar UTF-8 y caer a Windows-1252 (bug encontrado en
-- ImportarArticulosPage.tsx, corregido por separado) — cada byte inválido
-- se reemplaza por el MISMO "�", a diferencia del caso CP437 donde cada
-- byte roto mapeaba a una letra distinta y reversible. Por eso este caso
-- solo se puede detectar (para que el usuario lo revise), no revertir con
-- certeza matemática: el frontend (estimarReemplazoUnicode en
-- codificacionCP437.ts) propone Ñ/ñ como estimación, sin pre-marcarla.
-- ============================================================

CREATE OR REPLACE FUNCTION facturacion.fn_escanear_codificacion(p_empresa_id UUID)
RETURNS TABLE(tabla TEXT, id UUID, campo TEXT, valor_actual TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO facturacion
AS $$
BEGIN
    IF NOT facturacion.es_admin_plataforma() THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    RETURN QUERY
    SELECT 'clientes'::TEXT, c.id, 'nombre'::TEXT, c.nombre
      FROM facturacion.clientes c
     WHERE c.empresa_id = p_empresa_id
       AND c.nombre ~ '[¥¤¢£₧ƒ⌐¬½¼«»ºª‚„…†‡ˆ‰ŠŒ‘’“”•–—˜™š�]'
    UNION ALL
    SELECT 'clientes'::TEXT, c.id, 'direccion'::TEXT, c.direccion
      FROM facturacion.clientes c
     WHERE c.empresa_id = p_empresa_id
       AND c.direccion ~ '[¥¤¢£₧ƒ⌐¬½¼«»ºª‚„…†‡ˆ‰ŠŒ‘’“”•–—˜™š�]'
    UNION ALL
    SELECT 'productos'::TEXT, pr.id, 'nombre'::TEXT, pr.nombre
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
