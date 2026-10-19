-- 亞太寶寶:Teams 群組的 AI 同事。聊天紀錄、每日大綱、知識庫、用量。

-- 她被裝進去的每個對話(群組或私訊)
CREATE TABLE chats (
  id TEXT PRIMARY KEY,                 -- '19:...@thread.v2'(群組)或 'a:...'(私訊)
  kind TEXT NOT NULL,                  -- groupChat | personal | channel
  name TEXT,
  service_url TEXT NOT NULL,           -- 回話要用的 Bot Framework 服務網址
  tenant_id TEXT,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  active INTEGER NOT NULL DEFAULT 1,
  summary_enabled INTEGER NOT NULL DEFAULT 1,
  last_summary_date TEXT               -- 'YYYY-MM-DD'(台北日期)
);

-- 對話紀錄。即時收到的(live)和事後從 Graph 補抓的(graph)都放這裡,靠 teams_id 去重。
CREATE TABLE messages (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  teams_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  ts TEXT NOT NULL,                    -- ISO UTC
  from_id TEXT,
  from_name TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  images INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'live', -- live | graph
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_chat_ts ON messages(chat_id, ts);

-- 全文檢索(trigram 才搜得到中文)
CREATE VIRTUAL TABLE messages_fts USING fts5(text, content='messages', content_rowid='rowid', tokenize='trigram');
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;

-- 每日大綱
CREATE TABLE summaries (
  chat_id TEXT NOT NULL,
  date TEXT NOT NULL,                  -- 台北日期
  text TEXT NOT NULL,
  model TEXT,
  messages INTEGER NOT NULL DEFAULT 0,
  posted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, date)
);

-- 知識庫:一份文件拆成多段,每段一個向量(向量存在 Vectorize,文字存這裡)
CREATE TABLE kb_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- url | text | summary
  source_url TEXT,
  chat_id TEXT,                        -- NULL = 共用知識;有值 = 只有那個對話看得到(每日大綱)
  added_by TEXT,
  chars INTEGER NOT NULL DEFAULT 0,
  chunks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE kb_chunks (
  id TEXT PRIMARY KEY,                 -- '12-0'
  doc_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX idx_kb_chunks_doc ON kb_chunks(doc_id, seq);

-- 每次呼叫模型的用量與成本(預算控制靠這張表)
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  chat_id TEXT,
  kind TEXT NOT NULL,                  -- triage | answer | summary
  model TEXT NOT NULL,
  input INTEGER NOT NULL DEFAULT 0,
  output INTEGER NOT NULL DEFAULT 0,
  cache_read INTEGER NOT NULL DEFAULT 0,
  cache_write INTEGER NOT NULL DEFAULT 0,
  searches INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_usage_ts ON usage(ts);
