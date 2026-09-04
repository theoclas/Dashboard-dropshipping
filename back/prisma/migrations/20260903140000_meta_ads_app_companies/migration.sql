-- Las apps de Meta pasan a ser por empresa.
--
-- Hasta ahora eran globales: cualquier empresa veía todas. Ahora el acceso se decide por
-- esta tabla.

CREATE TABLE `meta_ads_app_companies` (
  `id` VARCHAR(191) NOT NULL,
  `app_id` VARCHAR(191) NOT NULL,
  `company_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `meta_ads_app_companies_app_id_company_id_key`(`app_id`, `company_id`),
  INDEX `meta_ads_app_companies_company_id_idx`(`company_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Traspaso: cada app queda asignada a TODAS las empresas, que es lo que pasaba antes.
-- Empezar en "ninguna" dejaría a las empresas sin apps y rompería el import de Meta el
-- mismo dia del despliegue; desde aquí se puede ir restringiendo a mano.
INSERT INTO `meta_ads_app_companies` (`id`, `app_id`, `company_id`, `created_at`)
SELECT
  CONCAT('maac_', REPLACE(UUID(), '-', '')),
  a.`id`,
  c.`id`,
  NOW(3)
FROM `meta_ads_apps` a
CROSS JOIN `Company` c;

ALTER TABLE `meta_ads_app_companies`
  ADD CONSTRAINT `meta_ads_app_companies_app_id_fkey`
  FOREIGN KEY (`app_id`) REFERENCES `meta_ads_apps`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `meta_ads_app_companies`
  ADD CONSTRAINT `meta_ads_app_companies_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
