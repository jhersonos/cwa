/**
 * AEO (Answer Engine Optimization) del Home montado en HubSpot CMS.
 * 1) Localiza la site page home vía CMS API
 * 2) Descarga HTML público
 * 3) Evalúa señales AEO: schema, FAQ, meta, headings, robots/llms.txt
 */
import axios from "axios";
import { refreshPortalToken } from "../hubspot/refreshToken.service.js";

const HUBSPOT_API = "https://api.hubapi.com";
const HTML_TIMEOUT_MS = 12000;
const API_TIMEOUT_MS = 15000;

/**
 * @param {string|number} portalId
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function analyzeAeoHome(portalId, fastify) {
  const accessToken = await refreshPortalToken(fastify, portalId);
  if (!accessToken) throw new Error("No se pudo obtener token de acceso.");

  let homePage = null;
  try {
    homePage = await resolveHomePage(accessToken);
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) return buildUnavailable(status);
    throw err;
  }

  if (!homePage) {
    return {
      score: 0,
      level: "rojo",
      unavailable: false,
      noWebsite: true,
      pageUrl: null,
      pageTitle: null,
      checks: [],
      insights: [
        {
          id: "no-home",
          title: "No se encontró un Home publicado en Website Pages de HubSpot",
          severity: "warning",
        },
      ],
      stats: {
        hasJsonLd: false,
        hasOrganization: false,
        hasFaqSchema: false,
        hasFaqSection: false,
        hasMetaDescription: false,
        hasQuestionHeadings: false,
        hasLlmsTxt: false,
        hasRobotsTxt: false,
      },
    };
  }

  const pageUrl = normalizeUrl(homePage.url || homePage.absoluteUrl);
  const pageTitle = homePage.htmlTitle || homePage.name || "Home";
  const metaFromCms = String(homePage.metaDescription || "").trim();

  let html = "";
  let fetchError = null;
  if (pageUrl) {
    try {
      const res = await axios.get(pageUrl, {
        timeout: HTML_TIMEOUT_MS,
        maxRedirects: 5,
        headers: {
          "User-Agent": "CWA-AEO-Auditor/1.0 (+https://cwa.estado7.com)",
          Accept: "text/html,application/xhtml+xml",
        },
        validateStatus: (s) => s >= 200 && s < 400,
      });
      html = typeof res.data === "string" ? res.data : "";
    } catch (err) {
      fetchError = err?.message || "fetch_failed";
      fastify.log.warn({ portalId, pageUrl, err: fetchError }, "AEO: HTML fetch failed");
    }
  }

  const origin = pageUrl ? originOf(pageUrl) : null;
  const [robotsOk, llmsOk] = origin
    ? await Promise.all([
        probeUrl(`${origin}/robots.txt`),
        probeUrl(`${origin}/llms.txt`),
      ])
    : [false, false];

  const parsed = parseHtmlSignals(html, {
    cmsMetaDescription: metaFromCms,
    cmsTitle: pageTitle,
  });

  const checks = [
    {
      id: "organization-schema",
      label: "Schema Organization / LocalBusiness",
      pass: parsed.hasOrganization,
      weight: 18,
      tip: "Añade JSON-LD Organization en el home (name, url, logo, sameAs).",
    },
    {
      id: "faq-schema",
      label: "Schema FAQPage",
      pass: parsed.hasFaqSchema,
      weight: 16,
      tip: "Marca preguntas/respuestas visibles con FAQPage schema.",
    },
    {
      id: "json-ld",
      label: "Datos estructurados JSON-LD",
      pass: parsed.hasJsonLd,
      weight: 10,
      tip: "Incluye al menos un bloque application/ld+json válido.",
    },
    {
      id: "meta-description",
      label: "Meta description",
      pass: parsed.hasMetaDescription,
      weight: 10,
      tip: "Define una meta description clara (120–160 caracteres).",
    },
    {
      id: "h1",
      label: "Un H1 claro",
      pass: parsed.h1Count === 1,
      weight: 8,
      tip: parsed.h1Count === 0 ? "Falta H1 en el home." : "Usa un solo H1 principal.",
    },
    {
      id: "question-headings",
      label: "Headings en forma de pregunta",
      pass: parsed.hasQuestionHeadings,
      weight: 12,
      tip: "Usa H2/H3 como preguntas que un motor de respuestas pueda citar.",
    },
    {
      id: "faq-section",
      label: "Sección FAQ visible",
      pass: parsed.hasFaqSection,
      weight: 10,
      tip: "Incluye un bloque FAQ con respuestas cortas (40–60 palabras).",
    },
    {
      id: "open-graph",
      label: "Open Graph / identidad social",
      pass: parsed.hasOpenGraph,
      weight: 6,
      tip: "Añade og:title y og:description para reforzar la entidad de marca.",
    },
    {
      id: "canonical",
      label: "Canonical URL",
      pass: parsed.hasCanonical,
      weight: 4,
      tip: "Declara link rel=canonical hacia la URL canónica del home.",
    },
    {
      id: "robots-txt",
      label: "robots.txt accesible",
      pass: robotsOk,
      weight: 3,
      tip: "Publica robots.txt y no bloquees crawlers de IA sin motivo.",
    },
    {
      id: "llms-txt",
      label: "llms.txt (señal AEO)",
      pass: llmsOk,
      weight: 3,
      tip: "Publica /llms.txt con resumen y URLs clave para motores de respuesta.",
    },
  ];

  if (fetchError && !html) {
    checks.push({
      id: "html-fetch",
      label: "HTML público del home",
      pass: false,
      weight: 0,
      tip: `No se pudo leer el HTML público (${fetchError}). Revisa dominio y publicación.`,
    });
  }

  const score = scoreFromChecks(checks);
  const insights = checks
    .filter((c) => !c.pass)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      title: `${c.label}: ${c.tip}`,
      severity: c.weight >= 12 ? "critical" : c.weight >= 8 ? "warning" : "info",
    }));

  if (insights.length === 0) {
    insights.push({
      id: "aeo-ok",
      title: "El home cumple las señales AEO básicas evaluadas",
      severity: "info",
    });
  }

  return {
    score,
    level: score >= 86 ? "verde" : score >= 66 ? "amarillo" : "rojo",
    unavailable: false,
    noWebsite: false,
    pageUrl,
    pageTitle,
    htmlFetched: Boolean(html),
    checks,
    insights,
    stats: {
      hasJsonLd: parsed.hasJsonLd,
      hasOrganization: parsed.hasOrganization,
      hasFaqSchema: parsed.hasFaqSchema,
      hasFaqSection: parsed.hasFaqSection,
      hasMetaDescription: parsed.hasMetaDescription,
      hasQuestionHeadings: parsed.hasQuestionHeadings,
      hasLlmsTxt: llmsOk,
      hasRobotsTxt: robotsOk,
      h1Count: parsed.h1Count,
      questionHeadingCount: parsed.questionHeadingCount,
    },
  };
}

async function resolveHomePage(accessToken) {
  const pages = [];
  let after;
  do {
    const params = { limit: 100, archived: false };
    if (after) params.after = after;
    const res = await axios.get(`${HUBSPOT_API}/cms/v3/pages/site-pages`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
      timeout: API_TIMEOUT_MS,
    });
    pages.push(...(res.data?.results || []));
    after = res.data?.paging?.next?.after;
  } while (after && pages.length < 300);

  const published = pages.filter((p) => {
    const state = String(p.state || p.currentState || "").toUpperCase();
    return !state || state.includes("PUBLISH") || state === "LIVE";
  });
  const pool = published.length ? published : pages;

  const bySlug = pool.find((p) => {
    const slug = String(p.slug || p.path || "").replace(/^\/+|\/+$/g, "").toLowerCase();
    return slug === "" || slug === "home" || slug === "inicio" || slug === "index";
  });
  if (bySlug) return bySlug;

  const byName = pool.find((p) => {
    const n = String(p.name || p.htmlTitle || "").toLowerCase();
    return n === "home" || n === "inicio" || n.includes("home page") || n.includes("página de inicio");
  });
  if (byName) return byName;

  // Fallback: primera page con URL raíz
  const byUrl = pool.find((p) => {
    const u = String(p.url || p.absoluteUrl || "");
    try {
      const path = new URL(u.startsWith("http") ? u : `https://${u}`).pathname.replace(/\/+$/, "");
      return path === "" || path === "/";
    } catch {
      return false;
    }
  });
  return byUrl || pool[0] || null;
}

function parseHtmlSignals(html, { cmsMetaDescription, cmsTitle }) {
  const empty = {
    hasJsonLd: false,
    hasOrganization: false,
    hasFaqSchema: false,
    hasFaqSection: false,
    hasMetaDescription: Boolean(cmsMetaDescription),
    hasQuestionHeadings: false,
    hasOpenGraph: false,
    hasCanonical: false,
    h1Count: 0,
    questionHeadingCount: 0,
  };
  if (!html) return empty;

  const lower = html.toLowerCase();
  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let hasOrganization = false;
  let hasFaqSchema = false;
  for (const m of jsonLdBlocks) {
    const raw = (m[1] || "").trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const types = collectSchemaTypes(data);
      if (types.has("organization") || types.has("localbusiness")) hasOrganization = true;
      if (types.has("faqpage")) hasFaqSchema = true;
    } catch {
      const soft = raw.toLowerCase();
      if (soft.includes('"organization"') || soft.includes('"localbusiness"')) hasOrganization = true;
      if (soft.includes('"faqpage"')) hasFaqSchema = true;
    }
  }

  const metaMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
  );
  const metaDesc = (metaMatch?.[1] || cmsMetaDescription || "").trim();

  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  const h2h3 = [...html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)];
  const questionHeadingCount = h2h3.filter((m) => {
    const text = stripTags(m[1]);
    return /\?/.test(text) || /^(qué|que|cómo|como|cuál|cual|por qué|porque|quién|quien|cuándo|cuando|dónde|donde|what|how|why|when|where|who)\b/i.test(text.trim());
  }).length;

  const hasFaqSection =
    /faq|preguntas?\s+frecuentes|frequently\s+asked/i.test(lower) ||
    hasFaqSchema;

  return {
    hasJsonLd: jsonLdBlocks.length > 0,
    hasOrganization,
    hasFaqSchema,
    hasFaqSection,
    hasMetaDescription: metaDesc.length >= 40,
    hasQuestionHeadings: questionHeadingCount >= 2,
    hasOpenGraph: /property=["']og:(title|description|type)["']/i.test(html),
    hasCanonical: /rel=["']canonical["']/i.test(html),
    h1Count: h1s.length,
    questionHeadingCount,
    titleHint: cmsTitle,
  };
}

function collectSchemaTypes(node, out = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectSchemaTypes(n, out));
    return out;
  }
  if (node["@type"]) {
    const t = node["@type"];
    if (Array.isArray(t)) t.forEach((x) => out.add(String(x).toLowerCase()));
    else out.add(String(t).toLowerCase());
  }
  if (node["@graph"]) collectSchemaTypes(node["@graph"], out);
  Object.values(node).forEach((v) => {
    if (v && typeof v === "object") collectSchemaTypes(v, out);
  });
  return out;
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreFromChecks(checks) {
  const weighted = checks.filter((c) => c.weight > 0);
  if (!weighted.length) return 0;
  const totalW = weighted.reduce((a, c) => a + c.weight, 0);
  const earned = weighted.reduce((a, c) => a + (c.pass ? c.weight : 0), 0);
  return Math.round((earned / totalW) * 100);
}

async function probeUrl(url) {
  try {
    const res = await axios.get(url, {
      timeout: 5000,
      maxRedirects: 3,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { "User-Agent": "CWA-AEO-Auditor/1.0" },
    });
    const body = typeof res.data === "string" ? res.data : "";
    return body.trim().length > 10;
  } catch {
    return false;
  }
}

function normalizeUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function buildUnavailable(status) {
  return {
    score: 0,
    level: "rojo",
    unavailable: true,
    noWebsite: false,
    pageUrl: null,
    pageTitle: null,
    checks: [],
    insights: [
      {
        id: "unavailable",
        title: `AEO no disponible (permisos CMS). Código: ${status}`,
        severity: "warning",
      },
    ],
    stats: {},
  };
}
