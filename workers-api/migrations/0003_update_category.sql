-- 카테고리 CHECK 제약 조건 업데이트: 구 8개 → 신 5개
-- SQLite는 ALTER TABLE로 CHECK 변경 불가, 테이블 재생성 필요

CREATE TABLE emails_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  subject TEXT,
  sender TEXT,
  recipient TEXT,
  body TEXT,
  body_html TEXT,
  category TEXT DEFAULT '필터링',
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  status TEXT DEFAULT 'unread' CHECK(status IN ('unread','read','draft','in_review','approved','rejected','sent','archived')),
  ai_summary TEXT,
  ai_draft_response TEXT,
  ai_confidence INTEGER,
  draft_response TEXT,
  draft_subject TEXT,
  processed_by INTEGER REFERENCES users(id),
  received_at TEXT,
  processed_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO emails_new SELECT * FROM emails;

DROP TABLE emails;

ALTER TABLE emails_new RENAME TO emails;
