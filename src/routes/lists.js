import { refreshPortalToken } from "../services/hubspot/refreshToken.service.js";
import { getListPreview } from "../services/listsPreview.service.js";

/**
 * Filtro de propiedad de fecha: valor entre dos puntos rodantes desde HOY (TIME_RANGED).
 * Sustituye RANGE_COMPARISON (ya no válido en Lists API v3 público).
 * @param {string} propertyName - internal name (p. ej. notes_last_updated, createdate)
 * @param {number} lowerDaysFromToday - más negativo = más al pasado (p. ej. -3650)
 * @param {number} upperDaysFromToday - menos negativo (p. ej. -180); debe ser > lowerDaysFromToday
 *
 * HubSpot Lists API: con límite inferior en TODAY, el superior debe usar NOW (evita error 400).
 */
function rollingDateBetweenProperty(propertyName, lowerDaysFromToday, upperDaysFromToday) {
  return {
    filterType: "PROPERTY",
    property: propertyName,
    operation: {
      operator: "IS_BETWEEN",
      includeObjectsWithNoValueSet: false,
      lowerBoundEndpointBehavior: "INCLUSIVE",
      upperBoundEndpointBehavior: "INCLUSIVE",
      propertyParser: "VALUE",
      lowerBoundTimePoint: {
        timezoneSource: "CUSTOM",
        zoneId: "UTC",
        indexReference: { referenceType: "TODAY" },
        offset: { days: lowerDaysFromToday },
        timeType: "INDEXED",
      },
      upperBoundTimePoint: {
        timezoneSource: "CUSTOM",
        zoneId: "UTC",
        indexReference: { referenceType: "NOW" },
        offset: { days: upperDaysFromToday },
        timeType: "INDEXED",
      },
      type: "TIME_RANGED",
      operationType: "TIME_RANGED",
    },
  };
}

/**
 * ========================================
 * ROUTES: Crear listas activas en HubSpot
 * ========================================
 */

const listsRoutes = async (fastify, options) => {
  
  /**
   * GET /api/lists/preview
   * Hasta 10 registros de muestra para un listId (misma lógica que las listas dinámicas).
   */
  fastify.get("/api/lists/preview", async (req, reply) => {
    try {
      const portalId = req.query?.portalId;
      const listId = req.query?.listId;
      const limit = req.query?.limit ? parseInt(String(req.query.limit), 10) : 10;

      if (!portalId || !listId) {
        return reply.code(400).send({
          error: "Se requiere portalId y listId",
        });
      }

      const token = await refreshPortalToken(fastify, portalId);
      if (!token) {
        return reply.code(401).send({
          error: "No se pudo obtener access token para este portal",
        });
      }

      const data = await getListPreview(fastify, portalId, listId, token, limit);
      return reply.send(data);
    } catch (err) {
      const status = err.statusCode || 500;
      fastify.log.error({ err }, "GET /api/lists/preview");
      return reply.code(status).send({
        error: err.message || "Error al obtener vista previa",
      });
    }
  });

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
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [
              {
                filterBranchType: 'AND',
                filterBranchOperator: 'AND',
                filters: [
                  // Última actividad entre hace ~10 años y hace 180 días (= inactivos 180+ días)
                  rollingDateBetweenProperty("notes_last_updated", -3650, -180),
                ],
              },
            ],
          },
        },
        'contacts-created-90-no-activity': {
          name: '[CWA] Contactos creados +90d sin actividad',
          objectTypeId: '0-1',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filterBranches: [
              {
                filterBranchType: 'AND',
                filterBranchOperator: 'AND',
                filters: [
                  rollingDateBetweenProperty("createdate", -3650, -90),
                  {
                    filterType: "PROPERTY",
                    property: "notes_last_updated",
                    operation: {
                      operationType: "ALL_PROPERTY",
                      operator: "IS_UNKNOWN",
                    },
                  },
                ],
              },
            ],
          },
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
            filterBranches: [
              {
                filterBranchType: 'AND',
                filterBranchOperator: 'AND',
                filters: [
                  {
                    filterType: 'PROPERTY',
                    property: 'num_associated_contacts',
                    operation: {
                      operationType: 'NUMBER',
                      operator: 'IS_EQUAL_TO',
                      value: 0,
                    },
                  },
                ],
              },
            ],
          },
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
            filterBranches: [
              {
                filterBranchType: 'AND',
                filterBranchOperator: 'AND',
                filters: [
                  rollingDateBetweenProperty('notes_last_updated', -3650, -180),
                ],
              },
            ],
          },
        },
        "deals-stuck-stage": {
          name: "[CWA] Deals abiertos sin actividad reciente (+30 días)",
          objectTypeId: "0-3",
          filterBranch: {
            filterBranchType: "OR",
            filterBranchOperator: "OR",
            filterBranches: [
              {
                filterBranchType: "AND",
                filterBranchOperator: "AND",
                filters: [
                  {
                    filterType: "PROPERTY",
                    property: "closedate",
                    operation: {
                      operationType: "ALL_PROPERTY",
                      operator: "IS_UNKNOWN",
                    },
                  },
                  rollingDateBetweenProperty("notes_last_updated", -3650, -30),
                ],
              },
            ],
          },
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

