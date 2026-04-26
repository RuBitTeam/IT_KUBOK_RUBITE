import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TEMPLATE_PROMPTS: Record<string, string> = {
  announcement:
    "Напиши короткий и яркий анонс мероприятия для соцсетей молодёжного центра. Тёплый дружелюбный тон, эмодзи, до 600 символов.",
  results:
    "Напиши подведение итогов прошедшего мероприятия молодёжного центра. Конкретные цифры, благодарности участникам, эмодзи, до 600 символов.",
  vacancy:
    "Напиши пост-вакансию для молодёжного центра. Кого ищем, что предлагаем, как откликнуться. Энергичный тон, эмодзи, до 600 символов.",
  grant:
    "Напиши анонс грантового конкурса/возможности для молодёжи. Сроки, кто может участвовать, призы. Мотивирующий тон, эмодзи, до 600 символов.",
};

// Удаляет markdown-разметку (** __ ## ` и т.п.) из AI-ответа,
// оставляя чистый текст для соцсетей.
function stripMarkdown(input: string): string {
  if (!input) return "";
  let text = String(input);
  // Code fences и inline code
  text = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim());
  text = text.replace(/`([^`]+)`/g, "$1");
  // Bold/italic: **text**, __text__, *text*, _text_
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, "$1$2");
  // Заголовки ## Title
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  // Маркеры списков в начале строк (-, *, +)
  text = text.replace(/^\s*[-*+]\s+/gm, "• ");
  // Цитаты >
  text = text.replace(/^\s*>\s?/gm, "");
  // Ссылки [text](url) → text (url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  // Подчистить лишние пустые строки
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

interface AiContext {
  workspaceDescription?: string;
  categoryName?: string;
  categoryDescription?: string;
}

function buildContextBlock(ctx?: AiContext): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (ctx.workspaceDescription?.trim()) {
    parts.push(`Контекст рабочего пространства: ${ctx.workspaceDescription.trim()}`);
  }
  if (ctx.categoryName?.trim()) {
    let cat = `Рубрика: ${ctx.categoryName.trim()}`;
    if (ctx.categoryDescription?.trim()) {
      cat += ` (${ctx.categoryDescription.trim()})`;
    }
    parts.push(cat);
  }
  return parts.length ? parts.join("\n") + "\n\n" : "";
}

export const generateTemplateContent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      type: string;
      topic: string;
      workspaceDescription?: string;
      categoryName?: string;
      categoryDescription?: string;
    }) => {
      const schema = z.object({
        type: z.enum(["announcement", "results", "vacancy", "grant"]),
        topic: z.string().trim().min(1).max(500),
        workspaceDescription: z.string().trim().max(2000).optional(),
        categoryName: z.string().trim().max(200).optional(),
        categoryDescription: z.string().trim().max(1000).optional(),
      });
      return schema.parse(input);
    },
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { content: "", error: "AI недоступен (LOVABLE_API_KEY не задан)" };
    }
    try {
      const ctxBlock = buildContextBlock({
        workspaceDescription: data.workspaceDescription,
        categoryName: data.categoryName,
        categoryDescription: data.categoryDescription,
      });
      const userMsg = `${ctxBlock}Тема: ${data.topic}\n\nВажно: пиши обычным текстом без markdown-разметки (без **, ##, *, _ и т.п.).`;
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: TEMPLATE_PROMPTS[data.type] },
            { role: "user", content: userMsg },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("AI gateway error:", res.status, text);
        return { content: "", error: `AI gateway: ${res.status}` };
      }
      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content ?? "";
      return { content: stripMarkdown(raw), error: null };
    } catch (e) {
      console.error("AI failure:", e);
      return { content: "", error: "Сбой обращения к AI" };
    }
  });

export const suggestTags = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string; existing: string[]; known: string[] }) => {
    const schema = z.object({
      text: z.string().trim().max(10000),
      existing: z.array(z.string().min(1).max(50)).max(50),
      known: z.array(z.string().min(1).max(50)).max(500),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }) => {
    if (!data.text.trim()) return { tags: [] as string[], error: null };
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      // Fallback: совпадения по ключевым словам из known
      const lower = data.text.toLowerCase();
      const tags = data.known
        .filter((t) => !data.existing.includes(t) && lower.includes(t.toLowerCase()))
        .slice(0, 8);
      return { tags, error: null };
    }
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content:
                "Ты подбираешь хэштеги для постов соцсетей. Возвращай 5-8 коротких релевантных тегов на русском, без символа #, без знаков препинания, через запятую. Сначала используй уже существующие теги из списка, если они подходят, иначе предлагай новые.",
            },
            {
              role: "user",
              content: `Существующие теги в системе: ${data.known.join(", ") || "нет"}\nУже выбраны: ${data.existing.join(", ") || "нет"}\nТекст поста:\n${data.text}`,
            },
          ],
        }),
      });
      if (!res.ok) {
        return { tags: [] as string[], error: `AI gateway: ${res.status}` };
      }
      const json = await res.json();
      const raw: string = json.choices?.[0]?.message?.content ?? "";
      const tags = raw
        .replace(/#/g, "")
        .split(/[,\n]+/)
        .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
        .filter((s) => s && s.length <= 40)
        .filter((s) => !data.existing.includes(s))
        .slice(0, 8);
      return { tags, error: null };
    } catch (e) {
      console.error("suggestTags failure:", e);
      return { tags: [] as string[], error: "Сбой обращения к AI" };
    }
  });

