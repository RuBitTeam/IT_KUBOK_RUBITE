import { useEffect, useState, type KeyboardEvent } from "react";
import { X, Plus, Sparkles, Loader2 } from "lucide-react";
import { listTags, type Tag } from "@/lib/social-api";
import { suggestTags } from "@/lib/ai.functions";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TagsPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** текст поста для AI-подбора тегов */
  contextText?: string;
}

export function TagsPicker({ value, onChange, disabled, contextText }: TagsPickerProps) {
  const [all, setAll] = useState<Tag[]>([]);
  const [draft, setDraft] = useState("");
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const suggest = useServerFn(suggestTags);

  useEffect(() => {
    listTags().then(setAll).catch(() => undefined);
  }, []);

  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (value.includes(t)) return;
    onChange([...value, t]);
    setDraft("");
    setAiTags((prev) => prev.filter((x) => x !== t));
  };

  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const askAi = async () => {
    if (!contextText || !contextText.trim()) {
      toast.error("Сначала напишите текст поста");
      return;
    }
    setAiLoading(true);
    try {
      const res = await suggest({
        data: {
          text: contextText,
          existing: value,
          known: all.map((t) => t.name),
        },
      });
      if (res.error) {
        toast.error(res.error);
      } else if (res.tags.length === 0) {
        toast.info("AI не нашёл подходящих тегов");
      } else {
        setAiTags(res.tags);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const suggestions = all
    .filter((t) => !value.includes(t.name))
    .filter((t) => !draft || t.name.toLowerCase().includes(draft.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground text-xs px-2.5 py-1"
          >
            {t}
            {!disabled && (
              <button type="button" onClick={() => remove(t)} aria-label={`Удалить ${t}`}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder="Введите тег и Enter"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add(draft)}
          disabled={disabled || !draft.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={askAi}
          disabled={disabled || aiLoading}
          title="Предложить теги на основе текста"
        >
          {aiLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </Button>
      </div>

      {aiTags.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Предложено AI:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {aiTags.map((t) => (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => add(t)}
                className="text-xs px-2 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition"
              >
                + {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => add(t.name)}
              className={cn(
                "text-xs px-2 py-1 rounded-full border border-border bg-muted hover:bg-accent hover:text-accent-foreground transition",
              )}
            >
              + {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
