-- ============================================================
-- MÓDULO LOPDP — Fase 5: Encargados de Tratamiento, Brechas de
-- Seguridad y Dashboard de Cumplimiento
--
-- Mismo aislamiento de siempre: todo en lopdp, únicos contactos con el
-- core son las FKs de solo lectura hacia facturacion.empresas/profiles
-- y la reutilización de facturacion.mis_empresas_ids()/es_admin_plataforma().
--
-- Reutiliza deliberadamente lo ya construido en fases previas, sin
-- duplicar:
--   - lopdp.sumar_dias_habiles() / lopdp.es_dia_habil() (Fase 2)
--   - lopdp.estado_solicitud_enum (Fase 2) para brechas_seguridad —
--     misma máquina de estados (abierto/a tiempo/fuera de
--     plazo/vencido), el frontend le pone etiquetas propias por
--     contexto ("Notificado" en vez de "Resuelta")
--   - lopdp.politicas_privacidad.encargados_terceros (Fase 3) sigue
--     siendo la lista PÚBLICA simple; encargados_tratamiento (esta
--     fase) es la gestión INTERNA de riesgo/contratos — no se
--     sincronizan automáticamente
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Encargados de Tratamiento (gestión interna)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lopdp.encargados_tratamiento (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id              UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,

    nombre                  TEXT NOT NULL,
    tipo_servicio           TEXT NOT NULL,

    tiene_contrato_dpa      BOOLEAN NOT NULL DEFAULT false,
    fecha_vigencia          DATE,

    nota_destruccion        TEXT,
    destruccion_confirmada  BOOLEAN NOT NULL DEFAULT false,

    activo                  BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by              UUID REFERENCES facturacion.profiles(id),
    updated_by              UUID REFERENCES facturacion.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_lopdp_encargados_empresa
    ON lopdp.encargados_tratamiento(empresa_id) WHERE activo = true;

DROP TRIGGER IF EXISTS trg_lopdp_encargados_updated_at ON lopdp.encargados_tratamiento;
CREATE TRIGGER trg_lopdp_encargados_updated_at
    BEFORE UPDATE ON lopdp.encargados_tratamiento
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2. Brechas de Seguridad
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'severidad_brecha_enum' AND n.nspname = 'lopdp'
    ) THEN
        CREATE TYPE lopdp.severidad_brecha_enum AS ENUM ('bajo', 'medio', 'alto');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS lopdp.brechas_seguridad (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id                    UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,

    fecha_deteccion               DATE NOT NULL DEFAULT CURRENT_DATE,
    descripcion                   TEXT NOT NULL,
    alcance_titulares_estimado    INT,
    severidad                    lopdp.severidad_brecha_enum NOT NULL DEFAULT 'medio',

    -- Calculados por trigger a partir de fecha_deteccion
    plazo_spdp                    DATE NOT NULL DEFAULT CURRENT_DATE,      -- +5 días hábiles
    plazo_titulares                DATE,                                   -- +3 días hábiles, solo si severidad='alto'

    fecha_notificacion_spdp         DATE,
    estado_spdp                     lopdp.estado_solicitud_enum NOT NULL DEFAULT 'pendiente',

    fecha_notificacion_titulares     DATE,
    estado_titulares                 lopdp.estado_solicitud_enum,          -- NULL = no aplica (severidad != alto)

    plantilla_notificacion          TEXT,  -- el frontend la pre-llena con los datos del incidente al crear

    activo                        BOOLEAN NOT NULL DEFAULT true,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by                    UUID REFERENCES facturacion.profiles(id),
    updated_by                    UUID REFERENCES facturacion.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_lopdp_brechas_empresa
    ON lopdp.brechas_seguridad(empresa_id) WHERE activo = true;

CREATE OR REPLACE FUNCTION lopdp.fn_calcular_plazos_brecha()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.plazo_spdp      := lopdp.sumar_dias_habiles(NEW.fecha_deteccion, 5);
    NEW.plazo_titulares  := CASE WHEN NEW.severidad = 'alto'
                                  THEN lopdp.sumar_dias_habiles(NEW.fecha_deteccion, 3)
                                  ELSE NULL END;

    -- Igual que en solicitudes_titulares: la BD decide a_tiempo/fuera_de_plazo,
    -- no el cliente. Se evalúa cada obligación por separado.
    IF NEW.fecha_notificacion_spdp IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.fecha_notificacion_spdp IS DISTINCT FROM NEW.fecha_notificacion_spdp)
       AND NEW.estado_spdp IN ('pendiente', 'en_proceso') THEN
        NEW.estado_spdp := CASE WHEN NEW.fecha_notificacion_spdp <= NEW.plazo_spdp
                                 THEN 'resuelta_a_tiempo' ELSE 'resuelta_fuera_de_plazo' END;
    END IF;

    IF NEW.severidad = 'alto'
       AND NEW.fecha_notificacion_titulares IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.fecha_notificacion_titulares IS DISTINCT FROM NEW.fecha_notificacion_titulares)
       AND NEW.estado_titulares IN ('pendiente', 'en_proceso') THEN
        NEW.estado_titulares := CASE WHEN NEW.fecha_notificacion_titulares <= NEW.plazo_titulares
                                      THEN 'resuelta_a_tiempo' ELSE 'resuelta_fuera_de_plazo' END;
    END IF;

    -- Si baja de severidad "alto" a otra, la obligación con titulares deja de aplicar
    IF NEW.severidad != 'alto' THEN
        NEW.estado_titulares := NULL;
    ELSIF NEW.estado_titulares IS NULL THEN
        NEW.estado_titulares := 'pendiente';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lopdp_brechas_plazos ON lopdp.brechas_seguridad;
