-- Phase 1: Add phone to profiles table
ALTER TABLE profiles ADD COLUMN phone TEXT UNIQUE;

-- Index for fast phone lookup
CREATE INDEX idx_profiles_phone ON profiles(phone);

-- Add temporary identification fields to deals table
ALTER TABLE deals ADD COLUMN temp_phone TEXT;
ALTER TABLE deals ADD COLUMN temp_email TEXT;

-- Index for orphan deals lookup
CREATE INDEX idx_deals_temp_phone ON deals(temp_phone) WHERE temp_phone IS NOT NULL;
CREATE INDEX idx_deals_temp_email ON deals(temp_email) WHERE temp_email IS NOT NULL;