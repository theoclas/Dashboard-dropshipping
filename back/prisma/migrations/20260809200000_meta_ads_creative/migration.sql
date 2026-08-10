-- Creativo del anuncio (miniatura, imagen y tipo) para verlo en el módulo Anuncios.
-- Las URLs vienen del CDN de Meta y pueden caducar: se refrescan en cada import.

ALTER TABLE `meta_ads`
    ADD COLUMN `creative_id` VARCHAR(128) NULL,
    ADD COLUMN `creative_thumb_url` TEXT NULL,
    ADD COLUMN `creative_image_url` TEXT NULL,
    ADD COLUMN `creative_object_type` VARCHAR(50) NULL,
    ADD COLUMN `creative_updated_at` DATETIME(3) NULL;
