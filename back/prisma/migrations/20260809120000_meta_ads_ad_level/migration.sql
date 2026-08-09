-- Módulo Anuncios: jerarquía cuenta → campaña → conjunto → anuncio + métricas diarias por anuncio.

-- Conjuntos de anuncios (adsets)
CREATE TABLE `meta_adsets` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `external_adset_id` VARCHAR(128) NOT NULL,
    `name` VARCHAR(255) NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `advertising_account_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `meta_adsets_uniq_co_ext`(`company_id`, `external_adset_id`),
    INDEX `meta_adsets_idx_camp`(`campaign_id`),
    INDEX `meta_adsets_idx_acct`(`advertising_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Anuncios (ads)
CREATE TABLE `meta_ads` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `external_ad_id` VARCHAR(128) NOT NULL,
    `name` VARCHAR(255) NULL,
    `adset_id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `advertising_account_id` VARCHAR(191) NULL,
    `effective_status` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `meta_ads_uniq_co_ext`(`company_id`, `external_ad_id`),
    INDEX `meta_ads_idx_adset`(`adset_id`),
    INDEX `meta_ads_idx_camp`(`campaign_id`),
    INDEX `meta_ads_idx_acct`(`advertising_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Métricas diarias por anuncio
CREATE TABLE `meta_ad_metrics` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `ad_id` VARCHAR(191) NOT NULL,
    `adset_id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `advertising_account_id` VARCHAR(191) NULL,
    `record_date` DATE NOT NULL,
    `spend` DECIMAL(14, 2) NULL,
    `impressions` INTEGER NULL,
    `reach` INTEGER NULL,
    `clicks` INTEGER NULL,
    `link_clicks` INTEGER NULL,
    `ctr` DECIMAL(10, 4) NULL,
    `cpc` DECIMAL(14, 4) NULL,
    `cpm` DECIMAL(14, 4) NULL,
    `conversations` INTEGER NULL,
    `purchases` INTEGER NULL,
    `conversion_value` DECIMAL(14, 2) NULL,
    `roas` DECIMAL(10, 4) NULL,
    `raw_snapshot` JSON NULL,
    `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `meta_ad_metrics_uniq_ad_day`(`ad_id`, `record_date`),
    INDEX `meta_ad_metrics_idx_co_day`(`company_id`, `record_date`),
    INDEX `meta_ad_metrics_idx_camp_day`(`campaign_id`, `record_date`),
    INDEX `meta_ad_metrics_idx_adset_day`(`adset_id`, `record_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `meta_adsets` ADD CONSTRAINT `meta_adsets_fk_company` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meta_adsets` ADD CONSTRAINT `meta_adsets_fk_camp` FOREIGN KEY (`campaign_id`) REFERENCES `advertising_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meta_adsets` ADD CONSTRAINT `meta_adsets_fk_acct` FOREIGN KEY (`advertising_account_id`) REFERENCES `cuentas_publicitarias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `meta_ads` ADD CONSTRAINT `meta_ads_fk_company` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meta_ads` ADD CONSTRAINT `meta_ads_fk_adset` FOREIGN KEY (`adset_id`) REFERENCES `meta_adsets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meta_ads` ADD CONSTRAINT `meta_ads_fk_camp` FOREIGN KEY (`campaign_id`) REFERENCES `advertising_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meta_ads` ADD CONSTRAINT `meta_ads_fk_acct` FOREIGN KEY (`advertising_account_id`) REFERENCES `cuentas_publicitarias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `meta_ad_metrics` ADD CONSTRAINT `meta_ad_metrics_fk_company` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meta_ad_metrics` ADD CONSTRAINT `meta_ad_metrics_fk_ad` FOREIGN KEY (`ad_id`) REFERENCES `meta_ads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meta_ad_metrics` ADD CONSTRAINT `meta_ad_metrics_fk_adset` FOREIGN KEY (`adset_id`) REFERENCES `meta_adsets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meta_ad_metrics` ADD CONSTRAINT `meta_ad_metrics_fk_camp` FOREIGN KEY (`campaign_id`) REFERENCES `advertising_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meta_ad_metrics` ADD CONSTRAINT `meta_ad_metrics_fk_acct` FOREIGN KEY (`advertising_account_id`) REFERENCES `cuentas_publicitarias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
