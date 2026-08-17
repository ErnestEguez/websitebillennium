-- ============================================================
-- Corrección de codificación (mojibake CP437/CP850 -> Windows-1252)
--
-- Clientes migrados desde sistemas viejos tipo DOS/Clipper/FoxPro guardan
-- el texto en CP437/CP850 (codepage de DOS), no en UTF-8. Al importar ese
-- CSV, ImportarClientesPage.tsx detecta que no es UTF-8 válido y cae al
-- fallback "asumir Windows-1252" (ver decodeCsvBuffer) -- pero si el
-- origen real era CP437/CP850, esa suposición es incorrecta: el mismo
-- byte significa una letra distinta en cada codepage (ej. 0xA5 = "Ñ" en
-- CP437, pero "¥" en Windows-1252). Resultado: "CEDEÑO" queda guardado
-- como "CEDE¥O".
--
-- Estas dos funciones RPC (SECURITY DEFINER, solo admin_plataforma, mismo
-- patrón que fn_estadisticas_empresa) permiten escanear y corregir esto
-- por empresa, sin tocar la policy de RLS de clientes/productos (que no
-- tiene excepción para admin_plataforma viendo otra empresa).
-- ============================================================

-- 1. Escaneo (solo lectura) — trae candidatos con caracteres sospechosos
-- de esta corrupción específica. El cálculo del valor corregido se hace
-- en el frontend (src/lib/codificacionCP437.ts), esta función solo
-- pre-filtra para no traer todos los registros de la empresa.
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
       AND c.nombre ~ '[¥¤¢£₧ƒ⌐¬½¼«»ºª‚„…†‡ˆ‰ŠŒ‘’“”•–—˜™š]'
    UNION ALL
    SELECT 'clientes'::TEXT, c.id, 'direccion'::TEXT, c.direccion
      FROM facturacion.clientes c
     WHERE c.empresa_id = p_empresa_id
       AND c.direccion ~ '[¥¤¢£₧ƒ⌐¬½¼«»ºª‚„…†‡ˆ‰ŠŒ‘’“”•–—˜™š]'
    UNION ALL
    SELECT 'productos'::TEXT, pr.id, 'nombre'::TEXT, pr.nombre
      FROM facturacion.productos pr
     WHERE pr.empresa_id = p_empresa_id
       AND pr.nombre ~ '[¥¤¢£₧ƒ⌐¬½¼«»ºª‚„…†‡ˆ‰ŠŒ‘’“”•–—˜™š]';
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_escanear_codificacion(UUID) TO authenticated;

-- 2. Aplicar corrección — recibe solo las filas que el admin revisó y
-- confirmó en pantalla (nunca corre sola). p_correcciones:
-- [{"tabla":"clientes","id":"...","campo":"nombre","valor_nuevo":"..."}]
-- Cada UPDATE queda acotado a empresa_id = p_empresa_id por seguridad,
-- aunque el id ya venga fijo desde el escaneo de esa misma empresa.
CREATE OR REPLACE FUNCTION facturacion.fn_aplicar_correccion_codificacion(
    p_empresa_id UUID,
    p_correcciones JSONB
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO facturacion
AS $$
DECLARE
    v_item JSONB;
BEGIN
    IF NOT facturacion.es_admin_plataforma() THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_correcciones)
    LOOP
        IF v_item->>'tabla' = 'clientes' AND v_item->>'campo' = 'nombre' THEN
            UPDATE facturacion.clientes SET nombre = v_item->>'valor_nuevo'
             WHERE id = (v_item->>'id')::UUID AND empresa_id = p_empresa_id;
        ELSIF v_item->>'tabla' = 'clientes' AND v_item->>'campo' = 'direccion' THEN
            UPDATE facturacion.clientes SET direccion = v_item->>'valor_nuevo'
             WHERE id = (v_item->>'id')::UUID AND empresa_id = p_empresa_id;
        ELSIF v_item->>'tabla' = 'productos' AND v_item->>'campo' = 'nombre' THEN
            UPDATE facturacion.productos SET nombre = v_item->>'valor_nuevo'
             WHERE id = (v_item->>'id')::UUID AND empresa_id = p_empresa_id;
        END IF;
    END LOOP;

    RETURN jsonb_array_length(p_correcciones);
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_aplicar_correccion_codificacion(UUID, JSONB) TO authenticated;

-- ============================================================
-- Verificación
-- ============================================================
-- SELECT * FROM facturacion.fn_escanear_codificacion('<EMPRESA_ID>');
