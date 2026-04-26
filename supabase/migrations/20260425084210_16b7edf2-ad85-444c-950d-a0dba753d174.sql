
-- 1) social_accounts
CREATE TYPE public.social_platform AS ENUM ('vk', 'telegram');
CREATE TYPE public.social_account_status AS ENUM ('connected', 'disconnected', 'error');

CREATE TABLE public.social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  platform public.social_platform NOT NULL,
  display_name TEXT NOT NULL,
  -- For Telegram: chat_id of the channel (e.g. @mychannel or -100123...).
  -- For VK: numeric group_id (without leading minus).
  target_chat TEXT NOT NULL,
  -- AES-GCM encrypted token. Format: base64(iv).base64(ciphertext+tag)
  encrypted_token TEXT NOT NULL,
  status public.social_account_status NOT NULL DEFAULT 'connected',
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors and admins view social accounts"
  ON public.social_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Editors and admins create social accounts"
  ON public.social_accounts FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin')) AND auth.uid() = owner_id);

CREATE POLICY "Editors and admins update social accounts"
  ON public.social_accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Editors and admins delete social accounts"
  ON public.social_accounts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_social_accounts_updated
  BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) media_assets
CREATE TABLE public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  bucket_path TEXT NOT NULL,        -- path in storage bucket 'post-media'
  public_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view media"
  ON public.media_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Editors and admins create media"
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin')) AND auth.uid() = owner_id);

CREATE POLICY "Editors and admins delete media"
  ON public.media_assets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin'));

-- 3) tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view tags"
  ON public.tags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Editors and admins create tags"
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins delete tags"
  ON public.tags FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 4) extend posts
ALTER TABLE public.posts
  ADD COLUMN social_account_id UUID REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  ADD COLUMN error_log TEXT,
  ADD COLUMN published_at TIMESTAMPTZ,
  ADD COLUMN retries INT NOT NULL DEFAULT 0;

CREATE INDEX idx_posts_scheduled
  ON public.posts (status, publish_date)
  WHERE status = 'scheduled';

-- 5) Storage bucket post-media (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media','post-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "post-media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

CREATE POLICY "post-media editors upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-media'
    AND (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin'))
  );

CREATE POLICY "post-media editors update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'post-media'
    AND (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin'))
  );

CREATE POLICY "post-media editors delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-media'
    AND (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin'))
  );

-- 6) pg_cron / pg_net for scheduler
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'autopost-scheduler-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--f3a726df-0167-45fb-82b4-5d55fad9e9b0.lovable.app/api/public/scheduler/run',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
