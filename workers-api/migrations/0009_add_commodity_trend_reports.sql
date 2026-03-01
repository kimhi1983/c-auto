-- 원료가격트렌드 보고서 이력 테이블
CREATE TABLE IF NOT EXISTS commodity_trend_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  commodities_data TEXT NOT NULL,
  exchange_rates TEXT,
  analysis TEXT,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ctr_date ON commodity_trend_reports(report_date);
