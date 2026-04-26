import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, Scissors, Briefcase, Megaphone, CheckCheck, Loader2, X, Palette, CalendarCheck, Trophy, UserSearch, Award } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { improveText } from "@/lib/ai.functions";
import { toast } from "sonner";

interface LTReplacement {
  value: string;
}
interface LTMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: LTReplacement[];
  rule?: { issueType?: string; category?: { name?: string } };
}

interface TextCheckerProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  language?: string; // "ru-RU" by default
  workspaceDescription?: string;
  categoryName?: string;
}

export function TextChecker({
  value,
  onChange,
  disabled,
  language = "ru-RU",
  workspaceDescription,
  categoryName,
}: TextCheckerProps) {
  const [matches, setMatches] = useState<LTMatch[]>([]);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [customStyle, setCustomStyle] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const improve = useServerFn(improveText);

  // Debounced LanguageTool check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim() || value.trim().length < 4) {
      setMatches([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setChecking(true);
      try {
        // Отключаем шумные правила: пробелы, типографика, стиль, повторы и пр.
        const disabledRules = [
          "WHITESPACE_RULE",
          "DOUBLE_PUNCTUATION",
          "PUNCTUATION_PARAGRAPH_END",
          "RU_COMPOUNDS",
          "RU_GENERAL_XX",
          "UPPERCASE_SENTENCE_START",
          "EN_QUOTES",
          "RUSSIAN_GENERAL_STYLE",
          "WORD_REPEAT_RULE",
          "TYPOGRAPHY",
        ].join(",");
        const disabledCategories = [
          "TYPOGRAPHY",
          "STYLE",
          "REDUNDANCY",
          "PLAIN_ENGLISH",
          "CASING",
          "MISC",
        ].join(",");
        const body = new URLSearchParams({
          text: value,
          language,
          enabledOnly: "false",
          level: "default",
          disabledRules,
          disabledCategories,
        });
        const res = await fetch("https://api.languagetool.org/v2/check", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setMatches([]);
          return;
        }
        const json = await res.json();
        const raw = (json.matches ?? []) as LTMatch[];
        // Дополнительный пост-фильтр: игнорируем срабатывания на латинских словах,
        // числах, хештегах, упоминаниях, ссылках, эмодзи и одиночных символах.
        const filtered = raw.filter((m) => {
          const fragment = value.slice(m.offset, m.offset + m.length);
          if (!fragment.trim()) return false;
          if (fragment.length < 2) return false;
          // Латиница / цифры / спец токены — пропускаем
          if (/^[A-Za-z0-9_@#./:\-+]+$/.test(fragment)) return false;
          // Хештеги и упоминания
          if (/^[#@]/.test(fragment)) return false;
          // URL
          if (/https?:\/\//i.test(fragment)) return false;
          const cat = m.rule?.category?.name?.toLowerCase() ?? "";
          // Оставляем только орфографию, грамматику и пунктуацию
          const allowed =
            cat.includes("орфо") ||
            cat.includes("spell") ||
            cat.includes("grammar") ||
            cat.includes("грамм") ||
            cat.includes("пункту") ||
            cat.includes("punct");
          return allowed;
        });
        setMatches(filtered);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          // молча: проверка — фоновая
          setMatches([]);
        }
      } finally {
        setChecking(false);
      }
    }, 1200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, language]);

  const matchKey = (m: LTMatch) => `${m.offset}:${m.length}:${m.message}`;
  const visible = matches.filter((m) => !ignored.has(matchKey(m)));

  const applyFix = (m: LTMatch, replacement: string) => {
    const next = value.slice(0, m.offset) + replacement + value.slice(m.offset + m.length);
    onChange(next);
  };

  const ignoreMatch = (m: LTMatch) => {
    setIgnored((prev) => {
      const n = new Set(prev);
      n.add(matchKey(m));
      return n;
    });
  };

  const runImprove = async (
    mode: "formal" | "selling" | "shorten" | "fix" | "custom" | "announce" | "results" | "vacancy" | "grant",
  ) => {
    if (!value.trim()) {
      toast.error("Сначала напишите текст");
      return;
    }
    if (mode === "custom" && !customStyle.trim()) {
      toast.error("Опишите желаемый стиль");
      return;
    }
    setAiBusy(mode);
    try {
      const res = await improve({
        data: {
          mode,
          text: value,
          customStyle: mode === "custom" ? customStyle : undefined,
          workspaceDescription,
          categoryName,
        },
      });
      if (res.error || !res.content) {
        toast.error(res.error ?? "AI не вернул результат");
        return;
      }
      onChange(res.content);
      toast.success("Текст обновлён");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAiBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* AI improvement buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || aiBusy !== null}
          onClick={() => runImprove("fix")}
        >
          {aiBusy === "fix" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCheck className="h-3.5 w-3.5" />
          )}
          Исправить ошибки
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || aiBusy !== null}
          onClick={() => runImprove("formal")}
        >
          {aiBusy === "formal" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Briefcase className="h-3.5 w-3.5" />
          )}
          Формальнее
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || aiBusy !== null}
          onClick={() => runImprove("selling")}
        >
          {aiBusy === "selling" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Megaphone className="h-3.5 w-3.5" />
          )}
          Продающий стиль
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || aiBusy !== null}
          onClick={() => runImprove("shorten")}
        >
          {aiBusy === "shorten" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Scissors className="h-3.5 w-3.5" />
          )}
          Сократить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || aiBusy !== null}
          onClick={() => runImprove("announce")}
        >
          {aiBusy === "announce" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CalendarCheck className="h-3.5 w-3.5" />
          )}
          Анонс мероприятия
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || aiBusy !== null}
          onClick={() => runImprove("results")}
        >
          {aiBusy === "results" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trophy className="h-3.5 w-3.5" />
          )}
          Итоги события
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || aiBusy !== null}
          onClick={() => runImprove("vacancy")}
        >
          {aiBusy === "vacancy" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserSearch className="h-3.5 w-3.5" />
          )}
          Вакансия
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || aiBusy !== null}
          onClick={() => runImprove("grant")}
        >
          {aiBusy === "grant" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Award className="h-3.5 w-3.5" />
          )}
          Грант
        </Button>
      </div>

      {/* Custom style input */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          type="text"
          placeholder="Свой стиль (например: дружелюбно с юмором, как Дудь, мотивационно)"
          value={customStyle}
          onChange={(e) => setCustomStyle(e.target.value)}
          disabled={disabled || aiBusy !== null}
          className="flex-1 min-w-[200px] h-9 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || aiBusy !== null || !customStyle.trim()}
          onClick={() => runImprove("custom")}
        >
          {aiBusy === "custom" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Palette className="h-3.5 w-3.5" />
          )}
          Применить стиль
        </Button>
      </div>

      {/* LT errors list */}
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {checking ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Проверка орфографии…
            </>
          ) : visible.length === 0 ? (
            <>
              <Sparkles className="h-3.5 w-3.5 text-success-foreground" />
              {value.trim().length < 4 ? "Введите текст для проверки" : "Ошибок не найдено"}
            </>
          ) : (
            <>
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              Найдено замечаний: <strong className="text-foreground">{visible.length}</strong>
            </>
          )}
        </div>

        {visible.length > 0 && (
          <ul className="space-y-2 max-h-64 overflow-auto">
            {visible.slice(0, 30).map((m) => {
              const fragment = value.slice(m.offset, m.offset + m.length);
              return (
                <li
                  key={matchKey(m)}
                  className="rounded-lg border border-border bg-card p-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <div className="font-medium text-foreground">
                        «<span className="text-destructive">{fragment}</span>»
                      </div>
                      <div className="text-muted-foreground">{m.message}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => ignoreMatch(m)}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      aria-label="Игнорировать"
                      disabled={disabled}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {m.replacements.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {m.replacements.slice(0, 5).map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={disabled}
                          onClick={() => applyFix(m, r.value)}
                          className="px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          {r.value}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
