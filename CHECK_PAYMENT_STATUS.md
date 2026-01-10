# 🔍 DIAGNOSTICAR PROBLEMA DE PAGO

## 1. Verificar estado del sistema

Abrir en navegador:
```
https://cwa.estado7.com/api/payment/debug
```

**Resultado esperado:**
```json
{
  "status": "OK",
  "database": {
    "tableExists": true,
    "tokenCount": 1,
    "recentTokens": [...]
  },
  "mercadoPago": {
    "configured": true,
    "accessToken": "✅ Configured"
  }
}
```

---

## 2. Si `tableExists: false`

**Problema:** La tabla `unlock_tokens` no existe.

**Solución rápida:**

### Opción A: Via Railway CLI
```bash
# Conectar a Railway
railway login
railway link

# Abrir MySQL shell
railway run mysql -h $MYSQLHOST -u root -p$MYSQLPASSWORD $MYSQLDATABASE

# Ejecutar migración
source migrations/002_add_unlock_tokens.sql
```

### Opción B: Via Railway Dashboard
1. Ir a Railway Dashboard → tu proyecto
2. Click en "MySQL" service
3. Tab "Data"
4. Click "Query"
5. Copiar y pegar contenido de `FIX_PAYMENT_TABLE.sql`
6. Ejecutar

### Opción C: Via script directo
```bash
cd cwa-backend
railway run mysql -h $MYSQLHOST -u root -p$MYSQLPASSWORD $MYSQLDATABASE < FIX_PAYMENT_TABLE.sql
```

---

## 3. Verificar token creado manualmente

Si el webhook falló pero el pago está aprobado, crear token manualmente:

```sql
-- Obtener payment_id de los logs de Railway
-- Buscar: "Payment info retrieved" con paymentId

INSERT INTO unlock_tokens (
  portal_id, 
  token, 
  expires_at, 
  payment_reference, 
  status
) VALUES (
  '123456',  -- TU PORTAL ID
  MD5(RAND()),  -- Token aleatorio
  DATE_ADD(NOW(), INTERVAL 30 DAY),  -- Expira en 30 días
  '1325843146',  -- payment_id de MercadoPago
  'active'
);

-- Ver token creado
SELECT * FROM unlock_tokens WHERE portal_id = '123456';
```

---

## 4. Ver logs detallados

```bash
# Ver todos los logs
railway logs

# Filtrar solo payment
railway logs --filter payment

# Ver solo errores
railway logs --filter ERROR
```

**Buscar estas líneas:**
- `✅ Unlock token created from payment` - Token creado OK
- `❌ Error processing webhook` - Error en webhook
- `unlock_tokens table doesn't exist` - Tabla no existe

---

## 5. Testing después del fix

1. Ir a: `https://cwa.estado7.com/api/payment/debug`
2. Verificar `tableExists: true`
3. Hacer un nuevo pago de prueba
4. Verificar que aparece en `/payment/success`

---

## 6. Crear token manualmente para tu pago actual

Si ya pagaste y necesitas el token YA:

```sql
-- Reemplaza con tus datos
INSERT INTO unlock_tokens (
  portal_id, 
  token, 
  expires_at, 
  payment_reference, 
  status
) VALUES (
  '49738070',  -- TU PORTAL ID real
  LOWER(HEX(RANDOM_BYTES(16))),  -- Token aleatorio seguro
  DATE_ADD(NOW(), INTERVAL 30 DAY),
  '1325843146',  -- El payment_id de MercadoPago (de los logs)
  'active'
);

-- Obtener el token creado
SELECT token, expires_at 
FROM unlock_tokens 
WHERE portal_id = '49738070' 
ORDER BY created_at DESC 
LIMIT 1;
```

Copia el `token` y úsalo en HubSpot.

---

## 7. Prevenir problema en futuro

**Después de arreglar:**

1. ✅ Ejecutar migración 002
2. ✅ Verificar con `/api/payment/debug`
3. ✅ Hacer nuevo pago de prueba completo
4. ✅ Verificar que webhook funciona correctamente

---

## 🆘 SOLUCIÓN INMEDIATA PARA TI

**Dado que ya pagaste ($9.99 USD):**

1. Ir a: `https://cwa.estado7.com/api/payment/debug`
2. Si dice `tableExists: false`:
   - Ejecutar `FIX_PAYMENT_TABLE.sql` en Railway
3. Luego, en Railway MySQL:
   ```sql
   INSERT INTO unlock_tokens (portal_id, token, expires_at, status) 
   VALUES ('49738070', LOWER(HEX(RANDOM_BYTES(16))), DATE_ADD(NOW(), INTERVAL 30 DAY), 'active');
   
   SELECT token FROM unlock_tokens WHERE portal_id = '49738070' ORDER BY created_at DESC LIMIT 1;
   ```
4. Copiar el token y usar en HubSpot
5. Hacer un nuevo pago de prueba para verificar que el flujo funciona

**Railway redesplegará automáticamente** con el código mejorado cuando detecte el push a GitHub.

