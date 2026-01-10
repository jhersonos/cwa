# 🚀 CHECKLIST FINAL - Deployment Pasarela MercadoPago

## ✅ COMPLETADO

- [x] Páginas HTML de checkout y éxito
- [x] Backend: Rutas de pago (create-preference, webhook, token-info)
- [x] Integración SDK MercadoPago
- [x] Frontend: Link actualizado con portalId
- [x] Documentación completa (MERCADOPAGO_SETUP.md)
- [x] Git commit y push

---

## 📋 PASOS PENDIENTES (Usuario)

### 1. **Actualizar variables de entorno en Railway**

```bash
# Ir a Railway Dashboard → cwa project → Variables
# Agregar:

MERCADOPAGO_ACCESS_TOKEN=TEST-1234567890-...  # Sandbox primero
BASE_URL=https://cwa.estado7.com
CWA_ADMIN_SECRET=tu_secreto_seguro_aqui
```

**Cómo obtener MERCADOPAGO_ACCESS_TOKEN:**
1. Ir a: https://www.mercadopago.com/developers
2. Login o crear cuenta
3. "Tus aplicaciones" → "Crear aplicación"
4. Nombre: "Cost CRM Risk Scanner"
5. Copiar "Access Token" (primero TEST para sandbox)

---

### 2. **Reiniciar backend (automático en Railway)**

Railway detectará las nuevas variables y reiniciará automáticamente.

**Para testing local:**
```bash
cd C:\proyectos\cwa\cwa-backend
pnpm start
```

---

### 3. **Configurar Webhook en MercadoPago**

1. Ir a tu aplicación en: https://www.mercadopago.com/developers
2. Click en tu aplicación "Cost CRM Risk Scanner"
3. Ir a "Webhooks" o "Notificaciones"
4. Agregar URL: `https://cwa.estado7.com/api/payment/webhook`
5. Seleccionar eventos: **Payments** (Pagos)
6. Guardar

---

### 4. **Testing con Sandbox (Tarjetas de prueba)**

**Abrir:** https://cwa.estado7.com/payment?portalId=123456

**Ingresar:**
- Portal ID: 123456 (o tu Portal ID real)
- Email: test@ejemplo.com

**Usar tarjeta APROBADA:**
```
Número: 5031 7557 3453 0604
CVV: 123
Fecha: 11/25
Nombre: APRO
```

**Flujo esperado:**
1. Click "Continuar a MercadoPago" → Redirige a checkout MercadoPago
2. Completar pago → Redirige a `/payment/success`
3. Ver token generado → Copiar
4. Ir a HubSpot → Abrir Cost CRM Risk Scanner
5. Click "Desbloquear auditoría completa" → Pegar token
6. Click "Validar token" → Debe aparecer "Desbloqueado hasta..."

---

### 5. **Verificar logs en Railway**

```bash
# Ver logs en tiempo real
railway logs

# Buscar estas líneas después de hacer un pago:
# "Payment preference created"
# "Received payment webhook"
# "Payment info retrieved"
# "Unlock token created from payment"
```

---

### 6. **Verificar en base de datos**

```sql
-- Ver tokens creados
SELECT * FROM unlock_tokens ORDER BY created_at DESC LIMIT 5;

-- Ver descargas (después de usar el token)
SELECT * FROM unlock_downloads ORDER BY downloaded_at DESC LIMIT 5;
```

---

### 7. **Desplegar frontend actualizado**

```bash
cd "C:\proyectos\cwa\Cost Waste Analyzer"
hs project upload
```

Verificar que se despliega correctamente en HubSpot.

---

### 8. **Cambiar a Producción (cuando esté listo)**

**En Railway:**
```bash
# Cambiar variable:
MERCADOPAGO_ACCESS_TOKEN=APP-1234567890-...  # Producción
```

**En MercadoPago:**
- Cambiar webhook URL (si es diferente)
- Verificar que está en modo producción

**Testing con tarjeta real:**
1. Hacer un pago de $9.99 USD con tu tarjeta
2. Verificar que todo funciona
3. **IMPORTANTE:** Si funciona, ¡puedes hacer refund del pago de prueba!

---

## 🐛 TROUBLESHOOTING

### Problema: "MERCADOPAGO_ACCESS_TOKEN not defined"

**Solución:**
- Verificar que agregaste la variable en Railway
- Railway debe reiniciar automáticamente
- Si no reinicia: Click "Redeploy"

### Problema: Webhook no se ejecuta

**Solución:**
1. Verificar URL en MercadoPago: `https://cwa.estado7.com/api/payment/webhook`
2. Ver logs de Railway: `railway logs --filter webhook`
3. Verificar que Railway está en running state

### Problema: Token no aparece en /payment/success

**Solución:**
1. Esperar 5-10 segundos (webhook puede tardar)
2. Recargar página
3. Verificar logs: "Unlock token created from payment"
4. Verificar en DB: `SELECT * FROM unlock_tokens WHERE payment_reference = '123...';`

### Problema: "Table unlock_tokens doesn't exist"

**Solución:**
Ejecutar migración:
```bash
mysql -h railway_host -u root -p railway_db < migrations/002_add_unlock_tokens.sql
```

---

## 📊 MÉTRICAS A MONITOREAR

**Primera semana:**
- Checkouts iniciados (preferencias creadas)
- Pagos completados (tokens generados)
- Tokens validados en HubSpot
- Descargas de reportes
- Tasa de conversión (pagos / checkouts)

**SQL útil:**
```sql
-- Pagos hoy
SELECT COUNT(*) as pagos_hoy, COUNT(*) * 9.99 as revenue_usd
FROM unlock_tokens
WHERE DATE(created_at) = CURDATE();

-- Tokens activos ahora
SELECT COUNT(*) as tokens_activos
FROM unlock_tokens
WHERE status = 'active' AND expires_at > NOW();

-- Top portales por descargas
SELECT portal_id, COUNT(*) as descargas
FROM unlock_downloads
GROUP BY portal_id
ORDER BY descargas DESC
LIMIT 10;
```

---

## 🎯 PRÓXIMOS PASOS (Futuro)

- [ ] Implementar envío de emails con SendGrid
- [ ] Dashboard de analytics de pagos
- [ ] Cupones de descuento
- [ ] Planes por volumen (50 días, 90 días, etc.)
- [ ] Webhook signature validation
- [ ] Refund API endpoint

---

## 📞 SOPORTE

**Si algo falla:**
1. Ver logs de Railway
2. Ver logs de MercadoPago (en tu dashboard)
3. Verificar variables de entorno
4. Verificar que migración 002 está aplicada

**Archivos importantes:**
- `MERCADOPAGO_SETUP.md` - Guía completa
- `migrations/002_add_unlock_tokens.sql` - Schema DB
- `src/routes/payment.js` - Lógica de pago
- `public/payment-checkout.html` - Página checkout
- `public/payment-success.html` - Página éxito

---

¡Todo listo para empezar a recibir pagos! 🎉