CREATE TRIGGER trg_lopdp_brechas_plazos
    BEFORE INSERT OR UPDATE ON lopdp.brechas_seguridad
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_calcular_plazos_brecha();

DROP TRIGGER IF EXISTS trg_lopdp_brechas_updated_at ON lopdp.brechas_seguridad;
CREATE TRIGGER trg_lopdp_brechas_updated_at
    BEFORE UPDATE ON lopdp.brechas_seguridad
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. RLS (mismo patrón exacto de las fases anteriores)
-- ────────────────────────────────────────────────────────────
ALTER TABLE lopdp.encargados_tratamiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE lopdp.brechas_seguridad      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lopdp_encargados_empresa" ON lopdp.encargados_tratamiento;
CREATE POLICY "lopdp_encargados_empresa" ON lopdp.encargados_tratamiento
    FOR ALL TO authenticated USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true)
    )
    WITH CHECK (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true)
    );

DROP POLICY IF EXISTS "lopdp_encargados_admin_readonly" ON lopdp.encargados_tratamiento;
CREATE POLICY "lopdp_encargados_admin_readonly" ON lopdp.encargados_tratamiento
    FOR SELECT TO authenticated USING (facturacion.es_admin_plataforma());

DROP POLICY IF EXISTS "lopdp_brechas_empresa" ON lopdp.brechas_seguridad;
CREATE POLICY "lopdp_brechas_empresa" ON lopdp.brechas_seguridad
    FOR ALL TO authenticated USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true)
    )
    WITH CHECK (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true)
    );

DROP POLICY IF EXISTS "lopdp_brechas_admin_readonly" ON lopdp.brechas_seguridad;
CREATE POLICY "lopdp_brechas_admin_readonly" ON lopdp.brechas_seguridad
    FOR SELECT TO authenticated USING (facturacion.es_admin_plataforma());

