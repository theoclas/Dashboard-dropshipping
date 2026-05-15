-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(64) NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `activeCompany` VARCHAR(191) NULL,
    `dashboard_config` JSON NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `operational_expense_enabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Company_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cuentas_publicitarias` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `meta_account_id` VARCHAR(32) NOT NULL,
    `business_name` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cuentas_publicitarias_company_id_idx`(`company_id`),
    UNIQUE INDEX `cuentas_publicitarias_company_id_meta_account_id_key`(`company_id`, `meta_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCompany` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'OPERADOR', 'LECTOR') NOT NULL,
    `operator_permissions` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserCompany_companyId_role_idx`(`companyId`, `role`),
    UNIQUE INDEX `UserCompany_userId_companyId_key`(`userId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `id_dropi` VARCHAR(50) NOT NULL,
    `fecha` DATETIME(3) NULL,
    `cliente` VARCHAR(255) NULL,
    `transportadora` VARCHAR(100) NULL,
    `estado_operativo` VARCHAR(100) NULL,
    `guia` VARCHAR(100) NULL,
    `departamento` VARCHAR(100) NULL,
    `ciudad` VARCHAR(100) NULL,
    `direccion` TEXT NULL,
    `telefono` VARCHAR(50) NULL,
    `notas` TEXT NULL,
    `notas_manuales` TEXT NULL,
    `venta` DECIMAL(12, 2) NULL,
    `ganancia_calc` DECIMAL(12, 2) NULL,
    `flete` DECIMAL(12, 2) NULL,
    `costo_devolucion_estimado` DECIMAL(12, 2) NULL,
    `costo_proveedor` DECIMAL(12, 2) NULL,
    `estatus_original` VARCHAR(255) NULL,
    `ultimo_mov` VARCHAR(255) NULL,
    `fecha_ult_mov` DATETIME(3) NULL,
    `hora_ult_mov` DECIMAL(10, 10) NULL,
    `dias_desde_ult_mov` INTEGER NULL,
    `estado_unificado` VARCHAR(100) NULL,
    `cartera` DECIMAL(12, 2) NULL,
    `cartera_aplicada` DECIMAL(12, 2) NULL,
    `estado_cartera` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pedidos_companyId_estado_unificado_idx`(`companyId`, `estado_unificado`),
    INDEX `pedidos_companyId_guia_idx`(`companyId`, `guia`),
    UNIQUE INDEX `pedidos_companyId_id_dropi_key`(`companyId`, `id_dropi`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `externalOrderId` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(12, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderItem_companyId_externalOrderId_idx`(`companyId`, `externalOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productos_detalle` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` VARCHAR(191) NOT NULL,
    `pedido_id_dropi` VARCHAR(50) NOT NULL,
    `producto_id` VARCHAR(50) NULL,
    `sku` VARCHAR(100) NULL,
    `variacion_id` VARCHAR(50) NULL,
    `producto_nombre` VARCHAR(255) NULL,
    `variacion` VARCHAR(255) NULL,
    `cantidad` INTEGER NULL,
    `precio_proveedor` DECIMAL(12, 2) NULL,
    `precio_proveedor_x_cantidad` DECIMAL(12, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `productos_detalle_companyId_pedido_id_dropi_idx`(`companyId`, `pedido_id_dropi`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cartera_movimientos` (
    `companyId` VARCHAR(191) NOT NULL,
    `id` BIGINT NOT NULL,
    `fecha` DATETIME(3) NULL,
    `tipo` VARCHAR(20) NULL,
    `monto` DECIMAL(12, 2) NULL,
    `monto_previo` DECIMAL(12, 2) NULL,
    `orden_id` VARCHAR(50) NULL,
    `numero_guia` VARCHAR(100) NULL,
    `descripcion` TEXT NULL,
    `concepto_retiro` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cartera_movimientos_companyId_orden_id_idx`(`companyId`, `orden_id`),
    PRIMARY KEY (`companyId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mapeo_estados` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `transportadora` VARCHAR(100) NOT NULL DEFAULT '',
    `estatus_original` VARCHAR(100) NOT NULL,
    `ultimo_movimiento` VARCHAR(255) NOT NULL DEFAULT '',
    `estado_unificado` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mapeo_estados_companyId_transportadora_estatus_original_ulti_key`(`companyId`, `transportadora`, `estatus_original`, `ultimo_movimiento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Note` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `externalOrderId` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Note_companyId_externalOrderId_idx`(`companyId`, `externalOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalog_products` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(100) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `catalog_products_company_id_name_idx`(`company_id`, `name`),
    INDEX `catalog_products_company_id_sku_idx`(`company_id`, `sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalog_product_dropi_links` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `catalog_product_id` VARCHAR(191) NOT NULL,
    `variant_key` VARCHAR(64) NOT NULL,
    `producto_id` VARCHAR(50) NULL,
    `sku` VARCHAR(100) NULL,
    `variacion_id` VARCHAR(50) NULL,
    `producto_nombre` VARCHAR(255) NULL,
    `variacion` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `catalog_product_dropi_links_company_id_catalog_product_id_idx`(`company_id`, `catalog_product_id`),
    UNIQUE INDEX `catalog_product_dropi_links_company_id_variant_key_key`(`company_id`, `variant_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `advertising_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `external_campaign_id` VARCHAR(128) NOT NULL,
    `display_name` VARCHAR(255) NULL,
    `advertising_account_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `advertising_campaigns_company_id_product_id_idx`(`company_id`, `product_id`),
    INDEX `advertising_campaigns_advertising_account_id_idx`(`advertising_account_id`),
    UNIQUE INDEX `advertising_campaigns_company_id_external_campaign_id_key`(`company_id`, `external_campaign_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `advertising_campaign_metrics` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `record_date` DATE NOT NULL,
    `meta_link_clicks` INTEGER NULL,
    `meta_conversations_started` INTEGER NULL,
    `shopify_sessions` INTEGER NULL,
    `meta_excel_snapshot` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `advertising_campaign_metrics_company_id_record_date_idx`(`company_id`, `record_date`),
    UNIQUE INDEX `advertising_campaign_metrics_campaign_id_record_date_key`(`campaign_id`, `record_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cpas` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `catalog_product_id` VARCHAR(191) NULL,
    `semana` VARCHAR(50) NULL,
    `fecha` DATETIME(3) NULL,
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

    INDEX `cpas_companyId_fecha_idx`(`companyId`, `fecha`),
    INDEX `cpas_companyId_catalog_product_id_idx`(`companyId`, `catalog_product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gastos_operacionales` (
    `id` VARCHAR(191) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `concepto` VARCHAR(255) NOT NULL,
    `categoria` ENUM('SOFTWARE', 'COMUNICACIONES', 'OTRO') NULL,
    `banco` VARCHAR(120) NULL,
    `medio` VARCHAR(120) NULL,
    `cuenta_publicitaria` VARCHAR(255) NULL,
    `advertising_account_id` VARCHAR(191) NULL,
    `notas` TEXT NULL,
    `pagado` BOOLEAN NOT NULL DEFAULT false,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `gastos_operacionales_company_id_fecha_idx`(`company_id`, `fecha`),
    INDEX `gastos_operacionales_advertising_account_id_idx`(`advertising_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cuentas_publicitarias` ADD CONSTRAINT `cuentas_publicitarias_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCompany` ADD CONSTRAINT `UserCompany_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCompany` ADD CONSTRAINT `UserCompany_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `productos_detalle` ADD CONSTRAINT `productos_detalle_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cartera_movimientos` ADD CONSTRAINT `cartera_movimientos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mapeo_estados` ADD CONSTRAINT `mapeo_estados_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Note` ADD CONSTRAINT `Note_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalog_products` ADD CONSTRAINT `catalog_products_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalog_product_dropi_links` ADD CONSTRAINT `catalog_product_dropi_links_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalog_product_dropi_links` ADD CONSTRAINT `catalog_product_dropi_links_catalog_product_id_fkey` FOREIGN KEY (`catalog_product_id`) REFERENCES `catalog_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advertising_campaigns` ADD CONSTRAINT `advertising_campaigns_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advertising_campaigns` ADD CONSTRAINT `advertising_campaigns_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advertising_campaigns` ADD CONSTRAINT `advertising_campaigns_advertising_account_id_fkey` FOREIGN KEY (`advertising_account_id`) REFERENCES `cuentas_publicitarias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advertising_campaign_metrics` ADD CONSTRAINT `advertising_campaign_metrics_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `advertising_campaign_metrics` ADD CONSTRAINT `advertising_campaign_metrics_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `advertising_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpas` ADD CONSTRAINT `cpas_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpas` ADD CONSTRAINT `cpas_catalog_product_id_fkey` FOREIGN KEY (`catalog_product_id`) REFERENCES `catalog_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gastos_operacionales` ADD CONSTRAINT `gastos_operacionales_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gastos_operacionales` ADD CONSTRAINT `gastos_operacionales_advertising_account_id_fkey` FOREIGN KEY (`advertising_account_id`) REFERENCES `cuentas_publicitarias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gastos_operacionales` ADD CONSTRAINT `gastos_operacionales_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
