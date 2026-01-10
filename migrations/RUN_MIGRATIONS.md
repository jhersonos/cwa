# Cómo ejecutar las migraciones

## Opción 1: Desde MySQL Workbench o cliente MySQL

1. Conectar a tu base de datos MySQL
2. Seleccionar la base de datos de CWA:
   ```sql
   USE tu_database_name;
   ```

3. Ejecutar las migraciones en orden:
   ```sql
   -- Ejecutar primero
   SOURCE /ruta/a/cwa-backend/migrations/001_add_new_metrics.sql;
   
   -- Ejecutar después
   SOURCE /ruta/a/cwa-backend/migrations/002_add_unlock_tokens.sql;
   ```

## Opción 2: Desde línea de comandos

```bash
cd cwa-backend/migrations

# Migración 001
mysql -u tu_usuario -p tu_database < 001_add_new_metrics.sql

# Migración 002
mysql -u tu_usuario -p tu_database < 002_add_unlock_tokens.sql
```

## Opción 3: Copiar y pegar (más fácil)

1. Abrir `001_add_new_metrics.sql`
2. Copiar todo el contenido
3. Pegarlo en tu cliente MySQL
4. Ejecutar

Repetir con `002_add_unlock_tokens.sql`

## Verificar que las migraciones se ejecutaron

```sql
-- Ver todas las tablas
SHOW TABLES;

-- Verificar estructura de scan_history
DESCRIBE scan_history;

-- Verificar que unlock_tokens existe
DESCRIBE unlock_tokens;

-- Verificar que unlock_downloads existe
DESCRIBE unlock_downloads;
```

## IMPORTANTE

⚠️ **La tabla `unlock_tokens` es OPCIONAL**

Si no ejecutas la migración 002, la app seguirá funcionando normalmente.
Solo el sistema de desbloqueo no estará disponible.

El backend detecta automáticamente si la tabla existe y no bloquea la app si falta.

