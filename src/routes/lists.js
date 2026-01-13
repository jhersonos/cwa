import { refreshPortalToken } from "../services/hubspot/refreshToken.service.js";

/**
 * ========================================
 * ROUTES: Crear listas activas en HubSpot
 * ========================================
 */

const listsRoutes = async (fastify, options) => {
  
  /**
   * POST /api/lists/create
   * Crea listas activas en HubSpot basadas en los problemas detectados
   */
  fastify.post("/api/lists/create", async (req, reply) => {
    try {
      // Workaround: Re-parsear body si llegó como string (HubSpot fetch sin Content-Type)
      let parsedBody = req.body;
      if (typeof req.body === 'string') {
        try {
          parsedBody = JSON.parse(req.body);
        } catch (e) {
          fastify.log.warn('Failed to parse body as JSON', e);
        }
      }
      
      const { portalId, listIds } = parsedBody;
      
      fastify.log.info({ portalId, listIds, bodyType: typeof req.body, parsedBodyType: typeof parsedBody }, 'POST /api/lists/create');
      
      if (!portalId || !listIds || !Array.isArray(listIds) || listIds.length === 0) {
        return reply.code(400).send({
          error: "Se requiere portalId y listIds (array no vacío)",
          debug: {
            receivedPortalId: portalId,
            receivedListIds: listIds,
            bodyType: typeof req.body,
            rawBody: typeof req.body === 'string' ? req.body.substring(0, 200) : 'not string'
          }
        });
      }
      
      // Obtener access token
      const token = await refreshPortalToken(fastify, portalId);
      if (!token) {
        throw new Error("No se pudo obtener access token para este portal");
      }
      
      const results = [];
      let created = 0;
      let failed = 0;
      
      // Definición de listas disponibles
      const listDefinitions = {
        // ===== CONTACTOS =====
        'contacts-without-email': {
          name: '[CWA] Contactos sin email',
          objectTypeId: '0-1', // contacts
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [
              {
                filterBranchType: 'AND',
                filterBranchOperator: 'AND',
                filters: [
                  {
                    filterType: 'PROPERTY',
                    property: 'email',
                    operation: {
                      operationType: 'ALL_PROPERTY',
                      operator: 'IS_UNKNOWN'
                    }
                  }
                ]
              }
            ]
          }
        },
        'contacts-without-phone': {
          name: '[CWA] Contactos sin teléfono',
          objectTypeId: '0-1',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              filters: [{
                filterType: 'PROPERTY',
                property: 'phone',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_UNKNOWN'
                }
              }]
            }]
          }
        },
        'contacts-without-owner': {
          name: '[CWA] Contactos sin owner',
          objectTypeId: '0-1',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              filters: [{
                filterType: 'PROPERTY',
                property: 'hubspot_owner_id',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_UNKNOWN'
                }
              }]
            }]
          }
        },
        'contacts-inactive-180': {
        name: '[CWA] Contactos inactivos +180 días',
        objectTypeId: '0-1',
        filterBranch: {
          filterBranchType: 'AND',
          filterBranchOperator: 'AND',
          filters: [
            {
              filterType: 'PROPERTY',
              property: 'hs_lastactivitydate',
              operation: {
                operationType: 'RANGE_COMPARISON',
                operator: 'IS_BEFORE_DATE',
                numberOfDays: 180,
                timeUnitType: 'DAY',
                includeObjectsWithNoValueSet: false // ✅ CLAVE
              }
            }
          ]
        }
      },
        'contacts-created-90-no-activity': {
        name: '[CWA] Contactos creados +90d sin actividad',
        objectTypeId: '0-1',
        filterBranch: {
          filterBranchType: 'AND',
          filterBranchOperator: 'AND',
          filters: [
            {
              filterType: 'PROPERTY',
              property: 'createdate',
              operation: {
                operationType: 'RANGE_COMPARISON',
                operator: 'IS_BEFORE_DATE',
                numberOfDays: 90,
                timeUnitType: 'DAY',
                includeObjectsWithNoValueSet: false
              }
            },
            {
              filterType: 'PROPERTY',
              property: 'hs_lastactivitydate',
              operation: {
                operationType: 'RANGE_COMPARISON',
                operator: 'IS_UNKNOWN'
              }
            }
          ]
        }
      },
        'contacts-high-risk': {
          name: '[CWA] Contactos de alto riesgo',
          objectTypeId: '0-1',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              filters: [
                {
                  filterType: 'PROPERTY',
                  property: 'email',
                  operation: {
                    operationType: 'ALL_PROPERTY',
                    operator: 'IS_UNKNOWN'
                  }
                },
                {
                  filterType: 'PROPERTY',
                  property: 'hubspot_owner_id',
                  operation: {
                    operationType: 'ALL_PROPERTY',
                    operator: 'IS_UNKNOWN'
                  }
                }
              ]
            }]
          }
        },
        
        // ===== DEALS =====
        'deals-without-contact': {
          name: '[CWA] Deals sin contacto',
          objectTypeId: '0-3', // deals
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              filters: [{
                filterType: 'ASSOCIATION',
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 'deal_to_contact',
                operation: {
                  operationType: 'ASSOCIATION_COUNT',
                  operator: 'EQ',
                  value: 0
                }
              }]
            }]
          }
        },
        'deals-without-amount': {
          name: '[CWA] Deals sin monto',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              filters: [{
                filterType: 'PROPERTY',
                property: 'amount',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_UNKNOWN'
                }
              }]
            }]
          }
        },
        'deals-without-owner': {
          name: '[CWA] Deals sin owner',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              filters: [{
                filterType: 'PROPERTY',
                property: 'hubspot_owner_id',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_UNKNOWN'
                }
              }]
            }]
          }
        },
        'deals-inactive-180': {
          name: '[CWA] Deals inactivos +180 días',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              filters: [{
                filterType: 'PROPERTY',
                property: 'hs_lastactivitydate',
                operation: {
                  operationType: 'RANGE_COMPARISON',
                  operator: 'IS_BEFORE_DATE',
                  includeObjectsWithNoValueSet: false,
                  numberOfDays: 180,
                  timeUnitType: 'DAY'
                }
              }]
            }]
          }
        },
        'deals-stuck-stage': {
          name: '[CWA] Deals estancados por etapa',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              filters: [{
                filterType: 'PROPERTY',
                property: 'hs_lastmodifieddate',
                operation: {
                  operationType: 'RANGE_COMPARISON',
                  operator: 'IS_BEFORE_DATE',
                  includeObjectsWithNoValueSet: true,
                  numberOfDays: 30,
                  timeUnitType: 'DAY'
                }
              }]
            }]
          }
        },
        'deals-high-risk': {
          name: '[CWA] Deals de alto riesgo',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranchOperator: 'AND',
              filters: [
                {
                  filterType: 'PROPERTY',
                  property: 'amount',
                  operation: {
                    operationType: 'ALL_PROPERTY',
                    operator: 'IS_UNKNOWN'
                  }
                },
                {
                  filterType: 'PROPERTY',
                  property: 'hubspot_owner_id',
                  operation: {
                    operationType: 'ALL_PROPERTY',
                    operator: 'IS_UNKNOWN'
                  }
                }
              ]
            }]
          }
        }
      };
      
      // Crear cada lista solicitada
      for (const listId of listIds) {
        const definition = listDefinitions[listId];
        
        if (!definition) {
          results.push({
            listId,
            success: false,
            error: "Definición de lista no encontrada"
          });
          failed++;
          continue;
        }
        
        try {
          const requestBody = {
            name: definition.name,
            objectTypeId: definition.objectTypeId,
            processingType: 'DYNAMIC', // Lista activa
            filterBranch: definition.filterBranch
          };
          
          fastify.log.info({ 
            listId, 
            portalId,
            listName: definition.name,
            objectTypeId: definition.objectTypeId,
            requestBody: JSON.stringify(requestBody) 
          }, 'Creating list in HubSpot');
          
          // Crear lista activa en HubSpot usando Lists API v3
          const response = await fetch(
            `https://api.hubapi.com/crm/v3/lists/`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(requestBody)
            }
          );
          
          if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = errorText;
            let errorDetails = {};
            
            try {
              const errorJson = JSON.parse(errorText);
              errorMsg = errorJson.message || errorJson.error || errorText;
              errorDetails = errorJson;
            } catch {}
            
            fastify.log.error({ 
              listId, 
              statusCode: response.status,
              errorText,
              errorDetails,
              requestBody: JSON.stringify(requestBody)
            }, 'HubSpot API error creating list');
            
            throw new Error(`[${response.status}] ${errorMsg}`);
          }
          
          const listData = await response.json();
          
          fastify.log.info({ 
            listId, 
            hubspotListId: listData.listId,
            listName: definition.name 
          }, 'List created successfully');
          
          results.push({
            listId,
            success: true,
            hubspotListId: listData.listId,
            name: definition.name,
            url: `https://app.hubspot.com/contacts/${portalId}/lists/${listData.listId}`
          });
          
          created++;
          
        } catch (err) {
          fastify.log.error({ 
            err: err.message, 
            stack: err.stack,
            listId,
            portalId 
          }, "Error creating list - catch block");
          
          results.push({
            listId,
            success: false,
            error: err.message
          });
          failed++;
        }
      }
      
      return reply.send({
        total: listIds.length,
        created,
        failed,
        results
      });
      
    } catch (err) {
      fastify.log.error({ err }, "Error in /api/lists/create");
      return reply.code(500).send({
        error: "Error al crear listas",
        message: err.message
      });
    }
  });
};

export default listsRoutes;

