-- ============================================================
-- MÓDULO LOPDP — Fase 2: Panel de Solicitudes ARCO-POL
--
-- Mismo aislamiento que la Fase 1: todo vive en el schema lopdp,
-- único contacto con el core es la FK de solo lectura hacia
-- facturacion.empresas(id)/profiles(id) y la reutilización de
-- facturacion.mis_empresas_ids() / facturacion.es_admin_plataforma()
-- (ya existentes, no se modifican).
--
-- No existía ninguna lógica de días hábiles/feriados en el resto del
-- sistema (se buscó en Nómina/Talento Humano y no hay nada que
-- reutilizar) — se implementa aquí como funciones puras dentro de
-- lopdp, sin tabla nueva, para no invadir el schema core. Quedan
-- disponibles para que otros módulos las reutilicen en modo lectura
-- el día que las necesiten.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Domingo de Pascua (algoritmo de Meeus/Jones/Butcher)
--    Necesario porque Carnaval y Viernes Santo son móviles.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lopdp.pascua(p_anio INT)
RETURNS DATE
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    a INT; b INT; c INT; d INT; e INT; f INT; g INT; h INT;
    i INT; k INT; l INT; m INT; v_mes INT; v_dia INT;
BEGIN
    a := p_anio % 19;
    b := p_anio / 100;
    c := p_anio % 100;
    d := b / 4;
    e := b % 4;
    f := (b + 8) / 25;
    g := (b - f + 1) / 3;
    h := (19*a + b - d - g + 15) % 30;
    i := c / 4;
    k := c % 4;
    l := (32 + 2*e + 2*i - h - k) % 7;
    m := (a + 11*h + 22*l) / 451;
    v_mes := (h + l - 7*m + 114) / 31;
    v_dia := ((h + l - 7*m + 114) % 31) + 1;
    RETURN make_date(p_anio, v_mes, v_dia);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Feriados nacionales de Ecuador
