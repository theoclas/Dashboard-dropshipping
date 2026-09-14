-- Rótulos propios de las tarjetas del dashboard, por usuario.
-- Columna aparte de `dashboard_config` para no tocar las configuraciones existentes.
ALTER TABLE `User` ADD COLUMN `dashboard_card_labels` JSON NULL;
