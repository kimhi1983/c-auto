-- Companies (거래처 관리)
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_cd TEXT,
  company_nm TEXT NOT NULL,
  ceo_nm TEXT,
  biz_no TEXT,
  tel TEXT,
  fax TEXT,
  email TEXT,
  addr TEXT,
  memo TEXT,
  manager_nm TEXT,
  manager_tel TEXT,
  manager_email TEXT,
  company_type TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  kpros_idx INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_nm);
CREATE INDEX IF NOT EXISTS idx_companies_cd ON companies(company_cd);
CREATE INDEX IF NOT EXISTS idx_companies_biz_no ON companies(biz_no);
