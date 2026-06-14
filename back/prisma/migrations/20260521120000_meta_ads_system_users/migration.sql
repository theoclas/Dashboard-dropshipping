CREATE TABLE `meta_ads_system_users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `meta_system_user_id` VARCHAR(32) NULL,
    `meta_app_name` VARCHAR(255) NULL,
    `meta_app_id` VARCHAR(32) NULL,
    `access_token` TEXT NOT NULL,
    `token_expires_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `meta_ads_system_users_is_default_is_active_idx`(`is_default`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
