-- ============================================================
-- MÓDULO LOPDP — Fase 3: Generador de Política de Privacidad Pública
--
-- Mismo aislamiento que Fases 1-2: todo vive en lopdp, único contacto
-- con el core son FKs de solo lectura hacia facturacion.empresas(id)/
-- profiles(id) y la reutilización de facturacion.mis_empresas_ids() /
-- facturacion.es_admin_plataforma() (ya existentes, no se modifican).
--
-- Cada empresa cliente es el RESPONSABLE del tratamiento de sus propios
-- datos. QuickInvoice/Billennium System es el ENCARGADO tecnológico —
-- nunca el responsable. Esto se refleja en el contenido publicado, no
-- solo en el texto de la UI: el objeto "encargados_terceros" con
-- fijo=true queda forzado por trigger, no depende de que el frontend
-- se porte bien.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Slug: generación (solo en el INSERT inicial) + inmutabilidad
--    (nunca se regenera solo, ni siquiera si la empresa cambia de
--    nombre — un slug roto invalida links ya impresos en facturas)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lopdp.generar_slug(p_texto TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT trim(both '-' from
        regexp_replace(
            lower(translate(p_texto, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')),
            '[^a-z0-9]+', '-', 'g'
        )
    );
$$;

CREATE OR REPLACE FUNCTION lopdp.fn_asegurar_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_base      TEXT;
    v_candidato TEXT;
    v_sufijo    INT := 1;
BEGIN
    IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
        RETURN NEW;
    END IF;

    SELECT lopdp.generar_slug(nombre) INTO v_base
    FROM facturacion.empresas WHERE id = NEW.empresa_id;

    IF v_base IS NULL OR length(v_base) = 0 THEN
        v_base := 'empresa';
    END IF;

    v_candidato := v_base;
    WHILE EXISTS (SELECT 1 FROM lopdp.politicas_privacidad WHERE slug = v_candidato) LOOP
        v_sufijo := v_sufijo + 1;
        v_candidato := v_base || '-' || v_sufijo;
    END LOOP;

    NEW.slug := v_candidato;
    RETURN NEW;
END;
$$;

-- El slug NUNCA cambia solo en un UPDATE — ni por cambio de nombre de la
-- empresa (que ni siquiera dispara este trigger, al vivir en otro schema)
-- ni por un guardado accidental del formulario. Un cambio manual futuro
-- requerirá una acción explícita y separada (fuera del alcance de esta fase).
CREATE OR REPLACE FUNCTION lopdp.fn_slug_inmutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.slug := OLD.slug;
    RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Garantiza que QuickInvoice siempre figure como encargado fijo
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lopdp.fn_asegurar_encargado_qi()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_fijo        JSONB := '{"nombre":"QuickInvoice (Billennium System)","tipo":"Encargado de tratamiento — proveedor de la plataforma tecnológica","fijo":true}'::jsonb;
    v_tiene_fijo  BOOLEAN;
BEGIN
    IF NEW.encargados_terceros IS NULL THEN
        NEW.encargados_terceros := jsonb_build_array(v_fijo);
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.encargados_terceros) e WHERE e = v_fijo
    ) INTO v_tiene_fijo;

    IF NOT v_tiene_fijo THEN
        -- Descarta cualquier entrada marcada fijo=true que haya sido
        -- alterada/omitida, y reinyecta la versión correcta al inicio.
        NEW.encargados_terceros := jsonb_build_array(v_fijo) || (
            SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
            FROM jsonb_array_elements(NEW.encargados_terceros) e
            WHERE COALESCE((e->>'fijo')::boolean, false) IS NOT TRUE
        );
    END IF;

    RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. Configuración viva (editable) — una fila por empresa
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lopdp.politicas_privacidad (
    empresa_id              UUID PRIMARY KEY REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    slug                    TEXT NOT NULL UNIQUE,

    finalidades_tratamiento TEXT[] NOT NULL DEFAULT '{}',
    plazo_conservacion      TEXT,

    tiene_dpd               BOOLEAN NOT NULL DEFAULT false,
    dpd_nombre              TEXT,
    dpd_contacto            TEXT,

    encargados_terceros     JSONB NOT NULL DEFAULT '[{"nombre":"QuickInvoice (Billennium System)","tipo":"Encargado de tratamiento — proveedor de la plataforma tecnológica","fijo":true}]'::jsonb,

    email_contacto          TEXT,
    email_arco_pol          TEXT NOT NULL,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by              UUID REFERENCES facturacion.profiles(id),
    updated_by              UUID REFERENCES facturacion.profiles(id)
);

DROP TRIGGER IF EXISTS trg_lopdp_politicas_slug_insert ON lopdp.politicas_privacidad;
CREATE TRIGGER trg_lopdp_politicas_slug_insert
    BEFORE INSERT ON lopdp.politicas_privacidad
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_asegurar_slug();

DROP TRIGGER IF EXISTS trg_lopdp_politicas_slug_inmutable ON lopdp.politicas_privacidad;
CREATE TRIGGER trg_lopdp_politicas_slug_inmutable
    BEFORE UPDATE ON lopdp.politicas_privacidad
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_slug_inmutable();

DROP TRIGGER IF EXISTS trg_lopdp_politicas_encargado_qi ON lopdp.politicas_privacidad;
CREATE TRIGGER trg_lopdp_politicas_encargado_qi
    BEFORE INSERT OR UPDATE ON lopdp.politicas_privacidad
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_asegurar_encargado_qi();

-- updated_at: reutiliza el trigger genérico ya creado en la Fase 1
DROP TRIGGER IF EXISTS trg_lopdp_politicas_updated_at ON lopdp.politicas_privacidad;
CREATE TRIGGER trg_lopdp_politicas_updated_at
    BEFORE UPDATE ON lopdp.politicas_privacidad
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 4. Histórico inmutable de versiones publicadas
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lopdp.politicas_privacidad_versiones (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id        UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    numero_version    INT NOT NULL,
    fecha_publicacion TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    publicado_por     UUID REFERENCES facturacion.profiles(id),

    slug              TEXT NOT NULL,
    contenido         JSONB NOT NULL,

    UNIQUE (empresa_id, numero_version)
);

CREATE INDEX IF NOT EXISTS idx_lopdp_versiones_empresa
    ON lopdp.politicas_privacidad_versiones(empresa_id, numero_version DESC);

CREATE INDEX IF NOT EXISTS idx_lopdp_versiones_slug
    ON lopdp.politicas_privacidad_versiones(slug, numero_version DESC);

-- Inmutabilidad real: bloquea CUALQUIER UPDATE/DELETE, sin excepción de
-- rol. No depende solo de que falte una política RLS de escritura.
CREATE OR REPLACE FUNCTION lopdp.fn_bloquear_edicion_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'politicas_privacidad_versiones es inmutable: no se puede modificar ni eliminar una versión publicada (empresa_id=%, version=%)',
        OLD.empresa_id, OLD.numero_version;
END;
$$;

DROP TRIGGER IF EXISTS trg_lopdp_versiones_bloquear ON lopdp.politicas_privacidad_versiones;
CREATE TRIGGER trg_lopdp_versiones_bloquear
    BEFORE UPDATE OR DELETE ON lopdp.politicas_privacidad_versiones
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_bloquear_edicion_version();

-- ────────────────────────────────────────────────────────────
-- 5. Publicación: arma el snapshot autocontenido y crea la versión.
--    SECURITY INVOKER (por defecto) a propósito: las políticas RLS de
--    abajo ya garantizan que solo se pueda publicar la propia empresa.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lopdp.publicar_politica_privacidad(p_empresa_id UUID, p_user_id UUID)
RETURNS lopdp.politicas_privacidad_versiones
LANGUAGE plpgsql AS $$
DECLARE
    v_config    lopdp.politicas_privacidad%ROWTYPE;
    v_empresa   RECORD;
    v_siguiente INT;
    v_contenido JSONB;
    v_version   lopdp.politicas_privacidad_versiones%ROWTYPE;
BEGIN
    SELECT * INTO v_config FROM lopdp.politicas_privacidad WHERE empresa_id = p_empresa_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe configuración de política de privacidad para esta empresa. Guarda el formulario antes de publicar.';
    END IF;

    SELECT id, nombre, razon_social, ruc, direccion INTO v_empresa
    FROM facturacion.empresas WHERE id = p_empresa_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Empresa no encontrada o sin acceso.';
    END IF;

    SELECT COALESCE(MAX(numero_version), 0) + 1 INTO v_siguiente
    FROM lopdp.politicas_privacidad_versiones WHERE empresa_id = p_empresa_id;

    v_contenido := jsonb_build_object(
        'razon_social',            COALESCE(v_empresa.razon_social, v_empresa.nombre),
        'nombre_comercial',        v_empresa.nombre,
        'ruc',                     v_empresa.ruc,
        'direccion',               v_empresa.direccion,
        'finalidades_tratamiento', to_jsonb(v_config.finalidades_tratamiento),
        'plazo_conservacion',      v_config.plazo_conservacion,
        'tiene_dpd',               v_config.tiene_dpd,
        'dpd_nombre',              v_config.dpd_nombre,
        'dpd_contacto',            v_config.dpd_contacto,
        'encargados_terceros',     v_config.encargados_terceros,
        'email_contacto',          v_config.email_contacto,
        'email_arco_pol',          v_config.email_arco_pol
    );

    INSERT INTO lopdp.politicas_privacidad_versiones
        (empresa_id, numero_version, publicado_por, slug, contenido)
    VALUES
        (p_empresa_id, v_siguiente, p_user_id, v_config.slug, v_contenido)
    RETURNING * INTO v_version;

    RETURN v_version;
END;
$$;

-- Helper SECURITY DEFINER para la política pública de abajo — evita un
-- subquery autoreferenciado sobre la misma tabla dentro de una política
-- RLS (mismo patrón ya usado por facturacion.mis_empresas_ids()).
CREATE OR REPLACE FUNCTION lopdp.version_vigente_de(p_empresa_id UUID)
RETURNS INT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO lopdp
AS $$
    SELECT MAX(numero_version) FROM lopdp.politicas_privacidad_versiones WHERE empresa_id = p_empresa_id;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. Row Level Security
-- ────────────────────────────────────────────────────────────
ALTER TABLE lopdp.politicas_privacidad           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lopdp.politicas_privacidad_versiones ENABLE ROW LEVEL SECURITY;

-- politicas_privacidad (config viva): mismo patrón exacto de Fases 1-2.
-- NUNCA tiene política para anon -> acceso cero por defecto, ni por accidente.
DROP POLICY IF EXISTS "lopdp_politicas_empresa" ON lopdp.politicas_privacidad;
CREATE POLICY "lopdp_politicas_empresa" ON lopdp.politicas_privacidad
    FOR ALL TO authenticated USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true)
    )
    WITH CHECK (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true)
    );

