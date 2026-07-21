const config = window.TREND_RADAR_CONFIG || {};
const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");
const isConfigured = Boolean(apiBaseUrl && !apiBaseUrl.includes("PASTE-YOUR-WORKER"));
const locale = config.locale || "id-ID";
const timezone = config.timezone || "Asia/Jakarta";

const state = {
  stats: null,
  trends: [],
  sources: [],
  socialSignals: [],
  currentTab: "dashboard",
  loading: false,
  filters: { q: "", lifecycle: "", category: "", source: "", sort: "score" },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeUrl(value = "") {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function compactNumber(value) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function percent(value, digits = 1) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}%`;
}

function formatDate(value, withTime = true) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(locale, withTime
      ? { dateStyle: "medium", timeStyle: "short", timeZone: timezone }
      : { dateStyle: "medium", timeZone: timezone }).format(new Date(value));
  } catch { return "—"; }
}

function relativeTime(value) {
  if (!value) return "belum pernah";
  const diffSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units = [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60], ["second", 1]];
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds || unit === "second") return formatter.format(Math.round(diffSeconds / seconds), unit);
  }
  return "baru saja";
}

function lifecycleLabel(value) {
  return ({ early_signal: "Early Signal", emerging: "Emerging", growing: "Growing", viral: "Viral", saturated: "Saturated", declining: "Declining", monitor: "Monitor" })[value] || value || "Monitor";
}

function sourceLabel(value) {
  return ({ google_trends: "Google Trends", youtube: "YouTube", news: "News", tiktok: "TikTok", instagram: "Instagram" })[value] || value;
}

function sourceIcon(value) {
  return ({ google_trends: "G", youtube: "▶", tiktok: "♪", instagram: "◎" })[value] || "•";
}

function freshnessClass(value) {
  if (!value) return "stale";
  const hours = (Date.now() - new Date(value).getTime()) / 3_600_000;
  if (hours <= 4) return "fresh";
  if (hours <= 24) return "aging";
  return "stale";
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function api(path, options = {}) {
  if (!isConfigured) throw new Error("API belum dikonfigurasi di site/config.js");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload.data ?? payload;
}

function setLiveStatus(type, text) {
  const element = $("#liveStatus");
  element.className = `status-pill status-${type}`;
  element.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(text)}</span>`;
}

function showToast(message, type = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  setTimeout(() => toast.classList.add("hidden"), 3500);
}

function emptyCards(message) {
  return `<div class="empty-card"><strong>No data yet</strong><span>${escapeHtml(message)}</span></div>`;
}

