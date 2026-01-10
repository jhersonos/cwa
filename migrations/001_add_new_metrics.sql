-- Migration: Agregar métricas de deals, companies y tools al historial
-- Fecha: 2026-01-10
-- Descripción: Expande la tabla scan_history para incluir las nuevas métricas

-- Agregar columnas para deals
ALTER TABLE scan_history
  ADD COLUMN deals_total INT DEFAULT 0 AFTER users_total,
  ADD COLUMN deals_without_contact INT DEFAULT 0 AFTER deals_total,
  ADD COLUMN deals_without_owner INT DEFAULT 0 AFTER deals_without_contact,
  ADD COLUMN deals_without_price INT DEFAULT 0 AFTER deals_without_owner,
  ADD COLUMN deals_inactive INT DEFAULT 0 AFTER deals_without_price;

-- Agregar columnas para companies
ALTER TABLE scan_history
  ADD COLUMN companies_total INT DEFAULT 0 AFTER deals_inactive,
  ADD COLUMN companies_without_domain INT DEFAULT 0 AFTER companies_total,
  ADD COLUMN companies_without_owner INT DEFAULT 0 AFTER companies_without_domain,
  ADD COLUMN companies_inactive INT DEFAULT 0 AFTER companies_without_owner;

-- Agregar columnas para tools
ALTER TABLE scan_history
  ADD COLUMN tools_in_use INT DEFAULT 0 AFTER companies_inactive,
  ADD COLUMN tools_total INT DEFAULT 0 AFTER tools_in_use,
  ADD COLUMN tools_usage_percentage DECIMAL(5,2) DEFAULT 0 AFTER tools_total;

-- Agregar columnas para traffic lights (scores promedio por objeto)
ALTER TABLE scan_history
  ADD COLUMN contacts_score INT DEFAULT 100 AFTER tools_usage_percentage,
  ADD COLUMN deals_score INT DEFAULT 100 AFTER contacts_score,
  ADD COLUMN companies_score INT DEFAULT 100 AFTER deals_score,
  ADD COLUMN users_score INT DEFAULT 100 AFTER companies_score;

-- Nota: workflows_total ya existe pero ya no se usa en V3
-- Podemos dejarlo por compatibilidad con scans antiguos

