import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, FileText, Share2, Loader2, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SocialAccountPicker } from "@/components/SocialAccountPicker";
import {
  getCategory,
  listWorkspacePosts,
  reorderPosts,
  updateCategory,
  type Category,
  type WorkspacePost,
} from "@/lib/workspaces-api";
import { listWorkspaceSocialAccounts } from "@/lib/social.functions";
import { type SocialAccount } from "@/lib/social-api";
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
} from "@/lib/posts-api";
import { useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PostAnalyticsModal } from "@/components/PostAnalyticsModal";
import { ExternalPostAnalyticsModal } from "@/components/ExternalPostAnalyticsModal";
import { useServerFn } from "@tanstack/react-start";
import {
  listWorkspaceVkWallPosts,
  listWorkspaceVkAccounts,
  type ExternalVkPost,
} from "@/lib/vk-stats.functions";
import {
  listWorkspaceTgWallPosts,
  type ExternalTgPost,
} from "@/lib/tg-stats.functions";

interface AuthorInfo {
  display_name: string | null;
  avatar_url: string | null;
}

interface PostStats {
  views: number;
  likes: number;
  comments: number;
  reposts: number;
}

function formatCommunityLabel(names: string[]): string | null {
  const uniq = Array.from(new Set(names.filter(Boolean)));
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return uniq[0];
  return `${uniq.length} сообществ`;
}

export const Route = createFileRoute("/_app/w/$wsId/categories/$catId")({
  component: CategoryDetailPage,
});

