-- Junction: producto ↔ cuenta publicitaria
CREATE TABLE `catalog_product_advertising_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `catalog_product_id` VARCHAR(191) NOT NULL,
    `advertising_account_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cpaa_uniq_co_prod_acct`(`company_id`, `catalog_product_id`, `advertising_account_id`),
    INDEX `cpaa_idx_co_prod`(`company_id`, `catalog_product_id`),
    INDEX `cpaa_idx_acct`(`advertising_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Junction: producto ↔ campaña
CREATE TABLE `catalog_product_advertising_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `catalog_product_id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cpac_uniq_co_prod_camp`(`company_id`, `catalog_product_id`, `campaign_id`),
    INDEX `cpac_idx_co_prod`(`company_id`, `catalog_product_id`),
    INDEX `cpac_idx_camp`(`campaign_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill campaña ↔ producto desde product_id existente
INSERT INTO `catalog_product_advertising_campaigns` (`id`, `company_id`, `catalog_product_id`, `campaign_id`, `created_at`)
SELECT
    CONCAT('cpac_', SUBSTRING(MD5(CONCAT(ac.`company_id`, ':', ac.`product_id`, ':', ac.`id`)), 1, 24)),
    ac.`company_id`,
    ac.`product_id`,
    ac.`id`,
    NOW(3)
FROM `advertising_campaigns` ac
WHERE ac.`product_id` IS NOT NULL AND ac.`product_id` <> '';

-- Backfill producto ↔ cuenta desde campañas con cuenta asignada
INSERT INTO `catalog_product_advertising_accounts` (`id`, `company_id`, `catalog_product_id`, `advertising_account_id`, `created_at`)
SELECT
    CONCAT('cpaa_', SUBSTRING(MD5(CONCAT(ac.`company_id`, ':', ac.`product_id`, ':', ac.`advertising_account_id`)), 1, 24)),
    ac.`company_id`,
    ac.`product_id`,
    ac.`advertising_account_id`,
    NOW(3)
FROM `advertising_campaigns` ac
WHERE ac.`product_id` IS NOT NULL
  AND ac.`product_id` <> ''
  AND ac.`advertising_account_id` IS NOT NULL
GROUP BY ac.`company_id`, ac.`product_id`, ac.`advertising_account_id`;

ALTER TABLE `catalog_product_advertising_accounts` ADD CONSTRAINT `cpaa_fk_company` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `catalog_product_advertising_accounts` ADD CONSTRAINT `cpaa_fk_product` FOREIGN KEY (`catalog_product_id`) REFERENCES `catalog_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `catalog_product_advertising_accounts` ADD CONSTRAINT `cpaa_fk_acct` FOREIGN KEY (`advertising_account_id`) REFERENCES `cuentas_publicitarias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `catalog_product_advertising_campaigns` ADD CONSTRAINT `cpac_fk_company` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `catalog_product_advertising_campaigns` ADD CONSTRAINT `cpac_fk_product` FOREIGN KEY (`catalog_product_id`) REFERENCES `catalog_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `catalog_product_advertising_campaigns` ADD CONSTRAINT `cpac_fk_camp` FOREIGN KEY (`campaign_id`) REFERENCES `advertising_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Quitar product_id de advertising_campaigns
ALTER TABLE `advertising_campaigns` DROP FOREIGN KEY `advertising_campaigns_product_id_fkey`;
DROP INDEX `advertising_campaigns_company_id_product_id_idx` ON `advertising_campaigns`;
ALTER TABLE `advertising_campaigns` DROP COLUMN `product_id`;
