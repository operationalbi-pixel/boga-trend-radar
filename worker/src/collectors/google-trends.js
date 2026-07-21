import { classifyFood, isFoodText } from "../lib/food-taxonomy.js";
import { finishCollectorRun, insertEvidence, insertObservation, startCollectorRun, upsertTrend } from "../lib/db.js";
import { decodeHtml, fetchWithTimeout, nowIso, parseApproxNumber } from "../lib/utils.js";

function tagValue(block, tagName) {
  const escaped = tagName.replace(":", "\\:");
  const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeHtml(match[1].trim()) : "";
}

function tagValues(block, tagName) {
  const escaped = tagName.replace(":", "\\:");
  const regex = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  return [...block.matchAll(regex)].map((match) => decodeHtml(match[1].trim()));
}

export function parseGoogleTrendsRss(xml = "") {
  const items = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  return items.map((block) => {
    const newsTitles = tagValues(block, "ht:news_item_title");
    const newsUrls = tagValues(block, "ht:news_item_url");
    return {
      title: tagValue(block, "title"),
      approxTrafficText: tagValue(block, "ht:approx_traffic"),
      approxTraffic: parseApproxNumber(tagValue(block, "ht:approx_traffic")),
      pubDate: tagValue(block, "pubDate"),
      picture: tagValue(block, "ht:picture"),
      description: tagValue(block, "description"),
      news: newsTitles.map((title, index) => ({ title, url: newsUrls[index] || "" })).filter((item) => item.title),
    };
  }).filter((item) => item.title);
}

export async function collectGoogleTrends(env) {
  const runId = await startCollectorRun(env, "google_trends");
  let itemsFound = 0;
  let itemsSaved = 0;
  try {
    const geo = String(env.GOOGLE_TRENDS_GEO || "ID").toUpperCase();
    const feedUrls = [
      `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`,
      `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${encodeURIComponent(geo)}`,
    ];
    let xml = "";
    let lastError = "Google Trends RSS unavailable.";
    for (const url of feedUrls) {
      try {
        const response = await fetchWithTimeout(url, {
          headers: {
            "user-agent": "Mozilla/5.0 (compatible; BOGAFoodTrendRadar/1.0)",
            "accept": "application/rss+xml,application/xml,text/xml,*/*",
          },
        }, 25_000);
        if (!response.ok) {
          lastError = `Google Trends RSS returned HTTP ${response.status}`;
          continue;
        }
        xml = await response.text();
        if (xml.includes("<item>")) break;
        lastError = "Google Trends RSS returned no items.";
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!xml || !xml.includes("<item>")) throw new Error(lastError);
    const parsed = parseGoogleTrendsRss(xml);
    itemsFound = parsed.length;
    const collectedAt = nowIso();

    for (const item of parsed) {
      const evidenceText = [item.title, item.description, ...item.news.map((news) => news.title)].join(" ");
      if (!isFoodText(evidenceText)) continue;
      const trend = await upsertTrend(env, {
        name: item.title,
        category: classifyFood(evidenceText),
        seenAt: collectedAt,
        metadata: {
          discoverySource: "google_trends",
          approxTrafficText: item.approxTrafficText,
          geo,
        },
      });
      await insertObservation(env, {
        trendId: trend.id,
        source: "google_trends",
        collectedAt,
        metricValue: item.approxTraffic,
        searchVolume: item.approxTraffic,
        postCount: item.news.length,
        raw: item,
      });
      const primaryUrl = item.news.find((news) => news.url)?.url || `https://trends.google.com/trending?geo=${geo}`;
      await insertEvidence(env, {
        trendId: trend.id,
        source: "google_trends",
        title: item.title,
        url: primaryUrl,
        publishedAt: item.pubDate || collectedAt,
        thumbnailUrl: item.picture || null,
        collectedAt,
        metadata: { approxTraffic: item.approxTraffic, approxTrafficText: item.approxTrafficText },
      });
      for (const news of item.news.slice(0, 3)) {
        if (!news.url) continue;
        await insertEvidence(env, {
          trendId: trend.id,
          source: "news",
          title: news.title,
          url: news.url,
          publishedAt: item.pubDate || collectedAt,
          collectedAt,
          metadata: { discoveredVia: "google_trends" },
        });
      }
      itemsSaved += 1;
    }

    await finishCollectorRun(env, runId, { status: "success", itemsFound, itemsSaved });
    return { source: "google_trends", itemsFound, itemsSaved };
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
