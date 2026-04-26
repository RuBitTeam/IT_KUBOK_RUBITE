-- Sessions (chats)
CREATE TABLE public.creative_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Новый чат',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_sessions_user ON public.creative_sessions(user_id, updated_at DESC);

ALTER TABLE public.creative_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sessions" ON public.creative_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sessions" ON public.creative_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions" ON public.creative_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own sessions" ON public.creative_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER tr_creative_sessions_updated
  BEFORE UPDATE ON public.creative_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Messages
CREATE TABLE public.creative_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.creative_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  action TEXT NOT NULL DEFAULT 'chat' CHECK (action IN ('chat','trends','idea','timing','headlines','remix')),
  content TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_messages_session ON public.creative_messages(session_id, created_at);

ALTER TABLE public.creative_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own messages" ON public.creative_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own messages" ON public.creative_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own messages" ON public.creative_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Sources (ссылки на сообщества для анализа)
CREATE TABLE public.creative_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_sources_user ON public.creative_sources(user_id, created_at DESC);

ALTER TABLE public.creative_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sources" ON public.creative_sources
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sources" ON public.creative_sources
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own sources" ON public.creative_sources
  FOR DELETE TO authenticated USING (auth.uid() = user_id);