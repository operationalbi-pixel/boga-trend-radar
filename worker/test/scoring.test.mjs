import test from "node:test";
import assert from "node:assert/strict";
import { calculateTrendScore } from "../src/lib/scoring.js";
import { extractFoodCandidates, classifyFood, isFoodText } from "../src/lib/food-taxonomy.js";
import { parseGoogleTrendsRss } from "../src/collectors/google-trends.js";

const now = new Date("2026-07-21T12:00:00.000Z");
const earlier = new Date("2026-07-20T12:00:00.000Z");

test("food taxonomy detects and classifies food titles", () => {
  assert.equal(isFoodText("Strawberry Pistachio Chocolate Cup viral"), true);
  assert.equal(classifyFood("Mochi Croissant Pastry"), "Pastry");
  const candidates = extractFoodCandidates("Strawberry Dubai Chocolate Cup Viral Banget #shorts");
  assert.ok(candidates.length >= 1);
  assert.match(candidates[0].name, /Chocolate|Strawberry|Cup/i);
});

test("Google Trends RSS parser reads traffic and news", () => {
  const xml = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel><item>
    <title><![CDATA[matcha tiramisu]]></title>
    <ht:approx_traffic>20K+</ht:approx_traffic>
    <pubDate>Tue, 21 Jul 2026 10:00:00 GMT</pubDate>
    <ht:news_item_title><![CDATA[Matcha tiramisu is rising]]></ht:news_item_title>
    <ht:news_item_url>https://example.com/article</ht:news_item_url>
  </item></channel></rss>`;
  const result = parseGoogleTrendsRss(xml);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "matcha tiramisu");
  assert.equal(result[0].approxTraffic, 20000);
  assert.equal(result[0].news[0].url, "https://example.com/article");
});

test("score rises with growth, reach, engagement and source confirmation", () => {
  const observations = [
    {
      id: "yt-new", source: "youtube", collected_at: now.toISOString(), metric_value: 12000,
      views: 800000, likes: 90000, comments: 6000, shares: 18000, creator_count: 45, post_count: 60,
      search_volume: 0, views_per_hour: 12000,
    },
    {
      id: "yt-old", source: "youtube", collected_at: earlier.toISOString(), metric_value: 4000,
      views: 250000, likes: 20000, comments: 1500, shares: 2500, creator_count: 18, post_count: 25,
      search_volume: 0, views_per_hour: 4000,
    },
    {
      id: "gt-new", source: "google_trends", collected_at: now.toISOString(), metric_value: 20000,
      views: 0, likes: 0, comments: 0, shares: 0, creator_count: 0, post_count: 3,
      search_volume: 20000, views_per_hour: 0,
    },
    {
      id: "gt-old", source: "google_trends", collected_at: earlier.toISOString(), metric_value: 5000,
      views: 0, likes: 0, comments: 0, shares: 0, creator_count: 0, post_count: 2,
      search_volume: 5000, views_per_hour: 0,
    },
  ];
  const score = calculateTrendScore(observations);
  assert.ok(score.viralScore > 65, `score was ${score.viralScore}`);
  assert.ok(score.growthPct > 100);
  assert.equal(score.sourceCount, 2);
  assert.equal(score.totalShares, 18000);
  assert.ok(["emerging", "growing", "viral"].includes(score.lifecycle));
});
