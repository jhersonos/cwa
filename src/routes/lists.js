import { refreshAccessToken } from "../services/hubspot/refreshToken.service.js";

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
      const { portalId, listIds } = req.body;
      
      if (!portalId || !listIds || !Array.isArray(listIds) || listIds.length === 0) {
        return reply.code(400).send({
          error: "Se requiere portalId y listIds (array no vacío)"
        });
      }
      
      // Obtener access token
      const token = await refreshAccessToken(portalId);
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
        },
        'contacts-without-phone': {
          name: '[CWA] Contactos sin teléfono',
          objectTypeId: '0-1',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filters: [
              {
                filterType: 'PROPERTY',
                property: 'phone',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_NOT_SET'
                }
              }
            ]
          }
        },
        'contacts-without-owner': {
          name: '[CWA] Contactos sin owner',
          objectTypeId: '0-1',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filters: [
              {
                filterType: 'PROPERTY',
                property: 'hubspot_owner_id',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_NOT_SET'
                }
              }
            ]
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
                property: 'notes_last_updated',
                operation: {
                  operationType: 'RANGE_COMPARISON',
                  operator: 'IS_BEFORE_DATE',
                  includeObjectsWithNoValueSet: false,
                  numberOfDays: 180,
                  timeUnitType: 'DAY'
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
                  includeObjectsWithNoValueSet: false,
                  numberOfDays: 90,
                  timeUnitType: 'DAY'
                }
              },
              {
                filterType: 'PROPERTY',
                property: 'notes_last_updated',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_NOT_SET'
                }
              }
            ]
          }
        },
        'contacts-high-risk': {
          name: '[CWA] Contactos de alto riesgo',
          objectTypeId: '0-1',
          filterBranch: {
            filterBranchType: 'AND',
            filterBranchOperator: 'AND',
            filters: [
              {
                filterType: 'PROPERTY',
                property: 'email',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_NOT_SET'
                }
              },
              {
                filterType: 'PROPERTY',
                property: 'hubspot_owner_id',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_NOT_SET'
                }
              }
            ]
          }
        },
        
        // ===== DEALS =====
        'deals-without-contact': {
          name: '[CWA] Deals sin contacto',
          objectTypeId: '0-3', // deals
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filters: [
              {
                filterType: 'ASSOCIATION',
                associationTypeId: 3, // deal to contact
                associationCategory: 'HUBSPOT_DEFINED',
                operation: {
                  operationType: 'ASSOCIATION_COUNT',
                  operator: 'EQ',
                  value: 0
                }
              }
            ]
          }
        },
        'deals-without-amount': {
          name: '[CWA] Deals sin monto',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filters: [
              {
                filterType: 'PROPERTY',
                property: 'amount',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_NOT_SET'
                }
              }
            ]
          }
        },
        'deals-without-owner': {
          name: '[CWA] Deals sin owner',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'OR',
            filterBranchOperator: 'OR',
            filters: [
              {
                filterType: 'PROPERTY',
                property: 'hubspot_owner_id',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_NOT_SET'
                }
              }
            ]
          }
        },
        'deals-inactive-180': {
          name: '[CWA] Deals inactivos +180 días',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'AND',
            filterBranchOperator: 'AND',
            filters: [
              {
                filterType: 'PROPERTY',
                property: 'notes_last_updated',
                operation: {
                  operationType: 'RANGE_COMPARISON',
                  operator: 'IS_BEFORE_DATE',
                  includeObjectsWithNoValueSet: false,
                  numberOfDays: 180,
                  timeUnitType: 'DAY'
                }
              }
            ]
          }
        },
        'deals-stuck-stage': {
          name: '[CWA] Deals estancados por etapa',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'AND',
            filterBranchOperator: 'AND',
            filters: [
              {
                filterType: 'PROPERTY',
                property: 'hs_date_entered_appointmentscheduled',
                operation: {
                  operationType: 'RANGE_COMPARISON',
                  operator: 'IS_BEFORE_DATE',
                  includeObjectsWithNoValueSet: false,
                  numberOfDays: 30,
                  timeUnitType: 'DAY'
                }
              }
            ]
          }
        },
        'deals-high-risk': {
          name: '[CWA] Deals de alto riesgo',
          objectTypeId: '0-3',
          filterBranch: {
            filterBranchType: 'AND',
            filterBranchOperator: 'AND',
            filters: [
              {
                filterType: 'PROPERTY',
                property: 'amount',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_NOT_SET'
                }
              },
              {
                filterType: 'PROPERTY',
                property: 'hubspot_owner_id',
                operation: {
                  operationType: 'ALL_PROPERTY',
                  operator: 'IS_NOT_SET'
                }
              }
            ]
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
          // Crear lista activa en HubSpot usando Lists API v3
          const response = await fetch(
            `https://api.hubapi.com/crm/v3/lists/`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: definition.name,
                objectTypeId: definition.objectTypeId,
                processingType: 'DYNAMIC', // Lista activa
                filterBranch: definition.filterBranch
              })
            }
          );
          
          if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = errorText;
            try {
              const errorJson = JSON.parse(errorText);
              errorMsg = errorJson.message || errorJson.error || errorText;
            } catch {}
            
            throw new Error(errorMsg);
          }
          
          const listData = await response.json();
          
          results.push({
            listId,
            success: true,
            hubspotListId: listData.listId,
            name: definition.name,
            url: `https://app.hubspot.com/contacts/${portalId}/lists/${listData.listId}`
          });
          
          created++;
          
        } catch (err) {
          fastify.log.error({ err, listId }, "Error creating list");
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

