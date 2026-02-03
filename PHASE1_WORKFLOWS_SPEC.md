# 📋 FASE 1: Workflows Analysis - Especificación Técnica

## 🎯 Objetivo

Implementar el análisis de Workflows de Marketing Hub como primer módulo del Marketing Analyzer.

**Por qué empezar con Workflows:**
- ✅ Ya tienes el scope `automation` configurado
- ✅ API simple y bien documentada
- ✅ Alto impacto (workflows son críticos en marketing)
- ✅ No requiere scopes adicionales

---

## 📊 Métricas a Analizar

### 1. **Workflows Activos vs. Inactivos**
```javascript
{
  total: 25,
  activos: 18,
  inactivos: 7,
  porcentajeActivo: 72
}
```

### 2. **Workflows sin Enrollments (No se usan)**
```javascript
{
  workflowsSinUso: [
    {
      id: 12345,
      name: "Nurturing Campaign Q3 2024",
      lastUpdated: "2024-09-15",
      enrollments: 0,
      daysSinceUpdate: 120
    }
  ],
  totalSinUso: 7,
  costoEstimado: "$35/mes desperdiciado" // $5 por workflow inactivo
}
```

### 3. **Workflows con Errores**
```javascript
{
  workflowsConErrores: [
    {
      id: 67890,
      name: "Lead Assignment Automation",
      errorType: "INVALID_ACTION",
      errorMessage: "Email template deleted",
      lastError: "2026-01-10"
    }
  ],
  totalConErrores: 2
}
```

### 4. **Workflows Obsoletos (Sin actualizar en 180+ días)**
```javascript
{
  workflowsObsoletos: [
    {
      id: 11111,
      name: "Webinar Follow-up 2024",
      lastUpdated: "2024-06-01",
      daysSinceUpdate: 224
    }
  ],
  totalObsoletos: 5
}
```

### 5. **Workflows Sin Objetivos (Goals)**
```javascript
{
  workflowsSinGoals: [
    {
      id: 22222,
      name: "Newsletter Subscription",
      enrollments: 450,
      hasGoal: false
    }
  ],
  totalSinGoals: 12
}
```

---

## 🔌 API de HubSpot

### Endpoint Principal:

```javascript
GET https://api.hubapi.com/automation/v4/flows
```

### Headers:
```javascript
{
  "Authorization": "Bearer {access_token}",
  "Content-Type": "application/json"
}
```

### Response Example:
```json
{
  "workflows": [
    {
      "id": 12345,
      "name": "Lead Nurturing Campaign",
      "type": "CONTACT_WORKFLOW",
      "enabled": true,
      "insertedAt": 1640995200000,
      "updatedAt": 1704067200000,
      "enrollmentCounts": {
        "active": 150,
        "completed": 1200,
        "total": 1350
      },
      "goalCriteria": {
        "isEnabled": false
      },
      "lastExecutedAt": 1704067200000,
      "hasErrors": false
    }
  ]
}
```

### Rate Limit:
- 100 requests por 10 segundos
- Usar paginación si hay > 100 workflows

---

## 🏗️ Implementación Backend

### Archivo: `cwa-backend/src/services/marketing/workflows.analysis.js`

