-- CPA experimental: una fila por producto y día (sin desglose por cuenta).

-- Conservar la fila más reciente por empresa + producto + fecha.
DELETE t1 FROM `cpa_experimental` t1
INNER JOIN `cpa_experimental` t2
  ON t1.company_id = t2.company_id
  AND t1.catalog_product_id = t2.catalog_product_id
  AND t1.fecha = t2.fecha
  AND t1.id < t2.id;

ALTER TABLE `cpa_experimental` DROP FOREIGN KEY `cpa_experimental_advertising_account_id_fkey`;
ALTER TABLE `cpa_experimental` DROP INDEX `cpa_exp_day_unique`;
ALTER TABLE `cpa_experimental` MODIFY `advertising_account_id` VARCHAR(191) NULL;

ALTER TABLE `cpa_experimental`
  ADD CONSTRAINT `cpa_experimental_advertising_account_id_fkey`
  FOREIGN KEY (`advertising_account_id`) REFERENCES `cuentas_publicitarias`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX `cpa_exp_product_day_unique`
  ON `cpa_experimental`(`company_id`, `fecha`, `catalog_product_id`);
