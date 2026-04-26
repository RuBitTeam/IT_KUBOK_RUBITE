-- Add external_post_ids to posts to track per-account VK/TG post IDs after publishing.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS external_post_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add timezone to workspaces (default Asia/Krasnoyarsk per user request fallback)
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Krasnoyarsk';