-- Migration 0008: KPROS 물류관리 7개 테이블 추가
-- 매입등록, 납품등록, 입고반영, 출고반영, 창고입고, 창고출고, 성적서(CoA)

-- 1. 매입등록 (Purchase Orders)
CREATE TABLE IF NOT EXISTS kpros_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpros_idx INTEGER UNIQUE,
  product_nm TEXT NOT NULL,
  bra_nm TEXT,
  company_nm TEXT,
  cost REAL,
  income_cost REAL,
  income_cost_unit_nm TEXT,
  lot_no TEXT,
  purchase_date TEXT,
  purchase_status TEXT,
  warehouse_nm TEXT,
  total_purchase_qty REAL,
  pkg_unit_nm TEXT,
  manu_date TEXT,
  valid_date TEXT,
  expect_wearing_date TEXT,
  real_wearing_date TEXT,
  prch_no TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kp_purchases_date ON kpros_purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_kp_purchases_company ON kpros_purchases(company_nm);
CREATE INDEX IF NOT EXISTS idx_kp_purchases_product ON kpros_purchases(product_nm);
CREATE INDEX IF NOT EXISTS idx_kp_purchases_lot ON kpros_purchases(lot_no);

-- 2. 납품등록 (Delivery Orders)
CREATE TABLE IF NOT EXISTS kpros_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpros_idx INTEGER UNIQUE,
  company_from_nm TEXT,
  company_to_nm TEXT,
  product_nm TEXT,
  due_date TEXT,
  delivery_status TEXT,
  delivery_status_str TEXT,
  delivery_bigo TEXT,
  warehouse_nm TEXT,
  expect_qty REAL,
  real_qty REAL,
  lot_no TEXT,
  dvr_no TEXT,
  order_date TEXT,
  order_method TEXT,
  pkg_unit_nm TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kp_deliveries_due ON kpros_deliveries(due_date);
CREATE INDEX IF NOT EXISTS idx_kp_deliveries_company ON kpros_deliveries(company_to_nm);
CREATE INDEX IF NOT EXISTS idx_kp_deliveries_product ON kpros_deliveries(product_nm);

-- 3. 입고반영 (Inbound Confirmation)
CREATE TABLE IF NOT EXISTS kpros_inbound (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpros_idx INTEGER UNIQUE,
  purchase_idx INTEGER,
  product_nm TEXT,
  bra_nm TEXT,
  company_nm TEXT,
  warehouse_nm TEXT,
  total_purchase_qty REAL,
  lot_no TEXT,
  purchase_date TEXT,
  purchase_status TEXT,
  expect_wearing_date TEXT,
  real_wearing_date TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kp_inbound_date ON kpros_inbound(real_wearing_date);
CREATE INDEX IF NOT EXISTS idx_kp_inbound_purchase ON kpros_inbound(purchase_idx);

-- 4. 출고반영 (Outbound Confirmation)
CREATE TABLE IF NOT EXISTS kpros_outbound (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpros_idx INTEGER UNIQUE,
  delivery_idx INTEGER,
  company_to_nm TEXT,
  product_nm TEXT,
  warehouse_nm TEXT,
  expect_qty REAL,
  real_qty REAL,
  lot_no TEXT,
  due_date TEXT,
  delivery_status TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kp_outbound_date ON kpros_outbound(due_date);
CREATE INDEX IF NOT EXISTS idx_kp_outbound_delivery ON kpros_outbound(delivery_idx);

-- 5. 창고입고 (Warehouse Receipt)
CREATE TABLE IF NOT EXISTS kpros_warehouse_in (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpros_idx INTEGER UNIQUE,
  product_nm TEXT,
  bra_nm TEXT,
  warehouse_nm TEXT,
  company_nm TEXT,
  total_purchase_qty REAL,
  lot_no TEXT,
  purchase_date TEXT,
  real_wearing_date TEXT,
  purchase_status TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kp_wh_in_date ON kpros_warehouse_in(real_wearing_date);

-- 6. 창고출고 (Warehouse Release)
CREATE TABLE IF NOT EXISTS kpros_warehouse_out (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpros_idx INTEGER UNIQUE,
  company_to_nm TEXT,
  product_nm TEXT,
  warehouse_nm TEXT,
  expect_qty REAL,
  real_qty REAL,
  lot_no TEXT,
  due_date TEXT,
  delivery_status TEXT,
  dvr_no TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kp_wh_out_date ON kpros_warehouse_out(due_date);

-- 7. 성적서 CoA (Certificates of Analysis)
CREATE TABLE IF NOT EXISTS kpros_coa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_idx INTEGER,
  product_nm TEXT NOT NULL,
  warehouse_nm TEXT,
  lot_no TEXT,
  company_nm TEXT,
  manu_date TEXT,
  valid_date TEXT,
  bra_nm TEXT,
  reports_exist INTEGER DEFAULT 0,
  pkg_amount REAL,
  pkg_unit_nm TEXT,
  total_amount REAL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kp_coa_product ON kpros_coa(product_nm);
CREATE INDEX IF NOT EXISTS idx_kp_coa_lot ON kpros_coa(lot_no);
CREATE INDEX IF NOT EXISTS idx_kp_coa_valid ON kpros_coa(valid_date);
