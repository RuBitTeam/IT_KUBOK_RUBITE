-- Restrict media_assets visibility to owner only (or admins)
DROP POLICY IF EXISTS "Authenticated view media" ON public.media_assets;

CREATE POLICY "Owner views media"
ON public.media_assets
FOR SELECT
TO authenticated
USING ((owner_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));