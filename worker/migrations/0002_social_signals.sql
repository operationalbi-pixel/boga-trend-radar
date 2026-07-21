ALTER TABLE observations ADD COLUMN shares INTEGER NOT NULL DEFAULT 0;
ALTER TABLE observations ADD COLUMN region TEXT NOT NULL DEFAULT 'ID';
ALTER TABLE observations ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'api';

ALTER TABLE evidence ADD COLUMN shares INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'api';

ALTER TABLE trends ADD COLUMN total_shares INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_observations_mode_time ON observations(data_mode, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_social_time ON observations(source, collected_at DESC)
  WHERE source IN ('tiktok', 'instagram');
