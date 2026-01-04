import {
    getContactsWithoutEmail,
    getContactsWithoutLifecycle,
    getStaleContacts
  } from "../services/analysis/details/contacts.details.js";
  
  import {
    getInactiveUsers
  } from "../services/analysis/details/users.details.js";
  
  import { getValidAccessToken } from "../services/hubspot/token.service.js";
  import { exportDetailsToXlsx } from "../services/analysis/details/exportXlsx.js";
  
  export async function getScanDetails(req, reply) {
    const { portalId } = req.query;
    const { type } = req.params;
    const isExportXlsx = req.url.endsWith("/export/xlsx");
  
    if (!portalId || !type) {
      return reply.code(400).send({ error: "Missing portalId or type" });
    }
  
    try {
      const token = await getValidAccessToken(req.server, portalId);
      let result;
  
      switch (type) {
        case "contacts-without-email":
          result = await getContactsWithoutEmail({ portalId, token });
          break;
  
        case "contacts-without-lifecycle":
          result = await getContactsWithoutLifecycle({ portalId, token });
          break;
  
        case "stale-contacts":
          result = await getStaleContacts({ portalId, token });
          break;
  
        case "inactive-users":
          result = await getInactiveUsers({ portalId, token });
          break;
  
        default:
          return reply.code(404).send({ error: "Unknown detail type" });
      }
  
      // 📤 EXPORT XLSX
      if (isExportXlsx) {
        const { buffer, filename } = await exportDetailsToXlsx({
          type,
          portalId,
          items: result.items
        });
  
        reply.header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        reply.header(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
  
        return reply.send(buffer);
      }
  
      return result;
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
  