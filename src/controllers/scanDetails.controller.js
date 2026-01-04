import {
    getContactsWithoutEmail,
    getContactsWithoutLifecycle,
    getStaleContacts
  } from "../services/analysis/details/contacts.details.js";
  
  import {
    getInactiveUsers
  } from "../services/analysis/details/users.details.js";
  
  import { getValidAccessToken } from "../services/hubspot/token.service.js";
  
  export async function getScanDetails(req, reply) {
    const { portalId } = req.query;
    const { type } = req.params;
  
    if (!portalId || !type) {
      return reply.code(400).send({ error: "Missing portalId or type" });
    }
  
    const token = await getValidAccessToken(req.server, portalId);
  
    try {
      let result = null;
  
      switch (type) {
        case "contacts-without-email":
          result = await getContactsWithoutEmail(req.server, portalId, token);
          break;
  
        case "contacts-without-lifecycle":
          result = await getContactsWithoutLifecycle(req.server, portalId, token);
          break;
  
        case "stale-contacts":
          result = await getStaleContacts(req.server, portalId, token);
          break;
  
        case "inactive-users":
          result = await getInactiveUsers(req.server, portalId, token);
          break;
  
        default:
          return reply.code(404).send({ error: "Unknown detail type" });
      }
  
      return {
        type,
        total: result.length,
        items: result
      };
    } catch (err) {
      req.server.log.error(
        { err, portalId, type },
        "Failed fetching scan details"
      );
  
      return reply.code(500).send({
        error: "Failed fetching scan details"
      });
    }
  }
  