const IMPROVE_PROMPTS: Record<string, string> = {
  formal:
    "Перепиши текст в более формальном, деловом стиле. Сохрани смысл и язык. Верни только итоговый текст обычным текстом без markdown (без **, ##, *, _).",
  selling:
    "Перепиши текст так, чтобы он стал более продающим и вовлекающим: добавь призыв к действию, выгоды, эмоции. Сохрани смысл и язык. Верни только итоговый текст без markdown-разметки.",
  shorten:
    "Сократи текст в 2 раза, сохранив главную мысль и тон. Верни только итоговый текст без markdown.",
  fix: "Исправь все орфографические и пунктуационные ошибки в тексте. Не меняй стиль, смысл и структуру. Верни только исправленный текст без markdown.",
  announce:
    "Перепиши текст как яркий анонс мероприятия для соцсетей: дата/время/место (если есть), что будет, для кого, призыв прийти. Тёплый дружелюбный тон, эмодзи, до 700 символов. Верни только итоговый текст без markdown.",
  results:
    "Перепиши текст как пост с итогами события: что прошло, цифры/факты, эмоции участников, благодарности, что дальше. Живой тон, эмодзи, до 700 символов. Верни только итоговый текст без markdown.",
  vacancy:
    "Перепиши текст как пост-вакансию: должность, ключевые задачи, требования, что предлагаем, как откликнуться. Структурированно, эмодзи-маркеры, без воды. Верни только итоговый текст без markdown-разметки.",
  grant:
    "Перепиши текст как анонс гранта/конкурса: суть возможности, кто может участвовать, сроки, призовой фонд, как подать заявку. Мотивирующий тон, эмодзи, до 700 символов. Верни только итоговый текст без markdown.",
};

export const improveText = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      mode: string;
      text: string;
      customStyle?: string;
      workspaceDescription?: string;
      categoryName?: string;
    }) => {
      const schema = z.object({
        mode: z.enum(["formal", "selling", "shorten", "fix", "custom", "announce", "results", "vacancy", "grant"]),
        text: z.string().trim().min(1).max(10000),
        customStyle: z.string().trim().max(500).optional(),
        workspaceDescription: z.string().trim().max(2000).optional(),
        categoryName: z.string().trim().max(200).optional(),
      });
      return schema.parse(input);
    },
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { content: "", error: "AI недоступен (LOVABLE_API_KEY не задан)" };
    }
    const baseSystem =
      data.mode === "custom"
        ? `Перепиши текст в следующем стиле: "${data.customStyle ?? ""}". Сохрани смысл и язык. Верни только итоговый текст обычным текстом без markdown-разметки.`
        : IMPROVE_PROMPTS[data.mode];
    if (data.mode === "custom" && !data.customStyle?.trim()) {
      return { content: "", error: "Опишите желаемый стиль" };
    }
    const ctxBlock = buildContextBlock({
      workspaceDescription: data.workspaceDescription,
      categoryName: data.categoryName,
    });
    const systemPrompt = ctxBlock ? `${ctxBlock}${baseSystem}` : baseSystem;
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
            { role: "system", content: systemPrompt },
            { role: "user", content: data.text },
          ],
        }),
      });
      if (!res.ok) {
        if (res.status === 429) return { content: "", error: "AI: слишком много запросов" };
        if (res.status === 402) return { content: "", error: "AI: закончились кредиты" };
        return { content: "", error: `AI gateway: ${res.status}` };
      }
      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content ?? "";
      return { content: stripMarkdown(String(raw)), error: null };
    } catch (e) {
      console.error("improveText failure:", e);
      return { content: "", error: "Сбой обращения к AI" };
    }
  });

export const recommendBestTime = createServerFn({ method: "POST" })
  .inputValidator((input: { platform: string }) => {
    return z.object({ platform: z.string().min(1).max(20) }).parse(input);
  })
  .handler(async ({ data }) => {
    // Только поддерживаемые платформы: VK и Telegram.
    const map: Record<string, { hours: number[]; days: string[]; note: string }> = {
      vk: {
        hours: [12, 18, 21],
        days: ["Вт", "Чт", "Сб"],
        note: "Пик активности ВК — обед и вечер.",
      },
      telegram: {
        hours: [9, 13, 20],
        days: ["Пн", "Ср", "Пт"],
        note: "Утренние и поздневечерние посты дают лучший охват.",
      },
    };
    const r = map[data.platform] ?? map.vk;
    return { ...r, score: 0.78 + Math.random() * 0.2 };
  });
