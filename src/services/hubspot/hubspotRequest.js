// services/hubspot.js
import axios from "axios";
import { refreshPortalToken } from "./refreshToken.service.js";

export async function hubspotRequest(
  fastify,
  portalId,
  token,
  url,
  options = {}
) {
  const { method = "GET", body } = options;

  try {
    const res = await axios({
      method,
      url: `https://api.hubapi.com${url}`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: body
    });

    return res.data;
  } catch (err) {
    const category = err.response?.data?.category;

    // 🔁 Token expirado → refresh automático
    if (category === "EXPIRED_AUTHENTICATION") {
      const newToken = await refreshPortalToken(fastify, portalId);

      const retry = await axios({
        method,
        url: `https://api.hubapi.com${url}`,
        headers: {
          Authorization: `Bearer ${newToken}`,
          "Content-Type": "application/json"
        },
        data: body
      });

      return retry.data;
    }

    // Otros errores → propaga
    throw err;
  }
}
