/**
 * BOGA Trend Radar - optional shared backend for GitHub Pages.
 * Deploy as a Google Apps Script Web App.
 * Data is normalized into Google Sheets; secrets stay in Script Properties.
 */

const COLLECTIONS = ["trends", "observations", "experiments", "keywords", "alerts"];
const SHEET_PREFIX = "BTR_";

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "ping";
  try {
    if (action === "ping") return json_({ ok: true, data: { service: "BOGA Trend Radar API", timestamp: new Date().toISOString() } });
    return json_({ ok: false, error: "Use POST for this action." });
  } catch (error) {
    return json_({ ok: false, error: error.message, stack: error.stack });
  }
}

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    assertToken_(request.token || "");
    const payload = request.payload || {};
    let data;

    switch (request.action) {
      case "ping": data = { service: "BOGA Trend Radar API", timestamp: new Date().toISOString() }; break;
      case "loadState": data = loadState_(); break;
      case "saveState": data = saveState_(payload); break;
      case "collectYouTube": data = collectYouTube_(payload); break;
      case "syncBigQuery": data = syncBigQuery_(payload); break;
      default: throw new Error("Unknown action: " + request.action);
    }
    return json_({ ok: true, data: data });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: error.message, stack: error.stack });
  }
}

/** Run once from Apps Script editor. */
function setupProject() {
  const props = PropertiesService.getScriptProperties();
  let sheetId = props.getProperty("DATA_SHEET_ID");
  let spreadsheet;
  if (sheetId) {
    spreadsheet = SpreadsheetApp.openById(sheetId);
  } else {
    spreadsheet = SpreadsheetApp.create("BOGA Trend Radar Database");
    sheetId = spreadsheet.getId();
    props.setProperty("DATA_SHEET_ID", sheetId);
  }
  ensureSheets_(spreadsheet);
  console.log("Database sheet: " + spreadsheet.getUrl());
  console.log("Set API_TOKEN and YOUTUBE_API_KEY under Project Settings > Script Properties.");
  return spreadsheet.getUrl();
}

function createDailyYouTubeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) { return trigger.getHandlerFunction() === "scheduledYouTubeCollect"; })
    .forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger("scheduledYouTubeCollect").timeBased().everyDays(1).atHour(6).create();
}

function scheduledYouTubeCollect() {
  collectYouTube_({ maxKeywords: 10, maxResults: 10, daysBack: 7, region: "ID" });
}

function assertToken_(received) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_TOKEN") || "";
  if (expected && received !== expected) throw new Error("Unauthorized request.");
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty("DATA_SHEET_ID");
  if (!sheetId) throw new Error("DATA_SHEET_ID missing. Run setupProject() first.");
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  ensureSheets_(spreadsheet);
  return spreadsheet;
}

function ensureSheets_(spreadsheet) {
  COLLECTIONS.concat(["meta"]).forEach(function(name) {
    const sheetName = SHEET_PREFIX + name;
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1).setValue("json");
  });
  const defaultSheet = spreadsheet.getSheetByName("Sheet1");
  if (defaultSheet && spreadsheet.getSheets().length > 1) spreadsheet.deleteSheet(defaultSheet);
}

function readCollection_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(SHEET_PREFIX + name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
    .map(function(row) { return String(row[0] || "").trim(); })
    .filter(Boolean)
    .map(function(value) {
      try { return JSON.parse(value); } catch (error) { console.warn("Invalid JSON in " + name + ": " + error.message); return null; }
    })
    .filter(Boolean);
}

function writeCollection_(spreadsheet, name, rows) {
  const sheet = spreadsheet.getSheetByName(SHEET_PREFIX + name);
  sheet.clearContents();
  sheet.getRange(1, 1).setValue("json");
  if (!rows || !rows.length) return;
  const values = rows.map(function(item) { return [JSON.stringify(item)]; });
  sheet.getRange(2, 1, values.length, 1).setValues(values);
}

