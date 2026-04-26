-- Add 'task' to notification_type enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'task'
  ) THEN
    ALTER TYPE public.notification_type ADD VALUE 'task';
  END IF;
END$$;

-- Task role enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_role') THEN
    CREATE TYPE public.task_role AS ENUM ('copywriter', 'designer', 'other');
  END IF;
END$$;

-- Task status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE public.task_status AS ENUM ('open', 'done');
  END IF;
END$$;

-- post_tasks table
CREATE TABLE IF NOT EXISTS public.post_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL,
  created_by uuid NOT NULL,
  task_role public.task_role NOT NULL DEFAULT 'other',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  deadline timestamptz,
  status public.task_status NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  completed_by uuid,
  reminder_24h_sent boolean NOT NULL DEFAULT false,
  reminder_dayof_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_tasks_workspace ON public.post_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_post_tasks_assignee ON public.post_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_post_tasks_post ON public.post_tasks(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tasks_status_deadline ON public.post_tasks(status, deadline);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_post_tasks_updated_at ON public.post_tasks;
CREATE TRIGGER trg_post_tasks_updated_at
BEFORE UPDATE ON public.post_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.post_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view post tasks" ON public.post_tasks;
CREATE POLICY "Members view post tasks"
ON public.post_tasks FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Members create post tasks" ON public.post_tasks;
CREATE POLICY "Members create post tasks"
ON public.post_tasks FOR INSERT TO authenticated
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND created_by = auth.uid()
  AND (
    -- editors can assign anyone
    public.can_edit_workspace(workspace_id, auth.uid())
    -- regular members can only create personal tasks for themselves
    OR assignee_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Editors or assignee or author update tasks" ON public.post_tasks;
CREATE POLICY "Editors or assignee or author update tasks"
ON public.post_tasks FOR UPDATE TO authenticated
USING (
  public.can_edit_workspace(workspace_id, auth.uid())
  OR assignee_id = auth.uid()
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "Editors or author delete tasks" ON public.post_tasks;
CREATE POLICY "Editors or author delete tasks"
ON public.post_tasks FOR DELETE TO authenticated
USING (
  public.can_edit_workspace(workspace_id, auth.uid())
  OR created_by = auth.uid()
);