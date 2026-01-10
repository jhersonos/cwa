# Configuración de MercadoPago - Cost CRM Risk Scanner

## 🚀 SISTEMA IMPLEMENTADO

**Páginas:**
- ✅ `/payment` - Checkout (payment-checkout.html)
- ✅ `/payment/success` - Éxito (payment-success.html)
- ✅ `/payment/failure` - Cancelado
- ✅ `/payment/pending` - Pendiente

**Endpoints API:**
- ✅ `POST /api/payment/create-preference` - Crear preferencia de pago
- ✅ `POST /api/payment/webhook` - Webhook de notificaciones
- ✅ `GET /api/payment/token-info` - Obtener token generado

**Flujo:**
```
1. Usuario → /payment?portalId=123
2. Ingresa email → Click "Continuar a MercadoPago"
3. Backend crea preferencia → Redirige a MercadoPago
4. Usuario paga → MercadoPago notifica vía webhook
5. Backend genera token → Guarda en DB
6. Redirige a /payment/success → Muestra token
7. Usuario copia token → Valida en HubSpot
```

---

## 📋 CONFIGURACIÓN NECESARIA

### 1. Crear cuenta en MercadoPago

1. Ir a: https://www.mercadopago.com/developers
2. Crear cuenta (o usar existente)
3. Ir a "Tus aplicaciones" → "Crear aplicación"
4. Nombre: "Cost CRM Risk Scanner"
5. Tipo: Pagos online

### 2. Obtener credenciales

**Modo Sandbox (Testing):**
```
Access Token Sandbox: TEST-1234567890-...
Public Key Sandbox: TEST_PUBLIC_KEY-...
```

**Modo Producción:**
```
Access Token: APP-1234567890-...
Public Key: APP_USR-...
```

### 3. Configurar variables de entorno en Railway

```bash
# En Railway (cwa.estado7.com)
MERCADOPAGO_ACCESS_TOKEN=APP-xxxxxxxxxxxx-...
BASE_URL=https://cwa.estado7.com
CWA_ADMIN_SECRET=your_admin_secret_here
```

**Para testing local:**
```bash
# En .env
MERCADOPAGO_ACCESS_TOKEN=TEST-xxxxxxxxxxxx-...
BASE_URL=http://localhost:3000
CWA_ADMIN_SECRET=local_admin_secret
```

### 4. Configurar Webhook en MercadoPago

1. Ir a tu aplicación en MercadoPago
2. "Webhooks" o "Notificaciones IPN"
3. URL: `https://cwa.estado7.com/api/payment/webhook`
4. Eventos: Seleccionar "Pagos"
5. Guardar

---

## 🧪 TESTING

### Testing con Sandbox

**Tarjetas de prueba MercadoPago:**

**Aprobada:**
```
Número: 5031 7557 3453 0604
CVV: 123
Fecha: 11/25
Nombre: APRO
```

**Rechazada:**
```
Número: 5031 4332 1540 6351
CVV: 123
Fecha: 11/25
Nombre: OTHE
```

**Pendiente:**
```
Número: 3753 651535 56885
CVV: 1234
Fecha: 11/25
Nombre: PEND
```

### Flujo de testing:

1. Abrir: `http://localhost:3000/payment?portalId=123456`
2. Ingresar:
   - Portal ID: 123456
   - Email: test@example.com
3. Click "Continuar a MercadoPago"
4. Usar tarjeta de prueba APRO
5. Verificar redirección a `/payment/success`
6. Copiar token
7. Ir a HubSpot → Validar token

### Verificar webhook:

```bash
# Ver logs de Railway
railway logs

# Buscar líneas:
# "Received payment webhook"
# "Payment info retrieved"
# "Unlock token created from payment"
```

---

## 🔐 SEGURIDAD

### Validación de Webhooks

MercadoPago envía notificaciones desde IPs específicas. Para máxima seguridad, agregar validación:

```javascript
const MERCADOPAGO_IPS = [
  '209.225.49.0/24',
  '216.33.197.0/24',
  '216.33.196.0/24'
];

// Validar IP en webhook
const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
if (!isValidMercadoPagoIP(clientIP)) {
  return reply.code(403).send({ error: 'Unauthorized' });
}
```

### Prevenir duplicados

El código actual usa `payment_reference` para evitar crear múltiples tokens para el mismo pago.

