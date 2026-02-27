-- CoA 성적서 파일 저장소 메타데이터
CREATE TABLE IF NOT EXISTS coa_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT,
  dropbox_path TEXT NOT NULL,
  note TEXT,
  tags TEXT,
  uploaded_by INTEGER,
  uploaded_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_coa_docs_name ON coa_documents(file_name);
CREATE INDEX idx_coa_docs_original ON coa_documents(original_name);
CREATE INDEX idx_coa_docs_uploader ON coa_documents(uploaded_by_name);
CREATE INDEX idx_coa_docs_created ON coa_documents(created_at);
