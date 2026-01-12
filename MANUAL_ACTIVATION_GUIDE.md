# 🔓 Guía de Activación Manual de Auditoría Completa

## 📋 Resumen

Este sistema permite activar cuentas manualmente desde la base de datos, sin necesidad de procesar pagos. Ideal para:
- Clientes VIP
- Demos comerciales
- Partners
- Testing interno
- Acuerdos especiales

---

## 🎯 Nuevo Flujo de Usuario

### Versión GRATUITA (sin desbloqueo):
1. Usuario ve diagnóstico basado en muestreo
2. Tab "Auditoría Completa" muestra **copy comercial potente**
3. CTA principal: "📞 Agendar Reunión Gratuita (30 min)"
4. Enfoque: Vender **implementación**, no solo data

### Versión DESBLOQUEADA:
1. Usuario ve todo el diagnóstico
2. Tab "Auditoría Completa" muestra:
   - ✅ Estatus de activación + fecha de expiración
   - 📥 Botones de descarga (6 reportes Excel)
   - 🎯 **Botón "Crear Listas en HubSpot"** (NUEVO)
3. Modal de crear listas permite seleccionar:
   - 6 listas de **Contactos** (sin email, sin teléfono, sin owner, inactivos, creados sin actividad, alto riesgo)
   - 6 listas de **Deals** (sin contacto, sin monto, sin owner, inactivos, estancados, alto riesgo)
4. Listas se crean como **ACTIVAS (DYNAMIC)** en HubSpot
5. Usuario recibe URLs directas a cada lista creada

---

## 🛠️ Cómo Activar una Cuenta Manualmente

### Paso 1: Conectar a la Base de Datos

Opción A - Railway Dashboard:
1. Ve a tu proyecto Railway
2. Click en "Data" (MySQL)
3. Click en "Connect" → "MySQL CLI"

Opción B - Desde tu terminal:
```bash
mysql -h containers-us-west-XXX.railway.app -u root -p -P XXXX
```

### Paso 2: Ejecutar Query de Activación

```sql
-- Reemplaza 'PORTAL_ID_AQUI' con el portal_id real del cliente
-- Ejemplo: '49738070'

INSERT INTO unlock_tokens (
    portal_id,
    token,
    status,
    created_at,
    expires_at,
    payment_reference
) VALUES (
    'PORTAL_ID_AQUI',                              -- Portal ID del cliente
    MD5(CONCAT('PORTAL_ID_AQUI', NOW(), RAND())),  -- Token único generado
    'active',                                       -- Estado activo
    NOW(),                                          -- Fecha de activación
    DATE_ADD(NOW(), INTERVAL 365 DAY),             -- Vigencia: 365 días (1 año)
    'MANUAL_ACTIVATION'                             -- Referencia para identificar activaciones manuales
);
```

### Paso 3: Verificar Activación

```sql
SELECT 
    portal_id,
    LEFT(token, 16) as token_preview,
    status,
    DATE_FORMAT(created_at, '%d/%m/%Y') as fecha_activacion,
    DATE_FORMAT(expires_at, '%d/%m/%Y') as fecha_expiracion,
    DATEDIFF(expires_at, NOW()) as dias_restantes,
    payment_reference
FROM unlock_tokens
WHERE portal_id = 'PORTAL_ID_AQUI'
AND status = 'active';
```

---

## ⚙️ Queries Útiles para Gestión

### Ver Todos los Tokens Activos
```sql
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
```

### Extender Vigencia de un Token (+90 días)
```sql
UPDATE unlock_tokens 
SET expires_at = DATE_ADD(expires_at, INTERVAL 90 DAY)
WHERE portal_id = 'PORTAL_ID_AQUI'
AND status = 'active';
```

### Desactivar un Token Manualmente
```sql
UPDATE unlock_tokens 
SET status = 'expired'
WHERE portal_id = 'PORTAL_ID_AQUI'
AND status = 'active';
```

### Ver Historial de Descargas de un Cliente
```sql
SELECT 
    portal_id,
    report_type,
    DATE_FORMAT(downloaded_at, '%d/%m/%Y %H:%i') as fecha_descarga,
    COUNT(*) as veces_descargado
FROM unlock_downloads
WHERE portal_id = 'PORTAL_ID_AQUI'
GROUP BY portal_id, report_type, DATE(downloaded_at)
ORDER BY downloaded_at DESC;
```

### Estadísticas Generales
```sql
-- Tokens activos vs expirados
SELECT 
    status,
    COUNT(*) as cantidad,
    COUNT(CASE WHEN payment_reference = 'MANUAL_ACTIVATION' THEN 1 END) as manuales,
    COUNT(CASE WHEN payment_reference != 'MANUAL_ACTIVATION' THEN 1 END) as pagos
FROM unlock_tokens
GROUP BY status;

-- Top 10 clientes por descargas
SELECT 
    portal_id,
    COUNT(*) as total_descargas,
    COUNT(DISTINCT report_type) as reportes_diferentes,
    MIN(downloaded_at) as primera_descarga,
    MAX(downloaded_at) as ultima_descarga
FROM unlock_downloads
GROUP BY portal_id
ORDER BY total_descargas DESC
LIMIT 10;
```

---

