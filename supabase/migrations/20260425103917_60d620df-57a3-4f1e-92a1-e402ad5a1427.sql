DROP POLICY IF EXISTS "Workspace contributors create posts" ON public.posts;
DROP POLICY IF EXISTS "Workspace contributors update posts" ON public.posts;
DROP POLICY IF EXISTS "Workspace admins or draft authors delete posts" ON public.posts;

-- Insert: editors/admins/owners — anything; viewers — own posts but NOT in published/scheduled status
CREATE POLICY "Workspace contributors create posts"
ON public.posts FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = author_id
  AND (
    public.can_edit_workspace(workspace_id, auth.uid())
    OR (
      public.is_workspace_member(workspace_id, auth.uid())
      AND status IN ('draft', 'failed')
    )
  )
);

-- Update: editors/admins/owners — anything; viewers — own posts, cannot move them to scheduled/published
CREATE POLICY "Workspace contributors update posts"
ON public.posts FOR UPDATE
TO authenticated
USING (
  public.can_edit_workspace(workspace_id, auth.uid())
  OR (
    author_id = auth.uid()
    AND public.is_workspace_member(workspace_id, auth.uid())
  )
)
WITH CHECK (
  public.can_edit_workspace(workspace_id, auth.uid())
  OR (
    author_id = auth.uid()
    AND status IN ('draft', 'failed')
  )
);

-- Delete: workspace admin/owner — anything; viewer — own posts only
CREATE POLICY "Workspace admins or authors delete posts"
ON public.posts FOR DELETE
TO authenticated
USING (
  public.can_admin_workspace(workspace_id, auth.uid())
  OR author_id = auth.uid()
);