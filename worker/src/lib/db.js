import { nowIso, randomId, slugify } from "./utils.js";

export async function upsertTrend(env, input) {
  const timestamp = input.seenAt || nowIso();
  const slug = slugify(input.slug || input.name);
  const id = input.id || randomId("tr");
  await env.DB.prepare(`
    INSERT INTO trends (
      id, slug, name, category, first_detected_at, last_seen_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      category = CASE WHEN trends.category = 'Other' THEN excluded.category ELSE trends.category END,
      last_seen_at = excluded.last_seen_at,
      is_active = 1,
      metadata_json = excluded.metadata_json
  `).bind(
    id,
    slug,
    input.name,
    input.category || "Other",
    timestamp,
    timestamp,
    JSON.stringify(input.metadata || {}),
  ).run();
  return env.DB.prepare("SELECT * FROM trends WHERE slug = ?").bind(slug).first();
}

export async function insertObservation(env, input) {
  const id = input.id || randomId("ob");
  await env.DB.prepare(`
    INSERT INTO observations (
      id, trend_id, source, collected_at, metric_value, views, likes, comments,
      creator_count, post_count, search_volume, views_per_hour, engagement_rate, raw_json,
      shares, region, data_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.trendId,
    input.source,
    input.collectedAt || nowIso(),
    Number(input.metricValue || 0),
    Math.round(Number(input.views || 0)),
    Math.round(Number(input.likes || 0)),
    Math.round(Number(input.comments || 0)),
    Math.round(Number(input.creatorCount || 0)),
    Math.round(Number(input.postCount || 0)),
    Math.round(Number(input.searchVolume || 0)),
    Number(input.viewsPerHour || 0),
    Number(input.engagementRate || 0),
    JSON.stringify(input.raw || {}),
    Math.round(Number(input.shares || 0)),
    String(input.region || "ID").toUpperCase(),
    input.dataMode || "api",
  ).run();
  return id;
}

export async function insertEvidence(env, input) {
  const id = input.id || randomId("ev");
  if (!input.url) return null;
  await env.DB.prepare(`
    INSERT INTO evidence (
      id, trend_id, source, title, url, creator, published_at, views, likes,
      comments, thumbnail_url, collected_at, metadata_json, shares, data_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trend_id, source, url) DO UPDATE SET
      title = excluded.title,
      creator = excluded.creator,
      published_at = excluded.published_at,
      views = excluded.views,
      likes = excluded.likes,
      comments = excluded.comments,
      thumbnail_url = excluded.thumbnail_url,
      collected_at = excluded.collected_at,
      metadata_json = excluded.metadata_json,
      shares = excluded.shares,
      data_mode = excluded.data_mode
  `).bind(
    id,
    input.trendId,
    input.source,
    input.title || "Evidence",
    input.url,
    input.creator || "",
    input.publishedAt || null,
    Math.round(Number(input.views || 0)),
    Math.round(Number(input.likes || 0)),
    Math.round(Number(input.comments || 0)),
    input.thumbnailUrl || null,
    input.collectedAt || nowIso(),
    JSON.stringify(input.metadata || {}),
    Math.round(Number(input.shares || 0)),
    input.dataMode || "api",
  ).run();
  return id;
}

export async function startCollectorRun(env, source) {
  const id = randomId("run");
  await env.DB.prepare(`
    INSERT INTO collector_runs (id, source, started_at, status)
    VALUES (?, ?, ?, 'running')
  `).bind(id, source, nowIso()).run();
  return id;
}

export async function finishCollectorRun(env, id, data = {}) {
  await env.DB.prepare(`
    UPDATE collector_runs
    SET completed_at = ?, status = ?, items_found = ?, items_saved = ?, error_message = ?
    WHERE id = ?
  `).bind(
    nowIso(),
    data.status || "success",
    Number(data.itemsFound || 0),
    Number(data.itemsSaved || 0),
    data.errorMessage || null,
    id,
  ).run();
}

export async function getWatchlist(env, limit = 20) {
  const result = await env.DB.prepare(`
    SELECT id, query, category, active, created_at
    FROM watchlist
    WHERE active = 1
    ORDER BY created_at ASC
    LIMIT ?
  `).bind(limit).all();
  return result.results || [];
}

export async function cleanupOldData(env) {
  const retention = Math.max(14, Number(env.DATA_RETENTION_DAYS || 90));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM observations WHERE collected_at < datetime('now', ?)").bind(`-${retention} days`),
    env.DB.prepare("DELETE FROM score_history WHERE captured_at < datetime('now', ?)").bind(`-${retention} days`),
    env.DB.prepare("DELETE FROM evidence WHERE collected_at < datetime('now', '-45 days')"),
    env.DB.prepare("DELETE FROM collector_runs WHERE started_at < datetime('now', '-30 days')"),
    env.DB.prepare("UPDATE trends SET is_active = 0 WHERE last_seen_at < datetime('now', '-14 days')"),
  ]);
}
