import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { generateTemplateContent } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/templates")({
  component: TemplatesPage,
});

type TemplateType = "announcement" | "results" | "vacancy" | "grant";
const TYPE_LABEL: Record<TemplateType, string> = {
  announcement: "Анонс",
  results: "Итоги",
  vacancy: "Вакансия",
  grant: "Грант",
};

interface Template {
  id: string;
  name: string;
  type: TemplateType;
  content: string;
  created_at: string;
}

function TemplatesPage() {
  const { canEdit, canDelete, user } = useAuth();
  const [items, setItems] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<TemplateType>("announcement");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Template[]);
  };

  useEffect(() => {
    load();
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Укажите тему");
      return;
    }
    setGenerating(true);
    try {
      const r = await generateTemplateContent({ data: { type, topic } });
      if (r.error) {
        toast.error(r.error);
      } else {
        setContent(r.content);
        toast.success("Сгенерировано");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim() || !content.trim()) {
      toast.error("Заполните название и текст");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("templates")
      .insert({ name: name.trim(), type, content, created_by: user.id });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setContent("");
    setTopic("");
    toast.success("Шаблон сохранён");
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить шаблон?")) return;
    const { error } = await supabase.from("templates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Шаблоны</h1>
        <p className="text-muted-foreground mt-1">
          Готовые тексты для частых типов публикаций. AI помогает быстро сгенерировать черновик.
        </p>
      </header>

      {canEdit && (
        <form
          onSubmit={handleSave}
          className="bg-card border border-border rounded-xl p-6 space-y-4"
        >
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tname">Название</Label>
              <Input id="tname" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ttype">Тип</Label>
              <select
                id="ttype"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as TemplateType)}
              >
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Тема для AI</Label>
              <Input
                id="topic"
                placeholder="Напр. волонтёрский фестиваль"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">Текст шаблона</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {generating ? "Генерация…" : "AI-генерация"}
              </Button>
            </div>
            <Textarea
              id="content"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить шаблон"}
          </Button>
        </form>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && (
          <p className="text-muted-foreground sm:col-span-2 lg:col-span-3">Шаблонов пока нет</p>
        )}
        {items.map((t) => (
          <article key={t.id} className="bg-card border border-border rounded-xl p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground"
                  )}
                >
                  {TYPE_LABEL[t.type]}
                </span>
                <h3 className="font-semibold mt-2">{t.name}</h3>
              </div>
              {canDelete && (
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap line-clamp-6">
              {t.content}
            </p>
            <Link
              to="/posts/$id"
              params={{ id: "new" }}
              className="mt-4 text-sm text-primary hover:underline"
              onClick={() => {
                try {
                  sessionStorage.setItem("template-prefill", t.content);
                } catch {
                  /* no-op */
                }
              }}
            >
              Использовать в посте →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
