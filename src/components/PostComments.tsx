import { useState } from "react";
import { MessageCircle, Loader2, RefreshCw, Heart } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getVkPostComments } from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Comment {
  id: number;
  text: string;
  date: number;
  author: string;
  avatar: string | null;
  likes: number;
}

interface PostCommentsProps {
  postId: string;
  /** true только если пост опубликован в VK */
  enabled: boolean;
}

export function PostComments({ postId, enabled }: PostCommentsProps) {
  const fetchComments = useServerFn(getVkPostComments);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchComments({ data: { post_id: postId } });
      if (!r.ok) {
        toast.error(r.error ?? "Не удалось получить комментарии");
        setComments([]);
        return;
      }
      const list = r.comments as Comment[];
      setComments(list);
      setTotal(("total" in r ? r.total : null) ?? list.length);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">
            Комментарии VK{total !== null ? ` (${total})` : ""}
          </h3>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={load}
          disabled={loading}
          className="h-8"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {comments === null ? "Загрузить" : "Обновить"}
        </Button>
      </div>

      {comments === null && (
        <p className="text-sm text-muted-foreground">
          Нажмите «Загрузить», чтобы получить комментарии из VK.
        </p>
      )}

      {comments !== null && comments.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>
      )}

      {comments !== null && comments.length > 0 && (
        <ul className="space-y-3 max-h-96 overflow-auto">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 text-sm">
              {c.avatar ? (
                <img
                  src={c.avatar}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-muted flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium truncate">{c.author}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(c.date).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-foreground/90 whitespace-pre-wrap break-words mt-0.5">
                  {c.text || <span className="text-muted-foreground italic">(без текста)</span>}
                </p>
                {c.likes > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Heart className="h-3 w-3" /> {c.likes}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
