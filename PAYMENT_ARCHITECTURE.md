# Arquitectura de Pasarela de Pago - Cost CRM Risk Scanner

## 🎯 RECOMENDACIÓN: Opción B (Híbrida)

Después de analizar las opciones, recomiendo:

**App + API:** `cwa.estado7.com` (Railway)  
**Pasarela de pago:** `estado7.com/cwa-payment` (WordPress)

---

## 📊 COMPARACIÓN DE OPCIONES

### Opción A: TODO en `cwa.estado7.com` ❌ NO RECOMENDADO

```
cwa.estado7.com/
  ├── /api/scan-v3          (Backend API)
  ├── /api/unlock/validate  (Backend API)
  ├── /payment              (Pasarela MercadoPago)
  └── /public               (Archivos estáticos)
```

**Ventajas:**
- ✅ Un solo dominio/certificado
- ✅ Sin problemas de CORS
- ✅ Sesiones más simples

**Desventajas:**
- ❌ Mezcla backend técnico con marketing
- ❌ Implementar MercadoPago desde cero (mucho código)
- ❌ Gestión de pagos manual
- ❌ Sin ecosistema de plugins

---

### Opción B: HÍBRIDA (RECOMENDADA) ✅

```
cwa.estado7.com/
  ├── /api/*               (Backend API - Railway)
  └── /public/*            (Modales, assets)

estado7.com/
  ├── /cwa-payment         (WordPress + WooCommerce/MercadoPago)
  └── /cwa-success         (Página post-pago)
```

**Ventajas:**
- ✅ **WordPress + WooCommerce** con plugin MercadoPago oficial
- ✅ Gestión de pagos visual (sin código)
- ✅ Emails automáticos profesionales
- ✅ Logs de transacciones
- ✅ Cupones, descuentos, reportes
- ✅ Separación app técnica vs. marketing
- ✅ SEO mejor en dominio principal
- ✅ Integración con Analytics/Tag Manager existente

**Desventajas:**
- ⚠️ Comunicación cross-domain (SOLUCIONABLE)
- ⚠️ Dos plataformas a mantener

---

## 🏗️ ARQUITECTURA HÍBRIDA DETALLADA

### **1. WordPress en `estado7.com/cwa-payment`**

**Plugin recomendado:** WooCommerce + MercadoPago oficial

**Flujo:**
```
1. Usuario en HubSpot click "Obtener token"
2. Redirige a: https://estado7.com/cwa-payment
3. WordPress muestra producto "Auditoría Completa - 30 días"
4. Usuario paga con MercadoPago
5. WordPress genera token único
6. Redirige a: https://estado7.com/cwa-success?token=abc123
7. Página muestra token y envía email
```

**Configuración WooCommerce:**

```php
// Producto: "Auditoría Completa Cost CRM Risk Scanner"
Precio: $9.99 USD
Tipo: Simple product (no variable)
Stock: Unlimited
Descargas: No (es token digital)

// Al completar pago:
Hook: woocommerce_order_status_completed
Action: Generar token y guardarlo en API de cwa.estado7.com
```

---

### **2. Comunicación WordPress ↔ CWA Backend**

**Endpoint en Railway:**
```
POST https://cwa.estado7.com/api/unlock/create-token
Authorization: Bearer SECRET_ADMIN_TOKEN

Body:
{
  "portalId": "12345",
  "email": "cliente@example.com",
  "orderId": "WC-123",
  "expiresInDays": 30
}

Response:
{
  "token": "abc123xyz",
  "expiresAt": "2026-02-10T00:00:00.000Z"
}
```

**Hook de WordPress:**
```php
// functions.php o plugin custom
add_action('woocommerce_order_status_completed', 'cwa_create_unlock_token', 10, 1);

function cwa_create_unlock_token($order_id) {
    $order = wc_get_order($order_id);
    $portal_id = $order->get_meta('cwa_portal_id');
    $email = $order->get_billing_email();
    
    // Llamar API de CWA
    $response = wp_remote_post('https://cwa.estado7.com/api/unlock/create-token', [
        'headers' => [
            'Authorization' => 'Bearer ' . CWA_ADMIN_SECRET,
            'Content-Type' => 'application/json'
        ],
        'body' => json_encode([
            'portalId' => $portal_id,
            'email' => $email,
            'orderId' => $order_id,
            'expiresInDays' => 30
        ])
    ]);
    
    $data = json_decode(wp_remote_retrieve_body($response), true);
    $token = $data['token'];
    
    // Guardar token en order meta
    $order->update_meta_data('cwa_unlock_token', $token);
    $order->save();
    
    // Enviar email con token
    cwa_send_token_email($email, $token);
}

function cwa_send_token_email($email, $token) {
    $subject = 'Tu token de Auditoría Completa - Cost CRM Risk Scanner';
    $message = "
        <h2>¡Gracias por tu compra!</h2>
        <p>Tu token de desbloqueo es:</p>
        <h3 style='background: #f0f9ff; padding: 15px; border-radius: 8px;'>{$token}</h3>
        <p>Este token es válido por 30 días.</p>
        <p>Para usarlo:</p>
        <ol>
            <li>Ve a tu app Cost CRM Risk Scanner en HubSpot</li>
            <li>Click en 'Desbloquear auditoría completa'</li>
            <li>Ingresa el token</li>
        </ol>
    ";
    
    wp_mail($email, $subject, $message, ['Content-Type: text/html; charset=UTF-8']);
}
```

---

### **3. Página de Checkout WordPress**

**URL:** `https://estado7.com/cwa-payment`

