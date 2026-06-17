-- Etapa 2D — Onboarding / Offboarding
-- Tablas: plantillas_checklist, plantilla_items, checklists_empleado, checklist_items_empleado

-- ─── 1. Plantillas de checklist (reutilizables) ───────────────────────────────

CREATE TABLE IF NOT EXISTS nominas.plantillas_checklist (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('onboarding','offboarding')),
    cargo_id        UUID REFERENCES nominas.cargos(id) ON DELETE SET NULL,
    seccion_id      UUID REFERENCES nominas.secciones(id) ON DELETE SET NULL,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_plantillas_ck_empresa ON nominas.plantillas_checklist(empresa_id);

ALTER TABLE nominas.plantillas_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_plantillas_checklist_empresa" ON nominas.plantillas_checklist
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.plantillas_checklist TO authenticated, service_role;

-- ─── 2. Ítems de plantilla ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nominas.plantilla_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    plantilla_id    UUID NOT NULL REFERENCES nominas.plantillas_checklist(id) ON DELETE CASCADE,
    orden           SMALLINT NOT NULL DEFAULT 1,
    descripcion     TEXT NOT NULL,
    responsable_tipo TEXT NOT NULL DEFAULT 'rrhh'
                        CHECK (responsable_tipo IN ('empleado','rrhh','it','gerencia','otro')),
    dias_plazo      SMALLINT,          -- días desde ingreso/salida para completar (informativo)
    activo          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_plantilla_items_plantilla ON nominas.plantilla_items(plantilla_id);

ALTER TABLE nominas.plantilla_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_plantilla_items_empresa" ON nominas.plantilla_items
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.plantilla_items TO authenticated, service_role;

-- ─── 3. Checklists instanciados por empleado ─────────────────────────────────

CREATE TABLE IF NOT EXISTS nominas.checklists_empleado (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    empleado_id     UUID NOT NULL REFERENCES nominas.empleados(id) ON DELETE CASCADE,
    plantilla_id    UUID REFERENCES nominas.plantillas_checklist(id) ON DELETE SET NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('onboarding','offboarding')),
    estado          TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','en_progreso','completado')),
    fecha_inicio    DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_limite    DATE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_checklists_emp_empleado ON nominas.checklists_empleado(empleado_id);
CREATE INDEX IF NOT EXISTS idx_checklists_emp_empresa  ON nominas.checklists_empleado(empresa_id);

ALTER TABLE nominas.checklists_empleado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_checklists_empleado_empresa" ON nominas.checklists_empleado
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.checklists_empleado TO authenticated, service_role;

-- ─── 4. Ítems instanciados (snapshot de la plantilla al momento de crear) ────

CREATE TABLE IF NOT EXISTS nominas.checklist_items_empleado (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    checklist_id    UUID NOT NULL REFERENCES nominas.checklists_empleado(id) ON DELETE CASCADE,
    orden           SMALLINT NOT NULL DEFAULT 1,
    descripcion     TEXT NOT NULL,
    responsable_tipo TEXT NOT NULL DEFAULT 'rrhh'
                        CHECK (responsable_tipo IN ('empleado','rrhh','it','gerencia','otro')),
    dias_plazo      SMALLINT,
    completado      BOOLEAN NOT NULL DEFAULT false,
    fecha_completado DATE,
    completado_por  TEXT,
    notas           TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ck_items_checklist ON nominas.checklist_items_empleado(checklist_id);

ALTER TABLE nominas.checklist_items_empleado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nominas_checklist_items_emp_empresa" ON nominas.checklist_items_empleado
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.checklist_items_empleado TO authenticated, service_role;
