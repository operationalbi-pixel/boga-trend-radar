import { extractFoodCandidates } from "../lib/food-taxonomy.js";
import { finishCollectorRun, getWatchlist, insertEvidence, insertObservation, startCollectorRun, upsertTrend } from "../lib/db.js";
import { fetchWithTimeout, hoursBetween, nowIso } from "../lib/utils.js";

async function youtubeRequest(path, params, apiKey) {
  const query = new URLSearchParams({ ...params, key: apiKey });
  const response = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/${path}?${query}`, {
    headers: { accept: "application/json" },
  }, 25_000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `YouTube API returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function videoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function aggregateCandidate(map, candidate, video, query) {
  const key = candidate.name.toLowerCase();
  if (!map.has(key)) {
    map.set(key, {
      name: candidate.name,
      category: candidate.category,
      confidence: candidate.confidence,
      views: 0,
      likes: 0,
      comments: 0,
      posts: 0,
      creators: new Set(),
      viewsPerHour: 0,
      evidence: [],
      queries: new Set(),
    });
  }
  const item = map.get(key);
  const stats = video.statistics || {};
  const snippet = video.snippet || {};
  const views = Number(stats.viewCount || 0);
  const likes = Number(stats.likeCount || 0);
  const comments = Number(stats.commentCount || 0);
  const ageHours = hoursBetween(snippet.publishedAt || new Date());
  item.views += views;
  item.likes += likes;
  item.comments += comments;
  item.posts += 1;
  item.viewsPerHour += views / ageHours;
  item.creators.add(snippet.channelId || snippet.channelTitle || video.id);
  item.queries.add(query);
  item.confidence = Math.max(item.confidence, candidate.confidence);
  item.evidence.push({
    id: video.id,
    title: snippet.title || candidate.name,
    creator: snippet.channelTitle || "",
    publishedAt: snippet.publishedAt || null,
    views,
    likes,
    comments,
    thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
  });
}

function collapseCandidates(aggregates) {
  const sorted = [...aggregates.values()].sort((a, b) => {
    const scoreA = a.viewsPerHour + a.views * 0.01 + a.posts * 500 + a.creators.size * 1000;
    const scoreB = b.viewsPerHour + b.views * 0.01 + b.posts * 500 + b.creators.size * 1000;
    return scoreB - scoreA;
  });
  const selected = [];
  for (const candidate of sorted) {
    const normalized = candidate.name.toLowerCase();
    const duplicate = selected.some((existing) => {
      const other = existing.name.toLowerCase();
      return normalized === other || (normalized.includes(other) && other.split(" ").length >= 2) || (other.includes(normalized) && normalized.split(" ").length >= 2);
    });
    if (!duplicate) selected.push(candidate);
  }
  return selected;
}

export async function collectYouTube(env) {
  const runId = await startCollectorRun(env, "youtube");
  let itemsFound = 0;
  let itemsSaved = 0;
  try {
    const apiKey = String(env.YOUTUBE_API_KEY || "");
    if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured.");
    const maxQueries = Math.max(1, Math.min(12, Number(env.MAX_YOUTUBE_QUERIES || 6)));
    const watchlist = await getWatchlist(env, maxQueries);
    if (!watchlist.length) throw new Error("No active watchlist queries found.");

    const region = String(env.YOUTUBE_REGION || "ID").toUpperCase();
    const language = String(env.YOUTUBE_LANGUAGE || "id");
    const daysBack = Math.max(1, Math.min(30, Number(env.YOUTUBE_DAYS_BACK || 7)));
    const publishedAfter = new Date(Date.now() - daysBack * 86_400_000).toISOString();
    const aggregates = new Map();

    for (const watch of watchlist) {
      const searchData = await youtubeRequest("search", {
        part: "snippet",
        q: watch.query,
        type: "video",
        maxResults: "25",
        order: "date",
        regionCode: region,
        relevanceLanguage: language,
        publishedAfter,
        safeSearch: "moderate",
      }, apiKey);
      const ids = (searchData.items || []).map((item) => item.id?.videoId).filter(Boolean);
      itemsFound += ids.length;
      if (!ids.length) continue;
      const detailData = await youtubeRequest("videos", {
        part: "snippet,statistics",
        id: ids.join(","),
      }, apiKey);
      for (const video of detailData.items || []) {
        const candidates = extractFoodCandidates(video.snippet?.title || "");
        for (const candidate of candidates) aggregateCandidate(aggregates, candidate, video, watch.query);
      }
    }

    const collectedAt = nowIso();
    const selected = collapseCandidates(aggregates)
      .filter((item) => item.posts >= 1 && (item.views >= 1_000 || item.viewsPerHour >= 100))
      .slice(0, 60);

    for (const item of selected) {
      const trend = await upsertTrend(env, {
        name: item.name,
        category: item.category,
        seenAt: collectedAt,
        metadata: {
          discoverySource: "youtube",
          extractionConfidence: item.confidence,
          queries: [...item.queries],
          region,
          daysBack,
        },
      });
      const engagementRate = item.views > 0 ? (item.likes + item.comments * 2) / item.views : 0;
      const metricValue = item.viewsPerHour > 0 ? item.viewsPerHour : item.views;
      await insertObservation(env, {
        trendId: trend.id,
        source: "youtube",
        collectedAt,
        metricValue,
        views: item.views,
        likes: item.likes,
        comments: item.comments,
        creatorCount: item.creators.size,
        postCount: item.posts,
        viewsPerHour: item.viewsPerHour,
        engagementRate,
        raw: {
          queries: [...item.queries],
          extractionConfidence: item.confidence,
          daysBack,
          region,
        },
      });
      for (const evidence of item.evidence.sort((a, b) => b.views - a.views).slice(0, 5)) {
        await insertEvidence(env, {
          trendId: trend.id,
          source: "youtube",
          title: evidence.title,
          url: videoUrl(evidence.id),
          creator: evidence.creator,
          publishedAt: evidence.publishedAt,
          views: evidence.views,
          likes: evidence.likes,
          comments: evidence.comments,
          thumbnailUrl: evidence.thumbnailUrl,
          collectedAt,
          metadata: { queries: [...item.queries] },
        });
      }
      itemsSaved += 1;
    }

    await finishCollectorRun(env, runId, { status: "success", itemsFound, itemsSaved });
    return { source: "youtube", itemsFound, itemsSaved, queries: watchlist.length };
  } catch (error) {
    await finishCollectorRun(env, runId, {
      status: "failed",
      itemsFound,
      itemsSaved,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
