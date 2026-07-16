-- Metadatos de portales para dashboard admin (emails, dominio, actividad)
-- Si alguna columna ya existe, omitir esa línea al ejecutar.

ALTER TABLE portals
  ADD COLUMN hub_domain VARCHAR(255) NULL AFTER portal_id;

ALTER TABLE portals
  ADD COLUMN account_name VARCHAR(255) NULL AFTER hub_domain;

ALTER TABLE portals
  ADD COLUMN installer_email VARCHAR(255) NULL AFTER expires_at;

ALTER TABLE portals
  ADD COLUMN last_user_email VARCHAR(255) NULL AFTER installer_email;

ALTER TABLE portals
  ADD COLUMN last_user_name VARCHAR(255) NULL AFTER last_user_email;

ALTER TABLE portals
  ADD COLUMN installed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER last_user_name;

ALTER TABLE portals
  ADD COLUMN last_seen_at TIMESTAMP NULL AFTER installed_at;

ALTER TABLE portals
  ADD COLUMN admin_notes TEXT NULL AFTER last_seen_at;

CREATE INDEX idx_portals_installer_email ON portals (installer_email);
CREATE INDEX idx_portals_last_seen_at ON portals (last_seen_at);
