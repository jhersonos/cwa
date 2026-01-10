# Migraciones de Base de Datos

## 📋 Cómo Aplicar las Migraciones

### Opción 1: Usando MySQL CLI

```bash
# Conectarse a MySQL
mysql -u tu_usuario -p tu_base_de_datos

# Ejecutar la migración
source migrations/001_add_new_metrics.sql;

# Verificar que las columnas se crearon
DESCRIBE scan_history;
```

### Opción 2: Usando MySQL Workbench

1. Abre MySQL Workbench
2. Conecta a tu base de datos
3. Abre el archivo `001_add_new_metrics.sql`
4. Ejecuta el script completo (Ctrl+Shift+Enter)

### Opción 3: Usando comando directo

```bash
mysql -u tu_usuario -p tu_base_de_datos < migrations/001_add_new_metrics.sql
```

## ⚠️ Importante

- **Haz un backup de tu base de datos antes de ejecutar la migración**
- Las nuevas columnas tienen valores por defecto (0 o 100), por lo que no afectarán los registros existentes
- La migración es **retrocompatible** - los scans antiguos seguirán funcionando

## 🔍 Verificación

Después de ejecutar la migración, verifica que las columnas se crearon:

```sql
SHOW COLUMNS FROM scan_history;
```

Deberías ver las nuevas columnas:
- `deals_total`
- `deals_without_contact`
- `deals_without_owner`
- `deals_without_price`
- `deals_inactive`
- `companies_total`
- `companies_without_domain`
- `companies_without_owner`
- `companies_inactive`
- `tools_in_use`
- `tools_total`
- `tools_usage_percentage`
- `contacts_score`
- `deals_score`
- `companies_score`
- `users_score`

## 📊 Estructura Completa de scan_history

Después de la migración, tu tabla tendrá:

### Columnas Originales
- `id` (PK, AUTO_INCREMENT)
- `portal_id`
- `efficiency_score`
- `efficiency_level`
- `has_limited_visibility`
- `contacts_total`
- `users_total`
- `workflows_total` (deprecated en V3)
- `critical_insights`
- `warning_insights`
- `created_at`

### Columnas Nuevas (V3)
- **Deals**: total, sin contacto, sin owner, sin precio, inactivos
- **Companies**: total, sin dominio, sin owner, inactivos
- **Tools**: en uso, total, porcentaje de uso
- **Scores**: por objeto (contacts, deals, companies, users)

## 🚀 Después de la Migración

1. Reinicia tu backend
2. Ejecuta un scan nuevo
3. Los nuevos datos se guardarán automáticamente en el historial
4. Los scans antiguos seguirán siendo visibles con sus datos originales

