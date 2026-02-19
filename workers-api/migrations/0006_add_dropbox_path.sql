-- Add dropbox_path column to email_attachments for tracking Dropbox storage location
ALTER TABLE email_attachments ADD COLUMN dropbox_path TEXT;
