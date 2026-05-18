-- Historial de importaciones Dropi (deshacer por lote).

CREATE TABLE `import_batches` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('CARTERA', 'PRODUCTOS', 'PEDIDOS') NOT NULL,
    `file_name` VARCHAR(255) NULL,
    `user_id` VARCHAR(191) NULL,
    `imported` INTEGER NOT NULL DEFAULT 0,
    `payload` JSON NOT NULL,
    `undone_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `import_batches_company_id_created_at_idx`(`company_id`, `created_at`),
    INDEX `import_batches_company_id_kind_created_at_idx`(`company_id`, `kind`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