**Campos personalizados:**
```html
<!-- Agregar campo Portal ID antes del checkout -->
<form class="cwa-pre-checkout">
    <label>Portal ID de HubSpot</label>
    <input type="text" name="cwa_portal_id" required 
           placeholder="Ej: 12345678">
    <button type="submit">Continuar a pago</button>
</form>

<!-- JavaScript guarda Portal ID en sesión -->
<script>
sessionStorage.setItem('cwa_portal_id', portalId);
// Se adjunta al crear order en WooCommerce
</script>
```

---

### **4. Página de Éxito**

**URL:** `https://estado7.com/cwa-success?token=abc123&order=WC-123`

```html
<!DOCTYPE html>
<html>
<head>
    <title>Auditoría Completa Desbloqueada</title>
</head>
<body>
    <div class="success-container">
        <h1>✓ ¡Pago Confirmado!</h1>
        <p>Tu token de desbloqueo:</p>
        
        <div class="token-display">
            <code id="token">abc123xyz</code>
            <button onclick="copyToken()">Copiar</button>
        </div>
        
        <h3>Instrucciones:</h3>
        <ol>
            <li>Abre Cost CRM Risk Scanner en HubSpot</li>
            <li>Click "Desbloquear auditoría completa"</li>
            <li>Pega el token</li>
        </ol>
        
        <p>También enviamos el token a tu email: <strong>[email]</strong></p>
        
        <a href="https://app.hubspot.com" class="button">
            Ir a HubSpot →
        </a>
    </div>
</body>
</html>
```

---

## 🔐 SEGURIDAD

### **API Admin Token**
```bash
# En Railway (cwa.estado7.com)
CWA_ADMIN_SECRET=super_secret_token_here

# En WordPress
define('CWA_ADMIN_SECRET', 'super_secret_token_here');
```

### **Validar requests en CWA Backend:**
```javascript
// src/routes/unlock.js
fastify.post("/api/unlock/create-token", async (req, reply) => {
  const adminToken = req.headers.authorization?.replace('Bearer ', '');
  
  if (adminToken !== process.env.CWA_ADMIN_SECRET) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  
  // ... crear token
});
```

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### **WordPress:**
- [ ] Instalar WooCommerce
- [ ] Instalar plugin MercadoPago oficial
- [ ] Crear producto "Auditoría Completa"
- [ ] Agregar campo custom "Portal ID"
- [ ] Implementar hook `woocommerce_order_status_completed`
- [ ] Crear página `/cwa-payment`
- [ ] Crear página `/cwa-success`
- [ ] Configurar emails transaccionales
- [ ] Testing con sandbox MercadoPago

### **CWA Backend (Railway):**
- [ ] Agregar `CWA_ADMIN_SECRET` a env vars
- [ ] Crear endpoint `POST /api/unlock/create-token`
- [ ] Validar admin token
- [ ] Documentar API

### **Frontend (HubSpot):**
- [ ] Link a `https://estado7.com/cwa-payment`
- [ ] Pasar Portal ID en URL o localStorage

---

## 💰 COSTOS

**WordPress en `estado7.com`:**
- Hosting: Ya existente ✓
- WooCommerce: Gratis ✓
- Plugin MercadoPago: Gratis ✓
- Comisión MercadoPago: ~4% por transacción

**Railway (`cwa.estado7.com`):**
- Ya existente ✓

**Total adicional:** $0 (solo comisiones por transacción)

---

## 🚀 PLAN DE ACCIÓN

**FASE 1: Backend API (1-2 horas)**
1. Crear endpoint `/api/unlock/create-token`
2. Agregar validación admin token
3. Testing con Postman

**FASE 2: WordPress (3-4 horas)**
1. Configurar producto WooCommerce
2. Instalar/configurar MercadoPago
3. Implementar hook custom
4. Crear páginas de checkout y success
5. Testing en sandbox

**FASE 3: Integración (1 hora)**
1. Link desde modal HubSpot
2. Testing end-to-end
3. Documentación para usuario

**Total estimado:** 5-7 horas

---

## ✅ VEREDICTO FINAL

**Opción B (Híbrida) es la mejor porque:**
- ✅ Aprovecha infraestructura WordPress existente
- ✅ Plugin MercadoPago oficial (menos bugs)
- ✅ Gestión visual de pagos
- ✅ Emails profesionales automáticos
- ✅ Separación de concerns (app técnica vs. marketing)
- ✅ Escalabilidad futura (agregar más productos fácil)

**Recomendación:** Implementar pasarela en WordPress.

---

## Checkout Pro en `cwa-backend` (Railway)

El backend actual expone Mercado Pago Checkout Pro (`/payment`, preferencia en `/api/payment/create-preference`, webhook en `/api/payment/webhook`).

- **Rechazos y motivos:** en logs del webhook se registran `status`, `status_detail` (por ejemplo `cc_rejected_*`) y `cause` cuando aplica. Consulta [resultados de cobro / rechazos](https://www.mercadopago.com/developers/es/docs/checkout-api/response-handling/collection-results).
- **Depuración:** con `CWA_ADMIN_SECRET`, `GET /api/payment/debug/last-mp-webhook?secret=…` devuelve el último evento MP en memoria (payment id + estado + detalle).
- **Perú / sandbox:** usa tarjetas y medios de prueba del país correcto; ver [tarjetas de prueba](https://www.mercadopago.com.pe/developers/es/docs/checkout-api/integration-test/test-cards) (Perú). Un error genérico en la UI de MP suele deberse a medio o datos de prueba incorrectos para el país.
- **Variables útiles:** `MERCADOPAGO_CURRENCY_ID=PEN` y `MERCADOPAGO_UNIT_PRICE` en soles si el checkout muestra PEN; `MERCADOPAGO_BINARY_MODE=false` si en sandbox necesitas flujos no binarios.

