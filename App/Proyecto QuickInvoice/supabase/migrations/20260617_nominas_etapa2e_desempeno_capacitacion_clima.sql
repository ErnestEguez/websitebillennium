-- Etapa 2E — Evaluación de Desempeño, Capacitación y Clima Organizacional
-- §6 Evaluación de desempeño   §7 Capacitación   §8 Clima + rotación

-- ─── ALTER empleados: motivo de salida ───────────────────────────────────────
ALTER TABLE nominas.empleados
    ADD COLUMN IF NOT EXISTS motivo_salida TEXT
        CHECK (motivo_salida IN (
            'renuncia_voluntaria','despido','fin_contrato',
            'mutuo_acuerdo','jubilacion','otro'
        ));

-- ─── §6A Períodos de evaluación ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nominas.periodos_evaluacion (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    frecuencia  TEXT NOT NULL DEFAULT 'anual'
                    CHECK (frecuencia IN ('trimestral','semestral','anual','libre')),
    fecha_inicio DATE NOT NULL,
    fecha_fin    DATE NOT NULL,
    estado       TEXT NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador','abierto','cerrado')),
    created_at   TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at   TIMESTAMPTZ DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_periodos_eval_empresa ON nominas.periodos_evaluacion(empresa_id);
ALTER TABLE nominas.periodos_evaluacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_periodos_eval_empresa" ON nominas.periodos_evaluacion
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.periodos_evaluacion TO authenticated, service_role;

-- ─── §6B Evaluaciones individuales ───────────────────────────────────────────
-- criterios: JSONB array [ { nombre, calificacion (1-5), comentario } ]
CREATE TABLE IF NOT EXISTS nominas.evaluaciones (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    periodo_id          UUID NOT NULL REFERENCES nominas.periodos_evaluacion(id) ON DELETE CASCADE,
    empleado_id         UUID NOT NULL REFERENCES nominas.empleados(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL DEFAULT 'jefe'
                            CHECK (tipo IN ('jefe','auto','360')),
    estado              TEXT NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente','completado')),
    criterios           JSONB NOT NULL DEFAULT '[]'::jsonb,
    calificacion_final  NUMERIC(3,1),
    comentarios         TEXT,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_periodo   ON nominas.evaluaciones(periodo_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_empleado  ON nominas.evaluaciones(empleado_id);
ALTER TABLE nominas.evaluaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_evaluaciones_empresa" ON nominas.evaluaciones
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.evaluaciones TO authenticated, service_role;

-- ─── §7A Cursos y capacitaciones ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nominas.cursos (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    tipo        TEXT NOT NULL DEFAULT 'interno'
                    CHECK (tipo IN ('interno','externo')),
    proveedor   TEXT,
    descripcion TEXT,
    horas       NUMERIC(6,2) NOT NULL DEFAULT 0,
    costo_total NUMERIC(12,2) DEFAULT 0,
    fecha_inicio DATE,
    fecha_fin    DATE,
    activo       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at   TIMESTAMPTZ DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_cursos_empresa ON nominas.cursos(empresa_id);
ALTER TABLE nominas.cursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_cursos_empresa" ON nominas.cursos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.cursos TO authenticated, service_role;

-- ─── §7B Inscripciones a cursos ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nominas.inscripciones_curso (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    curso_id        UUID NOT NULL REFERENCES nominas.cursos(id) ON DELETE CASCADE,
    empleado_id     UUID NOT NULL REFERENCES nominas.empleados(id) ON DELETE CASCADE,
    estado          TEXT NOT NULL DEFAULT 'inscrito'
                        CHECK (estado IN ('inscrito','asistio','aprobado','no_asistio')),
    costo_empleado  NUMERIC(12,2) DEFAULT 0,
    certificado_url TEXT,
    notas           TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_inscripciones_curso    ON nominas.inscripciones_curso(curso_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_empleado ON nominas.inscripciones_curso(empleado_id);
ALTER TABLE nominas.inscripciones_curso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_inscripciones_empresa" ON nominas.inscripciones_curso
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.inscripciones_curso TO authenticated, service_role;

-- ─── §8A Encuestas de clima ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nominas.encuestas_clima (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
    estado      TEXT NOT NULL DEFAULT 'activa'
                    CHECK (estado IN ('activa','cerrada')),
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_encuestas_clima_empresa ON nominas.encuestas_clima(empresa_id);
ALTER TABLE nominas.encuestas_clima ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_encuestas_clima_empresa" ON nominas.encuestas_clima
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.encuestas_clima TO authenticated, service_role;

-- ─── §8B Respuestas de clima (5 dimensiones, 1-5) ────────────────────────────
CREATE TABLE IF NOT EXISTS nominas.respuestas_clima (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id           UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    encuesta_id          UUID NOT NULL REFERENCES nominas.encuestas_clima(id) ON DELETE CASCADE,
    empleado_id          UUID REFERENCES nominas.empleados(id) ON DELETE SET NULL,
    satisfaccion_general SMALLINT CHECK (satisfaccion_general BETWEEN 1 AND 5),
    ambiente_trabajo     SMALLINT CHECK (ambiente_trabajo BETWEEN 1 AND 5),
    liderazgo            SMALLINT CHECK (liderazgo BETWEEN 1 AND 5),
    crecimiento          SMALLINT CHECK (crecimiento BETWEEN 1 AND 5),
    comunicacion         SMALLINT CHECK (comunicacion BETWEEN 1 AND 5),
    comentarios          TEXT,
    anonima              BOOLEAN NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_respuestas_clima_encuesta ON nominas.respuestas_clima(encuesta_id);
ALTER TABLE nominas.respuestas_clima ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_respuestas_clima_empresa" ON nominas.respuestas_clima
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.respuestas_clima TO authenticated, service_role;
