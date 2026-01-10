# Sistema de Desbloqueo de Auditoría Completa

## Descripción General

Cost CRM Risk Scanner incluye un sistema de **desbloqueo de auditoría completa** como capa de monetización pasiva. Permite a los usuarios obtener exportaciones completas de registros afectados y resúmenes detallados para trabajo interno o con agencias.

## Filosofía del Diseño

**NO es un "Pro/Premium"** - Es acceso temporal a descarga de auditoría completa.

### Tono y Lenguaje
✅ **Usar:**
- Auditoría completa
- Informe detallado  
- Descarga de registros
- Trabajo interno

❌ **Evitar:**
- Pro / Premium / Upgrade
- Límites artificiales
- Presión comercial

## Flujo de Usuario

```
1. Usuario ve botón "🔓 Desbloquear auditoría completa"
2. Click abre modal explicativo
3. Modal muestra:
   - Beneficios del desbloqueo
   - Link a página de pago ($9.99 USD)
   - Campo para ingresar token
4. Usuario paga en https://cwa.estado7.com/payment
5. Sistema genera token y envía por email
6. Usuario ingresa token en modal
7. Frontend valida token con backend
8. Si válido: Habilita botones de descarga
9. Usuario descarga CSVs de registros afectados
```

## Backend - Endpoints

### POST `/api/unlock/validate`
Valida un token de desbloqueo.

**Request:**
```json
{
  "portalId": "12345",
  "token": "abc123xyz"
}
```

**Response (válido):**
```json
{
  "valid": true,
  "expiresAt": "2026-02-10T00:00:00.000Z",
  "message": "Token válido. Auditoría completa desbloqueada."
}
```

**Response (inválido):**
```json
{
  "valid": false,
  "message": "Token inválido, expirado o no corresponde a esta cuenta"
}
```

### GET `/api/unlock/status?portalId=12345`
Verifica si un portal tiene desbloqueo activo.

**Response:**
```json
{
  "unlocked": true,
  "expiresAt": "2026-02-10T00:00:00.000Z"
}
```

### GET `/api/unlock/download/:reportType?portalId=12345&token=abc123`
Descarga un reporte específico en formato CSV.

**Tipos de reporte disponibles:**
- `audit-summary` - Resumen completo de auditoría
- `deals-without-owner` - Deals sin owner asignado
- `deals-without-contact` - Deals sin contacto asociado
- `deals-without-amount` - Deals sin valor monetario
- `contacts-without-email` - Contactos sin email
- `companies-without-phone` - Empresas sin teléfono

**Response:** Archivo CSV descargable

## Base de Datos

### Tabla `unlock_tokens`
```sql
CREATE TABLE unlock_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  portal_id VARCHAR(50) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  status ENUM('active', 'expired', 'revoked') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  payment_reference VARCHAR(255),
  INDEX idx_portal_id (portal_id),
  INDEX idx_token (token)
);
```

### Tabla `unlock_downloads`
```sql
CREATE TABLE unlock_downloads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  portal_id VARCHAR(50) NOT NULL,
  token VARCHAR(255) NOT NULL,
  download_type ENUM('csv', 'xlsx') NOT NULL,
  report_type VARCHAR(100) NOT NULL,
  downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Frontend - Componentes

### Modal de Desbloqueo
- Explicación de beneficios
- Link a página de pago
- Campo de token
- Botón validar

### Indicador de Estado
- Si no desbloqueado: Botón "🔓 Desbloquear auditoría completa"
- Si desbloqueado: Badge verde con fecha de expiración

### Botones de Descarga
Se muestran solo cuando `isUnlocked === true`:
- Resumen completo (CSV)
- Deals sin owner
- Deals sin contacto
- Deals sin precio
- Contactos sin email
- Empresas sin teléfono

## Página de Pago (Pendiente Implementación)

URL: `https://cwa.estado7.com/payment`

**TODO:**
1. Integración con MercadoPago
2. Formulario de pago ($9.99 USD)
3. Generación de token único al confirmar pago
4. Envío de token por email
5. Asociación de token con:
   - Portal ID
   - Fecha de expiración (30 días)
   - Referencia de pago

## Características de Seguridad

- ✅ Token único por portal
- ✅ Validación server-side
- ✅ Expiración automática (30 días)
- ✅ No compartible entre cuentas
- ✅ Logging de descargas
- ✅ Estado revocable manualmente

## Experiencia de Usuario

### Sin desbloqueo (Gratis - 100% funcional)
- ✅ Análisis completo de riesgos
- ✅ Scores y traffic lights
- ✅ Insights y recomendaciones
- ✅ Visualización de resultados
- ✅ Modales con detalles
- ✅ Historial de escaneos
- ❌ Descarga de registros afectados

### Con desbloqueo ($9.99 - 30 días)
- ✅ Todo lo anterior +
- ✅ Exportación CSV de registros afectados
- ✅ Resumen completo de auditoría
- ✅ Trabajo con agencias/consultores

## Monetización

**Objetivo:** Generar ingresos pasivos sin afectar:
- Captación de leads
- Confianza del usuario
- Valor del diagnóstico gratuito
- Posicionamiento profesional

**Precio:** $9.99 USD / 30 días
**Target:** Agencias, consultores, equipos internos que necesitan documentación formal

## Próximos Pasos

1. ✅ Backend de tokens
2. ✅ Servicios de exportación
3. ✅ Rutas de API
4. ✅ Frontend con modal
5. ⏳ Página de pago con MercadoPago
6. ⏳ Sistema de emails
7. ⏳ Dashboard de administración de tokens

