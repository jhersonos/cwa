-- ========================================
-- ACTIVACIÓN MANUAL DE AUDITORÍA COMPLETA
-- ========================================
-- Usa esta query para activar manualmente una cuenta
-- sin necesidad de pago (para clientes VIP, demos, partners, etc.)

-- PASO 1: Verificar si ya existe un token activo para el portal
SELECT 
    portal_id,
    token,
    status,
    created_at,
    expires_at,
    DATEDIFF(expires_at, NOW()) as dias_restantes
FROM unlock_tokens
WHERE portal_id = 'PORTAL_ID_AQUI'
AND status = 'active';

-- PASO 2: Crear token manual con 365 días de vigencia
-- Reemplaza 'PORTAL_ID_AQUI' con el portal_id real (ejemplo: 49738070)
INSERT INTO unlock_tokens (
    portal_id,
    token,
    status,
    created_at,
    expires_at,
    payment_reference
) VALUES (
    'PORTAL_ID_AQUI',
    MD5(CONCAT('PORTAL_ID_AQUI', NOW(), RAND())),
    'active',
    NOW(),
    DATE_ADD(NOW(), INTERVAL 365 DAY),
    'MANUAL_ACTIVATION'
);

-- PASO 3: Verificar que se creó correctamente
SELECT 
    portal_id,
    token,
    status,
    created_at,
    expires_at,
    DATEDIFF(expires_at, NOW()) as dias_restantes,
    payment_reference
FROM unlock_tokens
WHERE portal_id = 'PORTAL_ID_AQUI'
AND status = 'active'
ORDER BY created_at DESC
LIMIT 1;

-- ========================================
-- QUERIES ÚTILES PARA GESTIÓN
-- ========================================

-- Ver todos los tokens activos
SELECT 
    portal_id,
    LEFT(token, 16) as token_preview,
    status,
    DATE_FORMAT(created_at, '%d/%m/%Y') as fecha_activacion,
    DATE_FORMAT(expires_at, '%d/%m/%Y') as fecha_expiracion,
    DATEDIFF(expires_at, NOW()) as dias_restantes,
    payment_reference
FROM unlock_tokens
WHERE status = 'active'
ORDER BY created_at DESC;

-- Extender vigencia de un token existente (+90 días)
UPDATE unlock_tokens 
SET expires_at = DATE_ADD(expires_at, INTERVAL 90 DAY)
WHERE portal_id = 'PORTAL_ID_AQUI'
AND status = 'active';

-- Desactivar un token manualmente
UPDATE unlock_tokens 
SET status = 'expired'
WHERE portal_id = 'PORTAL_ID_AQUI'
AND status = 'active';

-- Ver historial de descargas de un portal
SELECT 
    portal_id,
    report_type,
    DATE_FORMAT(downloaded_at, '%d/%m/%Y %H:%i') as fecha_descarga,
    COUNT(*) as veces_descargado
FROM unlock_downloads
WHERE portal_id = 'PORTAL_ID_AQUI'
GROUP BY portal_id, report_type, DATE(downloaded_at)
ORDER BY downloaded_at DESC;

-- ========================================
-- NOTAS IMPORTANTES
-- ========================================
-- 1. El token se genera automáticamente con MD5
-- 2. La vigencia por defecto es 365 días (1 año)
-- 3. payment_reference = 'MANUAL_ACTIVATION' para identificar activaciones manuales
-- 4. Un portal puede tener múltiples tokens, pero solo uno 'active' a la vez
-- 5. Los tokens expirados quedan en la BD para auditoría

