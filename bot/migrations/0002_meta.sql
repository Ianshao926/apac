-- 小型鍵值表:記她宣布到哪一筆更新、滿月說過了沒
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
