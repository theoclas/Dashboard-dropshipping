ALTER TABLE `pedidos`
  ADD COLUMN `tipo_tienda` VARCHAR(100) NULL,
  ADD COLUMN `tienda` VARCHAR(255) NULL,
  ADD COLUMN `vendedor` VARCHAR(255) NULL,
  ADD COLUMN `tipo_envio` VARCHAR(100) NULL,
  ADD COLUMN `email_cliente` VARCHAR(255) NULL,
  ADD COLUMN `observacion_dropi` TEXT NULL,
  ADD COLUMN `tags` TEXT NULL,
  ADD COLUMN `codigo_postal` VARCHAR(20) NULL,
  ADD COLUMN `id_orden_tienda` VARCHAR(100) NULL,
  ADD COLUMN `numero_pedido_tienda` VARCHAR(100) NULL,
  ADD COLUMN `usuario_generacion_guia` VARCHAR(255) NULL,
  ADD COLUMN `fecha_generacion_guia` DATETIME(3) NULL;
