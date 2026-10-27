-- 之前只記 input/output,沒記快取 token,成本會低估。從這期開始記完整。
ALTER TABLE runs ADD COLUMN cache_read INTEGER;
ALTER TABLE runs ADD COLUMN cache_write INTEGER;
