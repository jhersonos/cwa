import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";

/**
 * USERS DETAIL — INACTIVE USERS
 * Devuelve usuarios inactivos con link directo a HubSpot
 */
export async function getInactiveUsers({ portalId, token }) {
  const res = await axios.get(
    `${HUBSPOT_API}/settings/v3/users`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      timeout: 8000
    }
  );

  const users = res.data?.results || [];

  const inactiveUsers = users.filter(
    u => u.archived || u.status === "inactive"
  );

  return {
    type: "inactive-users",
    total: inactiveUsers.length,
    items: inactiveUsers.map(u => ({
      id: u.id,
      name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
      email: u.email || null,
      hubspotUrl: `https://app.hubspot.com/settings/${portalId}/users`
    }))
  };
}
