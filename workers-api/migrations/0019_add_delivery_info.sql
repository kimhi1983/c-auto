-- 배송정보 컬럼 추가 (도착주소, 담당자명, 연락처)
ALTER TABLE order_workflows ADD COLUMN delivery_address TEXT;
ALTER TABLE order_workflows ADD COLUMN delivery_contact TEXT;
ALTER TABLE order_workflows ADD COLUMN delivery_phone TEXT;