DROP POLICY IF EXISTS "lopdp_politicas_admin_readonly" ON lopdp.politicas_privacidad;
CREATE POLICY "lopdp_politicas_admin_readonly" ON lopdp.politicas_privacidad
    FOR SELECT TO authenticated USING (facturacion.es_admin_plataforma());

-- politicas_privacidad_versiones:
--   a) Interno (oficina): ve TODO el historial de su propia empresa.
DROP POLICY IF EXISTS "lopdp_versiones_leer_interno" ON lopdp.politicas_privacidad_versiones;
CREATE POLICY "lopdp_versiones_leer_interno" ON lopdp.politicas_privacidad_versiones
    FOR SELECT TO authenticated USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true)
    );

--   b) Admin de plataforma: solo lectura, soporte puntual.
DROP POLICY IF EXISTS "lopdp_versiones_admin_readonly" ON lopdp.politicas_privacidad_versiones;
CREATE POLICY "lopdp_versiones_admin_readonly" ON lopdp.politicas_privacidad_versiones
    FOR SELECT TO authenticated USING (facturacion.es_admin_plataforma());

--   c) Inserción de versiones nuevas: solo la propia empresa (usada por
--      la función publicar_politica_privacidad, no por INSERT directo
--      del frontend).
DROP POLICY IF EXISTS "lopdp_versiones_insertar" ON lopdp.politicas_privacidad_versiones;
CREATE POLICY "lopdp_versiones_insertar" ON lopdp.politicas_privacidad_versiones
    FOR INSERT TO authenticated WITH CHECK (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true)
    );

