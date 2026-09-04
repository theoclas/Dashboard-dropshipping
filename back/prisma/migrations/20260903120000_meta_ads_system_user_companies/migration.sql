-- Un usuario de Meta puede servir a varias empresas.
--
-- Hasta ahora `meta_ads_system_users.company_id` ataba cada usuario a una sola. Esa
-- columna se conserva como empresa propietaria (quién lo creó), pero el acceso pasa a
-- decidirse por esta tabla: es lo que consultan el resolutor de token y los listados.

CREATE TABLE `meta_ads_system_user_companies` (
  `id` VARCHAR(191) NOT NULL,
  `system_user_id` VARCHAR(191) NOT NULL,
  `company_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `meta_ads_system_user_companies_system_user_id_company_id_key`(`system_user_id`, `company_id`),
  INDEX `meta_ads_system_user_companies_company_id_idx`(`company_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Traspaso: cada usuario conserva el acceso que ya tenía. Sin esto, el import de Meta
-- dejaría de encontrar tokens en cuanto se despliegue.
INSERT INTO `meta_ads_system_user_companies` (`id`, `system_user_id`, `company_id`, `created_at`)
SELECT
  CONCAT('mauc_', REPLACE(UUID(), '-', '')),
  u.`id`,
  u.`company_id`,
  NOW(3)
FROM `meta_ads_system_users` u;

ALTER TABLE `meta_ads_system_user_companies`
  ADD CONSTRAINT `meta_ads_system_user_companies_system_user_id_fkey`
  FOREIGN KEY (`system_user_id`) REFERENCES `meta_ads_system_users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `meta_ads_system_user_companies`
  ADD CONSTRAINT `meta_ads_system_user_companies_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
