-- CreateTable
CREATE TABLE `meta_ads_apps` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `meta_app_id` VARCHAR(32) NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `meta_ads_apps_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meta_ads_system_user_app_access` (
    `id` VARCHAR(191) NOT NULL,
    `system_user_id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NOT NULL,
    `access_token` TEXT NOT NULL,
    `token_expires_at` DATETIME(3) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `meta_ads_system_user_app_access_is_default_idx`(`is_default`),
    UNIQUE INDEX `meta_ads_system_user_app_access_system_user_id_app_id_key`(`system_user_id`, `app_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migrate existing users: create apps and access rows from legacy columns
INSERT INTO `meta_ads_apps` (`id`, `name`, `meta_app_id`, `notes`, `is_active`, `created_at`, `updated_at`)
SELECT
    CONCAT('migrated_app_', `id`) AS `id`,
    COALESCE(NULLIF(TRIM(`meta_app_name`), ''), 'App sin nombre') AS `name`,
    NULLIF(TRIM(`meta_app_id`), '') AS `meta_app_id`,
    NULL AS `notes`,
    true AS `is_active`,
    `created_at`,
    `updated_at`
FROM `meta_ads_system_users`
WHERE TRIM(COALESCE(`access_token`, '')) <> ''
  AND (NULLIF(TRIM(`meta_app_name`), '') IS NOT NULL OR NULLIF(TRIM(`meta_app_id`), '') IS NOT NULL);

INSERT INTO `meta_ads_system_user_app_access` (
    `id`, `system_user_id`, `app_id`, `access_token`, `token_expires_at`, `is_default`, `created_at`, `updated_at`
)
SELECT
    CONCAT('migrated_access_', `id`) AS `id`,
    `id` AS `system_user_id`,
    CONCAT('migrated_app_', `id`) AS `app_id`,
    `access_token`,
    `token_expires_at`,
    `is_default`,
    `created_at`,
    `updated_at`
FROM `meta_ads_system_users`
WHERE TRIM(COALESCE(`access_token`, '')) <> ''
  AND (NULLIF(TRIM(`meta_app_name`), '') IS NOT NULL OR NULLIF(TRIM(`meta_app_id`), '') IS NOT NULL);

-- Users with token but no app info: generic app per user
INSERT INTO `meta_ads_apps` (`id`, `name`, `meta_app_id`, `notes`, `is_active`, `created_at`, `updated_at`)
SELECT
    CONCAT('migrated_generic_app_', `id`) AS `id`,
    CONCAT('App — ', `name`) AS `name`,
    NULL AS `meta_app_id`,
    'Migrado automáticamente' AS `notes`,
    true AS `is_active`,
    `created_at`,
    `updated_at`
FROM `meta_ads_system_users`
WHERE TRIM(COALESCE(`access_token`, '')) <> ''
  AND NULLIF(TRIM(`meta_app_name`), '') IS NULL
  AND NULLIF(TRIM(`meta_app_id`), '') IS NULL;

INSERT INTO `meta_ads_system_user_app_access` (
    `id`, `system_user_id`, `app_id`, `access_token`, `token_expires_at`, `is_default`, `created_at`, `updated_at`
)
SELECT
    CONCAT('migrated_generic_access_', `id`) AS `id`,
    `id` AS `system_user_id`,
    CONCAT('migrated_generic_app_', `id`) AS `app_id`,
    `access_token`,
    `token_expires_at`,
    `is_default`,
    `created_at`,
    `updated_at`
FROM `meta_ads_system_users`
WHERE TRIM(COALESCE(`access_token`, '')) <> ''
  AND NULLIF(TRIM(`meta_app_name`), '') IS NULL
  AND NULLIF(TRIM(`meta_app_id`), '') IS NULL;

-- Drop legacy columns from users
ALTER TABLE `meta_ads_system_users` DROP INDEX `meta_ads_system_users_is_default_is_active_idx`;
ALTER TABLE `meta_ads_system_users`
    DROP COLUMN `meta_app_name`,
    DROP COLUMN `meta_app_id`,
    DROP COLUMN `access_token`,
    DROP COLUMN `token_expires_at`,
    DROP COLUMN `is_default`;

CREATE INDEX `meta_ads_system_users_is_active_idx` ON `meta_ads_system_users`(`is_active`);

-- AddForeignKey
ALTER TABLE `meta_ads_system_user_app_access` ADD CONSTRAINT `meta_ads_system_user_app_access_system_user_id_fkey` FOREIGN KEY (`system_user_id`) REFERENCES `meta_ads_system_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meta_ads_system_user_app_access` ADD CONSTRAINT `meta_ads_system_user_app_access_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `meta_ads_apps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
