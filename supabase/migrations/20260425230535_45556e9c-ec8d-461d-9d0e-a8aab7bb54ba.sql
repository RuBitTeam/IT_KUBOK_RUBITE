-- Watchers (доп. участники) для задачи
CREATE TABLE IF NOT EXISTS public.post_task_watchers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.post_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_task_watchers_task_id ON public.post_task_watchers(task_id);
CREATE INDEX IF NOT EXISTS idx_post_task_watchers_user_id ON public.post_task_watchers(user_id);

ALTER TABLE public.post_task_watchers ENABLE ROW LEVEL SECURITY;

-- Helper: workspace_id задачи
CREATE OR REPLACE FUNCTION public.workspace_of_task(_task_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM public.post_tasks WHERE id = _task_id;
$$;

-- View: участники пространства задачи
CREATE POLICY "Members view task watchers"
ON public.post_task_watchers
FOR SELECT
TO authenticated
USING (public.is_workspace_member(public.workspace_of_task(task_id), auth.uid()));

-- Insert: редактор пространства или автор задачи
CREATE POLICY "Editors or task author insert watchers"
ON public.post_task_watchers
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_edit_workspace(public.workspace_of_task(task_id), auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.post_tasks t
    WHERE t.id = task_id AND t.created_by = auth.uid()
  )
);

-- Delete: редактор или автор задачи или сам watcher
CREATE POLICY "Editors author or self delete watchers"
ON public.post_task_watchers
FOR DELETE
TO authenticated
USING (
  public.can_edit_workspace(public.workspace_of_task(task_id), auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.post_tasks t
    WHERE t.id = task_id AND t.created_by = auth.uid()
  )
  OR user_id = auth.uid()
);