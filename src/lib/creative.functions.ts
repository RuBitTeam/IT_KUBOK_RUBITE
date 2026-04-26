import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ACTIONS = ["chat", "trends", "idea", "timing", "headlines", "remix"] as const;
type Action = (typeof ACTIONS)[number];

const SYSTEM_PROMPTS: Record<Action, string> = {
  chat:
    "Ты — креативный ассистент для SMM молодёжного центра в Красноярске. Отвечай дружелюбно, ярко, с эмодзи. Пиши обычным текстом без markdown-разметки (без **, ##, *, _).",
  trends:
    "Ты — аналитик трендов молодёжного контента в Красноярске. На основе списка ссылок на сообщества (ВК, Telegram) и общего контекста выдели:\n— ТОП-3 темы недели (киберспорт, гранты, свидания, учёба, переезды и т.п.)\n— популярные форматы (опросы, мемы, клипы, длинные тексты)\n— часто встречающиеся эмодзи и слова\nСтруктурируй ответ кратко, используй эмодзи, без markdown-разметки. В конце дай 3 готовые идеи постов в стиле «🧠 Сейчас залетают:».",
  idea:
    "Ты — креативный продюсер. На основе промта пользователя выдай ОДНУ конкретную идею поста для соцсетей молодёжного центра. Формат: краткое название, суть, формат (карусель/клип/опрос/текст), что снять/собрать. Без markdown, с эмодзи.",
  timing:
    "Ты — аналитик тайминга публикаций для молодёжной аудитории Красноярска. На основе платформы и темы порекомендуй 2 лучших времени для поста на завтра в формате «⏰ HH:MM — короткое объяснение». Учитывай часовой пояс Asia/Krasnoyarsk. Без markdown.",
  headlines:
    "Ты — копирайтер. На основе темы пользователя сгенерируй ровно 5 вариантов вирусных заголовков для поста. Для каждого в скобках укажи фактор вовлечения: (низкий), (средний) или (высокий). Используй эмодзи. Каждый заголовок с новой строки, нумерация 1) 2) 3) ... Без markdown.",
  remix:
    "Ты — контент-редактор. На основе старого поста (дан пользователем) предложи 3 ремикса в новых форматах: 1) рилс/клип, 2) опрос, 3) карусель с мемами. Для каждого опиши концепцию в 2-3 строки. Без markdown, с эмодзи.",
};

const ACTION_LABELS: Record<Action, string> = {
  chat: "Сообщение",
  trends: "🔥 Тренды у молодёжи",
  idea: "💡 Идея поста за 10 секунд",
  timing: "⏰ Тайминг-советник",
  headlines: "📰 Вирусные заголовки",
  remix: "♻️ Ремикс контента",
};

function stripMarkdown(input: string): string {
  if (!input) return "";
  let text = String(input);
  text = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim());
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, "$1$2");
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  text = text.replace(/^\s*[-*+]\s+/gm, "• ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// ===== Sessions =====

export const listSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("creative_sessions")
      .select("id,title,updated_at,created_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) return { sessions: [], error: error.message };
    return { sessions: data ?? [], error: null };
  });

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title?: string }) =>
    z.object({ title: z.string().trim().max(200).optional() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("creative_sessions")
      .insert({ user_id: userId, title: data.title || "Новый чат" })
      .select("id,title,updated_at,created_at")
      .single();
    if (error) return { session: null, error: error.message };
    return { session: row, error: null };
  });

export const renameSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; title: string }) =>
    z
      .object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("creative_sessions")
      .update({ title: data.title })
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const deleteSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("creative_sessions").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("creative_messages")
      .select("id,role,action,content,data,created_at")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: true });
    if (error) return { messages: [], error: error.message };
    return { messages: rows ?? [], error: null };
  });

// ===== Sources =====

export const listSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("creative_sources")
      .select("id,url,label,platform,created_at")
      .order("created_at", { ascending: false });
    if (error) return { sources: [], error: error.message };
    return { sources: data ?? [], error: null };
  });