```javascript
import axios from 'axios';
import { refreshPortalToken } from '../hubspot/refreshToken.service.js';

/**
 * Analiza workflows de Marketing Hub
 * @param {number} portalId - ID del portal de HubSpot
 * @param {object} fastify - Instancia de Fastify (para DB)
 * @returns {object} Análisis completo de workflows
 */
export async function analyzeWorkflows(portalId, fastify) {
  try {
    // 1. Obtener token actualizado
    const accessToken = await refreshPortalToken(portalId, fastify);

    // 2. Fetch workflows desde HubSpot
    const workflows = await fetchAllWorkflows(accessToken);

    // 3. Analizar workflows
    const analysis = {
      overview: calculateOverview(workflows),
      sinUso: detectWorkflowsSinUso(workflows),
      conErrores: detectWorkflowsConErrores(workflows),
      obsoletos: detectWorkflowsObsoletos(workflows),
      sinGoals: detectWorkflowsSinGoals(workflows),
      score: calculateWorkflowsScore(workflows)
    };

    return analysis;

  } catch (error) {
    console.error('Error analizando workflows:', error);
    throw error;
  }
}

/**
 * Fetch todos los workflows (con paginación)
 */
async function fetchAllWorkflows(accessToken) {
  const allWorkflows = [];
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const response = await axios.get(
      'https://api.hubapi.com/automation/v4/flows',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 100,
          offset: offset
        }
      }
    );

    allWorkflows.push(...response.data.workflows);

    hasMore = response.data.workflows.length === 100;
    offset += 100;

    // Límite de seguridad: máximo 500 workflows
    if (offset >= 500) break;
  }

  return allWorkflows;
}

/**
 * Calcula overview general
 */
function calculateOverview(workflows) {
  const total = workflows.length;
  const activos = workflows.filter(w => w.enabled).length;
  const inactivos = total - activos;

  return {
    total,
    activos,
    inactivos,
    porcentajeActivo: Math.round((activos / total) * 100)
  };
}

/**
 * Detecta workflows sin enrollments (no se usan)
 */
function detectWorkflowsSinUso(workflows) {
  const threshold = 90; // días sin uso
  const now = Date.now();

  const sinUso = workflows.filter(w => {
    const enrollmentTotal = w.enrollmentCounts?.total || 0;
    const lastExecuted = w.lastExecutedAt || w.updatedAt;
    const daysSinceUse = Math.floor((now - lastExecuted) / (1000 * 60 * 60 * 24));

    return enrollmentTotal === 0 || daysSinceUse > threshold;
  }).map(w => ({
    id: w.id,
    name: w.name,
    enabled: w.enabled,
    enrollments: w.enrollmentCounts?.total || 0,
    lastExecuted: w.lastExecutedAt,
    daysSinceUse: Math.floor((now - (w.lastExecutedAt || w.updatedAt)) / (1000 * 60 * 60 * 24))
  }));

  return {
    workflows: sinUso,
    total: sinUso.length,
    costoEstimado: sinUso.length * 5 // $5 por workflow sin uso
  };
}

/**
 * Detecta workflows con errores
 */
function detectWorkflowsConErrores(workflows) {
  const conErrores = workflows.filter(w => w.hasErrors === true);

  return {
    workflows: conErrores.map(w => ({
      id: w.id,
      name: w.name,
      enabled: w.enabled,
      errorType: w.errorType || 'UNKNOWN',
      lastError: w.lastExecutedAt
    })),
    total: conErrores.length
  };
}

/**
 * Detecta workflows obsoletos (sin actualizar en 180+ días)
 */
function detectWorkflowsObsoletos(workflows) {
  const threshold = 180; // días
  const now = Date.now();

  const obsoletos = workflows.filter(w => {
    const daysSinceUpdate = Math.floor((now - w.updatedAt) / (1000 * 60 * 60 * 24));
    return daysSinceUpdate > threshold && w.enabled === true;
  }).map(w => ({
    id: w.id,
    name: w.name,
    lastUpdated: new Date(w.updatedAt).toISOString().split('T')[0],
    daysSinceUpdate: Math.floor((now - w.updatedAt) / (1000 * 60 * 60 * 24))
  }));

  return {
    workflows: obsoletos,
    total: obsoletos.length
  };
}

/**
 * Detecta workflows sin objetivos configurados
 */
function detectWorkflowsSinGoals(workflows) {
  const sinGoals = workflows.filter(w => {
    return w.enabled && !w.goalCriteria?.isEnabled;
  }).map(w => ({
    id: w.id,
    name: w.name,
    enrollments: w.enrollmentCounts?.total || 0
  }));

  return {
    workflows: sinGoals,
    total: sinGoals.length
  };
}

/**
 * Calcula score de salud de workflows (0-100)
 */
function calculateWorkflowsScore(workflows) {
  let score = 100;
  const total = workflows.length;

  if (total === 0) return 0;

  // Penalizaciones
  const activos = workflows.filter(w => w.enabled).length;
  const percentageInactive = ((total - activos) / total) * 100;
  score -= percentageInactive * 0.3; // -30% por workflows inactivos

  const sinUso = detectWorkflowsSinUso(workflows);
  score -= Math.min(sinUso.total * 5, 15); // -5 pts por cada uno (max -15)

  const conErrores = detectWorkflowsConErrores(workflows);
  score -= Math.min(conErrores.total * 10, 30); // -10 pts por cada uno (max -30)

  const obsoletos = detectWorkflowsObsoletos(workflows);
  score -= Math.min(obsoletos.total * 3, 15); // -3 pts por cada uno (max -15)

  const sinGoals = detectWorkflowsSinGoals(workflows);
  score -= Math.min(sinGoals.total * 2, 10); // -2 pts por cada uno (max -10)

  return Math.max(Math.round(score), 0);
}
```

---

## 🛣️ Ruta Backend

### Archivo: `cwa-backend/src/routes/marketing.js`

```javascript
import { analyzeWorkflows } from '../services/marketing/workflows.analysis.js';

export default async function marketingRoutes(fastify, options) {
  
  /**
   * GET /api/marketing/workflows/:portalId
   * Analiza workflows de un portal
   */
  fastify.get('/workflows/:portalId', async (request, reply) => {
    try {
      const { portalId } = request.params;

      console.log(`🔍 Analizando workflows para portal ${portalId}...`);

      const analysis = await analyzeWorkflows(parseInt(portalId), fastify);

      return reply.code(200).send({
        success: true,
        portalId: parseInt(portalId),
        timestamp: new Date().toISOString(),
        data: analysis
      });

    } catch (error) {
      console.error('❌ Error en /api/marketing/workflows:', error);
      
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Error al analizar workflows'
      });
    }
  });

}
```

