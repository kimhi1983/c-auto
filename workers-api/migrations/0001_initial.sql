-- C-Auto v3.0 Initial Schema
-- Cloudflare D1 (SQLite)

-- Users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin','approver','staff','viewer')),
  department TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Emails
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  subject TEXT,
  sender TEXT,
  recipient TEXT,
  body TEXT,
  body_html TEXT,
  category TEXT DEFAULT '기타' CHECK(category IN ('발주','요청','견적요청','문의','공지','미팅','클레임','기타')),
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

-- Email Approvals
CREATE TABLE IF NOT EXISTS email_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER NOT NULL REFERENCES emails(id),
  stage TEXT NOT NULL CHECK(stage IN ('draft','review','approval','send')),
  approver_id INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  comments TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Email Attachments
CREATE TABLE IF NOT EXISTS email_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER NOT NULL REFERENCES emails(id),
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  content_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- File Index
CREATE TABLE IF NOT EXISTS file_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_type TEXT,
  file_size INTEGER,
  directory TEXT,
  last_modified TEXT,
  is_accessible INTEGER DEFAULT 1,
  ai_tags TEXT,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Archived Documents
CREATE TABLE IF NOT EXISTS archived_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER REFERENCES emails(id),
  document_type TEXT NOT NULL CHECK(document_type IN ('pdf','excel','email','report','ai_document')),
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  company_name TEXT,
  category TEXT,
  description TEXT,
  archived_date TEXT NOT NULL DEFAULT (date('now')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Daily Reports
CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK(report_type IN ('daily','weekly','monthly')),
  file_path TEXT,
  file_name TEXT,
  generated_by INTEGER REFERENCES users(id),
  email_count INTEGER DEFAULT 0,
  inventory_transactions INTEGER DEFAULT 0,
  summary_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Exchange Rate History
CREATE TABLE IF NOT EXISTS exchange_rate_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  currency_pair TEXT NOT NULL,
  rate REAL NOT NULL,
  rate_date TEXT NOT NULL,
  source TEXT DEFAULT 'exchangerate-api',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inventory Items
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT UNIQUE,
  item_name TEXT NOT NULL,
  unit TEXT,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  max_stock INTEGER DEFAULT 0,
  unit_price REAL DEFAULT 0,
  supplier TEXT,
  category TEXT,
  location TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inventory Transactions
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('입고','출고')),
  quantity INTEGER NOT NULL,
  reference_number TEXT,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);
CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_email_approvals_email ON email_approvals(email_id);
CREATE INDEX IF NOT EXISTS idx_file_index_name ON file_index(file_name);
CREATE INDEX IF NOT EXISTS idx_archives_type ON archived_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_archives_company ON archived_documents(company_name);
CREATE INDEX IF NOT EXISTS idx_exchange_pair_date ON exchange_rate_history(currency_pair, rate_date);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory_items(item_name);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_item ON inventory_transactions(item_id);

-- Default admin user (password: admin1234!)
-- bcrypt hash of 'admin1234!' with 12 rounds
INSERT OR IGNORE INTO users (email, password_hash, full_name, role, department)
VALUES (
  'admin@company.com',
  '$2a$12$mNTUyGIvicLK5mnZwN2nTeapWN1i4mkYHCLip5KZiVJ.XOnMhxily',
  '관리자',
  'admin',
  '시스템관리'
);
