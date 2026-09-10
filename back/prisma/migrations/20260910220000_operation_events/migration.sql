-- Bitácora de cambios de operación. Solo CREATE TABLE.
CREATE TABLE `operation_events` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `ocurrio_en` DATETIME(3) NOT NULL,
    `tipo` VARCHAR(32) NOT NULL,
    `entidad` VARCHAR(32) NOT NULL,
    `entidad_id` VARCHAR(64) NULL,
    `etiqueta` VARCHAR(255) NULL,
    `valor_antes` VARCHAR(255) NULL,
    `valor_despues` VARCHAR(255) NULL,
    `nota` TEXT NULL,
    `automatico` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `operation_events_company_id_ocurrio_en_idx`(`company_id`, `ocurrio_en`),
    INDEX `operation_events_company_entidad_idx`(`company_id`, `entidad`, `entidad_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `operation_events` ADD CONSTRAINT `operation_events_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
