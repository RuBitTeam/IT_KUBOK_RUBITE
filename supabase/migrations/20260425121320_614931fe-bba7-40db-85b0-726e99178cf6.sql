
-- Drop old role-based policies
DROP POLICY IF EXISTS "Editors and admins create social accounts" ON public.social_accounts;
DROP POLICY IF EXISTS "Editors and admins delete social accounts" ON public.social_accounts;
DROP POLICY IF EXISTS "Editors and admins update social accounts" ON public.social_accounts;
DROP POLICY IF EXISTS "Editors and admins view social accounts" ON public.social_accounts;

DROP POLICY IF EXISTS "Editors and admins create media" ON public.media_assets;
DROP POLICY IF EXISTS "Editors and admins delete media" ON public.media_assets;

DROP POLICY IF EXISTS "Editors and admins create tags" ON public.tags;

DROP POLICY IF EXISTS "Editors and admins manage templates" ON public.templates;

DROP POLICY IF EXISTS "Editors and admins write analytics" ON public.post_analytics;

-- Storage policies for post-media that referenced editor/admin
DROP POLICY IF EXISTS "post-media editors upload" ON storage.objects;
DROP POLICY IF EXISTS "post-media editors update" ON storage.objects;
DROP POLICY IF EXISTS "post-media editors delete" ON storage.objects;

-- Remove editor/viewer rows from user_roles (keep admin)
DELETE FROM public.user_roles WHERE role IN ('editor','viewer');

-- New policies

-- social_accounts: personal per user
CREATE POLICY "Users view own social accounts"
  ON public.social_accounts FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Users create own social accounts"
  ON public.social_accounts FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users update own social accounts"
  ON public.social_accounts FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users delete own social accounts"
  ON public.social_accounts FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- media_assets: any authenticated user can upload their own; everyone authenticated can view (existing select policy stays)
CREATE POLICY "Authenticated create own media"
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner deletes media"
  ON public.media_assets FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- tags: any authenticated user can create
CREATE POLICY "Authenticated create tags"
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK (true);

-- templates: any authenticated user can manage
CREATE POLICY "Authenticated manage templates"
  ON public.templates FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- post_analytics: any authenticated user can write
CREATE POLICY "Authenticated write analytics"
  ON public.post_analytics FOR INSERT TO authenticated
  WITH CHECK (true);

-- Storage post-media: any authenticated user can upload/manage their own files in post-media bucket
CREATE POLICY "post-media authenticated upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-media' AND owner = auth.uid());

CREATE POLICY "post-media owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'post-media' AND owner = auth.uid());

CREATE POLICY "post-media owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'post-media' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

-- Update default role given to new users on signup: become an admin only if explicitly invited; default = no global role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  display text;
begin
  display := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1));

  insert into public.profiles (id, display_name)
  values (new.id, display);

  -- No global role assigned by default; only personal workspace.
  insert into public.workspaces (name, description, owner_id)
  values ('Личное пространство — ' || display, 'Создано автоматически', new.id);

  return new;
end;
$function$;
