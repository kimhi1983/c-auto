-- 품목 마스터 테이블 (이카운트 + KPROS 통합)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prod_cd TEXT,                -- 이카운트 품목코드
  prod_des TEXT NOT NULL,      -- 품목명
  prod_des2 TEXT,              -- 품목명2 (영문/별칭)
  unit TEXT,                   -- 단위 (KG, EA 등)
  sell_price REAL DEFAULT 0,   -- 판매가
  cost_price REAL DEFAULT 0,   -- 원가
  class_cd TEXT,               -- 분류코드
  class_des TEXT,              -- 분류명
  brand TEXT,                  -- 브랜드 (KPROS braNmList)
  manufacturer TEXT,           -- 제조사 (KPROS manuNmList)
  source TEXT DEFAULT 'manual', -- 출처: ecount | kpros | manual
  kpros_product_idx INTEGER,   -- KPROS productIdx (동기화 키)
  is_active INTEGER NOT NULL DEFAULT 1,
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_prod_cd ON products(prod_cd);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(prod_des);
CREATE INDEX IF NOT EXISTS idx_products_class ON products(class_cd);
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source);
