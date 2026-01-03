import axios from "axios";

export async function hubspotRequest(token, url, options = {}) {
  const { method = "GET", body } = options;

  const config = {
    method,
    url: `https://api.hubapi.com${url}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  };

  if (body) {
    config.data = body;
  }

  const res = await axios(config);
  return res.data;
}
