-- coa_documents에 제품 메타데이터 컬럼 추가
ALTER TABLE coa_documents ADD COLUMN product_name TEXT;
ALTER TABLE coa_documents ADD COLUMN lot_no TEXT;
ALTER TABLE coa_documents ADD COLUMN manu_date TEXT;
ALTER TABLE coa_documents ADD COLUMN valid_date TEXT;
CREATE INDEX idx_coa_docs_product ON coa_documents(product_name);
CREATE INDEX idx_coa_docs_lot ON coa_documents(lot_no);