--    - Móviles (no se trasladan): Lunes/Martes de Carnaval, Viernes Santo
--    - Fijos con traslado (Ley de Fines de Semana, Ley s/n R.O. 906/2016):
--      cae martes/miércoles -> se observa el lunes anterior
--      cae jueves           -> se observa el viernes siguiente
--      cae vie/sáb/dom/lun  -> sin traslado
--    NOTA: solo feriados NACIONALES (no incluye cantonales como
--    Fundación de Quito/Guayaquil, que dependen del cantón de la empresa).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lopdp.es_feriado_ecuador(p_fecha DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_pascua  DATE;
    v_fijos   TEXT[] := ARRAY['01-01','05-01','05-24','08-10','10-09','11-02','11-03','12-25'];
    v_mmdd    TEXT;
    v_anio    INT;
    v_offset  INT;
    v_ref     DATE;
    v_dow     INT; -- 0=domingo .. 6=sábado
BEGIN
    v_pascua := lopdp.pascua(EXTRACT(YEAR FROM p_fecha)::INT);

    -- Móviles: Lunes Carnaval (-48), Martes Carnaval (-47), Viernes Santo (-2)
    IF p_fecha IN (v_pascua - 48, v_pascua - 47, v_pascua - 2) THEN
        RETURN true;
    END IF;

    -- Fijos con traslado. Se revisan año-1/año/año+1 para cubrir el borde
    -- Dic-31/Ene-1 (Año Nuevo trasladado puede caer en el año anterior).
    FOREACH v_mmdd IN ARRAY v_fijos LOOP
        FOR v_offset IN -1..1 LOOP
            v_anio := EXTRACT(YEAR FROM p_fecha)::INT + v_offset;
            v_ref  := make_date(v_anio, split_part(v_mmdd, '-', 1)::INT, split_part(v_mmdd, '-', 2)::INT);
            v_dow  := EXTRACT(DOW FROM v_ref)::INT;

            IF v_dow IN (2, 3) AND p_fecha = v_ref - (v_dow - 1) THEN
                RETURN true; -- trasladado al lunes anterior
            ELSIF v_dow = 4 AND p_fecha = v_ref + 1 THEN
                RETURN true; -- trasladado al viernes siguiente
            ELSIF v_dow NOT IN (2, 3, 4) AND p_fecha = v_ref THEN
                RETURN true; -- sin traslado
            END IF;
        END LOOP;
    END LOOP;

    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION lopdp.es_dia_habil(p_fecha DATE)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
    SELECT EXTRACT(DOW FROM p_fecha) NOT IN (0, 6)
       AND NOT lopdp.es_feriado_ecuador(p_fecha);
$$;

CREATE OR REPLACE FUNCTION lopdp.sumar_dias_habiles(p_fecha_inicio DATE, p_dias INT)
RETURNS DATE
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_fecha    DATE := p_fecha_inicio;
    v_contados INT  := 0;
BEGIN
    WHILE v_contados < p_dias LOOP
        v_fecha := v_fecha + 1;
        IF lopdp.es_dia_habil(v_fecha) THEN
            v_contados := v_contados + 1;
        END IF;
    END LOOP;
    RETURN v_fecha;
END;
$$;

CREATE OR REPLACE FUNCTION lopdp.restar_dias_habiles(p_fecha_inicio DATE, p_dias INT)
RETURNS DATE
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_fecha    DATE := p_fecha_inicio;
    v_contados INT  := 0;
BEGIN
    WHILE v_contados < p_dias LOOP
        v_fecha := v_fecha - 1;
        IF lopdp.es_dia_habil(v_fecha) THEN
            v_contados := v_contados + 1;
        END IF;
    END LOOP;
    RETURN v_fecha;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. Enums
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'tipo_solicitud_enum' AND n.nspname = 'lopdp'
    ) THEN
        CREATE TYPE lopdp.tipo_solicitud_enum AS ENUM (
            'acceso', 'rectificacion', 'cancelacion', 'oposicion', 'portabilidad', 'limitacion'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'estado_solicitud_enum' AND n.nspname = 'lopdp'
    ) THEN
        CREATE TYPE lopdp.estado_solicitud_enum AS ENUM (
            'pendiente', 'en_proceso', 'resuelta_a_tiempo', 'resuelta_fuera_de_plazo', 'vencida_sin_resolver'
        );
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. Tabla de solicitudes ARCO-POL
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lopdp.solicitudes_titulares (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id              UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,

    tipo_solicitud          lopdp.tipo_solicitud_enum NOT NULL,

    nombre_titular          TEXT NOT NULL,
    identificacion_titular  TEXT,
    email_titular           TEXT,
    telefono_titular        TEXT,
    descripcion             TEXT NOT NULL,

    fecha_recepcion         DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Calculados por trigger (lopdp.fn_calcular_plazos_solicitud) — no editar a mano
    fecha_limite            DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_limite_prorroga   DATE NOT NULL DEFAULT CURRENT_DATE,
    prorroga_aplicada       BOOLEAN NOT NULL DEFAULT false,
    prorroga_motivo         TEXT,
    fecha_limite_vigente    DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_alerta            DATE NOT NULL DEFAULT CURRENT_DATE,

    estado                  lopdp.estado_solicitud_enum NOT NULL DEFAULT 'pendiente',
    fecha_resolucion        DATE,
    respuesta_titular       TEXT,

    activo                  BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by              UUID REFERENCES facturacion.profiles(id),
    updated_by              UUID REFERENCES facturacion.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_lopdp_solicitudes_empresa
    ON lopdp.solicitudes_titulares(empresa_id) WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_lopdp_solicitudes_alerta
    ON lopdp.solicitudes_titulares(empresa_id, fecha_limite_vigente)
    WHERE activo = true AND estado IN ('pendiente', 'en_proceso');

-- ────────────────────────────────────────────────────────────
-- 5. Trigger: calcula plazos y decide resuelta_a_tiempo/fuera_de_plazo
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lopdp.fn_calcular_plazos_solicitud()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.fecha_limite          := lopdp.sumar_dias_habiles(NEW.fecha_recepcion, 15);
    NEW.fecha_limite_prorroga := lopdp.sumar_dias_habiles(NEW.fecha_recepcion, 25);
    NEW.fecha_limite_vigente  := CASE WHEN NEW.prorroga_aplicada
                                       THEN NEW.fecha_limite_prorroga
                                       ELSE NEW.fecha_limite END;
    NEW.fecha_alerta          := lopdp.restar_dias_habiles(NEW.fecha_limite_vigente, 3);

    -- Si se está registrando la fecha de resolución y el estado sigue
    -- "abierto", la BD decide el resultado real — no lo puede falsear el
    -- cliente. Esto es lo que sostiene la trazabilidad ante una auditoría.
    IF NEW.fecha_resolucion IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.fecha_resolucion IS DISTINCT FROM NEW.fecha_resolucion)
       AND NEW.estado IN ('pendiente', 'en_proceso') THEN
        NEW.estado := CASE WHEN NEW.fecha_resolucion <= NEW.fecha_limite_vigente
                            THEN 'resuelta_a_tiempo'
                            ELSE 'resuelta_fuera_de_plazo' END;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lopdp_solicitudes_plazos ON lopdp.solicitudes_titulares;
CREATE TRIGGER trg_lopdp_solicitudes_plazos
    BEFORE INSERT OR UPDATE ON lopdp.solicitudes_titulares
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_calcular_plazos_solicitud();

-- updated_at: reutiliza el trigger genérico ya creado en la Fase 1
-- (lopdp.fn_set_updated_at), no se duplica.
DROP TRIGGER IF EXISTS trg_lopdp_solicitudes_updated_at ON lopdp.solicitudes_titulares;
CREATE TRIGGER trg_lopdp_solicitudes_updated_at
    BEFORE UPDATE ON lopdp.solicitudes_titulares
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 6. Row Level Security (mismo patrón exacto que la Fase 1)
-- ────────────────────────────────────────────────────────────
ALTER TABLE lopdp.solicitudes_titulares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lopdp_solicitudes_empresa" ON lopdp.solicitudes_titulares;
CREATE POLICY "lopdp_solicitudes_empresa" ON lopdp.solicitudes_titulares
    FOR ALL USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (
            SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true
        )
    )
    WITH CHECK (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (
            SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true
        )
    );

DROP POLICY IF EXISTS "lopdp_solicitudes_admin_readonly" ON lopdp.solicitudes_titulares;
CREATE POLICY "lopdp_solicitudes_admin_readonly" ON lopdp.solicitudes_titulares
    FOR SELECT USING (
        facturacion.es_admin_plataforma()
    );

-- ────────────────────────────────────────────────────────────
-- 7. Grants (mismo patrón que la Fase 1 — el schema lopdp ya está
--    expuesto en PostgREST desde la Fase 1, solo faltan los grants
--    de esta tabla nueva)
-- ────────────────────────────────────────────────────────────
GRANT ALL ON lopdp.solicitudes_titulares TO authenticated, service_role;
