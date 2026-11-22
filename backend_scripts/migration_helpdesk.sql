-- backend_scripts/migration_helpdesk.sql
-- Tablas para el Sistema Empresarial de Tickets (Helpdesk)

CREATE TABLE IF NOT EXISTS support_ticket_areas (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
  id VARCHAR(255) PRIMARY KEY,
  creator_id VARCHAR(255) NOT NULL,
  creator_name VARCHAR(255) NOT NULL,
  area_id VARCHAR(255) NOT NULL,
  area_name VARCHAR(255),
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  priority VARCHAR(50) DEFAULT 'MEDIA',
  status VARCHAR(50) DEFAULT 'OPEN',
  assigned_to VARCHAR(255),
  image_url LONGTEXT,
  created_at DATETIME,
  synced INT DEFAULT 1,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id VARCHAR(255) PRIMARY KEY,
  ticket_id VARCHAR(255) NOT NULL,
  sender_id VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  image_url LONGTEXT,
  created_at DATETIME,
  synced INT DEFAULT 1,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ticket_messages (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
