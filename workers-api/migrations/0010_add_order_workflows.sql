-- 주문처리 워크플로우 트래커
CREATE TABLE IF NOT EXISTS order_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ERP_SUBMITTED',
  io_date TEXT NOT NULL,
  cust_cd TEXT,
  cust_name TEXT,
  items_data TEXT NOT NULL,
  total_amount REAL DEFAULT 0,
  erp_result TEXT,
  erp_submitted_at TEXT,
  step2_at TEXT,
  step3_at TEXT,
  step4_at TEXT,
  step5_at TEXT,
  note TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ow_type ON order_workflows(workflow_type);
CREATE INDEX idx_ow_status ON order_workflows(status);
CREATE INDEX idx_ow_date ON order_workflows(io_date);
