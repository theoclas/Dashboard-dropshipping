-- Credenciales de servicio para la API de solo lectura del agente.
-- Solo CREATE TABLE: no toca ni borra nada existente.
CREATE TABLE `service_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `prefix` VARCHAR(20) NOT NULL,
    `company_id` VARCHAR(191) NOT NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,

    UNIQUE INDEX `service_tokens_token_hash_key`(`token_hash`),
    INDEX `service_tokens_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `service_tokens` ADD CONSTRAINT `service_tokens_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
