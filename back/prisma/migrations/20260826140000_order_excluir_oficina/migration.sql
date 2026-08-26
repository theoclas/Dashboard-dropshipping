-- AlterTable
ALTER TABLE `pedidos` ADD COLUMN `excluir_oficina` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `pedidos_companyId_excluir_oficina_idx` ON `pedidos`(`companyId`, `excluir_oficina`);
