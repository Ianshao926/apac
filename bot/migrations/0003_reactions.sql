-- 表情回饋:別人對她的訊息按的表情(即時收到),以及補抓紀錄時看到的每則訊息被按了幾個讚
ALTER TABLE messages ADD COLUMN reactions INTEGER NOT NULL DEFAULT 0;

CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,            -- 她那則訊息的 teams_id
  from_id TEXT,
  from_name TEXT,
  reaction TEXT NOT NULL,              -- like | heart | laugh | surprised | sad | angry | ...
  score INTEGER NOT NULL,              -- +1 正面、-1 負面、0 中性
  removed INTEGER NOT NULL DEFAULT 0,  -- 1 = 收回
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_feedback_chat ON feedback(chat_id, ts);
