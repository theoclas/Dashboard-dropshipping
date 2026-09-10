-- Guarda el token en claro para poder volver a copiarlo desde el panel.
-- Nullable: las credenciales creadas antes siguen funcionando, solo que no se pueden revelar.
ALTER TABLE `service_tokens` ADD COLUMN `token_plain` VARCHAR(80) NULL;
