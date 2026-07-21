(() => {
  "use strict";

  const CONFIG = Object.assign({
    appName: "BOGA TREND RADAR",
    storageMode: "local",
    apiUrl: "",
    apiToken: "",
    autoSync: true,
    alertViralThreshold: 75,
    alertFitThreshold: 70
  }, window.BOGA_CONFIG || {});

  const STORAGE_KEY = "boga-trend-radar-state-v1";
  const state = {
    data: null,
    trendsComputed: [],
    activeView: "radar",
    syncBusy: false,
    saveTimer: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const nowIso = () => new Date().toISOString();
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const clamp = (value, low = 0, high = 100) => Math.max(low, Math.min(high, Number(value) || 0));
  const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function money(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function integer(value) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function scoreClass(value) {
    return value >= 70 ? "high" : value >= 50 ? "mid" : "low";
  }

  function pill(value) {
    const text = String(value || "Monitor");
    const css = text.toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
    return `<span class="pill ${escapeHtml(css)}">${escapeHtml(text.replaceAll("_", " "))}</span>`;
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => node.classList.remove("show"), 2600);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeData(data) {
    const clean = data && typeof data === "object" ? deepClone(data) : {};
    clean.version = 1;
    clean.trends = Array.isArray(clean.trends) ? clean.trends : [];
    clean.observations = Array.isArray(clean.observations) ? clean.observations : [];
    clean.experiments = Array.isArray(clean.experiments) ? clean.experiments : [];
    clean.keywords = Array.isArray(clean.keywords) ? clean.keywords : [];
    clean.alerts = Array.isArray(clean.alerts) ? clean.alerts : [];
    clean.meta = clean.meta && typeof clean.meta === "object" ? clean.meta : {};
    clean.experiments.forEach((experiment) => {
      experiment.sales = Array.isArray(experiment.sales) ? experiment.sales : [];
    });
    return clean;
  }

  async function loadSeed() {
    try {
      const response = await fetch("./data/seed.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Seed HTTP ${response.status}`);
      return normalizeData(await response.json());
    } catch (error) {
      console.warn("Seed file could not be loaded", error);
      return normalizeData({
        trends: [], observations: [], experiments: [], keywords: [], alerts: [],
        meta: { createdAt: nowIso() }
      });
    }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeData(JSON.parse(raw)) : null;
    } catch (error) {
      console.warn("Local data invalid", error);
      return null;
    }
  }

  function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  async function cloudRequest(action, payload = {}) {
    if (!CONFIG.apiUrl) throw new Error("Apps Script endpoint belum dikonfigurasi di config.js.");
    const response = await fetch(CONFIG.apiUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, token: CONFIG.apiToken || "", payload })
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error("Response Apps Script bukan JSON yang valid."); }
    if (!response.ok || body.ok === false) throw new Error(body.error || `Cloud HTTP ${response.status}`);
    return body.data;
  }

  function cloudEnabled() {
    return CONFIG.storageMode === "apps-script" && Boolean(CONFIG.apiUrl);
  }

  async function loadCloud() {
    return normalizeData(await cloudRequest("loadState"));
  }

  async function saveCloud() {
    await cloudRequest("saveState", state.data);
    state.data.meta.lastSync = nowIso();
    saveLocal();
    renderStorageStatus();
  }

  function scheduleSave() {
    recalculateAll();
    saveLocal();
    renderAll();
    if (cloudEnabled() && CONFIG.autoSync) {
      window.clearTimeout(state.saveTimer);
      state.saveTimer = window.setTimeout(async () => {
        try { await saveCloud(); } catch (error) { setStorageError(error.message); }
      }, 700);
    }
  }

  async function syncNow(options = {}) {
    if (state.syncBusy) return;
    if (!cloudEnabled()) {
      if (!options.silent) toast("Mode local aktif. Atur Apps Script di config.js untuk shared cloud data.");
      return;
    }
    state.syncBusy = true;
    setSyncButtons(true);
    try {
      if (options.push) {
        await saveCloud();
      } else {
        const cloud = await loadCloud();
        if (cloud.trends.length || !state.data.trends.length) state.data = cloud;
        state.data.meta.lastSync = nowIso();
        saveLocal();
        recalculateAll();
        renderAll();
      }
      if (!options.silent) toast("Cloud sync selesai.");
    } catch (error) {
      setStorageError(error.message);
      if (!options.silent) toast(error.message);
    } finally {
      state.syncBusy = false;
      setSyncButtons(false);
    }
  }

  function setSyncButtons(busy) {
    [$("#syncBtn"), $("#settingsSyncBtn")].filter(Boolean).forEach((button) => {
      button.disabled = busy;
      button.textContent = busy ? "Syncing..." : (button.id === "syncBtn" ? "↻ Sync" : "Pull Cloud");
    });
  }

  function setStorageError(message) {
    const dot = $("#storageDot");
    dot.classList.add("error");
    $("#storageLabel").textContent = "Sync error";
    console.warn(message);
  }

  function logScore(value, reference) {
    if (value <= 0) return 0;
    return clamp(100 * Math.log1p(value) / Math.log1p(reference));
  }

  function commercialFit(trend) {
    return round1(
      clamp(trend.brand_fit) * 0.20 +
      clamp(trend.margin_potential) * 0.20 +
      clamp(trend.production_ease) * 0.15 +
      clamp(trend.ingredient_availability) * 0.10 +
      clamp(trend.channel_fit) * 0.10 +
      clamp(trend.visual_appeal) * 0.10 +
      clamp(trend.differentiation) * 0.10 +
      clamp(trend.repeat_potential) * 0.05
    );
  }

  function chooseAction(viral, fit, saturation) {
    if (viral >= 70 && fit >= 70) return saturation < 80 ? "Fast Test" : "Differentiate Fast";
    if (viral >= 70 && fit < 70) return "Adapt Concept";
    if (viral >= 50 && viral < 70 && fit >= 70) return "Lab Test";
    if (viral >= 50 || fit >= 50) return "Monitor";
    return "Ignore";
  }

  function calculateScore(trend) {
    const observations = state.data.observations
      .filter((item) => item.trend_id === trend.id)
      .sort((a, b) => String(b.observed_on).localeCompare(String(a.observed_on)));
    const grouped = new Map();
    observations.forEach((item) => {
      if (!grouped.has(item.source)) grouped.set(item.source, []);
      grouped.get(item.source).push(item);
    });

    const latest = [];
    const growthValues = [];
    for (const items of grouped.values()) {
      items.sort((a, b) => String(b.observed_on).localeCompare(String(a.observed_on)));
      const current = items[0];
      latest.push(current);
      if (items.length > 1) {
        const previous = items[1];
        const currentSignal = Number(current.views || 0) + Number(current.search_interest || 0) * 10000 + Number(current.post_count || 0) * 5000;
        const previousSignal = Number(previous.views || 0) + Number(previous.search_interest || 0) * 10000 + Number(previous.post_count || 0) * 5000;
        if (previousSignal > 0) growthValues.push((currentSignal - previousSignal) / previousSignal);
      } else if (current.views || current.post_count || current.search_interest) {
        growthValues.push(Math.min(1, Math.log1p(Number(current.views || 0) + Number(current.post_count || 0) * 1000) / 14));
      }
    }

    const avgGrowth = growthValues.length ? growthValues.reduce((a, b) => a + b, 0) / growthValues.length : 0;
    const momentum = growthValues.length ? clamp(50 + avgGrowth * 50) : 0;
    const totalViews = latest.reduce((sum, item) => sum + Number(item.views || 0), 0);
    const totalEngagement = latest.reduce((sum, item) => sum + Number(item.likes || 0) + Number(item.comments || 0), 0);
    const engagementRate = totalViews ? totalEngagement / totalViews : 0;
    const engagement = clamp((engagementRate / 0.08) * 100);
    const creators = latest.reduce((sum, item) => sum + Number(item.creator_count || 0), 0);
    const creatorScore = logScore(creators, 100);
    const crossPlatform = clamp((grouped.size / 4) * 100);
    const searchScore = latest.length ? latest.reduce((sum, item) => sum + Number(item.search_interest || 0), 0) / latest.length : 0;
    const regional = latest.length ? latest.reduce((sum, item) => sum + Number(item.regional_relevance || 0), 0) / latest.length : 0;
    const posts = latest.reduce((sum, item) => sum + Number(item.post_count || 0), 0);
    const saturation = round1(clamp(logScore(posts, 10000) * 0.65 + logScore(creators, 1000) * 0.35));
    const viral = round1(momentum * 0.30 + engagement * 0.20 + creatorScore * 0.15 + crossPlatform * 0.15 + searchScore * 0.10 + regional * 0.10);
    const fit = commercialFit(trend);
    return {
      viral_score: viral,
      commercial_fit_score: fit,
      saturation_score: saturation,
      momentum_score: round1(momentum),
      engagement_score: round1(engagement),
      creator_score: round1(creatorScore),
      cross_platform_score: round1(crossPlatform),
      search_score: round1(searchScore),
      regional_score: round1(regional),
      growth_7d: round1(avgGrowth * 100),
      action: chooseAction(viral, fit, saturation),
      calculated_at: nowIso()
    };
  }

  function recalculateAll() {
    state.trendsComputed = state.data.trends.map((trend) => ({ ...trend, score: calculateScore(trend) }));
    const existing = new Map(state.data.alerts.map((alert) => [`${alert.trend_id}:${alert.signature || ""}`, alert]));
    state.trendsComputed.forEach((trend) => {
      const score = trend.score;
      if (score.viral_score >= CONFIG.alertViralThreshold && score.commercial_fit_score >= CONFIG.alertFitThreshold) {
        const signature = `${Math.floor(score.viral_score / 5)}:${Math.floor(score.commercial_fit_score / 5)}:${score.action}`;
        const key = `${trend.id}:${signature}`;
        if (!existing.has(key)) {
          const alert = {
            id: uid("al"), trend_id: trend.id, signature, level: "high", acknowledged: false,
            message: `${trend.name} mencapai Viral ${score.viral_score} dan Commercial Fit ${score.commercial_fit_score}. Rekomendasi: ${score.action}.`,
            created_at: nowIso()
          };
          state.data.alerts.unshift(alert);
          existing.set(key, alert);
        }
      }
    });
    state.data.alerts = state.data.alerts.slice(0, 100);
  }

  function getTrend(id) {
    return state.data.trends.find((item) => item.id === id);
  }

  function getComputedTrend(id) {
    return state.trendsComputed.find((item) => item.id === id);
  }

  function renderAll() {
    renderSummary();
    renderAlerts();
    renderTrends();
    renderOpportunityMap();
    renderExperiments();
    renderKeywords();
    renderStorageStatus();
  }

  function renderSummary() {
    const activeExperiments = state.data.experiments.filter((item) => !["launched", "rejected", "stopped"].includes(item.status)).length;
    const values = [
      ["Trends monitored", state.data.trends.length, "Total aktif"],
      ["Fast-test opportunities", state.trendsComputed.filter((item) => ["Fast Test", "Differentiate Fast"].includes(item.score.action)).length, "Perlu keputusan cepat"],
      ["Active experiments", activeExperiments, "Dalam workflow"],
      ["Unread alerts", state.data.alerts.filter((item) => !item.acknowledged).length, "Opportunity signal"]
    ];
    $("#kpis").innerHTML = values.map(([label, value, helper]) => `
      <div class="kpi"><span>${escapeHtml(label)}</span><strong>${integer(value)}</strong><small>${escapeHtml(helper)}</small></div>
    `).join("");
  }

  function renderAlerts() {
    const alert = state.data.alerts.find((item) => !item.acknowledged);
    $("#alertText").textContent = alert ? alert.message : "Tidak ada alert baru. Semua peluang sudah ditinjau.";
    $("#ackAlertBtn").style.display = alert ? "inline-block" : "none";
  }

  function filteredTrends() {
    const query = $("#searchInput").value.trim().toLowerCase();
    const category = $("#categoryFilter").value;
    const action = $("#actionFilter").value;
    return state.trendsComputed
      .filter((trend) => !query || `${trend.name} ${trend.category} ${trend.origin_country}`.toLowerCase().includes(query))
      .filter((trend) => !category || trend.category === category)
      .filter((trend) => !action || trend.score.action === action)
      .sort((a, b) => (b.score.viral_score * 0.55 + b.score.commercial_fit_score * 0.45) - (a.score.viral_score * 0.55 + a.score.commercial_fit_score * 0.45));
  }

  function renderTrends() {
    const categories = [...new Set(state.data.trends.map((item) => item.category).filter(Boolean))].sort();
    const currentCategory = $("#categoryFilter").value;
    $("#categoryFilter").innerHTML = `<option value="">Semua kategori</option>${categories.map((category) => `<option value="${escapeHtml(category)}" ${category === currentCategory ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}`;

    const trends = filteredTrends();
    $("#trendRows").innerHTML = trends.length ? trends.map((trend) => {
      const score = trend.score;
      const growthClass = score.growth_7d >= 0 ? "growth-up" : "growth-down";
      const growthPrefix = score.growth_7d > 0 ? "+" : "";
      return `<tr>
        <td><div class="trend-name" data-trend-id="${escapeHtml(trend.id)}">${escapeHtml(trend.name)}</div><small>${escapeHtml(trend.origin_country || "Unknown")}</small></td>
        <td>${escapeHtml(trend.category || "Uncategorized")}</td>
        <td class="${growthClass}">${growthPrefix}${score.growth_7d.toFixed(1)}%</td>
        <td class="score ${scoreClass(score.viral_score)}">${score.viral_score.toFixed(1)}</td>
        <td class="score ${scoreClass(score.commercial_fit_score)}">${score.commercial_fit_score.toFixed(1)}</td>
        <td class="score ${scoreClass(100 - score.saturation_score)}">${score.saturation_score.toFixed(1)}</td>
        <td>${pill(score.action)}</td>
        <td><div class="row-action"><button class="mini-button open-trend" data-trend-id="${escapeHtml(trend.id)}" aria-label="Buka detail">›</button></div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="8" class="empty-state">Belum ada data yang sesuai filter.</td></tr>`;

    $("#trendCards").innerHTML = trends.length ? trends.map((trend) => {
      const score = trend.score;
      return `<article class="trend-card open-trend" data-trend-id="${escapeHtml(trend.id)}">
        <div class="trend-card-head"><div><h3>${escapeHtml(trend.name)}</h3><p>${escapeHtml(trend.category)} · ${escapeHtml(trend.origin_country)}</p></div>${pill(score.action)}</div>
        <div class="trend-card-scores">
          <div><small>Viral</small><strong class="score ${scoreClass(score.viral_score)}">${score.viral_score.toFixed(1)}</strong></div>
          <div><small>Fit</small><strong class="score ${scoreClass(score.commercial_fit_score)}">${score.commercial_fit_score.toFixed(1)}</strong></div>
          <div><small>7D Growth</small><strong class="${score.growth_7d >= 0 ? "growth-up" : "growth-down"}">${score.growth_7d > 0 ? "+" : ""}${score.growth_7d.toFixed(1)}%</strong></div>
        </div>
      </article>`;
    }).join("") : `<div class="empty-state">Belum ada data yang sesuai filter.</div>`;

    $$(".trend-name, .open-trend").forEach((node) => node.addEventListener("click", () => showTrendDetail(node.dataset.trendId)));
    $("#experimentTrend").innerHTML = state.data.trends.map((trend) => `<option value="${escapeHtml(trend.id)}">${escapeHtml(trend.name)}</option>`).join("");
  }

  function renderOpportunityMap() {
    const map = $("#opportunityMap");
    map.innerHTML = state.trendsComputed.map((trend) => {
      const score = trend.score;
      const x = clamp(score.viral_score, 3, 97);
      const y = clamp(score.commercial_fit_score, 3, 97);
      const fast = ["Fast Test", "Differentiate Fast"].includes(score.action) ? "fast" : "";
      const short = trend.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
      return `<button class="map-point ${fast}" style="left:${x}%;bottom:${y}%" data-trend-id="${escapeHtml(trend.id)}" title="${escapeHtml(trend.name)} — Viral ${score.viral_score}, Fit ${score.commercial_fit_score}">${escapeHtml(short)}<span class="map-label">${escapeHtml(trend.name)}</span></button>`;
    }).join("");
    $$(".map-point", map).forEach((node) => node.addEventListener("click", () => showTrendDetail(node.dataset.trendId)));
  }

  function experimentMetrics(experiment) {
    const sales = experiment.sales || [];
    return {
      netSales: sales.reduce((sum, item) => sum + Number(item.net_sales || 0), 0),
      quantity: sales.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      transactions: sales.reduce((sum, item) => sum + Number(item.transactions || 0), 0),
      repeats: sales.reduce((sum, item) => sum + Number(item.repeat_customers || 0), 0)
    };
  }

  function renderExperiments() {
    const board = $("#experimentBoard");
    if (!state.data.experiments.length) {
      board.innerHTML = `<div class="panel empty-state">Belum ada product experiment.</div>`;
      return;
    }
    board.innerHTML = state.data.experiments.map((experiment) => {
      const trend = getTrend(experiment.trend_id);
      const metrics = experimentMetrics(experiment);
      return `<article class="experiment">
        <div>${pill(experiment.status)}</div>
        <h3 class="experiment-title" data-experiment-id="${escapeHtml(experiment.id)}">${escapeHtml(experiment.concept_name)}</h3>
        <p>Based on: <strong>${escapeHtml(trend?.name || "Unknown trend")}</strong><br>${escapeHtml(experiment.test_outlets || "Outlet belum ditentukan")}</p>
        <div class="metric-row">
          <div class="mini-metric"><small>Target Price</small><strong>${money(experiment.target_price)}</strong></div>
          <div class="mini-metric"><small>COGS</small><strong>${round1(experiment.estimated_cogs_pct)}%</strong></div>
          <div class="mini-metric"><small>Sales</small><strong>${money(metrics.netSales)}</strong></div>
        </div>
        <div class="experiment-actions">
          <select class="experiment-status" data-experiment-id="${escapeHtml(experiment.id)}">
            ${["idea","review","lab_test","outlet_test","launched","rejected","stopped"].map((status) => `<option value="${status}" ${experiment.status === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}
          </select>
          <button class="secondary save-experiment-status" data-experiment-id="${escapeHtml(experiment.id)}">Update</button>
        </div>
        <div class="experiment-footer"><span>${escapeHtml(experiment.test_start || "Start TBC")}</span><span>${escapeHtml(experiment.test_end || "End TBC")}</span></div>
      </article>`;
    }).join("");

    $$(".save-experiment-status", board).forEach((button) => button.addEventListener("click", () => {
      const experiment = state.data.experiments.find((item) => item.id === button.dataset.experimentId);
      const select = $$(".experiment-status", board).find((node) => node.dataset.experimentId === button.dataset.experimentId);
      if (!experiment || !select) return;
      experiment.status = select.value;
      experiment.updated_at = nowIso();
      scheduleSave();
      toast("Status experiment diperbarui.");
    }));
    $$(".experiment-title", board).forEach((node) => node.addEventListener("click", () => showExperimentDetail(node.dataset.experimentId)));
  }

  function renderKeywords() {
    $("#keywordList").innerHTML = state.data.keywords.length ? state.data.keywords.map((keyword) => `
      <span class="keyword-chip">${escapeHtml(keyword.keyword)} <button class="keyword-remove" data-keyword-id="${escapeHtml(keyword.id)}" aria-label="Hapus keyword">×</button></span>
    `).join("") : `<span class="empty-state">Belum ada keyword.</span>`;
    $$(".keyword-remove").forEach((button) => button.addEventListener("click", () => {
      state.data.keywords = state.data.keywords.filter((item) => item.id !== button.dataset.keywordId);
      scheduleSave();
      toast("Keyword dihapus.");
    }));
  }

  function renderStorageStatus() {
    const localMode = !cloudEnabled();
    const dot = $("#storageDot");
    dot.classList.remove("offline", "error");
    if (localMode) dot.classList.add("offline");
    $("#storageLabel").textContent = localMode ? "Local mode" : "Apps Script cloud";
    $("#settingsMode").textContent = localMode ? "Local browser storage" : "Google Apps Script + Sheets";
    $("#settingsEndpoint").textContent = CONFIG.apiUrl || "Not configured";
    $("#lastSync").textContent = state.data?.meta?.lastSync ? new Date(state.data.meta.lastSync).toLocaleString("id-ID") : "Never";
  }

  function showTrendDetail(id) {
    const trend = getTrend(id);
    const computed = getComputedTrend(id);
    if (!trend || !computed) return;
    const score = computed.score;
    const observations = state.data.observations
      .filter((item) => item.trend_id === id)
      .sort((a, b) => String(b.observed_on).localeCompare(String(a.observed_on)));
    const fields = [
      ["brand_fit", "Brand fit"], ["margin_potential", "Margin potential"],
      ["production_ease", "Production ease"], ["ingredient_availability", "Ingredient availability"],
      ["channel_fit", "Channel fit"], ["visual_appeal", "Visual appeal"],
      ["differentiation", "Differentiation"], ["repeat_potential", "Repeat potential"]
    ];
    $("#detailContent").innerHTML = `
      <div class="dialog-head"><div><h2>${escapeHtml(trend.name)}</h2><p>${escapeHtml(trend.category)} · ${escapeHtml(trend.origin_country)}</p></div><button class="icon-button close-detail">×</button></div>
      <div class="detail-grid">
        <div class="detail-card"><h4>Viral Potential</h4><div class="score-big ${scoreClass(score.viral_score)}">${score.viral_score.toFixed(1)}</div><p>${pill(score.action)}</p><small>Momentum ${score.momentum_score} · Engagement ${score.engagement_score} · Creator ${score.creator_score} · Cross-platform ${score.cross_platform_score}</small></div>
        <div class="detail-card"><h4>Commercial Fit</h4><div class="score-big ${scoreClass(score.commercial_fit_score)}">${score.commercial_fit_score.toFixed(1)}</div><p>Saturation: <strong>${score.saturation_score}</strong> · 7D Growth: <strong>${score.growth_7d > 0 ? "+" : ""}${score.growth_7d}%</strong></p><small>${escapeHtml(trend.description || "Belum ada deskripsi.")}</small></div>
      </div>
      <details class="detail-card detail-section">
        <summary>Edit Commercial Fit</summary>
        <form id="commercialForm" class="score-grid">
          ${fields.map(([key, label]) => `<label>${escapeHtml(label)}<input name="${key}" type="number" min="0" max="100" value="${clamp(trend[key])}"></label>`).join("")}
          <button class="primary full-row">Save & Recalculate</button>
        </form>
      </details>
      <details class="detail-card detail-section" open>
        <summary>Add Observation / Evidence</summary>
        <form id="observationForm" class="score-grid">
          <label>Source<select name="source"><option>tiktok</option><option>instagram</option><option>youtube</option><option>google_trends</option><option>competitor</option><option>manual</option></select></label>
          <label>Date<input name="observed_on" type="date" value="${today()}"></label>
          <label>Views<input name="views" type="number" min="0" value="0"></label>
          <label>Likes<input name="likes" type="number" min="0" value="0"></label>
          <label>Comments<input name="comments" type="number" min="0" value="0"></label>
          <label>Post count<input name="post_count" type="number" min="0" value="0"></label>
          <label>Creator count<input name="creator_count" type="number" min="0" value="0"></label>
          <label>Search interest<input name="search_interest" type="number" min="0" max="100" value="0"></label>
          <label>Indonesia relevance<input name="regional_relevance" type="number" min="0" max="100" value="80"></label>
          <label class="full-row">Evidence URL<input name="source_url" type="url" placeholder="https://..."></label>
          <label class="full-row">Notes<textarea name="notes" rows="2" placeholder="Creator, kompetitor, harga, respons customer, atau konteks lain."></textarea></label>
          <button class="primary full-row">Add Observation</button>
        </form>
      </details>
      <div class="detail-card detail-section"><h4>Latest Observations</h4>
        ${observations.length ? observations.slice(0, 20).map((item) => {
          const url = safeUrl(item.source_url);
          return `<div class="observation"><strong>${escapeHtml(item.source)}</strong> · ${escapeHtml(item.observed_on)}<br>Views ${integer(item.views)} · Likes ${integer(item.likes)} · Posts ${integer(item.post_count)} · Creators ${integer(item.creator_count)} · Search ${round1(item.search_interest)}${item.notes ? `<br><span>${escapeHtml(item.notes)}</span>` : ""}${url ? `<br><a class="evidence-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open evidence ↗</a>` : ""}<button class="mini-button delete-observation" data-observation-id="${escapeHtml(item.id)}" aria-label="Hapus observation">×</button></div>`;
        }).join("") : "Belum ada observation."}
      </div>
      <div class="dialog-actions"><button class="danger" id="deleteTrendBtn">Delete Trend</button><button class="secondary close-detail">Close</button><button class="primary" id="createTestFromTrendBtn">Create Product Test</button></div>`;

    const dialog = $("#detailDialog");
    dialog.showModal();
    $$(".close-detail", dialog).forEach((button) => button.addEventListener("click", () => dialog.close()));
    $("#commercialForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      fields.forEach(([key]) => { trend[key] = clamp(payload[key]); });
      trend.updated_at = nowIso();
      scheduleSave();
      showTrendDetail(id);
      toast("Commercial fit diperbarui.");
    });
    $("#observationForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      ["views", "likes", "comments", "post_count", "creator_count", "search_interest", "regional_relevance"].forEach((key) => { payload[key] = Number(payload[key] || 0); });
      const duplicate = state.data.observations.find((item) => item.trend_id === id && item.source === payload.source && item.observed_on === payload.observed_on);
      if (duplicate) Object.assign(duplicate, payload, { updated_at: nowIso() });
      else state.data.observations.push({ id: uid("ob"), trend_id: id, ...payload, created_at: nowIso() });
      scheduleSave();
      showTrendDetail(id);
      toast(duplicate ? "Observation pada tanggal yang sama diperbarui." : "Observation ditambahkan.");
    });
    $$(".delete-observation", dialog).forEach((button) => button.addEventListener("click", () => {
      state.data.observations = state.data.observations.filter((item) => item.id !== button.dataset.observationId);
      scheduleSave();
      showTrendDetail(id);
      toast("Observation dihapus.");
    }));
    $("#deleteTrendBtn").addEventListener("click", () => {
      if (!window.confirm(`Hapus trend “${trend.name}” beserta observation dan experiment terkait?`)) return;
      state.data.trends = state.data.trends.filter((item) => item.id !== id);
      state.data.observations = state.data.observations.filter((item) => item.trend_id !== id);
      state.data.experiments = state.data.experiments.filter((item) => item.trend_id !== id);
      state.data.alerts = state.data.alerts.filter((item) => item.trend_id !== id);
      dialog.close();
      scheduleSave();
      toast("Trend dihapus.");
    });
    $("#createTestFromTrendBtn").addEventListener("click", () => {
      dialog.close();
      $("#experimentTrend").value = id;
      $("#experimentDialog").showModal();
    });
  }

  function showExperimentDetail(id) {
    const experiment = state.data.experiments.find((item) => item.id === id);
    if (!experiment) return;
    const trend = getTrend(experiment.trend_id);
    const metrics = experimentMetrics(experiment);
    const salesRows = (experiment.sales || []).sort((a, b) => String(b.sales_date).localeCompare(String(a.sales_date)));
    $("#detailContent").innerHTML = `
      <div class="dialog-head"><div><h2>${escapeHtml(experiment.concept_name)}</h2><p>${escapeHtml(trend?.name || "Unknown trend")} · ${escapeHtml(experiment.status.replaceAll("_", " "))}</p></div><button class="icon-button close-detail">×</button></div>
      <div class="detail-grid">
        <div class="detail-card"><h4>Test Economics</h4><div class="score-big">${money(experiment.target_price)}</div><p>Estimated COGS: <strong>${round1(experiment.estimated_cogs_pct)}%</strong></p><small>${escapeHtml(experiment.hypothesis || "Belum ada hipotesis.")}</small></div>
        <div class="detail-card"><h4>Validated Result</h4><div class="score-big">${money(metrics.netSales)}</div><p>Qty ${integer(metrics.quantity)} · Trx ${integer(metrics.transactions)} · Repeat ${integer(metrics.repeats)}</p><small>${escapeHtml(experiment.test_outlets || "Outlet belum ditentukan")}</small></div>
      </div>
      <details class="detail-card detail-section" open><summary>Add Sales Validation</summary>
        <form id="salesForm" class="score-grid">
          <label>Date<input name="sales_date" type="date" value="${today()}"></label>
          <label>Outlet<input name="outlet" required placeholder="BICP"></label>
          <label>Product code<input name="product_code" placeholder="TEST-001"></label>
          <label>Quantity<input name="quantity" type="number" min="0" value="0"></label>
          <label>Net sales<input name="net_sales" type="number" min="0" value="0"></label>
          <label>Transactions<input name="transactions" type="number" min="0" value="0"></label>
          <label>Repeat customers<input name="repeat_customers" type="number" min="0" value="0"></label>
          <button class="primary full-row">Add Result</button>
        </form>
      </details>
      <div class="detail-card detail-section"><h4>Sales Records</h4>${salesRows.length ? salesRows.map((sale) => `<div class="observation"><strong>${escapeHtml(sale.outlet)}</strong> · ${escapeHtml(sale.sales_date)}<br>${escapeHtml(sale.product_code || "No code")} · Qty ${integer(sale.quantity)} · ${money(sale.net_sales)} · Trx ${integer(sale.transactions)} · Repeat ${integer(sale.repeat_customers)}<button class="mini-button delete-sale" data-sale-id="${escapeHtml(sale.id)}">×</button></div>`).join("") : "Belum ada hasil penjualan."}</div>
      <div class="dialog-actions"><button class="danger" id="deleteExperimentBtn">Delete Test</button><button class="secondary close-detail">Close</button></div>`;
    const dialog = $("#detailDialog");
    dialog.showModal();
    $$(".close-detail", dialog).forEach((button) => button.addEventListener("click", () => dialog.close()));
    $("#salesForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      ["quantity", "net_sales", "transactions", "repeat_customers"].forEach((key) => { payload[key] = Number(payload[key] || 0); });
      experiment.sales.push({ id: uid("sl"), ...payload, created_at: nowIso() });
      experiment.updated_at = nowIso();
      scheduleSave();
      showExperimentDetail(id);
      toast("Sales validation ditambahkan.");
    });
    $$(".delete-sale", dialog).forEach((button) => button.addEventListener("click", () => {
      experiment.sales = experiment.sales.filter((sale) => sale.id !== button.dataset.saleId);
      scheduleSave();
      showExperimentDetail(id);
      toast("Sales record dihapus.");
    }));
    $("#deleteExperimentBtn").addEventListener("click", () => {
      if (!window.confirm(`Hapus product test “${experiment.concept_name}”?`)) return;
      state.data.experiments = state.data.experiments.filter((item) => item.id !== id);
      dialog.close();
      scheduleSave();
      toast("Product test dihapus.");
    });
  }

  function switchView(viewName) {
    state.activeView = viewName;
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
    closeMenu();
  }

  function openMenu() {
    $("#sidebar").classList.add("open");
    $("#scrim").classList.add("open");
  }

  function closeMenu() {
    $("#sidebar").classList.remove("open");
    $("#scrim").classList.remove("open");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && quoted && next === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(field.trim()); field = "";
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
      } else field += char;
    }
    row.push(field.trim());
    if (row.some((value) => value !== "")) rows.push(row);
    if (!rows.length) return [];
    const headers = rows[0].map((value) => value.toLowerCase().trim());
    return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  }

  async function importGoogleTrends(file, category) {
    const rows = parseCsv(await file.text());
    if (!rows.length || !rows[0].keyword || rows[0].search_interest === undefined || !rows[0].date) {
      throw new Error("CSV harus memiliki kolom keyword, search_interest, dan date.");
    }
    let added = 0;
    let updated = 0;
    rows.forEach((row) => {
      const keyword = String(row.keyword || "").trim();
      if (!keyword) return;
      let trend = state.data.trends.find((item) => item.name.toLowerCase() === keyword.toLowerCase());
      if (!trend) {
        trend = {
          id: uid("tr"), name: keyword, category, origin_country: "Unknown", description: "Imported from Google Trends",
          status: "monitor", owner: "Boga Lab", brand_fit: 60, margin_potential: 60, production_ease: 60,
          ingredient_availability: 60, channel_fit: 60, visual_appeal: 60, differentiation: 60, repeat_potential: 60,
          created_at: nowIso(), updated_at: nowIso()
        };
        state.data.trends.push(trend);
        added += 1;
      }
      const existing = state.data.observations.find((item) => item.trend_id === trend.id && item.source === "google_trends" && item.observed_on === row.date);
      const payload = {
        views: 0, likes: 0, comments: 0, post_count: 0, creator_count: 0,
        search_interest: clamp(row.search_interest), regional_relevance: 85,
        source_url: "https://trends.google.com/", notes: "CSV import"
      };
      if (existing) { Object.assign(existing, payload); updated += 1; }
      else state.data.observations.push({ id: uid("ob"), trend_id: trend.id, source: "google_trends", observed_on: row.date, ...payload, created_at: nowIso() });
    });
    scheduleSave();
    return { rows: rows.length, trends_created: added, observations_updated: updated };
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function exportTrendCsv() {
    const headers = ["trend_id", "trend_name", "category", "origin_country", "viral_score", "commercial_fit_score", "saturation_score", "growth_7d", "action"];
    const lines = [headers.join(",")];
    state.trendsComputed.forEach((trend) => {
      const score = trend.score;
      lines.push([trend.id, trend.name, trend.category, trend.origin_country, score.viral_score, score.commercial_fit_score, score.saturation_score, score.growth_7d, score.action].map(csvEscape).join(","));
    });
    download(`boga-trend-radar-${today()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  }

  async function runBigQuerySync() {
    const output = $("#bigQueryResult");
    output.textContent = "Syncing...";
    if (!cloudEnabled()) {
      output.textContent = "BigQuery sync membutuhkan Apps Script mode.";
      return;
    }
    try {
      const result = await cloudRequest("syncBigQuery", {});
      if (result?.state) state.data = normalizeData(result.state);
      else state.data = await loadCloud();
      state.data.meta.lastSync = nowIso();
      saveLocal();
      recalculateAll();
      renderAll();
      output.textContent = JSON.stringify({ rows: result?.rows || 0, imported: result?.imported || 0 }, null, 2);
      toast("BigQuery sales sync selesai.");
    } catch (error) {
      output.textContent = error.message;
      toast(error.message);
    }
  }

  async function runYouTubeCollector() {
    const output = $("#youtubeResult");
    output.textContent = "Collecting...";
    if (!cloudEnabled()) {
      output.textContent = "Collector membutuhkan Apps Script mode agar API key tidak terekspos di GitHub Pages.";
      return;
    }
    try {
      const result = await cloudRequest("collectYouTube", { limit: 12, region: CONFIG.youtubeRegion || "ID" });
      if (result?.state) state.data = normalizeData(result.state);
      else state.data = await loadCloud();
      state.data.meta.lastSync = nowIso();
      saveLocal();
      recalculateAll();
      renderAll();
      output.textContent = JSON.stringify(result?.summary || result, null, 2);
      toast("YouTube collector selesai.");
    } catch (error) {
      output.textContent = error.message;
      toast(error.message);
    }
  }

  function wireEvents() {
    $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    $("#menuBtn").addEventListener("click", openMenu);
    $("#closeMenuBtn").addEventListener("click", closeMenu);
    $("#scrim").addEventListener("click", closeMenu);
    $("#addTrendBtn").addEventListener("click", () => $("#trendDialog").showModal());
    $("#addExperimentBtn").addEventListener("click", () => $("#experimentDialog").showModal());
    $$(".close-dialog").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
    $("#syncBtn").addEventListener("click", () => syncNow());
    $("#settingsSyncBtn").addEventListener("click", () => syncNow());
    $("#pushCloudBtn").addEventListener("click", async () => {
      if (!cloudEnabled()) { toast("Apps Script cloud belum dikonfigurasi."); return; }
      if (!window.confirm("Kirim data perangkat ini dan timpa state cloud saat ini?")) return;
      try { await syncNow({ push: true }); toast("Data perangkat berhasil dikirim ke cloud."); }
      catch (error) { toast(error.message); }
    });

    let filterTimer;
    ["searchInput", "categoryFilter", "actionFilter"].forEach((id) => {
      const node = $(`#${id}`);
      node.addEventListener(id === "searchInput" ? "input" : "change", () => {
        window.clearTimeout(filterTimer);
        filterTimer = window.setTimeout(renderTrends, 120);
      });
    });

    $("#trendForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      const name = String(payload.name || "").trim();
      if (state.data.trends.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
        toast("Nama trend sudah ada.");
        return;
      }
      ["brand_fit", "margin_potential", "production_ease", "ingredient_availability", "channel_fit", "visual_appeal", "differentiation", "repeat_potential"].forEach((key) => { payload[key] = clamp(payload[key]); });
      state.data.trends.push({ id: uid("tr"), ...payload, status: "monitor", owner: "Boga Lab", created_at: nowIso(), updated_at: nowIso() });
      event.currentTarget.reset();
      $("#trendDialog").close();
      scheduleSave();
      toast("Trend berhasil ditambahkan.");
    });

    $("#experimentForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      payload.target_price = Number(payload.target_price || 0);
      payload.estimated_cogs_pct = clamp(payload.estimated_cogs_pct);
      state.data.experiments.push({ id: uid("ex"), ...payload, status: "idea", decision: "pending", notes: "", sales: [], created_at: nowIso(), updated_at: nowIso() });
      event.currentTarget.reset();
      $("#experimentDialog").close();
      scheduleSave();
      toast("Product test dibuat.");
    });

    $("#ackAlertBtn").addEventListener("click", () => {
      const alert = state.data.alerts.find((item) => !item.acknowledged);
      if (!alert) return;
      alert.acknowledged = true;
      scheduleSave();
    });

    $("#keywordForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const keyword = $("#keywordInput").value.trim();
      const category = $("#keywordCategory").value.trim() || "Dessert";
      if (state.data.keywords.some((item) => item.keyword.toLowerCase() === keyword.toLowerCase())) {
        toast("Keyword sudah ada.");
        return;
      }
      state.data.keywords.push({ id: uid("kw"), keyword, category, active: true, auto_create_trend: true, created_at: nowIso() });
      $("#keywordInput").value = "";
      scheduleSave();
      toast("Keyword ditambahkan.");
    });

    $("#trendsUpload").addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = $("#trendsFile").files[0];
      if (!file) return;
      try {
        const result = await importGoogleTrends(file, $("#importCategory").value);
        $("#importResult").textContent = JSON.stringify(result, null, 2);
        toast("Google Trends CSV berhasil diimpor.");
      } catch (error) {
        $("#importResult").textContent = error.message;
        toast(error.message);
      }
    });

    $("#collectYoutubeBtn").addEventListener("click", runYouTubeCollector);
    $("#syncBigQueryBtn").addEventListener("click", runBigQuerySync);
    $("#openFirstTrendBtn").addEventListener("click", () => {
      const first = state.trendsComputed[0];
      if (first) showTrendDetail(first.id);
      else toast("Tambahkan trend terlebih dahulu.");
    });

    $("#exportJsonBtn").addEventListener("click", () => download(`boga-trend-radar-backup-${today()}.json`, JSON.stringify(state.data, null, 2), "application/json"));
    $("#exportCsvBtn").addEventListener("click", exportTrendCsv);
    $("#importBackupBtn").addEventListener("click", async () => {
      const file = $("#backupFile").files[0];
      if (!file) { toast("Pilih file backup JSON."); return; }
      try {
        const imported = normalizeData(JSON.parse(await file.text()));
        if (!window.confirm("Ganti seluruh data aktif dengan backup ini?")) return;
        state.data = imported;
        scheduleSave();
        toast("Backup berhasil dipulihkan.");
      } catch {
        toast("File JSON tidak valid.");
      }
    });
    $("#resetBtn").addEventListener("click", async () => {
      if (!window.confirm("Reset seluruh data ke contoh awal?")) return;
      state.data = await loadSeed();
      scheduleSave();
      toast("Aplikasi dikembalikan ke seed data.");
    });
  }

  async function init() {
    state.data = loadLocal() || await loadSeed();
    recalculateAll();
    saveLocal();
    wireEvents();
    renderAll();
    if (cloudEnabled()) await syncNow({ silent: true });
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Service worker failed", error));
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();
