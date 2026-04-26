
DROP POLICY IF EXISTS "Authenticated create tags" ON public.tags;
DROP POLICY IF EXISTS "Authenticated manage templates" ON public.templates;
DROP POLICY IF EXISTS "Authenticated write analytics" ON public.post_analytics;

CREATE POLICY "Authenticated create tags"
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated manage templates"
  ON public.templates FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated write analytics"
  ON public.post_analytics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
