-- Allow temporary deals from WhatsApp without user_id
ALTER TABLE deals ALTER COLUMN user_id DROP NOT NULL;