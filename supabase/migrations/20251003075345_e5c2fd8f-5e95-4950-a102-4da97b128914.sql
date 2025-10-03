-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  investment_focus TEXT[], -- array of sectors
  check_size_min INTEGER,
  check_size_max INTEGER,
  country TEXT,
  role TEXT DEFAULT 'user', -- 'user' or 'admin'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Deals
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  startup_name TEXT NOT NULL,
  website TEXT,
  amount_raised_cents INTEGER, -- store in cents to avoid float issues
  currency TEXT DEFAULT 'EUR',
  pre_money_valuation_cents INTEGER,
  sector TEXT NOT NULL,
  stage TEXT NOT NULL,
  country TEXT NOT NULL,
  personal_notes TEXT,
  status TEXT DEFAULT 'pending', -- pending/analyzing/completed/failed
  analysis_started_at TIMESTAMPTZ,
  analysis_completed_at TIMESTAMPTZ,
  maturity_level TEXT, -- Early/Growth/Mature
  risk_score INTEGER CHECK (risk_score >= 1 AND risk_score <= 5),
  valuation_gap_percent NUMERIC(5,2), -- e.g., 25.50 for +25.5%
  is_invested BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on deals
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- Deals RLS policies
CREATE POLICY "Users can view own deals" ON deals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all deals" ON deals FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can insert own deals" ON deals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own deals" ON deals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own deals" ON deals FOR DELETE USING (auth.uid() = user_id);

-- Deck Files
CREATE TABLE IF NOT EXISTS deck_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT,
  thumbnail_path TEXT,
  docsend_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on deck_files
ALTER TABLE deck_files ENABLE ROW LEVEL SECURITY;

-- Deck files RLS policies
CREATE POLICY "Users can view own deck files" ON deck_files FOR SELECT USING (
  EXISTS (SELECT 1 FROM deals WHERE deals.id = deck_files.deal_id AND deals.user_id = auth.uid())
);
CREATE POLICY "Admins can view all deck files" ON deck_files FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can insert own deck files" ON deck_files FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM deals WHERE deals.id = deck_files.deal_id AND deals.user_id = auth.uid())
);

-- Analysis Results
CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'queued', -- queued/extracting/analyzing/finalizing/completed/failed
  current_step TEXT,
  progress_percent INTEGER DEFAULT 0,
  result JSONB,
  error_message TEXT,
  error_details JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on analyses
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Analyses RLS policies
CREATE POLICY "Users can view own analyses" ON analyses FOR SELECT USING (
  EXISTS (SELECT 1 FROM deals WHERE deals.id = analyses.deal_id AND deals.user_id = auth.uid())
);
CREATE POLICY "Admins can view all analyses" ON analyses FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- User Notes
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  content_html TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on notes
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Notes RLS policies
CREATE POLICY "Users can view own notes" ON notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON notes FOR DELETE USING (auth.uid() = user_id);

-- Investment KPIs
CREATE TABLE IF NOT EXISTS investment_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  arr_cents INTEGER,
  customer_count INTEGER,
  runway_months NUMERIC(4,1),
  burn_rate_monthly_cents INTEGER,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on investment_kpis
ALTER TABLE investment_kpis ENABLE ROW LEVEL SECURITY;

-- KPIs RLS policies
CREATE POLICY "Users can view own kpis" ON investment_kpis FOR SELECT USING (
  EXISTS (SELECT 1 FROM deals WHERE deals.id = investment_kpis.deal_id AND deals.user_id = auth.uid())
);
CREATE POLICY "Users can insert own kpis" ON investment_kpis FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM deals WHERE deals.id = investment_kpis.deal_id AND deals.user_id = auth.uid())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_deals_user_id ON deals(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_sector ON deals(sector);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_deal_id ON analyses(deal_id);

-- Enable realtime for deals and analyses
ALTER PUBLICATION supabase_realtime ADD TABLE deals;
ALTER PUBLICATION supabase_realtime ADD TABLE analyses;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create profile on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();