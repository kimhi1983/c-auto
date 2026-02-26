-- 워크플로우 메모리(학습) 테이블
-- 거래처, 품목단가, 창고배정 등 과거 입력 패턴을 학습하여 자동완성 제공
CREATE TABLE IF NOT EXISTS workflow_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_type TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  frequency INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wm_type_key ON workflow_memory(memory_type, memory_key);
CREATE INDEX IF NOT EXISTS idx_wm_type ON workflow_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_wm_freq ON workflow_memory(frequency DESC);