---

## 📧 ENVÍO DE EMAILS

**TODO:** Implementar envío de emails con token.

**Opciones:**
1. **SendGrid** (Recomendado)
2. **Mailgun**
3. **Amazon SES**

**Template sugerido:**

```html
<!DOCTYPE html>
<html>
<head>
    <title>Tu Token - Cost CRM Risk Scanner</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0091AE;">¡Gracias por tu compra!</h1>
        
        <p>Tu token de desbloqueo de Auditoría Completa es:</p>
        
        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <code style="font-size: 24px; font-weight: bold; color: #0891b2;">
                {{TOKEN}}
            </code>
        </div>
        
        <h3>Cómo usar tu token:</h3>
        <ol>
            <li>Abre Cost CRM Risk Scanner en HubSpot</li>
            <li>Click "Desbloquear auditoría completa"</li>
            <li>Pega el token</li>
            <li>¡Listo! Podrás descargar todos los reportes</li>
        </ol>
        
        <p><strong>Válido por 30 días</strong></p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
            Estado 7 - Cost CRM Risk Scanner<br>
            support@estado7.com
        </p>
    </div>
</body>
</html>
```

---

## 🐛 TROUBLESHOOTING

### Problema: Webhook no se ejecuta

**Solución:**
1. Verificar URL en MercadoPago
2. Verificar que Railway esté desplegado
3. Ver logs: `railway logs --filter webhook`

### Problema: Token no aparece en /payment/success

**Solución:**
1. Esperar 3-5 segundos (el webhook tarda)
2. Verificar en DB: `SELECT * FROM unlock_tokens ORDER BY created_at DESC LIMIT 1;`
3. Ver logs de webhook

### Problema: "Payment reference already exists"

**Solución:**
Cambiar constraint en DB o agregar `ON DUPLICATE KEY UPDATE` en insert.

---

## 📊 MONITOREO

### Métricas importantes:

```sql
-- Pagos exitosos hoy
SELECT COUNT(*) FROM unlock_tokens 
WHERE DATE(created_at) = CURDATE();

-- Revenue hoy (9.99 USD * count)
SELECT COUNT(*) * 9.99 as revenue FROM unlock_tokens 
WHERE DATE(created_at) = CURDATE();

-- Tokens activos
SELECT COUNT(*) FROM unlock_tokens 
WHERE status = 'active' AND expires_at > NOW();

-- Tasa de conversión (asumiendo que tienes tabla de preferences)
SELECT 
  COUNT(DISTINCT payment_reference) as successful_payments,
  COUNT(DISTINCT preference_id) as total_attempts,
  (COUNT(DISTINCT payment_reference) / COUNT(DISTINCT preference_id)) * 100 as conversion_rate
FROM unlock_tokens;
```

---

## 🚀 DEPLOYMENT CHECKLIST

- [ ] Agregar `MERCADOPAGO_ACCESS_TOKEN` a Railway
- [ ] Agregar `BASE_URL=https://cwa.estado7.com` a Railway
- [ ] Agregar `CWA_ADMIN_SECRET` a Railway
- [ ] Configurar webhook en MercadoPago
- [ ] Ejecutar migración `002_add_unlock_tokens.sql`
- [ ] Testing con tarjeta sandbox
- [ ] Testing webhook con ngrok o Railway
- [ ] Cambiar a credenciales de producción
- [ ] Testing con tarjeta real (pago mínimo)
- [ ] Configurar envío de emails
- [ ] Monitorear logs primeros días

---

## 💰 COMISIONES MERCADOPAGO

**Argentina:**
- Tarjeta de débito: 2.99% + $0
- Tarjeta de crédito: 4.99% + $0

**Internacional:**
- Tarjeta: 5.99% + $0.60 USD

**Ejemplo (USD):**
- Precio: $9.99
- Comisión (5.99%): ~$0.60
- Comisión fija: $0.60
- **Total recibido: ~$8.79 USD**

---

## 🎯 PRÓXIMOS PASOS

1. **Ahora:** Deploy con credenciales sandbox → Testing
2. **Luego:** Implementar envío de emails
3. **Futuro:** Dashboard de analytics de pagos
4. **Futuro:** Cupones de descuento
5. **Futuro:** Planes por volumen (50 días, 90 días, etc.)

