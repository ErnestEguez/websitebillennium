-- ============================================================
-- Auditoría: agregar user_email — el nombre de perfil puede estar
-- mal cargado (ej. un perfil de prueba con nombre='Herrajes', el
-- nombre de la empresa en vez de la persona), lo que generó
-- confusión al leer la columna "Usuario" del reporte. El email es
-- inequívoco: no se presta a esa confusión.
-- ============================================================

ALTER TABLE facturacion.auditoria_eventos ADD COLUMN IF NOT EXISTS user_email TEXT;

CREATE OR REPLACE FUNCTION facturacion.fn_registrar_auditoria(
    p_empresa_id       UUID,
    p_correlation_id   UUID,
    p_modulo           TEXT,
    p_accion           TEXT,
    p_entidad          TEXT,
    p_entidad_id       UUID DEFAULT NULL,
    p_tipo_documento   TEXT DEFAULT NULL,
    p_numero_documento TEXT DEFAULT NULL,
    p_sucursal_id      UUID DEFAULT NULL,
    p_serie            TEXT DEFAULT NULL,
    p_bodega_id        UUID DEFAULT NULL,
    p_resumen          TEXT DEFAULT NULL,
    p_detalle          JSONB DEFAULT NULL,
    p_cambios          JSONB DEFAULT NULL,
    p_estado           facturacion.auditoria_estado DEFAULT 'exitoso',
    p_error_mensaje    TEXT DEFAULT NULL,
    p_nivel            facturacion.auditoria_nivel DEFAULT 'operativo',
    p_user_agent       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO facturacion
AS $$
DECLARE
    v_user_id     UUID := auth.uid();
    v_user_nombre TEXT;
    v_user_email  TEXT;
    v_user_rol    TEXT;
BEGIN
    SELECT p.nombre, p.email, p.rol INTO v_user_nombre, v_user_email, v_user_rol
    FROM facturacion.profiles p
    WHERE p.id = v_user_id;

    INSERT INTO facturacion.auditoria_eventos (
        empresa_id, correlation_id, user_id, user_nombre, user_email, user_rol, ip, user_agent,
        modulo, accion, entidad, entidad_id, tipo_documento, numero_documento,
        sucursal_id, serie, bodega_id, resumen, detalle, cambios,
        estado, error_mensaje, nivel
    )
    VALUES (
        p_empresa_id, p_correlation_id, v_user_id, v_user_nombre, v_user_email, v_user_rol,
        facturacion.fn_ip_cliente(), p_user_agent,
        p_modulo, p_accion, p_entidad, p_entidad_id, p_tipo_documento, p_numero_documento,
        p_sucursal_id, p_serie, p_bodega_id, COALESCE(p_resumen, p_accion || ' ' || p_entidad),
        p_detalle, p_cambios, p_estado, p_error_mensaje, p_nivel
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_registrar_auditoria: % — %', SQLERRM, p_resumen;
END;
$$;
