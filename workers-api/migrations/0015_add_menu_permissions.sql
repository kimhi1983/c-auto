-- 사용자별 메뉴 접근 권한 (JSON 배열 형태의 TEXT)
-- NULL = 전체 메뉴 접근 가능 (기존 사용자 호환)
ALTER TABLE users ADD COLUMN menu_permissions TEXT DEFAULT NULL;