export const addSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string; label?: string }) =>
    z
      .object({
        url: z.string().trim().url().max(500),
        label: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let platform = "other";
    if (/vk\.com|vk\.ru/i.test(data.url)) platform = "vk";
    else if (/t\.me|telegram\.me/i.test(data.url)) platform = "telegram";
    const { data: row, error } = await supabase
      .from("creative_sources")
      .insert({ user_id: userId, url: data.url, label: data.label ?? null, platform })
      .select("id,url,label,platform,created_at")
      .single();
    if (error) return { source: null, error: error.message };
    return { source: row, error: null };
  });

export const deleteSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("creative_sources").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ===== AI run =====

const RunInput = z.object({
  sessionId: z.string().uuid().optional().nullable(),
  action: z.enum(ACTIONS),
  prompt: z.string().trim().min(1).max(4000),
  platform: z.enum(["vk", "telegram"]).optional(),
});

export const runCreative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof RunInput>) => RunInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { error: "AI недоступен (LOVABLE_API_KEY не задан)", sessionId: null, message: null };
    }

    // Подгружаем источники пользователя для контекста
    const { data: sources } = await supabase
      .from("creative_sources")
      .select("url,label,platform")
      .eq("user_id", userId)
      .limit(50);

    const sourcesBlock =
      sources && sources.length
        ? `Подключённые сообщества пользователя для анализа:\n${sources
            .map((s) => `- [${s.platform ?? "?"}] ${s.label ? s.label + " — " : ""}${s.url}`)
            .join("\n")}\n\n`
        : "Подключённых сообществ нет — давай ответ на основе общих знаний о молодёжной аудитории Красноярска.\n\n";

    const platformLine = data.platform ? `Платформа: ${data.platform}\n` : "";
    const userMsg = `${sourcesBlock}${platformLine}Запрос пользователя:\n${data.prompt}`;

    // Создаём сессию при необходимости
    let sessionId = data.sessionId ?? null;
    if (!sessionId) {
      const title = data.prompt.slice(0, 60);
      const { data: s, error: sErr } = await supabase
        .from("creative_sessions")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      if (sErr || !s) return { error: sErr?.message ?? "session error", sessionId: null, message: null };
      sessionId = s.id;
    } else {
      await supabase
        .from("creative_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sessionId);
    }

    // Сохраняем user message
    const userLabel = ACTION_LABELS[data.action];
    const userContent =
      data.action === "chat" ? data.prompt : `${userLabel}\n${data.prompt}`;
    await supabase.from("creative_messages").insert({
      session_id: sessionId,
      user_id: userId,
      role: "user",
      action: data.action,
      content: userContent,
      data: { platform: data.platform ?? null },
    });

    // Вызов AI
    let assistantText = "";
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPTS[data.action] },
            { role: "user", content: userMsg },
          ],
        }),
      });
      if (!res.ok) {
        if (res.status === 429) assistantText = "⚠️ Слишком много запросов к AI. Попробуйте позже.";
        else if (res.status === 402)
          assistantText = "⚠️ Закончились кредиты Lovable AI. Пополните в Settings → Workspace → Usage.";
        else {
          const t = await res.text();
          console.error("AI gateway:", res.status, t);
          assistantText = `⚠️ Ошибка AI (${res.status})`;
        }
      } else {
        const json = await res.json();
        assistantText = stripMarkdown(json.choices?.[0]?.message?.content ?? "");
      }
    } catch (e) {
      console.error("runCreative AI failure:", e);
      assistantText = "⚠️ Сбой обращения к AI";
    }

    const { data: msg, error: mErr } = await supabase
      .from("creative_messages")
      .insert({
        session_id: sessionId,
        user_id: userId,
        role: "assistant",
        action: data.action,
        content: assistantText,
        data: {},
      })
      .select("id,role,action,content,data,created_at")
      .single();

    return { error: mErr?.message ?? null, sessionId, message: msg };
  });
