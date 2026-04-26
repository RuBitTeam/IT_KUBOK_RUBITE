
-- 1) Extend notification_type enum
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'suggestion';

-- 2) Suggestion status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suggestion_status') THEN
    CREATE TYPE public.suggestion_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END$$;

-- 3) suggested_posts table
CREATE TABLE IF NOT EXISTS public.suggested_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  author_id uuid NOT NULL,
  text text NOT NULL DEFAULT '',
  media text[] NOT NULL DEFAULT '{}',
  status public.suggestion_status NOT NULL DEFAULT 'pending',
  converted_post_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suggested_posts_ws ON public.suggested_posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_suggested_posts_status ON public.suggested_posts(status);

ALTER TABLE public.suggested_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view suggestions" ON public.suggested_posts;
CREATE POLICY "Members view suggestions"
  ON public.suggested_posts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Members create suggestions" ON public.suggested_posts;
CREATE POLICY "Members create suggestions"
  ON public.suggested_posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND public.is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "Editors or author update suggestions" ON public.suggested_posts;
CREATE POLICY "Editors or author update suggestions"
  ON public.suggested_posts FOR UPDATE TO authenticated
  USING (
    public.can_edit_workspace(workspace_id, auth.uid())
    OR author_id = auth.uid()
  );

DROP POLICY IF EXISTS "Editors or author delete suggestions" ON public.suggested_posts;
CREATE POLICY "Editors or author delete suggestions"
  ON public.suggested_posts FOR DELETE TO authenticated
  USING (
    public.can_edit_workspace(workspace_id, auth.uid())
    OR author_id = auth.uid()
  );

DROP TRIGGER IF EXISTS trg_suggested_posts_updated_at ON public.suggested_posts;
CREATE TRIGGER trg_suggested_posts_updated_at
  BEFORE UPDATE ON public.suggested_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Link from posts to suggestion
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS suggested_post_id uuid;

-- 5) Fix DELETE policy on posts so editors can delete too
DROP POLICY IF EXISTS "Workspace admins or authors delete posts" ON public.posts;
CREATE POLICY "Workspace contributors delete posts"
  ON public.posts FOR DELETE TO authenticated
  USING (
    public.can_edit_workspace(workspace_id, auth.uid())
    OR author_id = auth.uid()
  );
