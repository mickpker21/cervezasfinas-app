-- backend_scripts/migration_onboard_supervision.sql
-- Create tables in MySQL for Onboard Supervision Sync

CREATE TABLE IF NOT EXISTS supervisor_onboard_supervisions (
  id VARCHAR(255) PRIMARY KEY,
  supervisor_id VARCHAR(255),
  supervisor_name VARCHAR(255),
  route_name VARCHAR(255),
  vendedor_id VARCHAR(255),
  vendedor_name VARCHAR(255),
  start_at DATETIME,
  end_at DATETIME,
  checklist_data TEXT,
  status VARCHAR(50),
  score FLOAT,
  synced INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_supervision_supervisor (supervisor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supervisor_onboard_visits (
  id VARCHAR(255) PRIMARY KEY,
  supervision_id VARCHAR(255),
  client_id VARCHAR(255),
  client_name VARCHAR(255),
  client_code VARCHAR(100),
  survey_data TEXT,
  evaluation_pdv_id VARCHAR(255),
  created_at DATETIME,
  synced INT DEFAULT 1,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_visit_supervision (supervision_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
