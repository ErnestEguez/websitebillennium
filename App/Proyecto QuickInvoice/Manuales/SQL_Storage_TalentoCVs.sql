-- =============================================================
-- STORAGE BUCKET: talento-cvs  (bucket PRIVADO para CVs de candidatos)
-- Ejecutar en el SQL Editor de Supabase
-- =============================================================

-- 1. Crear el bucket privado
--    public = false  →  ningún archivo es accesible por URL directa;
--                       se requiere URL firmada (createSignedUrl) con expiración.
--    file_size_limit = 10 MB
--    allowed_mime_types = PDF y Word
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'talento-cvs',
    'talento-cvs',
    false,
    10485760,
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS en storage.objects para el bucket talento-cvs
--    Estructura de ruta esperada:  {empresa_id}/{candidato_id}.{ext}
--    El primer segmento del path = empresa_id  →  (storage.foldername(name))[1]
--
--    Solo usuarios que pertenecen a la empresa dueña del archivo pueden leer/escribir/borrar.

-- 2a. Lectura (SELECT / GET)
CREATE POLICY "talento_cvs_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'talento-cvs' AND
        (storage.foldername(name))[1] IN (
            SELECT empresa_id::text FROM facturacion.profiles        WHERE id = auth.uid()
            UNION
            SELECT empresa_id::text FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- 2b. Escritura (INSERT)
CREATE POLICY "talento_cvs_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'talento-cvs' AND
        (storage.foldername(name))[1] IN (
            SELECT empresa_id::text FROM facturacion.profiles        WHERE id = auth.uid()
            UNION
            SELECT empresa_id::text FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- 2c. Actualización (UPDATE / UPSERT)
CREATE POLICY "talento_cvs_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'talento-cvs' AND
        (storage.foldername(name))[1] IN (
            SELECT empresa_id::text FROM facturacion.profiles        WHERE id = auth.uid()
            UNION
            SELECT empresa_id::text FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- 2d. Eliminación (DELETE)
CREATE POLICY "talento_cvs_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'talento-cvs' AND
        (storage.foldername(name))[1] IN (
            SELECT empresa_id::text FROM facturacion.profiles        WHERE id = auth.uid()
            UNION
            SELECT empresa_id::text FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- =============================================================
-- VERIFICACIÓN (ejecutar después del INSERT para confirmar)
-- =============================================================
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'talento-cvs';
