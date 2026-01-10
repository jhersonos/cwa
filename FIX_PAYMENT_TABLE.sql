-- Script de emergencia para crear tabla unlock_tokens
-- Ejecutar SOLO si la tabla no existe

-- Verificar si la tabla existe
SELECT COUNT(*) as table_exists
FROM information_schema.tables 
WHERE table_schema = DATABASE() 
AND table_name = 'unlock_tokens';

-- Si no existe, ejecutar esto:

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
  INDEX idx_expires_at (expires_at),
  INDEX idx_payment_reference (payment_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verificar creación
SELECT 'Tabla unlock_tokens creada o ya existía' as resultado;

-- Ver tokens creados (si hay)
SELECT * FROM unlock_tokens ORDER BY created_at DESC LIMIT 5;

