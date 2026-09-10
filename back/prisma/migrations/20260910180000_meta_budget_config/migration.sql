-- Presupuesto y configuración de conjuntos y campañas, traídos de Meta.
-- Solo ADD COLUMN nullable: no toca ni borra datos existentes.
ALTER TABLE `meta_adsets`
  ADD COLUMN `daily_budget_raw` VARCHAR(32) NULL,
  ADD COLUMN `lifetime_budget_raw` VARCHAR(32) NULL,
  ADD COLUMN `bid_strategy` VARCHAR(64) NULL,
  ADD COLUMN `effective_status` VARCHAR(64) NULL,
  ADD COLUMN `optimization_goal` VARCHAR(64) NULL,
  ADD COLUMN `billing_event` VARCHAR(64) NULL,
  ADD COLUMN `start_time` DATETIME(3) NULL,
  ADD COLUMN `end_time` DATETIME(3) NULL,
  ADD COLUMN `config_synced_at` DATETIME(3) NULL;

ALTER TABLE `advertising_campaigns`
  ADD COLUMN `daily_budget_raw` VARCHAR(32) NULL,
  ADD COLUMN `lifetime_budget_raw` VARCHAR(32) NULL,
  ADD COLUMN `effective_status` VARCHAR(64) NULL,
  ADD COLUMN `objective` VARCHAR(64) NULL,
  ADD COLUMN `buying_type` VARCHAR(64) NULL,
  ADD COLUMN `config_synced_at` DATETIME(3) NULL;
