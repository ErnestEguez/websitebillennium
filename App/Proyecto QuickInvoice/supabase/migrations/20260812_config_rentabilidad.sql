-- Semáforo de rentabilidad en Nueva Factura — configurable por empresa.
--
-- Se guarda como JSONB (mismo patrón que config_sri) porque son varios
-- valores relacionados que crecen juntos (activo, mostrarTasa, 5 umbrales
-- editables), no flags sueltos como es_agente_retencion.
--
-- Los umbrales se evalúan de mayor a menor: el margen de la línea/factura
-- cae en el primer umbral cuya "minPct" sea <= al margen. El último umbral
-- (minPct muy negativo) actúa como "todo lo demás" para ventas con pérdida.

ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS config_rentabilidad JSONB NOT NULL DEFAULT '{
        "activo": false,
        "mostrarTasa": true,
        "umbrales": [
            {"minPct": 45,    "label": "Saludable",                 "color": "green",  "emoji": "🟢"},
            {"minPct": 35,    "label": "Margen bajo",                "color": "yellow", "emoji": "🟡"},
            {"minPct": 20,    "label": "Margen crítico",             "color": "orange", "emoji": "🟠"},
            {"minPct": 0,     "label": "Riesgo / posible pérdida",   "color": "red",    "emoji": "🔴"},
            {"minPct": -9999, "label": "Venta con pérdida real",     "color": "black",  "emoji": "⛔"}
        ]
    }'::jsonb;