function CategoryDetailPage() {
  const { wsId, catId } = Route.useParams();
  const { canEdit, canCreate } = useWorkspace();
  const navigate = useNavigate();
  const isUncat = catId === "uncategorized";
  const [category, setCategory] = useState<Category | null>(null);
  const [posts, setPosts] = useState<WorkspacePost[]>([]);
  const [external, setExternal] = useState<ExternalVkPost[]>([]);
  const [externalTg, setExternalTg] = useState<ExternalTgPost[]>([]);
  const [communityNames, setCommunityNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [tab, setTab] = useState<"posts" | "drafts">("posts");
  const [analyticsFor, setAnalyticsFor] = useState<WorkspacePost | null>(null);
  const [externalAnalyticsFor, setExternalAnalyticsFor] = useState<ExternalVkPost | null>(null);

  const [authors, setAuthors] = useState<Record<string, AuthorInfo>>({});
  const [socialOpen, setSocialOpen] = useState(false);
  const [wsAccounts, setWsAccounts] = useState<SocialAccount[]>([]);
  const [selectedSocialIds, setSelectedSocialIds] = useState<Set<string>>(new Set());
  const [savingSocial, setSavingSocial] = useState(false);

  const fetchExternal = useServerFn(listWorkspaceVkWallPosts);
  const fetchExternalTg = useServerFn(listWorkspaceTgWallPosts);
  const fetchVkAccounts = useServerFn(listWorkspaceVkAccounts);

  const load = async () => {
    setLoading(true);
    try {
      const [cat, list] = await Promise.all([
        isUncat ? Promise.resolve(null) : getCategory(catId),
        listWorkspacePosts(wsId, { categoryId: isUncat ? null : catId }),
      ]);
      setCategory(cat);
      setPosts(list);
      if (cat) setSelectedSocialIds(new Set(cat.social_account_ids ?? []));
      const ids = Array.from(new Set(list.map((p) => p.author_id))).filter(Boolean);
      if (ids.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ids);
        const map: Record<string, AuthorInfo> = {};
        (data ?? []).forEach((p) => {
          map[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
        });
        setAuthors(map);
      } else {
        setAuthors({});
      }
    } catch (e) {
      toast.error((e as Error).message);
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
    load();
    loadExternal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, catId]);

  useEffect(() => {
    if (!wsId) return;
    listWorkspaceSocialAccounts({ data: { workspace_id: wsId } })
      .then((r) => {
        if (r.ok) setWsAccounts(r.accounts as unknown as SocialAccount[]);
      })
      .catch(() => {});
  }, [wsId]);

  const handleSaveSocial = async () => {
    if (!category) return;
    setSavingSocial(true);
    try {
      const ids = Array.from(selectedSocialIds);
      await updateCategory(category.id, { social_account_ids: ids });
      setCategory({ ...category, social_account_ids: ids });
      toast.success("Соцсети сохранены");
      setSocialOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingSocial(false);
    }
  };

  // Build lookup for external VK wall posts to enrich internal published posts
  const externalIndex = useMemo(() => {
    const m = new Map<string, ExternalVkPost>();
    for (const e of external) m.set(`${e.account_id}:${e.vk_post_id}`, e);
    return m;
  }, [external]);

  // Build lookup for external TG posts to enrich internal published posts
  const externalTgIndex = useMemo(() => {
    const m = new Map<string, ExternalTgPost>();
    for (const e of externalTg) m.set(`${e.account_id}:${e.tg_post_id}`, e);
    return m;
  }, [externalTg]);

  // Enrich internal posts with VK photo + stats + community label
  interface EnrichedPost {
    post: WorkspacePost;
    photoUrl: string | null;
    stats: PostStats | null;
    communityLabel: string | null;
  }
  const enriched: EnrichedPost[] = useMemo(() => {
    return posts.map((p) => {
      const ext = (p.external_post_ids ?? {}) as Record<string, string>;
      const accountIds = Object.keys(ext);
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

      return { post: p, photoUrl, stats, communityLabel };
    });
  }, [posts, externalIndex, externalTgIndex, communityNames]);

  // Set of (account_id:vkPostId) of internal posts to dedupe external rows
  const internalKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of posts) {
      const ext = (p.external_post_ids ?? {}) as Record<string, string>;
      for (const [accId, vkId] of Object.entries(ext)) {
        keys.add(`${accId}:${vkId}`);
      }
    }
    return keys;
  }, [posts]);

  // External posts not linked to any internal one — only for "posts" tab (not drafts).
  // Show only posts from accounts that are connected to this category. If the
  // category has no socials configured (or it is "uncategorized") — show nothing,
  // because "посты из сообщества подгружаются только в те рубрики, в которых
  // подключенно именно это сообщество".
  const externalRows = useMemo(() => {
    if (tab === "drafts") return [];
    const allowed = category?.social_account_ids ?? [];
    if (isUncat || allowed.length === 0) return [];
    const allowedSet = new Set(allowed);
    return external.filter(
      (e) =>
        allowedSet.has(e.account_id) && !internalKeys.has(`${e.account_id}:${e.vk_post_id}`),
    );
  }, [external, internalKeys, tab, category, isUncat]);

  const externalTgRows = useMemo(() => {
    if (tab === "drafts") return [];
    const allowed = category?.social_account_ids ?? [];
    if (isUncat || allowed.length === 0) return [];
    const allowedSet = new Set(allowed);
    return externalTg.filter(
      (e) =>
        allowedSet.has(e.account_id) &&
        !internalKeys.has(`${e.account_id}:${e.tg_post_id}`),
    );
  }, [externalTg, internalKeys, tab, category, isUncat]);

  const visibleInternal = useMemo(
    () =>
      enriched.filter((p) =>
        tab === "drafts" ? p.post.status === "draft" : p.post.status !== "draft",
      ),
    [enriched, tab],
  );

  // Перетаскивание постов отключено по запросу: список отображается без drag&drop

  const totalCount = visibleInternal.length + externalRows.length + externalTgRows.length;

  return (
    <div className="space-y-5">
      <Link
        to="/w/$wsId/categories"
        params={{ wsId }}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> К рубрикам
      </Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="h-11 w-11 rounded-xl grid place-items-center text-white font-bold"
            style={{ backgroundColor: category?.color ?? "#94a3b8" }}
          >
            {(category?.name ?? "•").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold">{isUncat ? "Без рубрики" : category?.name ?? "—"}</h2>
            {category?.description && (
              <p className="text-sm text-muted-foreground">{category.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadExternal}
            disabled={loadingExternal}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingExternal ? "animate-spin" : ""}`} />
            Обновить из соцсетей
          </Button>
          {!isUncat && canEdit && (
            <Button variant="outline" size="sm" onClick={() => setSocialOpen(true)}>
              <Share2 className="h-4 w-4 mr-1" /> Настроить соцсети
              {category && category.social_account_ids.length > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                  {category.social_account_ids.length}
                </span>
              )}
            </Button>
          )}
          {canCreate && (
            <Button
              onClick={() =>
                navigate({
                  to: "/posts/$id",
                  params: { id: "new" },
                  search: { ws: wsId, cat: isUncat ? undefined : catId },
                })
              }
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" /> Новый пост
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-border flex gap-1">
        {(
          [
            {
              key: "posts",
              label: "Посты",
              count:
                enriched.filter((p) => p.post.status !== "draft").length + externalRows.length,
            },
            {
              key: "drafts",
              label: "Черновики",
              count: enriched.filter((p) => p.post.status === "draft").length,
            },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2",
              tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                  tab === t.key ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            )}
            {tab === t.key && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted-foreground">Загрузка…</div>
      ) : totalCount === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Постов нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleInternal.map((e) => (
            <SortablePostRow
              key={e.post.id}
              enriched={e}
              canEdit={canEdit}
              author={authors[e.post.author_id]}
              onAnalytics={() => setAnalyticsFor(e.post)}
            />
          ))}

          {externalRows.map((e) => (
            <ExternalPostRow
              key={`ext-${e.account_id}-${e.vk_post_id}`}
              ext={e}
              onClick={() => setExternalAnalyticsFor(e)}
            />
          ))}

          {externalTgRows.map((e) => (
            <ExternalTgPostRow
              key={`exttg-${e.account_id}-${e.tg_post_id}`}
              ext={e}
            />
          ))}
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

      <Dialog open={socialOpen} onOpenChange={setSocialOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Соцсети для рубрики «{category?.name}»</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Отметьте соцсети, в которые можно публиковать посты этой рубрики. Если ничего не
              выбрано — будут доступны все соцсети рабочего пространства.
            </p>
            <SocialAccountPicker
              accounts={wsAccounts}
              selectedIds={selectedSocialIds}
              onToggle={(id, checked) => {
                setSelectedSocialIds((prev) => {
                  const n = new Set(prev);
                  if (checked) n.add(id);
                  else n.delete(id);
                  return n;
                });
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSocialOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSaveSocial} disabled={savingSocial}>
              {savingSocial && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortablePostRow({
  enriched,
  canEdit,
  author,
  onAnalytics,
}: {
  enriched: {
    post: WorkspacePost;
    photoUrl: string | null;
    stats: { views: number; likes: number; comments: number; reposts: number } | null;
    communityLabel: string | null;
  };
  canEdit: boolean;
  author?: AuthorInfo;
  onAnalytics: () => void;
}) {
  const { post, photoUrl, stats, communityLabel } = enriched;
  const navigate = useNavigate();
  const authorName = author?.display_name ?? "Без имени";
  const isPublishedVk = post.status === "published" && post.platform === "vk";
  void canEdit;

  const handleRowClick = () => {
    if (isPublishedVk) {
      onAnalytics();
    } else {
      navigate({ to: "/posts/$id", params: { id: post.id } });
    }
  };

  return (
    <div
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRowClick();
        }
      }}
      className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors cursor-pointer focus:outline-none focus:border-primary/40"
    >
      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary-glow/20 grid place-items-center text-primary font-bold shrink-0 overflow-hidden border border-border">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          post.title.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium line-clamp-1">{post.title}</div>
        <div className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1.5">
          {author?.avatar_url ? (
            <img src={author.avatar_url} alt="" className="h-4 w-4 rounded-full object-cover" />
          ) : (
            <User className="h-3 w-3" />
          )}
          <span className="font-medium">{authorName}</span>
          <span className="opacity-50">·</span>
          <span className="truncate">{post.content || "—"}</span>
        </div>
        {stats && (
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {communityLabel ? `${communityLabel} · ` : ""}👁 {stats.views.toLocaleString("ru-RU")}
            {post.platform !== "telegram" && (
              <>
                {" "}· ❤ {stats.likes} · 💬 {stats.comments} · 🔁 {stats.reposts}
              </>
            )}
          </div>
        )}
        {!stats && communityLabel && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{communityLabel}</div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={`inline-flex text-xs px-2.5 py-1 font-medium whitespace-nowrap ${STATUS_COLOR[post.status]}`}
        >
          {STATUS_LABEL[post.status]}
        </span>
        <span
          className={`inline-flex text-xs px-2.5 py-1 font-medium whitespace-nowrap ${SERVICE_BADGE_COLOR}`}
        >
          {SERVICE_BADGE_LABEL}
        </span>
      </div>
    </div>
  );
}

function ExternalPostRow({
  ext,
  onClick,
}: {
  ext: ExternalVkPost;
  onClick: () => void;
}) {
  const title = ext.text.split("\n")[0]?.slice(0, 80) || "Без текста";
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors cursor-pointer focus:outline-none focus:border-primary/40"
    >
      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary-glow/20 grid place-items-center text-primary font-bold shrink-0 overflow-hidden border border-border">
        {ext.photo_url ? (
          <img src={ext.photo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          title.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium line-clamp-1">{title}</div>
        <div className="text-xs text-muted-foreground line-clamp-1">{ext.text || "—"}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {ext.community_name} · 👁 {ext.views} · ❤ {ext.likes} · 💬 {ext.comments} · 🔁{" "}
          {ext.reposts}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={`inline-flex text-xs px-2.5 py-1 font-medium whitespace-nowrap ${PULLED_STATUS_COLOR}`}
        >
          {PULLED_STATUS_LABEL}
        </span>
        <span
          className={`inline-flex text-xs px-2.5 py-1 font-medium whitespace-nowrap ${PULLED_VK_COLOR}`}
        >
          {PULLED_VK_LABEL}
        </span>
      </div>
    </div>
  );
}


function ExternalTgPostRow({ ext }: { ext: ExternalTgPost }) {
  const title = ext.text.split("\n")[0]?.slice(0, 80) || "Без текста";
  const handleClick = () => window.open(ext.tg_url, "_blank", "noopener,noreferrer");
  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors cursor-pointer focus:outline-none focus:border-primary/40"
    >
      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary-glow/20 grid place-items-center text-primary font-bold shrink-0 overflow-hidden border border-border">
        {ext.photo_url ? (
          <img src={ext.photo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          title.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium line-clamp-1">{title}</div>
        <div className="text-xs text-muted-foreground line-clamp-1">{ext.text || "—"}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {ext.community_name} · 👁 {ext.views.toLocaleString("ru-RU")}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={`inline-flex text-xs px-2.5 py-1 font-medium whitespace-nowrap ${PULLED_STATUS_COLOR}`}
        >
          {PULLED_STATUS_LABEL}
        </span>
        <span
          className={`inline-flex text-xs px-2.5 py-1 font-medium whitespace-nowrap ${PULLED_TG_COLOR}`}
        >
          {PULLED_TG_LABEL}
        </span>
      </div>
    </div>
  );
}
