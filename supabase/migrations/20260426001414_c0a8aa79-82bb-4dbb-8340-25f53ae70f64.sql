-- Workspace invite tokens for "join by link" feature
CREATE TABLE public.workspace_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  role public.workspace_role NOT NULL DEFAULT 'viewer',
  created_by uuid NOT NULL,
  expires_at timestamptz,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspace_invites_workspace ON public.workspace_invites(workspace_id);
CREATE INDEX idx_workspace_invites_token ON public.workspace_invites(token);

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Workspace editors+ can see invites for that workspace
CREATE POLICY "Editors view invites"
ON public.workspace_invites
FOR SELECT
TO authenticated
USING (public.can_edit_workspace(workspace_id, auth.uid()));

-- Editors+ can create invites; created_by must equal current user
CREATE POLICY "Editors create invites"
ON public.workspace_invites
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_edit_workspace(workspace_id, auth.uid())
  AND created_by = auth.uid()
);

-- Editors+ can revoke (update) invites
CREATE POLICY "Editors update invites"
ON public.workspace_invites
FOR UPDATE
TO authenticated
USING (public.can_edit_workspace(workspace_id, auth.uid()));

-- Owners can delete invites
CREATE POLICY "Owners delete invites"
ON public.workspace_invites
FOR DELETE
TO authenticated
USING (public.is_workspace_owner(workspace_id, auth.uid()));