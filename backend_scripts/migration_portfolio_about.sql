-- Migration script for Portfolio and About Us modules

CREATE TABLE IF NOT EXISTS `portfolio_items` (
  `id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `video_url` text NOT NULL,
  `history_text` text,
  `thumbnail_url` text,
  `order_index` int(11) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `about_us_content` (
  `id` varchar(36) NOT NULL,
  `section_key` varchar(50) NOT NULL,
  `content_value` text,
  `content_type` varchar(20) DEFAULT 'text', -- 'text', 'image'
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_unique_section_key` (`section_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default about us content
INSERT IGNORE INTO `about_us_content` (`id`, `section_key`, `content_value`, `content_type`) VALUES 
(UUID(), 'mision', 'Proveer las mejores cervezas...', 'text'),
(UUID(), 'vision', 'Ser la distribuidora líder...', 'text'),
(UUID(), 'historia', 'Nuestra historia comienza...', 'text'),
(UUID(), 'main_image', '', 'image'),
(UUID(), 'secondary_image', '', 'image');
