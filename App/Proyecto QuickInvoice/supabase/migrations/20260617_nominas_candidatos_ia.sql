-- Evaluación IA de CVs — columnas en nominas.candidatos
ALTER TABLE nominas.candidatos
    ADD COLUMN IF NOT EXISTS ia_score         SMALLINT,          -- 0–100
    ADD COLUMN IF NOT EXISTS ia_recomendacion TEXT,              -- Altamente recomendado / Recomendado / A evaluar / No apto
    ADD COLUMN IF NOT EXISTS ia_resumen       TEXT,              -- 2-3 oraciones de resumen
    ADD COLUMN IF NOT EXISTS ia_fortalezas    JSONB DEFAULT '[]'::jsonb,  -- array de strings
    ADD COLUMN IF NOT EXISTS ia_alertas       JSONB DEFAULT '[]'::jsonb,  -- array de strings
    ADD COLUMN IF NOT EXISTS ia_habilidades   JSONB DEFAULT '[]'::jsonb,  -- skills extraídos del CV
    ADD COLUMN IF NOT EXISTS ia_preguntas     JSONB DEFAULT '[]'::jsonb,  -- preguntas sugeridas para entrevista
    ADD COLUMN IF NOT EXISTS ia_evaluado_at   TIMESTAMPTZ;
