import { collectGoogleTrends } from "./collectors/google-trends.js";
import { collectYouTube } from "./collectors/youtube.js";
import { classifyFood } from "./lib/food-taxonomy.js";
import { cleanupOldData, insertEvidence, insertObservation, upsertTrend } from "./lib/db.js";
import { scoreAllTrends, scoreTrend } from "./lib/scoring.js";
import {
  corsHeaders,
  hoursBetween,
  isAuthorized,
  json,
  nowIso,
  randomId,
  safeJsonParse,
} from "./lib/utils.js";

const SOCIAL_SOURCES = new Set(["tiktok", "instagram"]);

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function parseLimit(value, fallback = 50, max = 200) {
  return Math.min(max, Math.max(1, Number.parseInt(value || String(fallback), 10) || fallback));
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

async function getStats(env) {
  const [summary, lifecycle, category, freshness] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN lifecycle IN ('early_signal','emerging') AND is_active = 1 THEN 1 ELSE 0 END) AS early,
        SUM(CASE WHEN lifecycle = 'viral' AND is_active = 1 THEN 1 ELSE 0 END) AS viral,
        AVG(CASE WHEN is_active = 1 THEN viral_score END) AS average_score
      FROM trends
    `).first(),
    env.DB.prepare(`
      SELECT lifecycle, COUNT(*) AS count
      FROM trends WHERE is_active = 1
      GROUP BY lifecycle ORDER BY count DESC
    `).all(),
    env.DB.prepare(`
      SELECT category, COUNT(*) AS count
      FROM trends WHERE is_active = 1
      GROUP BY category ORDER BY count DESC LIMIT 12
    `).all(),
    env.DB.prepare("SELECT MAX(collected_at) AS last_collected_at FROM observations").first(),
  ]);
  return {
    total: Number(summary?.total || 0),
    active: Number(summary?.active || 0),
    early: Number(summary?.early || 0),
    viral: Number(summary?.viral || 0),
    averageScore: Number(summary?.average_score || 0),
    lifecycle: lifecycle.results || [],
    category: category.results || [],
    lastCollectedAt: freshness?.last_collected_at || null,
  };
}

async function listTrends(request, env) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 100, 300);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0);
  const category = url.searchParams.get("category") || "";
  const lifecycle = url.searchParams.get("lifecycle") || "";
  const source = url.searchParams.get("source") || "";
  const query = url.searchParams.get("q") || "";
  const activeOnly = url.searchParams.get("active") !== "false";
  const sort = url.searchParams.get("sort") || "score";
  const orderBy = {
    score: "viral_score DESC, growth_pct DESC",
    momentum: "momentum_score DESC, viral_score DESC",
    growth: "growth_pct DESC, viral_score DESC",
    newest: "first_detected_at DESC",
    updated: "last_seen_at DESC",
  }[sort] || "viral_score DESC, growth_pct DESC";

  const where = [];
  const bindings = [];
  if (activeOnly) where.push("is_active = 1");
  if (category) { where.push("category = ?"); bindings.push(category); }
  if (lifecycle) { where.push("lifecycle = ?"); bindings.push(lifecycle); }
  if (source) { where.push("source_list LIKE ?"); bindings.push(`%\"${source}\"%`); }
  if (query) { where.push("(name LIKE ? OR category LIKE ?)"); bindings.push(`%${query}%`, `%${query}%`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const result = await env.DB.prepare(`
    SELECT * FROM trends
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all();

  const rows = (result.results || []).map((row) => ({
    ...row,
    is_active: Boolean(row.is_active),
    source_list: safeJsonParse(row.source_list, []),
    metadata_json: safeJsonParse(row.metadata_json, {}),
  }));
  return { items: rows, limit, offset };
}

async function getTrendDetail(env, trendId) {
  const trend = await env.DB.prepare("SELECT * FROM trends WHERE id = ? OR slug = ?").bind(trendId, trendId).first();
  if (!trend) return null;
  const [observations, evidence, history] = await Promise.all([
    env.DB.prepare(`SELECT * FROM observations WHERE trend_id = ? ORDER BY collected_at DESC LIMIT 120`).bind(trend.id).all(),
    env.DB.prepare(`SELECT * FROM evidence WHERE trend_id = ? ORDER BY collected_at DESC, views DESC LIMIT 60`).bind(trend.id).all(),
    env.DB.prepare(`
      SELECT captured_at, viral_score, momentum_score, saturation_score, growth_pct, lifecycle
      FROM score_history WHERE trend_id = ? ORDER BY captured_at ASC LIMIT 240
    `).bind(trend.id).all(),
  ]);
  return {
    trend: {
      ...trend,
      is_active: Boolean(trend.is_active),
      source_list: safeJsonParse(trend.source_list, []),
      metadata_json: safeJsonParse(trend.metadata_json, {}),
    },
    observations: (observations.results || []).map((item) => ({ ...item, raw_json: safeJsonParse(item.raw_json, {}) })),
    evidence: (evidence.results || []).map((item) => ({ ...item, metadata_json: safeJsonParse(item.metadata_json, {}) })),
    scoreHistory: history.results || [],
  };
}

async function getSources(env) {
  const [runsResult, observationsResult] = await Promise.all([
    env.DB.prepare(`
      SELECT r.* FROM collector_runs r
      INNER JOIN (
        SELECT source, MAX(started_at) AS max_started_at
        FROM collector_runs GROUP BY source
      ) latest ON latest.source = r.source AND latest.max_started_at = r.started_at
    `).all(),
    env.DB.prepare(`
      SELECT source, MAX(collected_at) AS last_observation_at,
             COUNT(*) AS observations_30d, COUNT(DISTINCT trend_id) AS trends_30d
      FROM observations
      WHERE collected_at >= datetime('now', '-30 days')
      GROUP BY source
    `).all(),
  ]);
  const runs = new Map((runsResult.results || []).map((row) => [row.source, row]));
  const observations = new Map((observationsResult.results || []).map((row) => [row.source, row]));
  const definitions = [
    { source: "google_trends", mode: "automatic", frequency: "Setiap 1 jam", description: "Trending Now/RSS Indonesia, lalu disaring untuk topik makanan." },
    { source: "youtube", mode: "automatic", frequency: "Setiap 3 jam", description: "Video terbaru, views, likes, comments, creator spread, dan views/hour." },
    { source: "tiktok", mode: "manual_verified", frequency: "Disarankan 1–2× per hari", description: "Masukkan data aktual dari TikTok Creative Center atau video yang diverifikasi." },
    { source: "instagram", mode: "manual_verified", frequency: "Saat ada sinyal baru", description: "Masukkan link Reels/post dan metrik aktual dari Instagram." },
  ];
  return definitions.map((definition) => {
    const run = runs.get(definition.source) || {};
    const obs = observations.get(definition.source) || {};
    let status = run.status || "not_run";
    if (definition.mode === "manual_verified") {
      if (!obs.last_observation_at) status = "not_run";
      else {
        const ageHours = (Date.now() - new Date(obs.last_observation_at).getTime()) / 3_600_000;
        status = ageHours <= 48 ? "success" : "stale";
      }
    }
    return {
      ...definition,
      ...run,
      status,
      last_observation_at: obs.last_observation_at || null,
      observations_30d: Number(obs.observations_30d || 0),
      trends_30d: Number(obs.trends_30d || 0),
    };
  });
}

async function listSocialSignals(request, env) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 50, 200);
  const source = url.searchParams.get("source") || "";
  const where = source && SOCIAL_SOURCES.has(source) ? "AND o.source = ?" : "";
  const bindings = source && SOCIAL_SOURCES.has(source) ? [source, limit] : [limit];
  const result = await env.DB.prepare(`
    SELECT
      o.id, o.trend_id, t.name AS trend_name, t.category, o.source, o.collected_at,
      o.views, o.likes, o.comments, o.shares, o.creator_count, o.post_count,
      o.views_per_hour, o.engagement_rate, o.region, o.data_mode, o.raw_json,
      (SELECT e.url FROM evidence e WHERE e.trend_id = o.trend_id AND e.source = o.source ORDER BY e.collected_at DESC LIMIT 1) AS evidence_url,
      (SELECT e.creator FROM evidence e WHERE e.trend_id = o.trend_id AND e.source = o.source ORDER BY e.collected_at DESC LIMIT 1) AS creator
    FROM observations o
    JOIN trends t ON t.id = o.trend_id
    WHERE o.source IN ('tiktok', 'instagram') ${where}
    ORDER BY o.collected_at DESC
    LIMIT ?
  `).bind(...bindings).all();
  return (result.results || []).map((row) => ({ ...row, raw_json: safeJsonParse(row.raw_json, {}) }));
}

async function runCollectors(env, source = "all", forceYouTube = true) {
  const results = [];
  const errors = [];
  if (source === "all" || source === "google_trends") {
    try { results.push(await collectGoogleTrends(env)); }
    catch (error) { errors.push({ source: "google_trends", error: error.message || String(error) }); }
  }
  if (source === "all" || source === "youtube") {
    if (forceYouTube || source === "youtube") {
      try { results.push(await collectYouTube(env)); }
      catch (error) { errors.push({ source: "youtube", error: error.message || String(error) }); }
    }
  }
  const scores = await scoreAllTrends(env);
  await cleanupOldData(env);
  return { collectedAt: nowIso(), results, errors, scored: scores.length };
}

async function addManualSignalData(body, env) {
  if (!body?.trendName || !body?.source) throw new Error("trendName dan source wajib diisi.");
  const source = String(body.source).toLowerCase().trim();
  if (!SOCIAL_SOURCES.has(source)) throw new Error("Source manual harus tiktok atau instagram.");
  const collectedAt = body.collectedAt ? new Date(body.collectedAt).toISOString() : nowIso();
  const publishedAt = body.publishedAt ? new Date(body.publishedAt).toISOString() : null;
  const trendName = String(body.trendName).trim();
  const views = numberValue(body.views);
  const likes = numberValue(body.likes);
  const comments = numberValue(body.comments);
  const shares = numberValue(body.shares);
  const creatorCount = numberValue(body.creatorCount);
  const postCount = Math.max(1, numberValue(body.postCount) || 1);
  const viewsPerHour = numberValue(body.viewsPerHour) || (publishedAt && views > 0 ? views / hoursBetween(publishedAt, collectedAt) : 0);
  const metricValue = numberValue(body.metricValue) || views || postCount;
  const engagementRate = views > 0 ? (likes + comments * 2 + shares * 3) / views : 0;
  const region = String(body.region || "ID").toUpperCase();

  const trend = await upsertTrend(env, {
    name: trendName,
    category: body.category || classifyFood(trendName),
    seenAt: collectedAt,
    metadata: { discoverySource: `${source}_manual`, note: body.note || "", region },
  });
  await insertObservation(env, {
    trendId: trend.id,
    source,
    collectedAt,
    metricValue,
    views,
    likes,
    comments,
    shares,
    creatorCount,
    postCount,
    viewsPerHour,
    engagementRate,
    region,
    dataMode: "manual_verified",
    raw: {
      manual: true,
      verified: body.verified !== false,
      note: body.note || "",
      captureSource: body.captureSource || (source === "tiktok" ? "TikTok Creative Center" : "Instagram app"),
    },
  });
  if (body.url) {
    await insertEvidence(env, {
      trendId: trend.id,
      source,
      title: body.evidenceTitle || trendName,
      url: String(body.url).trim(),
      creator: body.creator || "",
      publishedAt,
      views,
      likes,
      comments,
      shares,
      thumbnailUrl: body.thumbnailUrl || null,
      collectedAt,
      dataMode: "manual_verified",
      metadata: { manual: true, verified: body.verified !== false, region, note: body.note || "" },
    });
  }
  const score = await scoreTrend(env, trend.id);
  return { trendId: trend.id, trendName, source, collectedAt, score };
}

async function addManualSignal(request, env) {
  return addManualSignalData(await request.json(), env);
}

async function addManualSignalsBulk(request, env) {
  const body = await request.json();
  const items = Array.isArray(body) ? body : body?.items;
  if (!Array.isArray(items) || !items.length) throw new Error("items wajib berupa array dan tidak boleh kosong.");
  if (items.length > 200) throw new Error("Maksimal 200 signal per upload.");
  const results = [];
  const errors = [];
  for (let index = 0; index < items.length; index += 1) {
    try { results.push(await addManualSignalData(items[index], env)); }
    catch (error) { errors.push({ row: index + 1, error: error.message || String(error) }); }
  }
  return { imported: results.length, failed: errors.length, results, errors };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/api/health") {
    const latest = await env.DB.prepare("SELECT MAX(collected_at) AS last_collected_at FROM observations").first();
    return json({
      ok: true,
      service: "BOGA Food Trend Radar API",
      timestamp: nowIso(),
      lastCollectedAt: latest?.last_collected_at || null,
      dataMode: "live",
    });
  }
  if (request.method === "GET" && path === "/api/stats") return json({ ok: true, data: await getStats(env) });
  if (request.method === "GET" && path === "/api/trends") return json({ ok: true, data: await listTrends(request, env) });
  if (request.method === "GET" && path.startsWith("/api/trends/")) {
    const id = decodeURIComponent(path.slice("/api/trends/".length));
    const detail = await getTrendDetail(env, id);
    return detail ? json({ ok: true, data: detail }) : json({ ok: false, error: "Trend not found." }, 404);
  }
  if (request.method === "GET" && path === "/api/sources") return json({ ok: true, data: await getSources(env) });
  if (request.method === "GET" && path === "/api/social-signals") return json({ ok: true, data: await listSocialSignals(request, env) });
  if (request.method === "GET" && path === "/api/watchlist") {
    const result = await env.DB.prepare("SELECT * FROM watchlist ORDER BY active DESC, created_at ASC").all();
    return json({ ok: true, data: result.results || [] });
  }

  if (path.startsWith("/api/admin/")) {
    if (!isAuthorized(request, env)) return json({ ok: false, error: "Unauthorized." }, 401);
    if (request.method === "POST" && path === "/api/admin/collect") {
      const body = await request.json().catch(() => ({}));
      const source = body.source || "all";
      if (!["all", "google_trends", "youtube"].includes(source)) return json({ ok: false, error: "Invalid source." }, 400);
      return json({ ok: true, data: await runCollectors(env, source, true) });
    }
    if (request.method === "POST" && path === "/api/admin/signals") {
      return json({ ok: true, data: await addManualSignal(request, env) });
    }
    if (request.method === "POST" && path === "/api/admin/signals/bulk") {
      return json({ ok: true, data: await addManualSignalsBulk(request, env) });
    }
    if (request.method === "POST" && path === "/api/admin/watchlist") {
      const body = await request.json();
      const query = String(body?.query || "").trim();
      if (query.length < 2) return json({ ok: false, error: "Query is required." }, 400);
      const id = randomId("wl");
      await env.DB.prepare(`
        INSERT INTO watchlist (id, query, category, active, created_at)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(query) DO UPDATE SET active = 1, category = excluded.category
      `).bind(id, query, body.category || "Food", nowIso()).run();
      return json({ ok: true, data: { query } });
    }
    if (request.method === "DELETE" && path.startsWith("/api/admin/watchlist/")) {
      const id = decodeURIComponent(path.slice("/api/admin/watchlist/".length));
      await env.DB.prepare("UPDATE watchlist SET active = 0 WHERE id = ?").bind(id).run();
      return json({ ok: true, data: { id, active: false } });
    }
  }

  return json({
    ok: true,
    service: "BOGA Food Trend Radar API",
    endpoints: [
      "GET /api/health",
      "GET /api/stats",
      "GET /api/trends",
      "GET /api/trends/:id",
      "GET /api/sources",
      "GET /api/social-signals",
      "GET /api/watchlist",
      "POST /api/admin/collect",
      "POST /api/admin/signals",
      "POST /api/admin/signals/bulk",
      "POST /api/admin/watchlist",
    ],
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      return withCors(await handleApi(request, env), cors);
    } catch (error) {
      console.error(error);
      return withCors(json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500), cors);
    }
  },

  async scheduled(controller, env, ctx) {
    const runAt = new Date(controller.scheduledTime || Date.now());
    const shouldRunYouTube = runAt.getUTCHours() % 3 === 0;
    ctx.waitUntil(runCollectors(env, "all", shouldRunYouTube));
  },
};
