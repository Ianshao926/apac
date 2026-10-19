-- 由正式環境 D1 的資料表結構還原(原檔留在本機)。已套用過,wrangler 不會重跑。
CREATE TABLE brands (
  id TEXT PRIMARY KEY,              -- 'chagee'
  name_zh TEXT NOT NULL,            -- 霸王茶姬
  name_en TEXT,                     -- CHAGEE
  markets TEXT NOT NULL,            -- JSON array: ["SG","MY"]
  focus TEXT NOT NULL,              -- 搜尋重點(給模型看的一段話)
  domains TEXT NOT NULL,            -- JSON array of official hostnames
  tier TEXT NOT NULL,               -- core | apac | tw
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE issues (
  week TEXT PRIMARY KEY,            -- '2026-W42'
  no INTEGER,                       -- 第幾期
  range_start TEXT NOT NULL,        -- '2026-10-12'
  range_end TEXT NOT NULL,          -- '2026-10-18'
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | published
  theme_line TEXT,                  -- 本週主題一句
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,              -- 'W42-chagee-01'
  week TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  category TEXT NOT NULL,           -- new_product | campaign | loyalty
  market TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  observation TEXT,
  date_start TEXT,
  date_end TEXT,
  status_note TEXT,                 -- 持續中 / 已結束 / 財報
  confidence TEXT NOT NULL,         -- verified (>=2 sources) | single
  is_lead INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 100,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_items_week ON items(week);
CREATE INDEX idx_items_brand ON items(brand_id, created_at);

CREATE TABLE item_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  url TEXT NOT NULL,
  publisher TEXT,
  title TEXT,
  published_at TEXT,
  is_official INTEGER NOT NULL DEFAULT 0,
  UNIQUE(item_id, url)
);
CREATE INDEX idx_sources_url ON item_sources(url);

CREATE TABLE item_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  kv_key TEXT NOT NULL,             -- 'img/W42-chagee-01/1'
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  source_url TEXT NOT NULL,         -- 圖片原始網址
  page_url TEXT,                    -- 取自哪一頁
  credit TEXT NOT NULL,             -- '官方素材 · CHAGEE SG' 或 '報導配圖 · Eatbook'
  is_official INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 1,
  UNIQUE(item_id, source_url)
);
CREATE INDEX idx_images_item ON item_images(item_id, sort);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  status TEXT NOT NULL,             -- ok | quiet | error
  items_found INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER, output_tokens INTEGER, searches INTEGER,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  UNIQUE(week, brand_id)
);
