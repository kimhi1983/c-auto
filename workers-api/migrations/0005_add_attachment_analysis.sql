-- email_attachments 테이블에 AI 분석 결과 컬럼 추가
ALTER TABLE email_attachments ADD COLUMN ai_analysis TEXT;
