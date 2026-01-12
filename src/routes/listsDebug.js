import { refreshPortalToken } from "../services/hubspot/refreshToken.service.js";

/**
 * ========================================
 * DEBUG: Diagnosticar por qué no se crean listas
 * ========================================
 */

const listsDebugRoutes = async (fastify, options) => {
  
  /**
   * GET /api/lists/debug/:portalId
   * Prueba simple de creación de lista
   */
  fastify.get("/api/lists/debug/:portalId", async (req, reply) => {
    const { portalId } = req.params;
    
    try {
      // 1. Obtener token
      const token = await refreshPortalToken(fastify, portalId);
      
      if (!token) {
        return reply.send({
          success: false,
          step: 1,
          error: "No se pudo obtener access token"
        });
      }
      
      // 2. Verificar permisos con un GET simple
      const testGetResponse = await fetch(
        `https://api.hubapi.com/crm/v3/lists?count=1`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!testGetResponse.ok) {
        const errorText = await testGetResponse.text();
        return reply.send({
          success: false,
          step: 2,
          error: "Error al verificar permisos",
          statusCode: testGetResponse.status,
          errorText
        });
      }
      
      // 3. Intentar crear lista simple con filtro básico
      const simpleList = {
        name: `[TEST CWA] Lista prueba ${Date.now()}`,
        objectTypeId: '0-1', // Contacts
        processingType: 'SNAPSHOT', // Estática
        filterBranch: {
          filterBranchType: 'OR',
          filterBranchOperator: 'OR',
          filters: [
            {
              filterType: 'PROPERTY',
              property: 'email',
              operation: {
                operationType: 'ALL_PROPERTY',
                operator: 'HAS_PROPERTY'
              }
            }
          ]
        }
      };
      
      const createResponse = await fetch(
        `https://api.hubapi.com/crm/v3/lists/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(simpleList)
        }
      );
      
      const responseText = await createResponse.text();
      let responseJson = null;
      
      try {
        responseJson = JSON.parse(responseText);
      } catch {}
      
      if (!createResponse.ok) {
        return reply.send({
          success: false,
          step: 3,
          error: "Error al crear lista simple",
          statusCode: createResponse.status,
          responseText,
          responseJson,
          requestBody: simpleList
        });
      }
      
      // 4. Intentar crear lista con filtro (como las reales)
      const listWithFilter = {
        name: `[TEST CWA] Lista con filtro ${Date.now()}`,
        objectTypeId: '0-1',
        processingType: 'DYNAMIC',
        filterBranch: {
          filterBranchType: 'OR',
          filterBranchOperator: 'OR',
          filters: [
            {
              filterType: 'PROPERTY',
              property: 'email',
              operation: {
                operationType: 'ALL_PROPERTY',
                operator: 'IS_NOT_SET'
              }
            }
          ]
        }
      };
      
      const createFilterResponse = await fetch(
        `https://api.hubapi.com/crm/v3/lists/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(listWithFilter)
        }
      );
      
      const filterResponseText = await createFilterResponse.text();
      let filterResponseJson = null;
      
      try {
        filterResponseJson = JSON.parse(filterResponseText);
      } catch {}
      
      if (!createFilterResponse.ok) {
        return reply.send({
          success: false,
          step: 4,
          error: "Error al crear lista con filtro",
          statusCode: createFilterResponse.status,
          responseText: filterResponseText,
          responseJson: filterResponseJson,
          requestBody: listWithFilter,
          simpleListCreated: responseJson
        });
      }
      
      return reply.send({
        success: true,
        message: "Ambas listas creadas exitosamente",
        simpleList: responseJson,
        filterList: filterResponseJson
      });
      
    } catch (err) {
      fastify.log.error({ err, portalId }, "Error in debug endpoint");
      return reply.code(500).send({
        success: false,
        error: err.message,
        stack: err.stack
      });
    }
  });
};

export default listsDebugRoutes;