function loadState_() {
  const spreadsheet = getSpreadsheet_();
  const state = { version: 1 };
  COLLECTIONS.forEach(function(name) { state[name] = readCollection_(spreadsheet, name); });
  const metaRows = readCollection_(spreadsheet, "meta");
  state.meta = metaRows[0] || {};
  return state;
}

function saveState_(incoming) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    COLLECTIONS.forEach(function(name) { writeCollection_(spreadsheet, name, Array.isArray(incoming[name]) ? incoming[name] : []); });
    const meta = incoming.meta || {};
    meta.lastServerSave = new Date().toISOString();
    writeCollection_(spreadsheet, "meta", [meta]);
    SpreadsheetApp.flush();
    return { saved: true, timestamp: meta.lastServerSave };
  } finally {
    lock.releaseLock();
  }
}

function collectYouTube_(options) {
  options = options || {};
  const apiKey = PropertiesService.getScriptProperties().getProperty("YOUTUBE_API_KEY");
  if (!apiKey) throw new Error("YOUTUBE_API_KEY missing in Script Properties.");

  const state = loadState_();
  const keywords = (state.keywords || []).filter(function(item) { return item.active !== false; }).slice(0, Number(options.maxKeywords || 10));
  const maxResults = Math.max(1, Math.min(25, Number(options.maxResults || options.limit || 10)));
  const daysBack = Math.max(1, Math.min(30, Number(options.daysBack || 7)));
  const region = String(options.region || "ID").toUpperCase();
  const publishedAfter = new Date(Date.now() - daysBack * 86400000).toISOString();
  const runDate = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
  const summary = [];

  keywords.forEach(function(keyword) {
    const searchUrl = "https://www.googleapis.com/youtube/v3/search?" + toQuery_({
      key: apiKey, part: "snippet", q: keyword.keyword, type: "video", maxResults: maxResults,
      order: "date", regionCode: region, relevanceLanguage: "id", publishedAfter: publishedAfter
    });
    const searchData = fetchJson_(searchUrl);
    const ids = (searchData.items || []).map(function(item) { return item.id && item.id.videoId; }).filter(Boolean);
    if (!ids.length) {
      summary.push({ keyword: keyword.keyword, videos: 0 });
      return;
    }

    const videoUrl = "https://www.googleapis.com/youtube/v3/videos?" + toQuery_({
      key: apiKey, part: "snippet,statistics", id: ids.join(",")
    });
    const videoData = fetchJson_(videoUrl);
    let views = 0, likes = 0, comments = 0;
    const creators = {};
    (videoData.items || []).forEach(function(video) {
      const stats = video.statistics || {};
      views += Number(stats.viewCount || 0);
      likes += Number(stats.likeCount || 0);
      comments += Number(stats.commentCount || 0);
      creators[(video.snippet || {}).channelId || video.id] = true;
    });

    let trend = null;
    if (keyword.trend_id) trend = (state.trends || []).find(function(item) { return item.id === keyword.trend_id; });
    if (!trend) trend = (state.trends || []).find(function(item) { return item.name.toLowerCase() === String(keyword.keyword).toLowerCase(); });
    if (!trend) {
      trend = defaultTrend_(titleCase_(keyword.keyword), keyword.category || "Food");
      state.trends.push(trend);
      keyword.trend_id = trend.id;
    }

    const observation = {
      id: uniqueId_("ob"), trend_id: trend.id, source: "youtube", observed_on: runDate,
      views: views, likes: likes, comments: comments, post_count: ids.length,
      creator_count: Object.keys(creators).length, search_interest: 0, regional_relevance: 80,
      source_url: "https://www.youtube.com/watch?v=" + ids[0],
      notes: "Apps Script YouTube collector; keyword: " + keyword.keyword,
      created_at: new Date().toISOString()
    };
    const existingIndex = state.observations.findIndex(function(item) {
      return item.trend_id === trend.id && item.source === "youtube" && item.observed_on === runDate;
    });
    if (existingIndex >= 0) observation.id = state.observations[existingIndex].id;
    if (existingIndex >= 0) state.observations[existingIndex] = observation;
    else state.observations.push(observation);
    summary.push({ keyword: keyword.keyword, trend: trend.name, videos: ids.length, views: views, likes: likes, comments: comments, creators: Object.keys(creators).length });
  });

  state.meta = state.meta || {};
  state.meta.lastYouTubeCollection = new Date().toISOString();
  saveState_(state);
  return { summary: summary, state: state };
}

