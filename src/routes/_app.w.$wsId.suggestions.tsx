import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Lightbulb, Send, Trash2, Sparkles, X, Image as ImageIcon, Film } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { uploadMedia } from "@/lib/social-api";
import {
  createSuggestion,
  deleteSuggestion,
  updateSuggestionStatus,
} from "@/lib/suggestions.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/w/$wsId/suggestions")({
  component: SuggestionsPage,
});

interface Suggestion {
  id: string;
  workspace_id: string;
  author_id: string;
  text: string;
  media: string[];
  status: "pending" | "approved" | "rejected";
  converted_post_id: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface AuthorProfile {
  display_name: string | null;
  avatar_url: string | null;
}

const STATUS_LABEL: Record<Suggestion["status"], string> = {
  pending: "Ожидает",
  approved: "Принято",
  rejected: "Отклонено",
};

const STATUS_VARIANT: Record<Suggestion["status"], "secondary" | "default" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "outline",
};

function isVideo(url: string) {
  return /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url);
}

function SuggestionsPage() {
  const { wsId } = Route.useParams();
  const { user } = useAuth();
  const { canEdit, canCreate } = useWorkspace();
  const navigate = useNavigate();

  const createFn = useServerFn(createSuggestion);
  const updateFn = useServerFn(updateSuggestionStatus);
  const deleteFn = useServerFn(deleteSuggestion);

  const [items, setItems] = useState<Suggestion[]>([]);
  const [profiles, setProfiles] = useState<Record<string, AuthorProfile>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<"all" | Suggestion["status"]>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("suggested_posts")
      .select("*")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Suggestion[];
    setItems(list);

    const ids = Array.from(new Set(list.map((s) => s.author_id)));
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      const map: Record<string, AuthorProfile> = {};
      (profs ?? []).forEach((p) => {
        map[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !user) return;
    setUploading(true);
    try {
      for (const f of files) {
        if (f.size > 20 * 1024 * 1024) {
          toast.error(`«${f.name}»: больше 20 MB`);
          continue;
        }
        const asset = await uploadMedia(f, user.id);
        setMedia((prev) => [...prev, asset.public_url]);
      }
      toast.success("Загружено");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      toast.error("Введите текст");
      return;
    }
    setSubmitting(true);
    try {
      const r = await createFn({
        data: { workspace_id: wsId, text: text.trim(), media },
      });
      if (!r.ok) {
        toast.error(r.error ?? "Не удалось отправить");
        return;
      }
      toast.success("Предложение отправлено");
      setText("");
      setMedia([]);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const convert = (s: Suggestion) => {
    // Avoid stuffing long text/media into the URL (it can exceed browser limits
    // and break navigation). Stash payload in sessionStorage and pass only id.
    try {
      sessionStorage.setItem(
        `suggestion:${s.id}`,
        JSON.stringify({ text: s.text, media: s.media }),
      );
    } catch {
      // ignore quota errors — editor will fall back to empty form
    }
    navigate({
      to: "/posts/$id",
      params: { id: "new" },
      search: {
        ws: wsId,
        suggestion: s.id,
      } as never,
    });
  };

  const reject = async (id: string) => {
    const r = await updateFn({ data: { suggestion_id: id, status: "rejected" } });
    if (!r.ok) toast.error(r.error ?? "Ошибка");
    else {
      toast.success("Отклонено");
      load();
    }
  };

  const reopen = async (id: string) => {
    const r = await updateFn({ data: { suggestion_id: id, status: "pending" } });
    if (!r.ok) toast.error(r.error ?? "Ошибка");
    else load();
  };

  const remove = async (id: string) => {
    const r = await deleteFn({ data: { suggestion_id: id } });
    if (!r.ok) toast.error(r.error ?? "Ошибка");
    else {
      toast.success("Удалено");
      setConfirmDelete(null);
      load();
    }
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
          <Lightbulb className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Предложка</h2>
          <p className="text-muted-foreground text-sm">
            Любой участник может предложить идею поста — редактор превратит её в публикацию.
          </p>
        </div>
      </header>

      {canCreate && (
        <form
          onSubmit={onSubmit}
          className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)] space-y-4"
        >
          <div>
            <label className="text-sm font-medium">Текст предложения</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Опишите идею поста: о чём, для кого, ключевые тезисы…"
              rows={5}
              maxLength={10000}
              disabled={submitting}
              className="mt-1 resize-y"
            />
            <p className="text-xs text-muted-foreground mt-1">{text.length} / 10000</p>
          </div>

          <div>
            <label className="text-sm font-medium">Медиа (необязательно)</label>
            <div className="mt-2 flex flex-wrap gap-2 items-center">
              <label className="inline-flex">
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,video/*"
                  multiple
                  onChange={onUpload}
                  disabled={uploading || submitting}
                />
                <Button type="button" variant="outline" size="sm" asChild disabled={uploading || submitting}>
                  <span>
                    <ImageIcon className="h-4 w-4 mr-1" />
                    {uploading ? "Загрузка…" : "Добавить файлы"}
                  </span>
                </Button>
              </label>
              <span className="text-xs text-muted-foreground">
                Изображения и видео, до 20 MB. Можно несколько.
              </span>
            </div>

            {media.length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {media.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group"
                  >
                    {isVideo(url) ? (
                      <div className="h-full w-full grid place-items-center text-muted-foreground">
                        <Film className="h-8 w-8" />
                      </div>
                    ) : (
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-cover cursor-pointer"
                        onClick={() => setPreviewUrl(url)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setMedia((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 h-7 w-7 rounded-full bg-background/90 backdrop-blur grid place-items-center text-destructive opacity-0 group-hover:opacity-100 transition"
                      aria-label="Удалить"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || !text.trim()}>
              <Send className="h-4 w-4 mr-1" />
              {submitting ? "Отправка…" : "Отправить предложение"}
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Фильтр:</span>
        {(["all", "pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition",
              filter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
            )}
          >
            {s === "all" ? "Все" : STATUS_LABEL[s]}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">
          Всего: {items.length}
        </span>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Пока нет предложений
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {filtered.map((s) => {
            const author = profiles[s.author_id];
            const mine = s.author_id === user?.id;
            return (
              <li
                key={s.id}
                className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)] flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  {author?.avatar_url ? (
                    <img
                      src={author.avatar_url}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-medium">
                      {(author?.display_name ?? "?")[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {author?.display_name ?? "Участник"}
                      {mine && (
                        <span className="text-muted-foreground text-xs font-normal ml-1">(вы)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[s.status]} className="shrink-0">
                    {STATUS_LABEL[s.status]}
                  </Badge>
                </div>

                <p className="text-sm whitespace-pre-wrap break-words text-foreground/90">
                  {s.text}
                </p>

                {s.media.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {s.media.slice(0, 6).map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPreviewUrl(url)}
                        className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group"
                      >
                        {isVideo(url) ? (
                          <div className="h-full w-full grid place-items-center text-muted-foreground">
                            <Film className="h-6 w-6" />
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover group-hover:scale-105 transition"
                          />
                        )}
                        {i === 5 && s.media.length > 6 && (
                          <div className="absolute inset-0 bg-background/70 grid place-items-center text-sm font-medium">
                            +{s.media.length - 6}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1 mt-auto border-t border-border">
                  {canEdit && s.status !== "approved" && (
                    <Button size="sm" onClick={() => convert(s)}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Создать пост
                    </Button>
                  )}
                  {canEdit && s.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => reject(s.id)}>
                      Отклонить
                    </Button>
                  )}
                  {canEdit && s.status !== "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => reopen(s.id)}>
                      Вернуть в работу
                    </Button>
                  )}
                  {(canEdit || mine) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive ml-auto"
                      onClick={() => setConfirmDelete(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить предложение?</AlertDialogTitle>
            <AlertDialogDescription>
              Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && remove(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={previewUrl !== null} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Просмотр медиа</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            isVideo(previewUrl) ? (
              <video src={previewUrl} controls className="w-full rounded-lg" />
            ) : (
              <img src={previewUrl} alt="" className="w-full rounded-lg object-contain max-h-[70vh]" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
