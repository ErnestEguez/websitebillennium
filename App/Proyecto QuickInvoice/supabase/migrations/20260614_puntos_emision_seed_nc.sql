-- Migration: Seed de secuenciales.NOTA_CREDITO en el punto de emisión "Principal"
-- Description: La migración 20260614_puntos_emision.sql solo inicializó
--   secuenciales.FACTURA. Antes de que ncService empiece a usar
--   qi_next_secuencial_punto(id, 'NOTA_CREDITO') para el punto de emisión
--   Principal, hay que sembrar ese contador con el máximo secuencial de NC
--   ya emitido para esa serie (o con config_sri.secuencial_nc_actual si
--   todavía no hay NCs), para no retroceder ni repetir numeración SRI.
--
-- Nota: todas las tablas viven en el schema "facturacion".

UPDATE facturacion.puntos_emision pe
SET secuenciales = pe.secuenciales || jsonb_build_object(
        'NOTA_CREDITO',
        COALESCE(
            (SELECT MAX(split_part(nc.secuencial, '-', 3)::int)
               FROM facturacion.notas_credito nc
              WHERE nc.empresa_id = pe.empresa_id
                AND nc.secuencial LIKE (pe.establecimiento || '-' || pe.punto_emision || '-%')
            ),
            (SELECT (e.config_sri ->> 'secuencial_nc_actual')::int
               FROM facturacion.empresas e
              WHERE e.id = pe.empresa_id),
            0
        )
    ),
    updated_at = timezone('utc'::text, now())
WHERE pe.es_principal = true
  AND NOT (pe.secuenciales ? 'NOTA_CREDITO');
