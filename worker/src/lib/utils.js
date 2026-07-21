export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function normalizeText(value = "") {
  return decodeHtml(String(value))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value = "") {
  const normalized = normalizeText(value)
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.replace(/\s+/g, "-").slice(0, 120) || `trend-${Date.now()}`;
}

export function titleCase(value = "") {
  return String(value)
    .trim()
    .split(/\s+/)
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "")
    .join(" ");
}

export function decodeHtml(value = "") {
  const map = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (match) => map[match] || match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function parseApproxNumber(value = "") {
  const cleaned = String(value).toUpperCase().replace(/\s/g, "").replace(/\+/g, "").replace(/,/g, ".");
  const match = cleaned.match(/([\d.]+)\s*([KMB]|RB|JT|M)?/i);
  if (!match) return 0;
  const number = Number.parseFloat(match[1]) || 0;
  const suffix = match[2] || "";
  const multiplier = suffix === "K" || suffix === "RB" ? 1_000
    : suffix === "M" || suffix === "JT" ? 1_000_000
      : suffix === "B" ? 1_000_000_000
        : 1;
  return Math.round(number * multiplier);
}

export function parseCsvList(value = "") {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function hoursBetween(older, newer = new Date()) {
  const start = new Date(older).getTime();
  const end = newer instanceof Date ? newer.getTime() : new Date(newer).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, (end - start) / 3_600_000);
}

export function isoHourBucket(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("Request timed out"), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function corsHeaders(request, env) {
  const requestOrigin = request.headers.get("origin") || "";
  const configured = parseCsvList(env.ALLOWED_ORIGINS || "");
  const localhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);
  const allowed = configured.includes("*") || configured.includes(requestOrigin) || localhost;
  const origin = allowed ? requestOrigin || configured[0] || "*" : configured[0] || "null";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

export function isAuthorized(request, env) {
  const expected = String(env.ADMIN_TOKEN || "");
  if (!expected) return false;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === expected;
}

export function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
}
