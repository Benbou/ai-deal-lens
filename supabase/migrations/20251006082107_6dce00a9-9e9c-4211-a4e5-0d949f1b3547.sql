-- Fix security: Move roles to separate table to avoid infinite recursion
-- Step 1: Drop existing policies that depend on the role column

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all deals" ON public.deals;
DROP POLICY IF EXISTS "Admins can view all analyses" ON public.analyses;
DROP POLICY IF EXISTS "Admins can view all deck files" ON public.deck_files;
DROP POLICY IF EXISTS "Admins can view all deck files" ON storage.objects;

-- Step 2: Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Step 3: Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 4: Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Step 5: Remove role column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

-- Step 6: Recreate admin policies using the new function
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all deals"
ON public.deals
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all analyses"
ON public.analyses
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all deck files"
ON public.deck_files
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Step 7: Add missing DELETE and UPDATE policies
CREATE POLICY "Users can delete own deck files"
ON public.deck_files
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM deals
  WHERE deals.id = deck_files.deal_id
    AND deals.user_id = auth.uid()
));

CREATE POLICY "Users can update own deck files"
ON public.deck_files
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM deals
  WHERE deals.id = deck_files.deal_id
    AND deals.user_id = auth.uid()
));

CREATE POLICY "System can insert analyses"
ON public.analyses
FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update analyses"
ON public.analyses
FOR UPDATE
USING (true);

CREATE POLICY "Users can update own kpis"
ON public.investment_kpis
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM deals
  WHERE deals.id = investment_kpis.deal_id
    AND deals.user_id = auth.uid()
));

CREATE POLICY "Users can delete own kpis"
ON public.investment_kpis
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM deals
  WHERE deals.id = investment_kpis.deal_id
    AND deals.user_id = auth.uid()
));

CREATE POLICY "Users can delete own deck files from storage"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'deck-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own deck files in storage"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'deck-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Step 8: Add database constraints for validation
ALTER TABLE deals
  ADD CONSTRAINT deals_startup_name_length CHECK (char_length(startup_name) > 0 AND char_length(startup_name) <= 200),
  ADD CONSTRAINT deals_sector_length CHECK (char_length(sector) > 0 AND char_length(sector) <= 100),
  ADD CONSTRAINT deals_stage_length CHECK (char_length(stage) > 0 AND char_length(stage) <= 50),
  ADD CONSTRAINT deals_country_length CHECK (char_length(country) > 0 AND char_length(country) <= 100),
  ADD CONSTRAINT deals_website_valid CHECK (website IS NULL OR website ~ '^https?://'),
  ADD CONSTRAINT deals_personal_notes_length CHECK (personal_notes IS NULL OR char_length(personal_notes) <= 5000);

ALTER TABLE profiles
  ADD CONSTRAINT profiles_name_length CHECK (char_length(name) > 0 AND char_length(name) <= 100),
  ADD CONSTRAINT profiles_email_length CHECK (char_length(email) > 0 AND char_length(email) <= 255);

ALTER TABLE notes
  ADD CONSTRAINT notes_content_length CHECK (char_length(content) > 0 AND char_length(content) <= 50000);

-- Step 9: User roles policies
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));