/**
 * Optional BigQuery sync. Required query columns:
 * experiment_id, sales_date, outlet, product_code, quantity,
 * net_sales, transactions, repeat_customers.
 */
function syncBigQuery_(options) {
  options = options || {};
  const props = PropertiesService.getScriptProperties();
  const projectId = options.projectId || props.getProperty("BIGQUERY_PROJECT_ID");
  const sql = options.sql || props.getProperty("BIGQUERY_SQL");
  if (!projectId || !sql) throw new Error("BIGQUERY_PROJECT_ID or BIGQUERY_SQL missing in Script Properties.");

  const request = { query: sql, useLegacySql: false, location: options.location || props.getProperty("BIGQUERY_LOCATION") || "asia-southeast2" };
  let result = BigQuery.Jobs.query(request, projectId);
  const jobId = result.jobReference.jobId;
  while (!result.jobComplete) {
    Utilities.sleep(500);
    result = BigQuery.Jobs.getQueryResults(projectId, jobId, { location: request.location });
  }
  const fields = ((result.schema || {}).fields || []).map(function(field) { return field.name; });
  const rows = (result.rows || []).map(function(row) {
    const obj = {};
    (row.f || []).forEach(function(cell, index) { obj[fields[index]] = cell.v; });
    return obj;
  });

  const state = loadState_();
  let imported = 0;
  rows.forEach(function(row) {
    const experiment = state.experiments.find(function(item) { return item.id === row.experiment_id; });
    if (!experiment) return;
    experiment.sales = Array.isArray(experiment.sales) ? experiment.sales : [];
    const key = [row.sales_date, row.outlet, row.product_code].join("|");
    if (experiment.sales.some(function(item) { return [item.sales_date, item.outlet, item.product_code].join("|") === key; })) return;
    experiment.sales.push({
      id: uniqueId_("sl"), sales_date: row.sales_date, outlet: row.outlet || "", product_code: row.product_code || "",
      quantity: Number(row.quantity || 0), net_sales: Number(row.net_sales || 0), transactions: Number(row.transactions || 0),
      repeat_customers: Number(row.repeat_customers || 0), created_at: new Date().toISOString()
    });
    imported += 1;
  });
  state.meta = state.meta || {};
  state.meta.lastBigQuerySync = new Date().toISOString();
  saveState_(state);
  return { rows: rows.length, imported: imported, state: state };
}

function defaultTrend_(name, category) {
  const now = new Date().toISOString();
  return {
    id: uniqueId_("tr"), name: name, category: category, origin_country: "Unknown", description: "Auto-created from keyword watchlist",
    status: "monitor", owner: "Boga Lab", brand_fit: 60, margin_potential: 60, production_ease: 60,
    ingredient_availability: 60, channel_fit: 60, visual_appeal: 60, differentiation: 60, repeat_potential: 60,
    created_at: now, updated_at: now
  };
}

function fetchJson_(url) {
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error("External API HTTP " + code + ": " + text.slice(0, 500));
  return JSON.parse(text);
}

function toQuery_(params) {
  return Object.keys(params).map(function(key) { return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]); }).join("&");
}

function titleCase_(text) {
  return String(text || "").replace(/\w\S*/g, function(word) { return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); });
}

function uniqueId_(prefix) {
  return prefix + "_" + new Date().getTime().toString(36) + "_" + Utilities.getUuid().slice(0, 8);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
