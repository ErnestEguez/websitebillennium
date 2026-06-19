-- Fix: RLS de config_contable / config_contable_mapeo no soportaba multiempresa.
-- La política original solo validaba contra profiles.empresa_id (1 empresa por usuario).
-- Un usuario con varias empresas vía usuario_empresas (ej. Janela: Fundación, Piff, Prentisa)
-- recibía 403 al guardar el mapeo contable de cualquier empresa distinta a profiles.empresa_id.

DROP POLICY IF EXISTS acceso_empresa_propia ON facturacion.config_contable;
CREATE POLICY acceso_empresa_propia ON facturacion.config_contable
FOR ALL
USING (
    empresa_id IN (
        SELECT profiles.empresa_id FROM facturacion.profiles WHERE profiles.id = auth.uid()
        UNION
        SELECT usuario_empresas.empresa_id FROM facturacion.usuario_empresas
        WHERE usuario_empresas.user_id = auth.uid() AND usuario_empresas.activo = true
    )
)
WITH CHECK (
    empresa_id IN (
        SELECT profiles.empresa_id FROM facturacion.profiles WHERE profiles.id = auth.uid()
        UNION
        SELECT usuario_empresas.empresa_id FROM facturacion.usuario_empresas
        WHERE usuario_empresas.user_id = auth.uid() AND usuario_empresas.activo = true
    )
);

DROP POLICY IF EXISTS acceso_empresa_propia ON facturacion.config_contable_mapeo;
CREATE POLICY acceso_empresa_propia ON facturacion.config_contable_mapeo
FOR ALL
USING (
    empresa_id IN (
        SELECT profiles.empresa_id FROM facturacion.profiles WHERE profiles.id = auth.uid()
        UNION
        SELECT usuario_empresas.empresa_id FROM facturacion.usuario_empresas
        WHERE usuario_empresas.user_id = auth.uid() AND usuario_empresas.activo = true
    )
)
WITH CHECK (
    empresa_id IN (
        SELECT profiles.empresa_id FROM facturacion.profiles WHERE profiles.id = auth.uid()
        UNION
        SELECT usuario_empresas.empresa_id FROM facturacion.usuario_empresas
        WHERE usuario_empresas.user_id = auth.uid() AND usuario_empresas.activo = true
    )
);