### Registrar en `app.js`:

```javascript
import marketingRoutes from './routes/marketing.js';

// ... después de otros routes
await app.register(marketingRoutes, { prefix: '/api/marketing' });
```

---

## 🎨 Frontend - Tab Marketing Audit

### Modificar: `Cost Waste Analyzer/src/app/settings/SettingsPage.tsx`

```typescript
import { useState, useEffect } from 'react';
import { hubspot } from '@hubspot/ui-extensions';
import {
  Flex,
  Tabs,
  Tab,
  Text,
  LoadingSpinner,
  Alert
} from '@hubspot/ui-extensions/components';

// Importar componentes
import WorkflowsCard from './components/WorkflowsCard';

hubspot.extend(({ context, actions }) => (
  <Extension context={context} actions={actions} />
));

const Extension = ({ context, actions }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [workflowsData, setWorkflowsData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch workflows data cuando se activa el tab
  useEffect(() => {
    if (activeTab === 1) { // Tab "Marketing Audit"
      fetchWorkflowsData();
    }
  }, [activeTab]);

  const fetchWorkflowsData = async () => {
    setLoading(true);
    try {
      const response = await hubspot.fetch(
        `https://cwa.estado7.com/api/marketing/workflows/${context.portal.id}`
      );
      const result = await response.json();
      setWorkflowsData(result.data);
    } catch (error) {
      console.error('Error fetching workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex direction="column" gap="md">
      <Tabs onChange={(index) => setActiveTab(index)}>
        
        {/* Tab 1: CRM Audit (actual) */}
        <Tab title="CRM Audit">
          {/* ... código actual ... */}
        </Tab>

        {/* Tab 2: Marketing Audit (NUEVO) */}
        <Tab title="Marketing Audit">
          <Flex direction="column" gap="md">
            
            {loading && (
              <Flex direction="row" align="center" justify="center">
                <LoadingSpinner />
                <Text>Analizando workflows...</Text>
              </Flex>
            )}

            {!loading && workflowsData && (
              <>
                <WorkflowsCard data={workflowsData} actions={actions} />
                
                {/* Más cards en fases futuras */}
                <Alert variant="info">
                  <Text>
                    📊 Más análisis de Marketing Hub próximamente: Emails, Formularios, Lead Scoring
                  </Text>
                </Alert>
              </>
            )}

          </Flex>
        </Tab>

        {/* Tab 3: Desbloquear (actual) */}
        <Tab title="Desbloquear">
          {/* ... código actual ... */}
        </Tab>

      </Tabs>
    </Flex>
  );
};
```

---

## 🧩 Componente WorkflowsCard

### Archivo: `Cost Waste Analyzer/src/app/settings/components/WorkflowsCard.tsx`

```typescript
import {
  Flex,
  Text,
  Card,
  Divider,
  StatisticsItem,
  Button,
  Alert,
  ProgressBar
} from '@hubspot/ui-extensions/components';

