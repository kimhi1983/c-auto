-- Migration 0012: 워크플로우 승인 관련 필드 추가
-- 새 상태: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED

ALTER TABLE order_workflows ADD COLUMN approved_by INTEGER;
ALTER TABLE order_workflows ADD COLUMN approved_at TEXT;
ALTER TABLE order_workflows ADD COLUMN rejection_reason TEXT;
ALTER TABLE order_workflows ADD COLUMN order_number TEXT;
ALTER TABLE order_workflows ADD COLUMN customer_name TEXT;

CREATE INDEX IF NOT EXISTS idx_ow_approval ON order_workflows(status) WHERE status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');
