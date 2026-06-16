-- nominas Etapa 3b: Novedades (descuentos recurrentes y préstamos) + columnas horas/novedad_id

-- ── 1. NOVEDADES ──────────────────────────────────────────────────────────────
-- Descuentos recurrentes por empleado: fijos, variables y préstamos
CREATE TABLE IF NOT EXISTS nominas.novedades (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    empleado_id     UUID NOT NULL REFERENCES nominas.empleados(id),
    concepto_id     UUID REFERENCES nominas.conceptos(id),
    codigo          TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    tipo_novedad    TEXT NOT NULL CHECK (tipo_novedad IN (
                        'descuento_variable',
                        'descuento_fijo',
                        'prestamo_cuota',
                        'prestamo_plazo'
                    )),
    monto_fijo          NUMERIC(12,2),
    saldo_inicial       NUMERIC(12,2),
    saldo_pendiente     NUMERIC(12,2),
    n_meses             INTEGER,
    n_cuotas_pagadas    INTEGER NOT NULL DEFAULT 0,
    fecha_inicio        DATE NOT NULL,
    activo              BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);

ALTER TABLE nominas.novedades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nominas_novedades_empresa" ON nominas.novedades
    FOR ALL USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
                WHERE user_id = auth.uid() AND activo = true
        )
    );

GRANT ALL ON nominas.novedades TO authenticated, service_role;

-- ── 2. COLUMNAS NUEVAS EN ROL_LINEAS ──────────────────────────────────────────
-- horas: para conceptos de sobretiempo y nocturnas
-- novedad_id: vínculo a la novedad que originó la línea
ALTER TABLE nominas.rol_lineas
    ADD COLUMN IF NOT EXISTS horas      NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS novedad_id UUID REFERENCES nominas.novedades(id);
