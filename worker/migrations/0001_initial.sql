PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trends (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  lifecycle TEXT NOT NULL DEFAULT 'monitor',
  viral_score REAL NOT NULL DEFAULT 0,
  momentum_score REAL NOT NULL DEFAULT 0,
  saturation_score REAL NOT NULL DEFAULT 0,
  confidence_score REAL NOT NULL DEFAULT 0,
  growth_pct REAL NOT NULL DEFAULT 0,
  total_views INTEGER NOT NULL DEFAULT 0,
  views_per_hour REAL NOT NULL DEFAULT 0,
  engagement_rate REAL NOT NULL DEFAULT 0,
  creator_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  search_volume INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  source_list TEXT NOT NULL DEFAULT '[]',
  first_detected_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_scored_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_trends_score ON trends(viral_score DESC);
CREATE INDEX IF NOT EXISTS idx_trends_lifecycle ON trends(lifecycle, viral_score DESC);
CREATE INDEX IF NOT EXISTS idx_trends_category ON trends(category, viral_score DESC);
CREATE INDEX IF NOT EXISTS idx_trends_last_seen ON trends(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  trend_id TEXT NOT NULL,
  source TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  metric_value REAL NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  creator_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  search_volume INTEGER NOT NULL DEFAULT 0,
  views_per_hour REAL NOT NULL DEFAULT 0,
  engagement_rate REAL NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (trend_id) REFERENCES trends(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_observations_trend_time ON observations(trend_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_source_time ON observations(source, collected_at DESC);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  trend_id TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  creator TEXT,
  published_at TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  thumbnail_url TEXT,
  collected_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (trend_id) REFERENCES trends(id) ON DELETE CASCADE,
  UNIQUE(trend_id, source, url)
);

CREATE INDEX IF NOT EXISTS idx_evidence_trend_time ON evidence(trend_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'Food',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collector_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  items_found INTEGER NOT NULL DEFAULT 0,
  items_saved INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_collector_runs_source_time ON collector_runs(source, started_at DESC);

CREATE TABLE IF NOT EXISTS score_history (
  id TEXT PRIMARY KEY,
  trend_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  viral_score REAL NOT NULL,
  momentum_score REAL NOT NULL,
  saturation_score REAL NOT NULL,
  growth_pct REAL NOT NULL,
  lifecycle TEXT NOT NULL,
  FOREIGN KEY (trend_id) REFERENCES trends(id) ON DELETE CASCADE,
  UNIQUE(trend_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_score_history_trend_time ON score_history(trend_id, captured_at DESC);

INSERT OR IGNORE INTO watchlist (id, query, category, active, created_at) VALUES
  ('wl_food_viral', 'makanan viral indonesia', 'Food', 1, datetime('now')),
  ('wl_dessert_viral', 'dessert viral indonesia', 'Dessert', 1, datetime('now')),
  ('wl_drink_viral', 'minuman viral indonesia', 'Beverage', 1, datetime('now')),
  ('wl_snack_viral', 'jajanan viral indonesia', 'Snack', 1, datetime('now')),
  ('wl_pastry_viral', 'pastry viral', 'Pastry', 1, datetime('now')),
  ('wl_tiktok_food', 'resep viral tiktok indonesia', 'Food', 1, datetime('now'));
