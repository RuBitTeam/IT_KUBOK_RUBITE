-- Many-to-many: social accounts linked to workspaces
CREATE TABLE public.workspace_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  social_account_id uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, social_account_id)
);

CREATE INDEX idx_wsa_workspace ON public.workspace_social_accounts(workspace_id);
CREATE INDEX idx_wsa_account ON public.workspace_social_accounts(social_account_id);

ALTER TABLE public.workspace_social_accounts ENABLE ROW LEVEL SECURITY;

-- Members can see links of their workspaces
CREATE POLICY "Members view workspace social links"
ON public.workspace_social_accounts
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

-- Members of workspace can add a link if they own the social account
CREATE POLICY "Members add own social to workspace"
ON public.workspace_social_accounts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.social_accounts sa
    WHERE sa.id = social_account_id AND sa.owner_id = auth.uid()
  )
);

-- Workspace owner OR social account owner can unlink
CREATE POLICY "Owner unlinks workspace social"
ON public.workspace_social_accounts
FOR DELETE
TO authenticated
USING (
  public.is_workspace_owner(workspace_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.social_accounts sa
    WHERE sa.id = social_account_id AND sa.owner_id = auth.uid()
  )
);

-- Backfill: for each existing social account, link to:
--  (a) all workspaces where the owner is a member
--  (b) all workspaces where the account is referenced by posts
INSERT INTO public.workspace_social_accounts (workspace_id, social_account_id, added_by)
SELECT DISTINCT wu.workspace_id, sa.id, sa.owner_id
FROM public.social_accounts sa
JOIN public.workspace_users wu ON wu.user_id = sa.owner_id
ON CONFLICT DO NOTHING;

INSERT INTO public.workspace_social_accounts (workspace_id, social_account_id, added_by)
SELECT DISTINCT p.workspace_id, p.social_account_id, sa.owner_id
FROM public.posts p
JOIN public.social_accounts sa ON sa.id = p.social_account_id
WHERE p.social_account_id IS NOT NULL
ON CONFLICT DO NOTHING;