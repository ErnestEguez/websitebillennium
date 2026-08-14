-- Campos "Ciudad" y "Email" de la empresa — usados en el encabezado del
-- ticket POS ("Correo - Ciudad - Ecuador") y disponibles para el RIDE si
-- se necesita. email es el correo público de contacto de la empresa (no
-- confundir con config_sri.mail_user, que es la casilla SMTP de envío).

ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS ciudad TEXT NOT NULL DEFAULT 'Guayaquil',
    ADD COLUMN IF NOT EXISTS email  TEXT;
