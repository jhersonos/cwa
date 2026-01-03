// src/services/analysis/workflows.analysis.js

import axios from "axios";

export async function analyzeWorkflows(server, portalId, token) {
  const baseUrl = "https://api.hubapi.com";

  let workflows = [];
  let after = undefined;

  try {
    do {
      const res = await axios.get(
        `${baseUrl}/automation/v3/workflows`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          params: {
            limit: 50,
            after
          }
        }
      );

      workflows = workflows.concat(res.data.results || []);
      after = res.data.paging?.next?.after;
    } while (after);
  } catch (error) {
    return {
      total: 0,
      inactive: 0,
      highComplexity: 0,
      legacy: 0,
      limitedVisibility: true
    };
  }

  const now = Date.now();
  const SIX_MONTHS = 1000 * 60 * 60 * 24 * 180;

  let inactive = 0;
  let highComplexity = 0;
  let legacy = 0;

  workflows.forEach(wf => {
    if (wf.state !== "ACTIVE") inactive++;

    if ((wf.actions || []).length > 10) {
      highComplexity++;
    }

    if (now - new Date(wf.updatedAt).getTime() > SIX_MONTHS) {
      legacy++;
    }
  });

  return {
    total: workflows.length,
    inactive,
    highComplexity,
    legacy,
    limitedVisibility: false
  };
}
