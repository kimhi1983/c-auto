-- daily_reports 테이블의 report_type CHECK 제약 업데이트
-- 기존: ('daily','weekly','monthly')
-- 추가: 'smart_inventory'
-- SQLite는 ALTER TABLE로 CHECK 변경 불가, 테이블 재생성 필요

CREATE TABLE daily_reports_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  report_type TEXT NOT NULL,
  file_path TEXT,
  file_name TEXT,
  generated_by INTEGER REFERENCES users(id),
  email_count INTEGER DEFAULT 0,
  inventory_transactions INTEGER DEFAULT 0,
  summary_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO daily_reports_new SELECT * FROM daily_reports;

DROP TABLE daily_reports;

ALTER TABLE daily_reports_new RENAME TO daily_reports;
