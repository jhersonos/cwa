-- Migration: Add unlock tokens table
-- Purpose: Store unlock tokens for full audit report access

CREATE TABLE IF NOT EXISTS unlock_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  portal_id VARCHAR(50) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  status ENUM('active', 'expired', 'revoked') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  payment_reference VARCHAR(255),
  INDEX idx_portal_id (portal_id),
  INDEX idx_token (token),
  INDEX idx_status (status),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table to track download history
CREATE TABLE IF NOT EXISTS unlock_downloads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  portal_id VARCHAR(50) NOT NULL,
  token VARCHAR(255) NOT NULL,
  download_type ENUM('csv', 'xlsx') NOT NULL,
  report_type VARCHAR(100) NOT NULL,
  downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_portal_id (portal_id),
  INDEX idx_downloaded_at (downloaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

