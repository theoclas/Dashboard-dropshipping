-- Retiros detectados al importar historial de cartera Dropi (filas TIPO = SALIDA).

CREATE TABLE `retiros_dropi` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `dropi_movement_id` BIGINT NOT NULL,
    `fecha` DATETIME(3) NULL,
    `monto` DECIMAL(14, 2) NULL,
    `descripcion` TEXT NULL,
    `concepto_retiro` TEXT NULL,
    `nota_adicional` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `retiros_dropi_company_id_dropi_movement_id_key`(`company_id`, `dropi_movement_id`),
    INDEX `retiros_dropi_company_id_fecha_idx`(`company_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `retiros_dropi` ADD CONSTRAINT `retiros_dropi_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