const WorkflowsCard = ({ data, actions }) => {
  const { overview, sinUso, conErrores, obsoletos, sinGoals, score } = data;

  // Determinar color del score
  const getScoreVariant = (score) => {
    if (score >= 86) return 'success';
    if (score >= 66) return 'warning';
    return 'error';
  };

  return (
    <Card>
      <Flex direction="column" gap="md">
        
        {/* Header con Score */}
        <Flex direction="row" align="center" justify="between">
          <Text format={{ fontWeight: "bold", fontSize: "large" }}>
            ⚙️ Workflows de Marketing
          </Text>
          <Flex direction="column" align="end">
            <Text format={{ fontWeight: "bold", fontSize: "xlarge" }}>
              {score}/100
            </Text>
            <ProgressBar 
              value={score} 
              max={100}
              variant={getScoreVariant(score)}
            />
          </Flex>
        </Flex>

        <Divider />

        {/* Overview */}
        <Flex direction="row" gap="md" wrap="wrap">
          <StatisticsItem label="Total" value={overview.total} />
          <StatisticsItem label="Activos" value={overview.activos} />
          <StatisticsItem label="Inactivos" value={overview.inactivos} />
          <StatisticsItem 
            label="% Activo" 
            value={`${overview.porcentajeActivo}%`} 
          />
        </Flex>

        <Divider />

        {/* Problemas Detectados */}
        <Text format={{ fontWeight: "bold" }}>
          🚨 Problemas Detectados:
        </Text>

        {sinUso.total > 0 && (
          <Alert variant="warning">
            <Flex direction="column" gap="xs">
              <Text format={{ fontWeight: "bold" }}>
                {sinUso.total} workflows sin uso
              </Text>
              <Text>
                Estos workflows no tienen enrollments o no se han ejecutado en 90+ días.
                Costo estimado desperdiciado: ${sinUso.costoEstimado}/mes
              </Text>
              <Button 
                size="xs"
                onClick={() => actions.openLink('https://app.hubspot.com/workflows')}
              >
                Ver en HubSpot
              </Button>
            </Flex>
          </Alert>
        )}

        {conErrores.total > 0 && (
          <Alert variant="error">
            <Flex direction="column" gap="xs">
              <Text format={{ fontWeight: "bold" }}>
                {conErrores.total} workflows con errores
              </Text>
              <Text>
                Estos workflows están fallando y requieren atención inmediata.
              </Text>
            </Flex>
          </Alert>
        )}

        {obsoletos.total > 0 && (
          <Alert variant="info">
            <Flex direction="column" gap="xs">
              <Text format={{ fontWeight: "bold" }}>
                {obsoletos.total} workflows obsoletos
              </Text>
              <Text>
                No se han actualizado en 180+ días. Revisa si siguen siendo relevantes.
              </Text>
            </Flex>
          </Alert>
        )}

        {sinGoals.total > 0 && (
          <Alert variant="info">
            <Flex direction="column" gap="xs">
              <Text format={{ fontWeight: "bold" }}>
                {sinGoals.total} workflows sin objetivos
              </Text>
              <Text>
                Configura goals para medir la efectividad de tus workflows.
              </Text>
            </Flex>
          </Alert>
        )}

        {/* Todo perfecto */}
        {sinUso.total === 0 && conErrores.total === 0 && obsoletos.total === 0 && (
          <Alert variant="success">
            <Text format={{ fontWeight: "bold" }}>
              ✅ ¡Workflows en buen estado!
            </Text>
            <Text>No se detectaron problemas críticos.</Text>
          </Alert>
        )}

      </Flex>
    </Card>
  );
};

export default WorkflowsCard;
```

---

## ✅ Testing Plan

### 1. **Testing Backend (Local)**

```bash
# 1. Crear test.js
node test-workflows.js

# Script de test:
import { analyzeWorkflows } from './src/services/marketing/workflows.analysis.js';

const portalId = 50636461; // Tu portal de prueba

analyzeWorkflows(portalId, fastify)
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

### 2. **Testing API (Railway)**

```bash
curl https://cwa.estado7.com/api/marketing/workflows/50636461
```

### 3. **Testing Frontend (HubSpot)**

- Subir con `hs project upload`
- Abrir Settings de la app
- Click en tab "Marketing Audit"
- Verificar que se muestre WorkflowsCard

---

## 📊 Casos de Prueba

### Caso 1: Portal sin workflows
- **Expected:** Score = 0, mensaje "No se encontraron workflows"

### Caso 2: Portal con todos workflows activos y sanos
- **Expected:** Score = 95-100, mensaje "✅ Workflows en buen estado"

### Caso 3: Portal con workflows inactivos
- **Expected:** Score < 70, alerta de workflows sin uso

### Caso 4: Portal con workflows con errores
- **Expected:** Score < 60, alerta roja de workflows con errores

---

## 🚀 Deployment Checklist

- [ ] Backend: Crear archivo `workflows.analysis.js`
- [ ] Backend: Crear ruta `marketing.js`
- [ ] Backend: Registrar ruta en `app.js`
- [ ] Backend: Push a GitHub (auto-deploy Railway)
- [ ] Frontend: Agregar tab "Marketing Audit" en `SettingsPage.tsx`
- [ ] Frontend: Crear componente `WorkflowsCard.tsx`
- [ ] Frontend: `hs project upload`
- [ ] Testing: Probar en portal de desarrollo
- [ ] Testing: Probar en portal de producción
- [ ] Docs: Actualizar README con nueva funcionalidad

---

## 🎯 Definition of Done

La Fase 1 está completa cuando:

✅ Backend responde correctamente en `/api/marketing/workflows/:portalId`
✅ Frontend muestra tab "Marketing Audit" con WorkflowsCard
✅ Score de workflows se calcula correctamente (0-100)
✅ Alertas se muestran según problemas detectados
✅ Link "Ver en HubSpot" abre workflows en nueva pestaña
✅ Loading states funcionan correctamente
✅ Error handling implementado
✅ Testing en al menos 3 portales diferentes

---

**Tiempo estimado:** 5-7 días
**Prioridad:** 🔴 Alta
**Status:** 🟡 Listo para implementar

---

**Próxima Fase:** FASE 2 - Forms + Lists Analysis