function renderKpis() {
  const stats = state.stats || {};
  const cards = [
    ["Active Trends", stats.active || 0, "Sinyal aktif dalam 14 hari"],
    ["Early Signals", stats.early || 0, "Momentum tumbuh sebelum viral"],
    ["Viral Now", stats.viral || 0, "Score tinggi dan volume kuat"],
    ["Avg Viral Score", Number(stats.averageScore || 0).toFixed(1), "Rata-rata tren aktif"],
  ];
  $("#kpiGrid").classList.remove("skeleton-grid");
  $("#kpiGrid").innerHTML = cards.map(([label, value, note]) => `<article class="kpi-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join("");
}

function trendCard(trend) {
  const sources = Array.isArray(trend.source_list) ? trend.source_list : [];
  return `<button class="trend-card" data-trend-id="${escapeHtml(trend.id)}" type="button">
    <div class="trend-card-top"><span class="lifecycle lifecycle-${escapeHtml(trend.lifecycle)}">${escapeHtml(lifecycleLabel(trend.lifecycle))}</span><span class="score-ring">${Number(trend.viral_score || 0).toFixed(0)}</span></div>
    <div><p class="trend-category">${escapeHtml(trend.category || "Other")}</p><h3>${escapeHtml(trend.name)}</h3></div>
    <div class="trend-metrics"><div><span>Momentum</span><strong>${Number(trend.momentum_score || 0).toFixed(0)}</strong></div>
      <div><span>Growth</span><strong class="${Number(trend.growth_pct || 0) >= 0 ? "positive" : "negative"}">${escapeHtml(percent(trend.growth_pct || 0))}</strong></div>
      <div><span>Reach</span><strong>${compactNumber((trend.total_views || 0) + (trend.search_volume || 0))}</strong></div></div>
    <div class="trend-card-footer"><div class="source-tags">${sources.slice(0, 3).map((source) => `<span>${escapeHtml(sourceLabel(source))}</span>`).join("") || "<span>No source</span>"}</div><time>${escapeHtml(relativeTime(trend.last_seen_at))}</time></div>
  </button>`;
}

function renderDashboard() {
  renderKpis();
  const early = state.trends.filter((item) => ["early_signal", "emerging"].includes(item.lifecycle)).slice(0, 6);
  const viral = state.trends.filter((item) => ["viral", "growing"].includes(item.lifecycle)).slice(0, 6);
  $("#earlySignals").innerHTML = early.length ? early.map(trendCard).join("") : emptyCards("Belum ada early signal. Dibutuhkan minimal dua snapshot sumber yang sama untuk menghitung growth.");
  $("#viralGrowing").innerHTML = viral.length ? viral.map(trendCard).join("") : emptyCards("Belum ada trend viral atau growing.");

  const momentum = [...state.trends].sort((a, b) => b.momentum_score - a.momentum_score).slice(0, 7);
  $("#momentumList").innerHTML = momentum.length ? momentum.map((trend, index) => `<button data-trend-id="${escapeHtml(trend.id)}" type="button"><span class="rank">${index + 1}</span><span class="compact-name"><strong>${escapeHtml(trend.name)}</strong><small>${escapeHtml(trend.category)}</small></span><span class="compact-value">${Number(trend.momentum_score || 0).toFixed(0)}</span></button>`).join("") : `<div class="empty-inline">Belum ada data.</div>`;

  const categories = state.stats?.category || [];
  const max = Math.max(...categories.map((item) => Number(item.count || 0)), 1);
  $("#categoryPulse").innerHTML = categories.length ? categories.map((item) => `<div class="category-row"><div><span>${escapeHtml(item.category)}</span><strong>${item.count}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${(Number(item.count) / max) * 100}%"></div></div></div>`).join("") : `<div class="empty-inline">Belum ada kategori.</div>`;
  $("#freshnessText").textContent = state.stats?.lastCollectedAt ? `Last collected ${relativeTime(state.stats.lastCollectedAt)} · ${formatDate(state.stats.lastCollectedAt)}` : "Belum ada data. Jalankan Collect All dan masukkan TikTok/Instagram signal.";
  bindTrendOpeners();
}

function renderCategoryOptions() {
  const categories = [...new Set(state.trends.map((item) => item.category).filter(Boolean))].sort();
  const select = $("#categoryFilter");
  const current = select.value;
  select.innerHTML = `<option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  select.value = categories.includes(current) ? current : "";
}

function renderTrendsTable() {
  renderCategoryOptions();
  const filtered = state.trends.filter((trend) => {
    const sources = Array.isArray(trend.source_list) ? trend.source_list : [];
    return (!state.filters.q || `${trend.name} ${trend.category}`.toLowerCase().includes(state.filters.q.toLowerCase()))
      && (!state.filters.lifecycle || trend.lifecycle === state.filters.lifecycle)
      && (!state.filters.category || trend.category === state.filters.category)
      && (!state.filters.source || sources.includes(state.filters.source));
  });
  const sorted = [...filtered].sort((a, b) => {
    if (state.filters.sort === "momentum") return b.momentum_score - a.momentum_score;
    if (state.filters.sort === "growth") return b.growth_pct - a.growth_pct;
    if (state.filters.sort === "newest") return new Date(b.first_detected_at) - new Date(a.first_detected_at);
    if (state.filters.sort === "updated") return new Date(b.last_seen_at) - new Date(a.last_seen_at);
    return b.viral_score - a.viral_score;
  });
  $("#trendsTableBody").innerHTML = sorted.map((trend) => {
    const sources = Array.isArray(trend.source_list) ? trend.source_list : [];
    return `<tr data-trend-id="${escapeHtml(trend.id)}"><td><div class="table-trend"><strong>${escapeHtml(trend.name)}</strong><span>${escapeHtml(trend.category)}</span></div></td>
      <td><span class="lifecycle lifecycle-${escapeHtml(trend.lifecycle)}">${escapeHtml(lifecycleLabel(trend.lifecycle))}</span></td><td><strong class="table-score">${Number(trend.viral_score || 0).toFixed(0)}</strong></td>
      <td>${Number(trend.momentum_score || 0).toFixed(0)}</td><td class="${Number(trend.growth_pct || 0) >= 0 ? "positive" : "negative"}">${escapeHtml(percent(trend.growth_pct || 0))}</td>
      <td>${compactNumber((trend.total_views || 0) + (trend.search_volume || 0))}</td><td><div class="source-tags">${sources.slice(0, 2).map((source) => `<span>${escapeHtml(sourceLabel(source))}</span>`).join("")}</div></td>
      <td><span title="${escapeHtml(formatDate(trend.last_seen_at))}">${escapeHtml(relativeTime(trend.last_seen_at))}</span></td></tr>`;
  }).join("");
  $("#tableEmpty").classList.toggle("hidden", sorted.length > 0);
  bindTrendOpeners();
}

function renderSources() {
  $("#sourceCards").innerHTML = state.sources.map((source) => {
    const last = source.last_observation_at || source.completed_at || source.started_at;
    const status = source.status || "not_run";
    return `<article class="source-card"><div class="source-card-top"><span class="source-icon">${escapeHtml(sourceIcon(source.source))}</span><span class="source-status source-${escapeHtml(status)}">${escapeHtml(status.replaceAll("_", " "))}</span></div>
      <h3>${escapeHtml(sourceLabel(source.source))}</h3><p>${escapeHtml(source.description || "")}</p>
      <div class="source-mode">${source.mode === "automatic" ? "LIVE API / RSS" : "MANUAL VERIFIED"}</div>
      <dl><div><dt>Frequency</dt><dd>${escapeHtml(source.frequency || "—")}</dd></div><div><dt>Last data</dt><dd>${escapeHtml(last ? relativeTime(last) : "Belum pernah")}</dd></div>
        <div><dt>Trends 30d</dt><dd>${Number(source.trends_30d || 0)}</dd></div><div><dt>Signals 30d</dt><dd>${Number(source.observations_30d || 0)}</dd></div></dl>
      ${source.error_message ? `<div class="source-error">${escapeHtml(source.error_message)}</div>` : ""}</article>`;
  }).join("") || emptyCards("Belum ada source information.");
}

function renderSocialSignals() {
  $("#socialSignalsBody").innerHTML = state.socialSignals.map((item) => {
    const url = safeUrl(item.evidence_url);
    return `<tr><td><span title="${escapeHtml(formatDate(item.collected_at))}">${escapeHtml(relativeTime(item.collected_at))}</span></td>
      <td><span class="source-chip source-chip-${escapeHtml(item.source)}">${escapeHtml(sourceLabel(item.source))}</span></td>
      <td><button class="link-button" data-trend-id="${escapeHtml(item.trend_id)}" type="button"><strong>${escapeHtml(item.trend_name)}</strong><small>${escapeHtml(item.category)}</small></button></td>
      <td>${compactNumber(item.views)}</td><td>${Number(item.engagement_rate || 0).toFixed(2)}%</td><td>${compactNumber(item.shares)}</td><td>${compactNumber(item.creator_count)}</td>
      <td>${url ? `<a class="evidence-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : "—"}</td></tr>`;
  }).join("");
  $("#socialEmpty").classList.toggle("hidden", state.socialSignals.length > 0);
  bindTrendOpeners();
}