--   d) PÚBLICO — sin "TO", aplica a cualquier rol (anon Y authenticated),
--      porque un visitante puede o no tener sesión activa de QuickInvoice
--      y la página debe funcionar igual para ambos. Nota deliberada: NO
--      exige lopdp_enabled -- la página pública sigue viva aunque el
--      módulo interno se desactive después. Solo expone la versión MÁS
--      RECIENTE de cada empresa, nunca el histórico completo.
DROP POLICY IF EXISTS "lopdp_versiones_publico" ON lopdp.politicas_privacidad_versiones;
CREATE POLICY "lopdp_versiones_publico" ON lopdp.politicas_privacidad_versiones
    FOR SELECT USING (
        numero_version = lopdp.version_vigente_de(empresa_id)
    );

-- ────────────────────────────────────────────────────────────
-- 7. Grants
-- ────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA lopdp TO anon;

GRANT ALL ON lopdp.politicas_privacidad TO authenticated, service_role;
GRANT SELECT, INSERT ON lopdp.politicas_privacidad_versiones TO authenticated, service_role;

-- Público: SOLO estas columnas, nunca publicado_por ni ninguna columna
-- interna que se agregue después. Esto se aplica incluso si alguien
-- llama a la API REST directamente pidiendo select=*.
GRANT SELECT (empresa_id, slug, numero_version, fecha_publicacion, contenido)
    ON lopdp.politicas_privacidad_versiones TO anon;

GRANT EXECUTE ON FUNCTION lopdp.publicar_politica_privacidad(UUID, UUID) TO authenticated;
