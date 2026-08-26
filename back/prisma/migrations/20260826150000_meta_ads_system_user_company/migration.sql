-- Usuarios Meta API por empresa (antes eran globales).
ALTER TABLE `meta_ads_system_users` ADD COLUMN `company_id` VARCHAR(191) NULL;

UPDATE `meta_ads_system_users` u
INNER JOIN (
  SELECT `id` AS `cid` FROM `Company` ORDER BY `createdAt` ASC LIMIT 1
) c
SET u.`company_id` = c.`cid`
WHERE u.`company_id` IS NULL;

-- Si no había empresas, no deberían existir filas; por seguridad borramos huérfanos.
DELETE FROM `meta_ads_system_users` WHERE `company_id` IS NULL;

ALTER TABLE `meta_ads_system_users` MODIFY COLUMN `company_id` VARCHAR(191) NOT NULL;

CREATE INDEX `meta_ads_system_users_company_id_is_active_idx` ON `meta_ads_system_users`(`company_id`, `is_active`);

ALTER TABLE `meta_ads_system_users`
  ADD CONSTRAINT `meta_ads_system_users_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
