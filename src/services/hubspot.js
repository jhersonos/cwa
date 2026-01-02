import axios from "axios";

export async function hubspotRequest(token, url) {
  const res = await axios.get(
    `https://api.hubapi.com${url}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  return res.data;
}
