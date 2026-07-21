import { clamp, isoHourBucket, randomId, round } from "./utils.js";

function latestPerSource(observations) {
  const map = new Map();
  for (const observation of observations) {
    if (!map.has(observation.source)) map.set(observation.source, observation);
  }
  return map;
}

function calculateGrowth(observations, latestMap) {
  const values = [];
  for (const [source, latest] of latestMap.entries()) {
    const latestTime = new Date(latest.collected_at).getTime();
    const previous = observations.find((item) => {
      if (item.source !== source || item.id === latest.id) return false;
      const deltaHours = (latestTime - new Date(item.collected_at).getTime()) / 3_600_000;
      return deltaHours >= 6 && deltaHours <= 168 && Number(item.metric_value) > 0;
    });
    if (!previous) continue;
    const current = Number(latest.metric_value || 0);
    const base = Number(previous.metric_value || 0);
    if (base <= 0) continue;
    values.push(clamp(((current - base) / base) * 100, -100, 500));
  }
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateTrendScore(observations = []) {
  if (!observations.length) {
    return {
      viralScore: 0,
      momentumScore: 0,
      saturationScore: 0,
      confidenceScore: 0,
      growthPct: 0,
      lifecycle: "monitor",
      totalViews: 0,
      totalShares: 0,
      viewsPerHour: 0,
      engagementRate: 0,
      creatorCount: 0,
      postCount: 0,
      searchVolume: 0,
      sourceCount: 0,
      sourceList: [],
    };
  }

  const sorted = [...observations].sort((a, b) => new Date(b.collected_at) - new Date(a.collected_at));
  const latestMap = latestPerSource(sorted);
  const latest = [...latestMap.values()];
  const sourceList = [...latestMap.keys()];

  const totalViews = latest.reduce((sum, item) => sum + Number(item.views || 0), 0);
  const totalLikes = latest.reduce((sum, item) => sum + Number(item.likes || 0), 0);
  const totalComments = latest.reduce((sum, item) => sum + Number(item.comments || 0), 0);
  const totalShares = latest.reduce((sum, item) => sum + Number(item.shares || 0), 0);
  const viewsPerHour = latest.reduce((sum, item) => sum + Number(item.views_per_hour || 0), 0);
  const creatorCount = latest.reduce((sum, item) => sum + Number(item.creator_count || 0), 0);
  const postCount = latest.reduce((sum, item) => sum + Number(item.post_count || 0), 0);
  const searchVolume = latest.reduce((sum, item) => sum + Number(item.search_volume || 0), 0);
  const engagementRate = totalViews > 0
    ? (totalLikes + totalComments * 2 + totalShares * 3) / totalViews
    : 0;
  const growthPct = calculateGrowth(sorted, latestMap);

  const growthScore = growthPct > 0
    ? clamp(6 + Math.log10(growthPct + 1) * 8, 0, 25)
    : clamp(8 + growthPct / 8, 0, 25);
  const velocityScore = clamp((Math.log10(viewsPerHour + 1) / 5) * 15, 0, 15);
  const reachScore = clamp((Math.log10(totalViews + 1) / 8) * 15, 0, 15);
  const searchScore = clamp((Math.log10(searchVolume + 1) / 6) * 10, 0, 10);
  const engagementScore = clamp((engagementRate / 0.16) * 15, 0, 15);
  const creatorScore = clamp((Math.log10(creatorCount + 1) / 2.2) * 10, 0, 10);
  const sourceScore = clamp((sourceList.length / 3) * 10, 0, 10);

  const viralScore = clamp(
    growthScore + velocityScore + reachScore + searchScore + engagementScore + creatorScore + sourceScore,
    0,
    100,
  );
  const momentumScore = clamp(growthScore * 2.2 + velocityScore * 2.2, 0, 100);

  const maturity = clamp((Math.log10(totalViews + searchVolume + 1) / 8) * 60, 0, 60);
  const creatorMaturity = clamp((Math.log10(creatorCount + postCount + 1) / 3) * 25, 0, 25);
  const slowdown = growthPct < 15 ? clamp((15 - growthPct) * 0.7, 0, 25) : 0;
  const saturationScore = clamp(maturity + creatorMaturity + slowdown - Math.max(0, growthPct) * 0.08, 0, 100);
  const freshnessHours = Math.max(0, (Date.now() - new Date(sorted[0].collected_at).getTime()) / 3_600_000);
  const freshnessScore = clamp(100 - freshnessHours * 3, 20, 100);
  const confidenceScore = clamp(sourceList.length * 22 + Math.min(sorted.length, 10) * 4 + freshnessScore * 0.35, 0, 100);

  let lifecycle = "monitor";
  if (growthPct < -15 && (totalViews > 10_000 || searchVolume > 1_000)) lifecycle = "declining";
  else if (saturationScore >= 78 && growthPct < 12) lifecycle = "saturated";
  else if (viralScore >= 85 && (totalViews >= 250_000 || searchVolume >= 20_000)) lifecycle = "viral";
  else if (viralScore >= 72) lifecycle = "growing";
  else if (viralScore >= 58 && growthPct >= 15) lifecycle = "emerging";
  else if (growthPct >= 40 && viralScore >= 38) lifecycle = "early_signal";

  return {
    viralScore: round(viralScore),
    momentumScore: round(momentumScore),
    saturationScore: round(saturationScore),
    confidenceScore: round(confidenceScore),
    growthPct: round(growthPct),
    lifecycle,
    totalViews: Math.round(totalViews),
    totalShares: Math.round(totalShares),
    viewsPerHour: round(viewsPerHour),
    engagementRate: round(engagementRate * 100, 2),
    creatorCount: Math.round(creatorCount),
    postCount: Math.round(postCount),
    searchVolume: Math.round(searchVolume),
    sourceCount: sourceList.length,
    sourceList,
  };
}

export async function scoreTrend(env, trendId, capturedAt = new Date()) {
  const observationsResult = await env.DB.prepare(`
    SELECT * FROM observations
    WHERE trend_id = ? AND collected_at >= datetime('now', '-30 days')
    ORDER BY collected_at DESC
  `).bind(trendId).all();
  const observations = observationsResult.results || [];
  const score = calculateTrendScore(observations);
  const timestamp = capturedAt instanceof Date ? capturedAt.toISOString() : new Date(capturedAt).toISOString();
  await env.DB.prepare(`
    UPDATE trends SET
      lifecycle = ?, viral_score = ?, momentum_score = ?, saturation_score = ?, confidence_score = ?,
      growth_pct = ?, total_views = ?, total_shares = ?, views_per_hour = ?, engagement_rate = ?, creator_count = ?,
      post_count = ?, search_volume = ?, source_count = ?, source_list = ?, last_scored_at = ?
    WHERE id = ?
  `).bind(
    score.lifecycle,
    score.viralScore,
    score.momentumScore,
    score.saturationScore,
    score.confidenceScore,
    score.growthPct,
    score.totalViews,
    score.totalShares,
    score.viewsPerHour,
    score.engagementRate,
    score.creatorCount,
    score.postCount,
    score.searchVolume,
    score.sourceCount,
    JSON.stringify(score.sourceList),
    timestamp,
    trendId,
  ).run();

  const bucket = isoHourBucket(capturedAt);
  await env.DB.prepare(`
    INSERT INTO score_history (
      id, trend_id, captured_at, viral_score, momentum_score, saturation_score, growth_pct, lifecycle
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trend_id, captured_at) DO UPDATE SET
      viral_score = excluded.viral_score,
      momentum_score = excluded.momentum_score,
      saturation_score = excluded.saturation_score,
      growth_pct = excluded.growth_pct,
      lifecycle = excluded.lifecycle
  `).bind(
    randomId("score"),
    trendId,
    bucket,
    score.viralScore,
    score.momentumScore,
    score.saturationScore,
    score.growthPct,
    score.lifecycle,
  ).run();

  return score;
}

export async function scoreAllTrends(env, capturedAt = new Date()) {
  const result = await env.DB.prepare("SELECT id FROM trends WHERE is_active = 1").all();
  const rows = result.results || [];
  const scores = [];
  for (const row of rows) scores.push({ trendId: row.id, ...(await scoreTrend(env, row.id, capturedAt)) });
  return scores;
}
