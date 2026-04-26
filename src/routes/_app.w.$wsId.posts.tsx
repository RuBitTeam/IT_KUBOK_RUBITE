import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  FileText,
  Send,
  Trash2,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listCategories,
  listWorkspacePosts,
  type Category,
  type WorkspacePost,
} from "@/lib/workspaces-api";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  SERVICE_BADGE_LABEL,
  SERVICE_BADGE_COLOR,
  PULLED_VK_LABEL,
  PULLED_VK_COLOR,
  PULLED_TG_LABEL,
  PULLED_TG_COLOR,
  PULLED_STATUS_LABEL,
  PULLED_STATUS_COLOR,
  deletePost,
} from "@/lib/posts-api";
import { useWorkspace } from "@/lib/workspace-context";
import { PostAnalyticsModal } from "@/components/PostAnalyticsModal";
import { ExternalPostAnalyticsModal } from "@/components/ExternalPostAnalyticsModal";
import { useServerFn } from "@tanstack/react-start";
import { publishPostNow } from "@/lib/social.functions";
import {
  listWorkspaceVkWallPosts,
  listWorkspaceVkAccounts,
  type ExternalVkPost,
} from "@/lib/vk-stats.functions";
import {
  listWorkspaceTgWallPosts,
  type ExternalTgPost,
} from "@/lib/tg-stats.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/w/$wsId/posts")({
  component: WorkspacePostsPage,
});

interface PostStats {
  views: number;
  likes: number;
  comments: number;
  reposts: number;
}

type Row =
  | {
      kind: "internal";
      id: string;
      title: string;
      content: string;
      category_id: string | null;
      status: WorkspacePost["status"];
      platform: WorkspacePost["platform"];
      social_account_id: string | null;
      sortDate: string; // ISO
      displayDate: string | null;
      communityLabel: string | null;
      stats: PostStats | null;
      photoUrl: string | null;
      raw: WorkspacePost;
    }
  | {
      kind: "external";
      id: string;
      title: string;
      content: string;
      community_name: string;
      vk_url: string;
      photo_url: string | null;
      sortDate: string;
      displayDate: string;
      stats: PostStats;
      ext: ExternalVkPost;
    }
  | {
      kind: "external_tg";
      id: string;
      title: string;
      content: string;
      community_name: string;
      tg_url: string;
      photo_url: string | null;
      sortDate: string;
      displayDate: string;
      views: number;
      ext: ExternalTgPost;
    };

type SortKey = "date" | "title" | "status";

// Format community label: 1 → name, N → "N сообществ"
function formatCommunityLabel(names: string[]): string | null {
  const uniq = Array.from(new Set(names.filter(Boolean)));
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return uniq[0];
  return `${uniq.length} сообществ`;
}

