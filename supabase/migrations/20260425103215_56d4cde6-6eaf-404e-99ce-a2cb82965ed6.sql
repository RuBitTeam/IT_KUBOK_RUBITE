-- Replace posts RLS with workspace-role-based rules
DROP POLICY IF EXISTS "Admins delete posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated view posts" ON public.posts;
DROP POLICY IF EXISTS "Editors and admins create posts" ON public.posts;
DROP POLICY IF EXISTS "Editors and admins update posts" ON public.posts;

-- View: any member of the workspace
CREATE POLICY "Workspace members view posts"
ON public.posts FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

-- Insert:
--   editor/admin/owner: any post in the workspace (must be author)
--   viewer: only own draft (is_draft = true)
CREATE POLICY "Workspace contributors create posts"
ON public.posts FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = author_id
  AND (
    public.can_edit_workspace(workspace_id, auth.uid())
    OR (
      public.is_workspace_member(workspace_id, auth.uid())
      AND is_draft = true
    )
  )
);

-- Update:
--   editor/admin/owner: any post in workspace
--   viewer: only own draft, and it must remain a draft
CREATE POLICY "Workspace contributors update posts"
ON public.posts FOR UPDATE
TO authenticated
USING (
  public.can_edit_workspace(workspace_id, auth.uid())
  OR (
    author_id = auth.uid()
    AND is_draft = true
    AND public.is_workspace_member(workspace_id, auth.uid())
  )
)
WITH CHECK (
  public.can_edit_workspace(workspace_id, auth.uid())
  OR (
    author_id = auth.uid()
    AND is_draft = true
  )
);

-- Delete:
--   admin/owner of workspace: anything
--   viewer: own draft only
CREATE POLICY "Workspace admins or draft authors delete posts"
ON public.posts FOR DELETE
TO authenticated
USING (
  public.can_admin_workspace(workspace_id, auth.uid())
  OR (author_id = auth.uid() AND is_draft = true)
);

-- Restrict workspace member management to owners only (not admins)
DROP POLICY IF EXISTS "Admins manage workspace users" ON public.workspace_users;
DROP POLICY IF EXISTS "Admins update workspace users" ON public.workspace_users;
DROP POLICY IF EXISTS "Admins delete workspace users" ON public.workspace_users;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id AND owner_id = _user_id
  );
$$;

CREATE POLICY "Owner adds workspace users"
ON public.workspace_users FOR INSERT
TO authenticated
WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "Owner updates workspace users"
ON public.workspace_users FOR UPDATE
TO authenticated
USING (public.is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "Owner deletes workspace users"
ON public.workspace_users FOR DELETE
TO authenticated
USING (public.is_workspace_owner(workspace_id, auth.uid()));
