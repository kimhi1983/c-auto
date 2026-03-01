-- Migration 0011: 워크플로우 문서(CoA 성적서 등) 메타데이터
CREATE TABLE IF NOT EXISTS workflow_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'COA',
  file_name TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  dropbox_path TEXT,
  note TEXT,
  uploaded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_wd_workflow ON workflow_documents(workflow_id);
CREATE INDEX idx_wd_type ON workflow_documents(document_type);