function renderSparkline(history = []) {
  if (!history.length) return `<div class="empty-chart">Histori score akan muncul setelah beberapa collector run.</div>`;
  const width = 680; const height = 180; const padding = 18;
  const values = history.map((item) => Number(item.viral_score || 0));
  const min = Math.min(...values, 0); const max = Math.max(...values, 100); const range = Math.max(1, max - min);
  const points = history.map((item, index) => {
    const x = padding + (index / Math.max(1, history.length - 1)) * (width - padding * 2);
    const y = height - padding - ((Number(item.viral_score || 0) - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="score-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Viral score history"><line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis"/><line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" class="chart-axis"/><polyline points="${points}" class="chart-line"/></svg>`;
}

async function openTrend(trendId) {
  $("#drawerBackdrop").classList.remove("hidden");
  $("#trendDrawer").classList.add("open");
  $("#trendDrawer").setAttribute("aria-hidden", "false");
  $("#trendDetailContent").innerHTML = `<div class="drawer-loading">Loading trend detail…</div>`;
  try {
    const detail = await api(`/api/trends/${encodeURIComponent(trendId)}`);
    const trend = detail.trend; const sources = Array.isArray(trend.source_list) ? trend.source_list : [];
    $("#trendDetailContent").innerHTML = `<div class="drawer-hero"><div class="drawer-badges"><span class="lifecycle lifecycle-${escapeHtml(trend.lifecycle)}">${escapeHtml(lifecycleLabel(trend.lifecycle))}</span><span>${escapeHtml(trend.category)}</span></div>
      <h2>${escapeHtml(trend.name)}</h2><p>First detected ${escapeHtml(formatDate(trend.first_detected_at))} · Last seen ${escapeHtml(relativeTime(trend.last_seen_at))}</p></div>
      <div class="detail-score-grid"><div><span>Viral Score</span><strong>${Number(trend.viral_score || 0).toFixed(0)}</strong></div><div><span>Momentum</span><strong>${Number(trend.momentum_score || 0).toFixed(0)}</strong></div>
        <div><span>Growth</span><strong class="${Number(trend.growth_pct || 0) >= 0 ? "positive" : "negative"}">${escapeHtml(percent(trend.growth_pct || 0))}</strong></div><div><span>Confidence</span><strong>${Number(trend.confidence_score || 0).toFixed(0)}</strong></div></div>
      <section class="drawer-section"><div class="drawer-section-heading"><h3>Score History</h3><span>${detail.scoreHistory.length} snapshots</span></div>${renderSparkline(detail.scoreHistory)}</section>
      <section class="drawer-section"><h3>Signal Summary</h3><div class="signal-grid"><div><span>Total views</span><strong>${compactNumber(trend.total_views)}</strong></div><div><span>Total shares</span><strong>${compactNumber(trend.total_shares)}</strong></div>
        <div><span>Views/hour</span><strong>${compactNumber(trend.views_per_hour)}</strong></div><div><span>Engagement</span><strong>${Number(trend.engagement_rate || 0).toFixed(2)}%</strong></div>
        <div><span>Creators</span><strong>${compactNumber(trend.creator_count)}</strong></div><div><span>Posts/videos</span><strong>${compactNumber(trend.post_count)}</strong></div><div><span>Search volume</span><strong>${compactNumber(trend.search_volume)}</strong></div></div>
        <div class="source-tags detail-tags">${sources.map((source) => `<span>${escapeHtml(sourceLabel(source))}</span>`).join("")}</div></section>
      <section class="drawer-section"><div class="drawer-section-heading"><h3>Evidence</h3><span>${detail.evidence.length} items</span></div><div class="evidence-list">
        ${detail.evidence.length ? detail.evidence.map((item) => { const url = safeUrl(item.url); return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${item.thumbnail_url ? `<img src="${escapeHtml(safeUrl(item.thumbnail_url))}" alt="" loading="lazy">` : `<div class="evidence-placeholder">${escapeHtml(sourceLabel(item.source).charAt(0))}</div>`}<div><span>${escapeHtml(sourceLabel(item.source))} · ${item.data_mode === "manual_verified" ? "Manual Verified" : "Live"}</span><strong>${escapeHtml(item.title)}</strong><small>${item.creator ? `${escapeHtml(item.creator)} · ` : ""}${escapeHtml(item.published_at ? formatDate(item.published_at, false) : formatDate(item.collected_at, false))}</small></div><b>↗</b></a>` : ""; }).join("") : `<div class="empty-inline">Belum ada evidence.</div>`}
      </div></section>
      <section class="drawer-section"><h3>Latest Observations</h3><div class="observation-list">${detail.observations.slice(0, 12).map((item) => `<div><span>${escapeHtml(sourceLabel(item.source))} · ${item.data_mode === "manual_verified" ? "Verified" : "Live"}</span><strong>${compactNumber(item.metric_value)}</strong><small>${escapeHtml(formatDate(item.collected_at))}</small></div>`).join("")}</div></section>`;
  } catch (error) {
    $("#trendDetailContent").innerHTML = `<div class="drawer-error"><strong>Gagal memuat detail</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function closeTrend() {
  $("#drawerBackdrop").classList.add("hidden");
  $("#trendDrawer").classList.remove("open");
  $("#trendDrawer").setAttribute("aria-hidden", "true");
}

function bindTrendOpeners() {
  $$('[data-trend-id]').forEach((element) => { element.onclick = () => openTrend(element.dataset.trendId); });
}

function switchTab(tab) {
  state.currentTab = tab;
  $$(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${tab}Tab`));
  if (tab === "trends") renderTrendsTable();
  if (tab === "sources") renderSources();
  if (tab === "social") renderSocialSignals();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadData({ silent = false } = {}) {
  if (state.loading || !isConfigured) return;
  state.loading = true;
  if (!silent) setLiveStatus("loading", "Updating");
  try {
    const [health, stats, trendData, sources, socialSignals] = await Promise.all([
      api("/api/health"), api("/api/stats"), api(`/api/trends?limit=${Number(config.defaultLimit || 100)}&sort=score`), api("/api/sources"), api("/api/social-signals?limit=100").catch(() => []),
    ]);
    state.stats = stats; state.trends = trendData.items || []; state.sources = sources || []; state.socialSignals = socialSignals || [];
    setLiveStatus(freshnessClass(health.lastCollectedAt), health.lastCollectedAt ? `Live · ${relativeTime(health.lastCollectedAt)}` : "Live · no data");
    renderDashboard(); renderTrendsTable(); renderSources(); renderSocialSignals();
  } catch (error) {
    setLiveStatus("error", "Connection error");
    if (!silent) showToast(error.message, "error");
  } finally { state.loading = false; }
}

function adminToken() {
  const candidates = [$("#socialAdminToken")?.value, $("#adminTokenInput")?.value, sessionStorage.getItem("trendRadarAdminToken")];
  const token = candidates.map((item) => String(item || "").trim()).find(Boolean) || "";
  if (token) sessionStorage.setItem("trendRadarAdminToken", token);
  return token;
}

async function adminApi(path, body, method = "POST") {
  const token = adminToken();
  if (!token) throw new Error("Isi admin token terlebih dahulu.");
  return api(path, { method, headers: { authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function collect(source) {
  const message = $("#adminMessage"); message.textContent = `Collecting ${source}…`;
  try {
    const result = await adminApi("/api/admin/collect", { source });
    const errorText = result.errors?.length ? ` · ${result.errors.map((item) => `${item.source}: ${item.error}`).join(" | ")}` : "";
    message.textContent = `Done. ${result.results?.reduce((sum, item) => sum + item.itemsSaved, 0) || 0} trends saved${errorText}`;
    await loadData({ silent: true });
  } catch (error) { message.textContent = error.message; }
}

function socialPayloadFromForm() {
  const trendName = $("#socialTrendName").value.trim();
  if (!trendName) throw new Error("Trend name wajib diisi.");
  return {
    trendName, source: $("#socialSource").value, category: $("#socialCategory").value || undefined,
    region: $("#socialRegion").value.trim() || "ID", creator: $("#socialCreator").value.trim(),
    views: Number($("#socialViews").value || 0), likes: Number($("#socialLikes").value || 0), comments: Number($("#socialComments").value || 0), shares: Number($("#socialShares").value || 0),
    postCount: Number($("#socialPosts").value || 1), creatorCount: Number($("#socialCreators").value || 0),
    publishedAt: toIso($("#socialPublishedAt").value), collectedAt: toIso($("#socialCollectedAt").value),
    url: $("#socialUrl").value.trim(), note: $("#socialNote").value.trim(), verified: true,
  };
}

function clearSocialForm() {
  ["#socialTrendName", "#socialCreator", "#socialViews", "#socialLikes", "#socialComments", "#socialShares", "#socialCreators", "#socialPublishedAt", "#socialUrl", "#socialNote"].forEach((selector) => { $(selector).value = ""; });
  $("#socialPosts").value = "1";
}

function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]; const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field); field = ""; if (row.some((item) => item.trim())) rows.push(row); row = [];
    } else field += char;
  }
  row.push(field); if (row.some((item) => item.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((item) => item.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()])));
}

function normalizeCsvItem(item) {
  return {
    source: String(item.source || "").toLowerCase(), trendName: item.trendName || item.trend_name || "", category: item.category || undefined,
    region: item.region || "ID", views: Number(item.views || 0), likes: Number(item.likes || 0), comments: Number(item.comments || 0), shares: Number(item.shares || 0),
    postCount: Number(item.postCount || item.post_count || 1), creatorCount: Number(item.creatorCount || item.creator_count || 0), creator: item.creator || "",
    publishedAt: item.publishedAt || item.published_at || null, collectedAt: item.collectedAt || item.collected_at || null,
    url: item.url || "", note: item.note || "", verified: true,
  };
}

function bindEvents() {
  $$(".tab-button").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  $$('[data-open-tab]').forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.lifecycle) { const first = button.dataset.lifecycle.split(",")[0]; state.filters.lifecycle = first; $("#lifecycleFilter").value = first; }
    switchTab(button.dataset.openTab);
  }));
  $("#refreshButton").addEventListener("click", () => loadData());
  $("#closeDrawer").addEventListener("click", closeTrend); $("#drawerBackdrop").addEventListener("click", closeTrend);
  $("#adminButton").addEventListener("click", () => { $("#adminTokenInput").value = sessionStorage.getItem("trendRadarAdminToken") || ""; $("#adminDialog").showModal(); });
  $("#socialAdminToken").value = sessionStorage.getItem("trendRadarAdminToken") || "";

  [["#searchInput", "q", "input"], ["#lifecycleFilter", "lifecycle", "change"], ["#categoryFilter", "category", "change"], ["#sourceFilter", "source", "change"], ["#sortFilter", "sort", "change"]]
    .forEach(([selector, key, event]) => $(selector).addEventListener(event, (e) => { state.filters[key] = e.target.value; renderTrendsTable(); }));

  $$('[data-collect]').forEach((button) => button.addEventListener("click", () => collect(button.dataset.collect)));
  $("#addWatchlistButton").addEventListener("click", async () => {
    try {
      const query = $("#watchlistQuery").value.trim(); if (!query) throw new Error("Isi watchlist query.");
      await adminApi("/api/admin/watchlist", { query, category: $("#watchlistCategory").value });
      $("#watchlistQuery").value = ""; $("#adminMessage").textContent = `Watchlist “${query}” berhasil ditambahkan.`;
    } catch (error) { $("#adminMessage").textContent = error.message; }
  });

  $("#saveSocialSignal").addEventListener("click", async () => {
    const message = $("#socialMessage"); message.textContent = "Saving…";
    try {
      const payload = socialPayloadFromForm(); await adminApi("/api/admin/signals", payload);
      message.textContent = `Signal “${payload.trendName}” berhasil disimpan sebagai Manual Verified.`; clearSocialForm(); await loadData({ silent: true });
    } catch (error) { message.textContent = error.message; }
  });

  $("#importSocialCsv").addEventListener("click", async () => {
    const message = $("#socialMessage");
    try {
      const file = $("#socialCsvFile").files?.[0]; if (!file) throw new Error("Pilih file CSV terlebih dahulu.");
      const items = parseCsv(await file.text()).map(normalizeCsvItem).filter((item) => item.trendName && ["tiktok", "instagram"].includes(item.source));
      if (!items.length) throw new Error("Tidak ada baris valid. Periksa header dan source CSV.");
      message.textContent = `Importing ${items.length} signal…`;
      const result = await adminApi("/api/admin/signals/bulk", { items });
      message.textContent = `Import selesai: ${result.imported} berhasil, ${result.failed} gagal.`; await loadData({ silent: true });
    } catch (error) { message.textContent = error.message; }
  });
}

function init() {
  bindEvents();
  if (!isConfigured) {
    $("#setupBanner").classList.remove("hidden"); setLiveStatus("error", "Setup required");
    $("#kpiGrid").innerHTML = emptyCards("Hubungkan Cloudflare Worker untuk mulai membaca data aktual.");
    $("#earlySignals").innerHTML = emptyCards("Tidak ada seed/demo data. Data hanya muncul dari collector aktual.");
    $("#viralGrowing").innerHTML = emptyCards("Tidak ada seed/demo data. Data hanya muncul dari collector aktual.");
    renderTrendsTable(); renderSources(); renderSocialSignals();
  } else {
    loadData(); setInterval(() => loadData({ silent: true }), Number(config.refreshIntervalMs || 300000));
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

document.addEventListener("DOMContentLoaded", init);
