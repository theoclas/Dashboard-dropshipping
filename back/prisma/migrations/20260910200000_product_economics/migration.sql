-- Economía por producto: CPA objetivo, costo y precios por pack.
-- Solo ADD COLUMN nullable.
ALTER TABLE `catalog_products`
  ADD COLUMN `cpa_objetivo` DECIMAL(12,2) NULL,
  ADD COLUMN `cpa_alerta` DECIMAL(12,2) NULL,
  ADD COLUMN `costo_unitario` DECIMAL(12,2) NULL,
  ADD COLUMN `precios` JSON NULL,
  ADD COLUMN `proveedor` VARCHAR(255) NULL,
  ADD COLUMN `economia_notas` TEXT NULL,
  ADD COLUMN `economia_actualizada_en` DATETIME(3) NULL;
