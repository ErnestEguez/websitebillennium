-- Etapa 2B — Reclutamiento y Selección
-- Tablas: nominas.vacantes, nominas.candidatos, nominas.candidato_eventos

-- ─── 1. Vacantes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nominas.vacantes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cargo_id            UUID REFERENCES nominas.cargos(id) ON DELETE SET NULL,
    seccion_id          UUID REFERENCES nominas.secciones(id) ON DELETE SET NULL,
    titulo              TEXT NOT NULL,
    descripcion         TEXT,
    sueldo_referencial  NUMERIC(10,2),
    tipo_contrato       TEXT CHECK (tipo_contrato IS NULL OR tipo_contrato IN
                            ('indefinido','plazo_fijo','prueba','honorarios','servicios')),
    estado              TEXT NOT NULL DEFAULT 'abierta'
                            CHECK (estado IN ('abierta','en_proceso','cerrada','cancelada')),
    fecha_apertura      DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_cierre        DATE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_vacantes_empresa ON nominas.vacantes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vacantes_estado  ON nominas.vacantes(empresa_id, estado);

ALTER TABLE nominas.vacantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_vacantes_empresa" ON nominas.vacantes
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.vacantes TO authenticated, service_role;

-- ─── 2. Candidatos ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nominas.candidatos (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    vacante_id  UUID NOT NULL REFERENCES nominas.vacantes(id) ON DELETE CASCADE,
    nombres     TEXT NOT NULL,
    apellidos   TEXT NOT NULL,
    cedula      TEXT,
    email       TEXT,
    telefono    TEXT,
    fuente      TEXT NOT NULL DEFAULT 'directo'
                    CHECK (fuente IN ('directo','referido','portal','linkedin','bolsa_trabajo','otro')),
    referido_por TEXT,
    cv_url      TEXT,
    etapa       TEXT NOT NULL DEFAULT 'postulacion'
                    CHECK (etapa IN (
                        'postulacion','revision_cv','entrevista_inicial',
                        'entrevista_tecnica','evaluacion','oferta',
                        'contratado','rechazado','retirado'
                    )),
    notas       TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_candidatos_vacante ON nominas.candidatos(vacante_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_empresa  ON nominas.candidatos(empresa_id);

ALTER TABLE nominas.candidatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_candidatos_empresa" ON nominas.candidatos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.candidatos TO authenticated, service_role;

-- ─── 3. Eventos por candidato (entrevistas, evaluaciones, etc.) ──────────────

CREATE TABLE IF NOT EXISTS nominas.candidato_eventos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    candidato_id    UUID NOT NULL REFERENCES nominas.candidatos(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL CHECK (tipo IN ('entrevista','evaluacion','prueba_tecnica','llamada','otro')),
    fecha           DATE NOT NULL,
    responsable     TEXT,
    calificacion    SMALLINT CHECK (calificacion BETWEEN 1 AND 5),
    comentarios     TEXT,
    resultado       TEXT CHECK (resultado IS NULL OR resultado IN ('aprobado','reprobado','pendiente')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_cand_eventos_cand ON nominas.candidato_eventos(candidato_id);

ALTER TABLE nominas.candidato_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_candidato_eventos_empresa" ON nominas.candidato_eventos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.candidato_eventos TO authenticated, service_role;
