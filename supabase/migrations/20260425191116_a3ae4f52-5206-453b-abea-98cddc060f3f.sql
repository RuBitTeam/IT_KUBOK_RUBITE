ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS social_account_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];