function WorkspacePostsPage() {
  const { wsId } = Route.useParams();
  const { canCreate, canEdit: canPublish } = useWorkspace();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<WorkspacePost[]>([]);
  const [external, setExternal] = useState<ExternalVkPost[]>([]);
  const [externalTg, setExternalTg] = useState<ExternalTgPost[]>([]);
  const [communityNames, setCommunityNames] = useState<Record<string, string>>({});
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [analyticsFor, setAnalyticsFor] = useState<WorkspacePost | null>(null);
  const [externalAnalyticsFor, setExternalAnalyticsFor] = useState<ExternalVkPost | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const publishNow = useServerFn(publishPostNow);
  const fetchExternal = useServerFn(listWorkspaceVkWallPosts);
  const fetchExternalTg = useServerFn(listWorkspaceTgWallPosts);
  const fetchVkAccounts = useServerFn(listWorkspaceVkAccounts);

  const handleDelete = async (post: WorkspacePost) => {
    if (!confirm(`Удалить пост «${post.title || "Без заголовка"}»? Действие нельзя отменить.`))
      return;
    setDeletingId(post.id);
    try {
      await deletePost(post.id);
      toast.success("Пост удалён");
      await loadPosts();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const loadPosts = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([listWorkspacePosts(wsId), listCategories(wsId)]);
      setPosts(p);
      setCats(c);
    } finally {
      setLoading(false);
    }
  };

  const loadExternal = async () => {
    setLoadingExternal(true);
    try {
      const [r, rTg, accs] = await Promise.all([
        fetchExternal({ data: { workspace_id: wsId, count: 50 } }),
        fetchExternalTg({ data: { workspace_id: wsId, count: 40 } }),
        fetchVkAccounts({ data: { workspace_id: wsId } }),
      ]);
      if (r.ok) setExternal(r.posts);
      if (rTg.ok) setExternalTg(rTg.posts);
      const map: Record<string, string> = {};
      if (accs.ok) {
        for (const a of accs.accounts) map[a.id] = a.display_name;
      }
      if (rTg.ok) {
        for (const t of rTg.posts) {
          if (!map[t.account_id]) map[t.account_id] = t.community_name;
        }
      }
      setCommunityNames(map);
    } catch {
      // ignore
    } finally {
      setLoadingExternal(false);
    }
  };

  useEffect(() => {
    loadPosts();
    loadExternal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  const handlePublishNow = async (post: WorkspacePost) => {
    if (!post.social_account_id) {
      toast.error("У поста не выбрано сообщество. Откройте пост и выберите соцсеть.");
      return;
    }
    if (!confirm(`Опубликовать «${post.title}» сейчас?`)) return;
    setPublishingId(post.id);
    try {
      const res = await publishNow({ data: { post_id: post.id } });
      if (!res.ok) {
        toast.error(`Не удалось опубликовать: ${res.error}`);
      } else {
        toast.success("Опубликовано");
        await loadPosts();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishingId(null);
    }
  };

  const catMap = new Map(cats.map((c) => [c.id, c]));

  // Index external wall posts by accountId:vkPostId for stats lookup
  const externalIndex = useMemo(() => {
    const m = new Map<string, ExternalVkPost>();
    for (const e of external) m.set(`${e.account_id}:${e.vk_post_id}`, e);
    return m;
  }, [external]);

  // Index external TG posts by accountId:tgPostId for views lookup
  const externalTgIndex = useMemo(() => {
    const m = new Map<string, ExternalTgPost>();
    for (const e of externalTg) m.set(`${e.account_id}:${e.tg_post_id}`, e);
    return m;
  }, [externalTg]);

  const rows: Row[] = useMemo(() => {
    const internalRows: Row[] = posts.map((p) => {
      // Determine community names this post was published to
      const ext = (p.external_post_ids ?? {}) as Record<string, string>;
      const accountIds = Object.keys(ext);
      // Fallback to single social_account_id when external map is empty
      const idsForLabel =
        accountIds.length > 0
          ? accountIds
          : p.social_account_id
            ? [p.social_account_id]
            : [];
      const names = idsForLabel
        .map((aid) => communityNames[aid] ?? null)
        .filter((n): n is string => Boolean(n));
      const communityLabel = formatCommunityLabel(names);

      // Aggregate stats by matching external wall posts (when published to VK)
      let stats: PostStats | null = null;
      let photoUrl: string | null = p.media_url
        ? p.media_url.split(/\r?\n/)[0]?.trim() || p.media_url
        : null;
      if (p.status === "published" && p.platform === "vk" && accountIds.length > 0) {
        let agg: PostStats = { views: 0, likes: 0, comments: 0, reposts: 0 };
        let matched = 0;
        for (const [accId, vkId] of Object.entries(ext)) {
          const m = externalIndex.get(`${accId}:${vkId}`);
          if (m) {
            agg = {
              views: agg.views + m.views,
              likes: agg.likes + m.likes,
              comments: agg.comments + m.comments,
              reposts: agg.reposts + m.reposts,
            };
            matched++;
            if (!photoUrl && m.photo_url) photoUrl = m.photo_url;
          }
        }
        if (matched > 0) stats = agg;
      } else if (p.status === "published" && p.platform === "telegram" && accountIds.length > 0) {
        let views = 0;
        let matched = 0;
        for (const [accId, tgId] of Object.entries(ext)) {
          const m = externalTgIndex.get(`${accId}:${tgId}`);
          if (m) {
            views += m.views;
            matched++;
            if (!photoUrl && m.photo_url) photoUrl = m.photo_url;
          }
        }
        if (matched > 0) stats = { views, likes: 0, comments: 0, reposts: 0 };
      }

      return {
        kind: "internal" as const,
        id: p.id,
        title: p.title,
        content: p.content,
        category_id: p.category_id,
        status: p.status,
        platform: p.platform,
        social_account_id: p.social_account_id,
        sortDate: p.publish_date ?? p.created_at,
        displayDate: p.publish_date,
        communityLabel,
        stats,
        photoUrl,
        raw: p,
      };
    });

    // Set of (account_id:vkPostId) of internal posts to dedupe
    const internalKeys = new Set<string>();
    for (const p of posts) {
      const ext = (p.external_post_ids ?? {}) as Record<string, string>;
      for (const [accId, vkId] of Object.entries(ext)) {
        internalKeys.add(`${accId}:${vkId}`);
      }
    }

    const externalRows: Row[] = external
      .filter((e) => !internalKeys.has(`${e.account_id}:${e.vk_post_id}`))
      .map((e) => ({
        kind: "external" as const,
        id: `ext-${e.account_id}-${e.vk_post_id}`,
        title: e.text.split("\n")[0]?.slice(0, 80) || "Без текста",
        content: e.text,
        community_name: e.community_name,
        vk_url: e.vk_url,
        photo_url: e.photo_url,
        sortDate: e.date,
        displayDate: e.date,
        stats: { views: e.views, likes: e.likes, comments: e.comments, reposts: e.reposts },
        ext: e,
      }));

    const externalTgRows: Row[] = externalTg
      .filter((e) => !internalKeys.has(`${e.account_id}:${e.tg_post_id}`))
      .map((e) => ({
        kind: "external_tg" as const,
        id: `exttg-${e.account_id}-${e.tg_post_id}`,
        title: e.text.split("\n")[0]?.slice(0, 80) || "Без текста",
        content: e.text,
        community_name: e.community_name,
        tg_url: e.tg_url,
        photo_url: e.photo_url,
        sortDate: e.date,
        displayDate: e.date,
        views: e.views,
        ext: e,
      }));

    const all = [...internalRows, ...externalRows, ...externalTgRows];

    const dir = sortDir === "asc" ? 1 : -1;
    all.sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "status": {
          const sa = a.kind === "internal" ? a.status : "pulled";
          const sb = b.kind === "internal" ? b.status : "pulled";
          return sa.localeCompare(sb) * dir;
        }
        case "date":
        default:
          return a.sortDate.localeCompare(b.sortDate) * dir;
      }
    });
    return all;
  }, [posts, external, externalTg, externalIndex, externalTgIndex, communityNames, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      <ArrowUpDown
        className={`h-3 w-3 ${sortKey === k ? "text-foreground" : "opacity-40"}`}
      />
    </button>
  );

  const stopRow = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Все посты пространства</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadExternal}
            disabled={loadingExternal}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1 ${loadingExternal ? "animate-spin" : ""}`}
            />
            Обновить из соцсетей
          </Button>
          {canCreate && (
            <Button
              onClick={() =>
                navigate({
                  to: "/posts/$id",
                  params: { id: "new" },
                  search: { ws: wsId },
                })
              }
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" /> Новый пост
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Загрузка…</div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Постов пока нет</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/30">
                <th className="text-left font-medium px-5 py-3">
                  <SortBtn k="title" label="Пост" />
                </th>
                <th className="text-left font-medium px-3 py-3">Рубрика</th>
                <th className="text-left font-medium px-3 py-3">
                  <SortBtn k="status" label="Статус" />
                </th>
                <th className="text-left font-medium px-3 py-3">Источник</th>
                <th className="text-left font-medium px-3 py-3">
                  <SortBtn k="date" label="Дата" />
                </th>
                <th className="text-right font-medium px-5 py-3 w-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.kind === "internal") {
                  const p = row.raw;
                  const cat = p.category_id ? catMap.get(p.category_id) : null;
                  const goEdit = () =>
                    navigate({ to: "/posts/$id", params: { id: p.id } });
                  return (
                    <tr
                      key={row.id}
                      onClick={goEdit}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          goEdit();
                        }
                      }}
                      className="border-t border-border hover:bg-muted/40 cursor-pointer focus:outline-none focus:bg-muted/40"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-start gap-3">
                          {row.photoUrl ? (
                            <img
                              src={row.photoUrl}
                              alt=""
                              className="h-12 w-12 rounded-md object-cover shrink-0 border border-border"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-md bg-gradient-to-br from-primary/20 to-primary-glow/20 grid place-items-center text-primary font-bold shrink-0 border border-border">
                              {(p.title || "?").slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <Link
                              to="/posts/$id"
                              params={{ id: p.id }}
                              onClick={stopRow}
                              className="font-medium hover:text-primary line-clamp-1"
                            >
                              {p.title || "Без заголовка"}
                            </Link>
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {p.content || "—"}
                            </div>
                            {row.stats && (
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {row.communityLabel ? `${row.communityLabel} · ` : ""}👁{" "}
                                {row.stats.views.toLocaleString("ru-RU")}
                                {p.platform !== "telegram" && (
                                  <>
                                    {" "}· ❤ {row.stats.likes} · 💬 {row.stats.comments} · 🔁{" "}
                                    {row.stats.reposts}
                                  </>
                                )}
                              </div>
                            )}
                            {!row.stats && row.communityLabel && (
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {row.communityLabel}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {cat ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-medium"
                            style={{ color: cat.color }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex text-xs px-2.5 py-1 font-medium ${STATUS_COLOR[p.status]}`}
                        >
                          {STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex text-xs px-2.5 py-1 font-medium ${SERVICE_BADGE_COLOR}`}
                        >
                          {SERVICE_BADGE_LABEL}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {p.publish_date
                          ? new Date(p.publish_date).toLocaleDateString("ru-RU")
                          : "—"}
                      </td>
                      <td
                        className="px-5 py-3 text-right whitespace-nowrap"
                        onClick={stopRow}
                      >
                        <div className="inline-flex gap-2 justify-end">
                          {(p.status === "draft" || p.status === "failed") && canPublish && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handlePublishNow(p)}
                              disabled={publishingId === p.id}
                              className="h-8"
                            >
                              <Send className="h-3.5 w-3.5 mr-1" />
                              {publishingId === p.id ? "Публикуем…" : "Опубликовать"}
                            </Button>
                          )}
                          {canPublish && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(p)}
                              disabled={deletingId === p.id}
                              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                              aria-label="Удалить пост"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
                // external row (VK or Telegram)
                const isTg = row.kind === "external_tg";
                const openExt = () => {
                  if (row.kind === "external") setExternalAnalyticsFor(row.ext);
                  else if (row.kind === "external_tg")
                    window.open(row.tg_url, "_blank", "noopener,noreferrer");
                };
                return (
                  <tr
                    key={row.id}
                    onClick={openExt}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openExt();
                      }
                    }}
                    className="border-t border-border hover:bg-muted/40 cursor-pointer focus:outline-none focus:bg-muted/40"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        {row.photo_url && (
                          <img
                            src={row.photo_url}
                            alt=""
                            className="h-12 w-12 rounded-md object-cover shrink-0 border border-border"
                            loading="lazy"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium line-clamp-1">{row.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {row.content || "—"}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {row.kind === "external"
                              ? `${row.community_name} · 👁 ${row.stats.views} · ❤ ${row.stats.likes} · 💬 ${row.stats.comments} · 🔁 ${row.stats.reposts}`
                              : `${row.community_name} · 👁 ${row.views.toLocaleString("ru-RU")}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-muted-foreground">—</span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex text-xs px-2.5 py-1 font-medium ${PULLED_STATUS_COLOR}`}
                      >
                        {PULLED_STATUS_LABEL}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {isTg ? (
                        <span
                          className={`inline-flex text-xs px-2.5 py-1 font-medium ${PULLED_TG_COLOR}`}
                        >
                          {PULLED_TG_LABEL}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex text-xs px-2.5 py-1 font-medium ${PULLED_VK_COLOR}`}
                        >
                          {PULLED_VK_LABEL}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.displayDate).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">—</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {analyticsFor && (
        <PostAnalyticsModal
          postId={analyticsFor.id}
          postTitle={analyticsFor.title}
          platform={analyticsFor.platform}
          open={!!analyticsFor}
          onClose={() => setAnalyticsFor(null)}
        />
      )}

      {externalAnalyticsFor && (
        <ExternalPostAnalyticsModal
          title={externalAnalyticsFor.text.split("\n")[0]?.slice(0, 80) || "Без текста"}
          vkUrl={externalAnalyticsFor.vk_url}
          communityName={externalAnalyticsFor.community_name}
          stats={{
            views: externalAnalyticsFor.views,
            likes: externalAnalyticsFor.likes,
            comments: externalAnalyticsFor.comments,
            reposts: externalAnalyticsFor.reposts,
          }}
          open={!!externalAnalyticsFor}
          onClose={() => setExternalAnalyticsFor(null)}
        />
      )}
    </div>
  );
}