## 🎯 Crear Listas en HubSpot (Nuevo Feature)

### ¿Qué hace?

Cuando un usuario desbloqueado hace click en **"🎯 Crear Listas en HubSpot"**:

1. Se abre un modal con checkboxes para seleccionar listas
2. Usuario elige las listas que quiere crear (puede seleccionar todas o solo algunas)
3. Backend crea listas **ACTIVAS (DYNAMIC)** en HubSpot usando Lists API v3
4. Listas se actualizan automáticamente cuando nuevos registros cumplan los criterios

### Listas Disponibles

#### Contactos (6 listas):
- `[CWA] Contactos sin email` - Contactos sin email configurado
- `[CWA] Contactos sin teléfono` - Contactos sin teléfono
- `[CWA] Contactos sin owner` - Contactos sin propietario
- `[CWA] Contactos inactivos +180 días` - Sin actividad en 6 meses
- `[CWA] Contactos creados +90d sin actividad` - Creados hace +90 días sin actividad
- `[CWA] Contactos de alto riesgo` - Sin email Y sin owner

#### Deals (6 listas):
- `[CWA] Deals sin contacto` - Deals sin contacto asociado
- `[CWA] Deals sin monto` - Deals sin valor monetario
- `[CWA] Deals sin owner` - Deals sin propietario
- `[CWA] Deals inactivos +180 días` - Sin actividad en 6 meses
- `[CWA] Deals estancados por etapa` - En la misma etapa +30 días
- `[CWA] Deals de alto riesgo` - Sin monto Y sin owner

### Endpoint Backend

```
POST https://cwa.estado7.com/api/lists/create

Body:
{
  "portalId": "49738070",
  "listIds": [
    "contacts-without-email",
    "deals-without-owner",
    "deals-high-risk"
  ]
}

Response:
{
  "total": 3,
  "created": 3,
  "failed": 0,
  "results": [
    {
      "listId": "contacts-without-email",
      "success": true,
      "hubspotListId": "12345",
      "name": "[CWA] Contactos sin email",
      "url": "https://app.hubspot.com/contacts/49738070/lists/12345"
    },
    ...
  ]
}
```

---

## 💡 Estrategia Comercial

### Copy del Tab "Auditoría Completa"

**Cuando NO está desbloqueado:**
- Headline: "🚀 ¿Quieres corregir estos problemas sin trabajo manual?"
- Enfoque: Vender **implementación**, no solo data
- Beneficios:
  - ✓ Exportación completa
  - ✓ Listas activas automáticas
  - ✓ Workflows de corrección
  - ✓ Validaciones automáticas
  - ✓ Auditoría profunda
  - ✓ Capacitación del equipo
  - ✓ Soporte 30 días
- CTA: "📞 Agendar Reunión Gratuita (30 min)"
- Mensaje clave: *"No vendemos un reporte. Te ayudamos a implementar las soluciones en tu HubSpot."*

**Cuando SÍ está desbloqueado:**
- Acceso completo a descargas Excel
- Botón destacado: "🎯 Crear Listas en HubSpot"
- CTA secundario: Sección "¿Necesitas ayuda?" al final

---

## 🔐 Seguridad

- Un portal puede tener múltiples tokens, pero solo uno `active` a la vez
- Los tokens expirados quedan en la BD para auditoría
- `payment_reference = 'MANUAL_ACTIVATION'` identifica activaciones manuales
- Frontend verifica automáticamente el estado al cargar la app

---

## 🚀 Deploy

### Backend
Ya está desplegado en Railway (auto-deploy desde GitHub)

### Frontend
```bash
cd "C:\proyectos\cwa\Cost Waste Analyzer"
hs project upload
```

---

## 🧪 Testing

1. **Activar cuenta de prueba:**
   ```sql
   INSERT INTO unlock_tokens (portal_id, token, status, created_at, expires_at, payment_reference)
   VALUES ('49738070', MD5(CONCAT('49738070', NOW(), RAND())), 'active', NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY), 'MANUAL_ACTIVATION');
   ```

2. **Abrir app en HubSpot:**
   - Ir a Marketplace > Connected apps > Cost CRM Risk Scanner > Settings
   - Tab "🔓 Auditoría Completa"
   - Debe mostrar "✓ Auditoría Completa Desbloqueada"

3. **Probar descargas:**
   - Click en cualquier botón de descarga
   - Debe abrir página azul con animación
   - Debe iniciar descarga automática del Excel

4. **Probar crear listas:**
   - Click en "🎯 Crear Listas en HubSpot"
   - Seleccionar algunas listas
   - Click en "Crear X listas"
   - Debe mostrar "✓ Se crearon X de X listas exitosamente"
   - Ir a HubSpot > Lists y verificar que se crearon

---

## 📞 Soporte

Si tienes problemas:
1. Verifica que el portal_id sea correcto
2. Verifica que el token esté activo: `SELECT * FROM unlock_tokens WHERE portal_id = 'XXX' AND status = 'active'`
3. Revisa logs de Railway para errores backend
4. Verifica que el access token de HubSpot sea válido

---

**¡Listo!** 🎉 Ahora puedes activar cuentas manualmente y ofrecer la funcionalidad completa de crear listas automáticas en HubSpot.