-- ────────────────────────────────────────────────────────────
-- 4. Dashboard de Cumplimiento — UNA sola función que combina todo
--    (evita 6 llamadas separadas desde el frontend). SECURITY INVOKER
--    (por defecto): las políticas RLS de arriba ya limitan todo a la
--    propia empresa del que llama, sin lógica adicional de permisos.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lopdp.dashboard_cumplimiento(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
    v_hoy      DATE := CURRENT_DATE;
    v_rat         JSONB;
    v_solicitudes JSONB;
    v_encargados  JSONB;
    v_brechas     JSONB;
    v_ultima_publicacion TIMESTAMPTZ;
BEGIN
    -- Actualizaciones perezosas (mismo criterio ya usado en los listados
    -- de Solicitudes ARCO-POL) — se hacen aquí para no requerir una
    -- llamada aparte antes de leer los conteos.
    UPDATE lopdp.solicitudes_titulares
        SET estado = 'vencida_sin_resolver'
        WHERE empresa_id = p_empresa_id
          AND estado IN ('pendiente', 'en_proceso')
          AND fecha_limite_vigente < v_hoy;

    UPDATE lopdp.brechas_seguridad
        SET estado_spdp = 'vencida_sin_resolver'
        WHERE empresa_id = p_empresa_id
          AND estado_spdp IN ('pendiente', 'en_proceso')
          AND plazo_spdp < v_hoy;

    UPDATE lopdp.brechas_seguridad
        SET estado_titulares = 'vencida_sin_resolver'
        WHERE empresa_id = p_empresa_id
          AND severidad = 'alto'
          AND estado_titulares IN ('pendiente', 'en_proceso')
          AND plazo_titulares < v_hoy;

    -- RAT: "completa" = llenó los campos que sí pueden quedar vacíos en
    -- la práctica (nombre/finalidad/base_legal/plazo_retencion ya son
    -- NOT NULL desde la Fase 1, así que no son un indicador útil aquí).
    SELECT jsonb_build_object(
        'total', COUNT(*),
        'completas', COUNT(*) FILTER (
            WHERE array_length(categorias_datos, 1) > 0
              AND array_length(categoria_titulares, 1) > 0
              AND medidas_seguridad IS NOT NULL AND length(trim(medidas_seguridad)) > 0
        )
    ) INTO v_rat
    FROM lopdp.actividades_tratamiento
    WHERE empresa_id = p_empresa_id AND activo = true;

    -- Solicitudes ARCO-POL
    SELECT jsonb_build_object(
        'abiertas', COUNT(*) FILTER (WHERE estado IN ('pendiente', 'en_proceso')),
        'por_vencer', COUNT(*) FILTER (
            WHERE estado IN ('pendiente', 'en_proceso') AND fecha_alerta <= v_hoy AND fecha_limite_vigente >= v_hoy
        ),
        'vencidas', COUNT(*) FILTER (WHERE estado = 'vencida_sin_resolver')
    ) INTO v_solicitudes
    FROM lopdp.solicitudes_titulares
    WHERE empresa_id = p_empresa_id AND activo = true;

    -- Encargados de tratamiento
    SELECT jsonb_build_object(
        'total', COUNT(*),
        'sin_contrato_vigente', COUNT(*) FILTER (
            WHERE NOT tiene_contrato_dpa OR fecha_vigencia IS NULL OR fecha_vigencia < v_hoy + INTERVAL '30 days'
        )
    ) INTO v_encargados
    FROM lopdp.encargados_tratamiento
    WHERE empresa_id = p_empresa_id AND activo = true;

    -- Brechas de seguridad
    SELECT jsonb_build_object(
        'abiertas', COUNT(*) FILTER (
            WHERE estado_spdp IN ('pendiente', 'en_proceso')
               OR (severidad = 'alto' AND estado_titulares IN ('pendiente', 'en_proceso'))
        ),
        'vencidas', COUNT(*) FILTER (
            WHERE estado_spdp = 'vencida_sin_resolver' OR estado_titulares = 'vencida_sin_resolver'
        )
    ) INTO v_brechas
    FROM lopdp.brechas_seguridad
    WHERE empresa_id = p_empresa_id AND activo = true;

    -- Política de privacidad: se devuelve la fecha cruda; el umbral de
    -- "desactualizada" (6 meses) se clasifica en el frontend con una
    -- sola constante — así cambiarlo después no requiere migración.
    SELECT MAX(fecha_publicacion) INTO v_ultima_publicacion
    FROM lopdp.politicas_privacidad_versiones
    WHERE empresa_id = p_empresa_id;

    RETURN jsonb_build_object(
        'rat', v_rat,
        'solicitudes', v_solicitudes,
        'encargados', v_encargados,
        'brechas', v_brechas,
        'politica_ultima_publicacion', v_ultima_publicacion
    );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. Grants
-- ────────────────────────────────────────────────────────────
GRANT ALL ON lopdp.encargados_tratamiento TO authenticated, service_role;
GRANT ALL ON lopdp.brechas_seguridad      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lopdp.dashboard_cumplimiento(UUID) TO authenticated;
