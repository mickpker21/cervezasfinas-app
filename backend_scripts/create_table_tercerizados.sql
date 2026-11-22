-- Script para crear la tabla de clientes tercerizados
-- Esta tabla permite a Televenta registrar clientes bajo un esquema de promoción especial

CREATE TABLE IF NOT EXISTS `tercerizados` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `client_id` VARCHAR(36) NOT NULL,
    `fecha_compra_manual` DATE NOT NULL,
    `created_by` VARCHAR(36) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `status` VARCHAR(20) DEFAULT 'PENDIENTE',
    INDEX idx_client_id (`client_id`),
    INDEX idx_fecha (`fecha_compra_manual`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
