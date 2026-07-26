-- ============================================================
-- MÓDULO LOPDP — Acceso de solo lectura para admin de plataforma
--
-- El rol "oficina" de cada empresa es quien gestiona el RAT
-- (ver/crear/editar) — es su obligación legal como responsable del
-- tratamiento. El admin de plataforma (superadmin de Billennium)
-- NO participa en el uso normal del módulo; solo necesita poder
-- leer entre empresas para soporte puntual (ej. diagnosticar un
-- problema reportado por un cliente).
--
-- Política adicional y permisiva (se combina con OR junto a la
-- política "lopdp_rat_empresa" ya existente): no reemplaza nada,
-- solo agrega una vía de SELECT extra para admin_plataforma.
-- ============================================================

DROP POLICY IF EXISTS "lopdp_rat_admin_readonly" ON lopdp.actividades_tratamiento;
CREATE POLICY "lopdp_rat_admin_readonly" ON lopdp.actividades_tratamiento
    FOR SELECT USING (
        facturacion.es_admin_plataforma()
    );
