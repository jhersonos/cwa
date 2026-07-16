-- Migración: guardar respuesta completa del scan v3 para rehidratación tras recargar la app
-- Fecha: 2026-04-04
-- Ejecutar después de 001 y 002. La cuota free sigue usando scan_history.created_at.

ALTER TABLE scan_history
  ADD COLUMN result_payload JSON NULL
    COMMENT 'Respuesta completa GET scan-v3 (rehidratación UI; sin token HubSpot)'
    AFTER users_score;
