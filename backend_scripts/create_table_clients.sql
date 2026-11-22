-- Script para CREAR la tabla clients desde cero
-- Optimizado para importar sin errores (coords y coolers como TEXT)

CREATE TABLE IF NOT EXISTS `clients` (
  `id` varchar(36) NOT NULL,
  `client_code` varchar(50) NOT NULL,
  `name` text NOT NULL,
  `business_name` text,
  `contact` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `address` text,
  `coords` text,                -- Solicitado como TEXT para facilitar importación
  `sales_route` varchar(50) DEFAULT NULL,
  `internal_route` varchar(50) DEFAULT NULL,
  `visit_days` varchar(255) DEFAULT NULL,
  `visit_day_televenta` varchar(255) DEFAULT NULL,
  `zona_comercial` varchar(100) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `gec` varchar(50) DEFAULT NULL,
  `level` varchar(50) DEFAULT NULL,
  `cadena` varchar(255) DEFAULT NULL,
  `exclusivity` varchar(50) DEFAULT NULL,
  `client_type` varchar(50) DEFAULT NULL,
  `enfriador` varchar(50) DEFAULT NULL,
  `cooler_serials` text,        -- Solicitado como TEXT
  `notes` text,
  `owner_id` varchar(36) DEFAULT NULL,
  `created_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_unique_client_code` (`client_code`), -- ÚNICO para evitar duplicados
  KEY `idx_sales_route` (`sales_route`),
  KEY `idx_internal_route` (`internal_route`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
