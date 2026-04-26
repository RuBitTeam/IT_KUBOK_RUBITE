import { useEffect, useState } from "react";
import {
  BarChart3,
  Eye,
  Heart,
  Repeat,
  MessageCircle,
  RefreshCw,
  X,
  ExternalLink,
  Users,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVkPostStats, type VkPostStats } from "@/lib/vk-stats.functions";
import { getTgPostStats } from "@/lib/tg-stats.functions";

interface Props {
  postId: string;
  postTitle: string;
  platform?: "vk" | "telegram" | string;
  open: boolean;
  onClose: () => void;
}

interface TgChannelInfo {
  account_id: string;
  community_name: string;
  message_id: string | null;
  members_count: number | null;
  channel_title: string | null;
  channel_username: string | null;
  tg_url: string | null;
  views: number | null;
}

interface TgPostInfo {
  id: string;
  title: string;
  content: string;
  media_url: string | null;
  published_at: string | null;
}

export function PostAnalyticsModal({ postId, postTitle, platform, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [vkStats, setVkStats] = useState<VkPostStats | null>(null);
  const [tgPost, setTgPost] = useState<TgPostInfo | null>(null);
  const [tgChannels, setTgChannels] = useState<TgChannelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isTg = platform === "telegram";

  const load = async () => {
    setLoading(true);
    setError(null);
    setVkStats(null);
    setTgPost(null);
    setTgChannels([]);
    try {
      if (isTg) {
        const r = await getTgPostStats({ data: { post_id: postId } });
        if (r.ok) {
          setTgPost(r.post);
          setTgChannels(r.channels);
        } else {
          setError(r.error ?? "Не удалось получить информацию");
        }
      } else {
        const r = await getVkPostStats({ data: { post_id: postId } });
        if (r.ok) setVkStats(r.stats);
        else setError(r.error ?? "Не удалось получить статистику");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId, platform]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold truncate">
                {isTg ? "Информация о публикации" : "Аналитика поста"}
              </h2>
              <p className="text-xs text-muted-foreground truncate">{postTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {isTg ? "Запрашиваем Telegram…" : "Загружаем данные из VK…"}
            </p>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm p-3">
              {error}
            </div>
          )}

          {!loading && !error && !isTg && vkStats && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Metric icon={<Eye className="h-4 w-4" />} label="Просмотры" value={vkStats.views} />
                <Metric icon={<Heart className="h-4 w-4" />} label="Лайки" value={vkStats.likes} />
                <Metric icon={<Repeat className="h-4 w-4" />} label="Репосты" value={vkStats.reposts} />
                <Metric
                  icon={<MessageCircle className="h-4 w-4" />}
                  label="Комментарии"
                  value={vkStats.comments}
                />
              </div>
              {vkStats.vk_post_id && (
                <p className="text-xs text-muted-foreground text-center">
                  VK post id: {vkStats.vk_post_id}
                </p>
              )}
            </>
          )}

          {!loading && !error && isTg && tgPost && (
            <div className="space-y-4">
              {(() => {
                const totalViews = tgChannels.reduce(
                  (sum, c) => sum + (c.views ?? 0),
                  0,
                );
                const hasAnyViews = tgChannels.some((c) => c.views !== null);
                if (hasAnyViews) {
                  return (
                    <div className="grid grid-cols-1 gap-3">
                      <Metric
                        icon={<Eye className="h-4 w-4" />}
                        label="Просмотры (всего)"
                        value={totalViews}
                      />
                    </div>
                  );
                }
                return (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                    Просмотры доступны только для публичных каналов с @username.
                    Для приватных каналов Telegram не отдаёт эти данные.
                  </div>
                );
              })()}

              {tgPost.media_url && (
                <img
                  src={tgPost.media_url.split(/\r?\n/)[0]?.trim() || tgPost.media_url}
                  alt=""
                  className="w-full max-h-64 object-cover rounded-xl border border-border"
                />
              )}

              {tgPost.content && (
                <div className="text-sm whitespace-pre-wrap rounded-xl border border-border bg-background p-3 max-h-40 overflow-y-auto">
                  {tgPost.content}
                </div>
              )}

              {tgPost.published_at && (
                <p className="text-xs text-muted-foreground text-center">
                  Опубликовано: {new Date(tgPost.published_at).toLocaleString("ru-RU")}
                </p>
              )}

              {tgChannels.length > 0 && (
                <ul className="space-y-2">
                  {tgChannels.map((c) => (
                    <li
                      key={c.account_id}
                      className="rounded-xl border border-border p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {c.channel_title ?? c.community_name}
                            {c.channel_username && (
                              <span className="text-muted-foreground font-normal ml-1">
                                @{c.channel_username}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground inline-flex items-center gap-2 mt-0.5">
                            <Users className="h-3 w-3" />
                            {c.members_count?.toLocaleString("ru-RU") ?? "—"} подписчиков
                          </p>
                        </div>
                        {c.tg_url && (
                          <a
                            href={c.tg_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                          >
                            Открыть
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {c.message_id && (
                          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                            <Send className="h-3 w-3" />
                            message_id: {c.message_id}
                          </p>
                        )}
                        {c.views !== null && (
                          <p className="text-[11px] inline-flex items-center gap-1.5 text-foreground font-medium">
                            <Eye className="h-3 w-3" />
                            {c.views.toLocaleString("ru-RU")} просмотров
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="flex-1">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Обновить
            </Button>
            <Button size="sm" onClick={onClose} className="flex-1">
              Закрыть
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border p-3 bg-background">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}
