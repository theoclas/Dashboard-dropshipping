-- CreateTable
CREATE TABLE `cpa_experimental` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `catalog_product_id` VARCHAR(191) NOT NULL,
    `advertising_account_id` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `semana` VARCHAR(50) NULL,
    `producto` VARCHAR(255) NULL,
    `cuenta_publicitaria` VARCHAR(255) NULL,
    `gasto_publicidad` DECIMAL(12, 2) NULL,
    `conversaciones` INTEGER NULL,
    `total_facturado` DECIMAL(12, 2) NULL,
    `ganancia_promedio` DECIMAL(12, 2) NULL,
    `ventas` INTEGER NULL,
    `ticket_promedio_producto` DECIMAL(12, 2) NULL,
    `cpa` DECIMAL(12, 2) NULL,
    `conversion_rate` DECIMAL(12, 4) NULL,
    `costo_publicitario` DECIMAL(12, 2) NULL,
    `rentabilidad` DECIMAL(12, 4) NULL,
    `utilidad_aproximada` DECIMAL(12, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cpa_exp_day_unique`(`company_id`, `fecha`, `catalog_product_id`, `advertising_account_id`),
    INDEX `cpa_experimental_company_id_fecha_idx`(`company_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cpa_experimental` ADD CONSTRAINT `cpa_experimental_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpa_experimental` ADD CONSTRAINT `cpa_experimental_catalog_product_id_fkey` FOREIGN KEY (`catalog_product_id`) REFERENCES `catalog_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpa_experimental` ADD CONSTRAINT `cpa_experimental_advertising_account_id_fkey` FOREIGN KEY (`advertising_account_id`) REFERENCES `cuentas_publicitarias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
