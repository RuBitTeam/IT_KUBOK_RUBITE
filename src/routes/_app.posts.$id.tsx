import { createFileRoute, useNavigate, useParams, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Share2, Send, Trash2 } from "lucide-react";
import { z } from "zod";
import {
  createPost,
  getPost,
  updatePost,
  deletePost,
  type Platform,
  type PostStatus,
  PLATFORM_LABEL,
  STATUS_LABEL,
} from "@/lib/posts-api";
import {
  ensureTags,
  type SocialAccount,
} from "@/lib/social-api";
import { SocialAccountPicker } from "@/components/SocialAccountPicker";
import {
  publishPostNow,
  publishPostToAll,
  listWorkspaceSocialAccounts,
} from "@/lib/social.functions";
import { syncPostRoleTasks, getPostRoleTasks } from "@/lib/tasks.functions";
import { listWorkspaceMembers } from "@/lib/workspace-members.functions";
import { updateSuggestionStatus } from "@/lib/suggestions.functions";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import {
  getMyRole,
  getWorkspace,
  listMyWorkspaces,
  listCategories,
  type Category,
  type WorkspaceRole,
} from "@/lib/workspaces-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TagsPicker } from "@/components/TagsPicker";
import { MediaPicker } from "@/components/MediaPicker";
import { SocialPreview } from "@/components/SocialPreview";
import { TextChecker } from "@/components/TextChecker";
import { PostComments } from "@/components/PostComments";
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

interface EditorSearch {
  ws?: string;
  cat?: string;
  suggestion?: string;
  text?: string;
  media?: string;
}

export const Route = createFileRoute("/_app/posts/$id")({
  component: PostEditor,
  validateSearch: (s: Record<string, unknown>): EditorSearch => ({
    ws: typeof s.ws === "string" ? s.ws : undefined,
    cat: typeof s.cat === "string" ? s.cat : undefined,
    suggestion: typeof s.suggestion === "string" ? s.suggestion : undefined,
    text: typeof s.text === "string" ? s.text : undefined,
    media: typeof s.media === "string" ? s.media : undefined,
  }),
});

const schema = z.object({
  title: z.string().trim().max(200),
  content: z.string().max(10000),
});

interface FormState {
  title: string;
  content: string;
  media_url: string;
  status: PostStatus;
  publish_date: string;
  platform: Platform;
  tags: string[];
  social_account_id: string | null;
  publishToSocial: boolean;
}

const empty: FormState = {
  title: "",
  content: "",
  media_url: "",
  status: "draft",
  publish_date: "",
  platform: "vk",
  tags: [],
  social_account_id: null,
  publishToSocial: false,
};

function PostEditor() {
  const { id } = useParams({ from: "/_app/posts/$id" });
  const search = useSearch({ from: "/_app/posts/$id" });
  const isNew = id === "new";
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [wsRole, setWsRole] = useState<WorkspaceRole | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const publishNow = useServerFn(publishPostNow);
  const publishAll = useServerFn(publishPostToAll);
  const updateSuggestion = useServerFn(updateSuggestionStatus);
  const syncRoleTasks = useServerFn(syncPostRoleTasks);
  const getRoleTasks = useServerFn(getPostRoleTasks);
  const loadMembers = useServerFn(listWorkspaceMembers);
  const [members, setMembers] = useState<
    { user_id: string; display_name: string | null; email: string }[]
  >([]);
  const [copywriterId, setCopywriterId] = useState<string>("");
  const [designerId, setDesignerId] = useState<string>("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [workspaceDescription, setWorkspaceDescription] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const userTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  // Workspace-level permissions: anyone in the workspace can edit; only editor+ can publish.
  const canEdit = wsRole !== null;
  const canPublish = wsRole === "owner" || wsRole === "admin" || wsRole === "editor";

  useEffect(() => {
    if (!workspaceId) {
      setAccounts([]);
      setCategories([]);
      return;
    }
    listWorkspaceSocialAccounts({ data: { workspace_id: workspaceId } })
      .then((r) => {
        if (r.ok) setAccounts(r.accounts as unknown as SocialAccount[]);
        else setAccounts([]);
      })
      .catch(() => setAccounts([]));
    listCategories(workspaceId)
      .then((cs) => setCategories(cs))
      .catch(() => setCategories([]));
    getWorkspace(workspaceId)
      .then((w) => {
        setWorkspaceDescription(w?.description ?? "");
        setWorkspaceName(w?.name ?? "");
      })
      .catch(() => {
        setWorkspaceDescription("");
        setWorkspaceName("");
      });
  }, [workspaceId]);

  // Load workspace members for copywriter/designer pickers
  useEffect(() => {
    if (!workspaceId) {
      setMembers([]);
      return;
    }
    loadMembers({ data: { workspaceId } })
      .then((r) => {
        const list = (r?.members ?? []).map((m) => ({
          user_id: m.user_id,
          display_name: m.display_name,
          email: m.email,
        }));
        setMembers(list);
      })
      .catch(() => setMembers([]));
  }, [workspaceId, loadMembers]);

  // Load existing copywriter/designer assignments for the post
  useEffect(() => {
    if (isNew || !user) {
      setCopywriterId("");
      setDesignerId("");
      return;
    }
    getRoleTasks({ data: { post_id: id } })
      .then((r) => {
        if (r.ok) {
          setCopywriterId(r.copywriter_id ?? "");
          setDesignerId(r.designer_id ?? "");
        }
      })
      .catch(() => undefined);
  }, [id, isNew, user, getRoleTasks]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      let wsId: string | null = null;
      let catId: string | null = null;
      if (isNew) {
        // Read suggestion payload from sessionStorage (avoids huge URLs)
        let suggText = search.text ?? "";
        let suggMedia = search.media ?? "";
        if (search.suggestion) {
          try {
            const raw = sessionStorage.getItem(`suggestion:${search.suggestion}`);
            if (raw) {
              const parsed = JSON.parse(raw) as { text?: string; media?: string[] };
              if (parsed.text) suggText = parsed.text;
              if (parsed.media && parsed.media.length > 0 && !suggMedia) {
                suggMedia = parsed.media[0];
              }
            }
          } catch {
            // ignore parse errors
          }
        }
        setForm({
          ...empty,
          content: suggText,
          media_url: suggMedia,
        });
        setSelectedAccountIds(new Set());
        // Приоритет: search param ws → первое доступное пространство
        if (search.ws) {
          wsId = search.ws;
        } else {
          const wss = await listMyWorkspaces(user.id).catch(() => []);
          wsId = wss[0]?.id ?? null;
        }
        catId = search.cat ?? null;
      } else {
        const p = await getPost(id);
        if (p) {
          wsId = (p as unknown as { workspace_id: string }).workspace_id ?? null;
          catId = (p as unknown as { category_id: string | null }).category_id ?? null;
          setForm({
            title: p.title,
            content: p.content,
            media_url: p.media_url ?? "",
            status: p.status,
            publish_date: p.publish_date ? p.publish_date.slice(0, 16) : "",
            platform: p.platform,
            tags: p.tags ?? [],
            social_account_id:
              (p as unknown as { social_account_id: string | null }).social_account_id ?? null,
            publishToSocial: Boolean(
              (p as unknown as { social_account_id: string | null }).social_account_id,
            ),
          });
        }
        setLoading(false);
      }
      setWorkspaceId(wsId);
      setCategoryId(catId);
      if (wsId) {
        const r = await getMyRole(wsId, user.id).catch(() => null);
        setWsRole(r);
      }
    })();
  }, [id, isNew, user, search.ws, search.cat, search.suggestion, search.text, search.media]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ title: form.title, content: form.content });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (form.publishToSocial && !canPublish) {
      toast.error("Публиковать в соцсеть могут только редакторы пространства");
      return;
    }
    if (form.publishToSocial && !form.social_account_id) {
      toast.error("Выберите подключённую соцсеть");
      return;
    }
    setBusy(true);
    try {
      await ensureTags(form.tags);
      // Viewer не может публиковать: статус всегда draft, без даты, без соцсети
      const effectivePublishToSocial = canPublish && form.publishToSocial;
      const effectiveStatus: PostStatus = canPublish ? form.status : "draft";
      const effectivePublishDate = canPublish ? form.publish_date : "";
      const willPublishNow =
        effectivePublishToSocial && !!form.social_account_id && !effectivePublishDate;
      const payload = {
        title: form.title.trim(),
        content: form.content,
        media_url: form.media_url || null,
        status: willPublishNow ? ("draft" as PostStatus) : effectiveStatus,
        publish_date: effectivePublishDate ? new Date(effectivePublishDate).toISOString() : null,
        platform: form.platform,
        tags: form.tags,
        social_account_id: effectivePublishToSocial ? form.social_account_id : null,
      };

      const wsLabel = workspaceName ? `[${workspaceName}] ` : "";

      let postId: string;
      if (isNew) {
        const post = await createPost({
          ...payload,
          media_url: form.media_url ? form.media_url : null,
          author_id: user.id,
          workspace_id: workspaceId ?? undefined,
          category_id: categoryId,
          suggested_post_id: search.suggestion ?? null,
        });
        if (form.media_url && !post.media_url) {
          // Defensive: if RLS dropped media_url, patch it after insert.
          await updatePost(post.id, { media_url: form.media_url });
        }
        postId = post.id;
        if (post.status === "scheduled" && post.publish_date) {
          await supabase.from("notifications").insert({
            user_id: user.id,
            type: "scheduled",
            title: `${wsLabel}Запланирован пост`,
            message: `«${post.title}» выйдет ${new Date(post.publish_date).toLocaleString("ru-RU")}`,
            post_id: post.id,
          });
        }
        // Mark suggestion as approved + link
        if (search.suggestion) {
          await updateSuggestion({
            data: {
              suggestion_id: search.suggestion,
              status: "approved",
              converted_post_id: post.id,
            },
          }).catch(() => undefined);
        }
      } else {
        await updatePost(id, payload);
        postId = id;
      }

      // Sync copywriter/designer task assignments (editor+ only — RLS rejects otherwise)
      if (canPublish) {
        try {
          const r = await syncRoleTasks({
            data: {
              post_id: postId,
              copywriter_id: copywriterId || null,
              designer_id: designerId || null,
            },
          });
          if (!r.ok && r.error) toast.error(r.error);
        } catch (err) {
          toast.error((err as Error).message);
        }
      }

      if (willPublishNow) {
        const res = await publishNow({ data: { post_id: postId } });
        if (!res.ok) {
          toast.error(`Не отправилось в соцсеть: ${res.error}`);
        } else {
          const acc = accounts.find((a) => a.id === form.social_account_id);
          const commLabel = acc ? acc.display_name : "1 сообщество";
          toast.success(`Опубликовано в «${commLabel}»`);
          await supabase.from("notifications").insert({
            user_id: user.id,
            type: "published",
            title: `${wsLabel}Пост опубликован`,
            message: `«${form.title.trim()}» — ${commLabel}`,
            post_id: postId,
          });
        }
      } else {
        toast.success(isNew ? "Создан" : "Сохранено");
      }

      if (isNew) {
        if (workspaceId) {
          if (categoryId) {
            navigate({
              to: "/w/$wsId/categories/$catId",
              params: { wsId: workspaceId, catId: categoryId },
            });
          } else {
            navigate({ to: "/w/$wsId/posts", params: { wsId: workspaceId } });
          }
        } else {
          navigate({ to: "/posts/$id", params: { id: postId } });
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onBroadcastAll = async () => {
    if (!user || isNew || !workspaceId) return;
    if (connectedAccounts.length === 0) {
      toast.error("Нет подключённых сообществ");
      return;
    }
    const ids = Array.from(selectedAccountIds).filter((id) =>
      connectedAccounts.some((a) => a.id === id),
    );
    if (ids.length === 0) {
      toast.error("Отметьте хотя бы одно сообщество");
      return;
    }
    const scheduledIso = form.publish_date ? new Date(form.publish_date).toISOString() : null;
    const isFuture = scheduledIso ? new Date(scheduledIso).getTime() > Date.now() + 30_000 : false;
    const confirmMsg = isFuture
      ? `Запланировать публикацию в ${ids.length} сообществ на ${new Date(scheduledIso!).toLocaleString("ru-RU")}?`
      : `Опубликовать пост в ${ids.length} сообществ сейчас?`;
    if (!confirm(confirmMsg)) return;
    setBroadcasting(true);
    try {
      // Не отправляем фейковое «Без заголовка» в соцсеть — если заголовок пуст,
      // публикуем только текст поста. На бэке title допускается пустым.
      const safeTitle = form.title.trim();
      const res = await publishAll({
        data: {
          post_id: id,
          title: safeTitle,
          content: form.content,
          media_url: form.media_url || null,
          workspace_id: workspaceId,
          account_ids: ids,
          publish_date: scheduledIso,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Не удалось опубликовать");
        return;
      }
      // Build community label: 1 → name, N → "N сообществ"
      const accNames = ids
        .map((aid) => accounts.find((a) => a.id === aid)?.display_name)
        .filter((n): n is string => Boolean(n));
      const uniqNames = Array.from(new Set(accNames));
      const commLabel =
        uniqNames.length === 1 ? uniqNames[0] : `${ids.length} сообществ`;
      if ("scheduled" in res && res.scheduled) {
        toast.success(
          `Запланировано на ${new Date(res.scheduledAt!).toLocaleString("ru-RU")} (${commLabel})`,
        );
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "scheduled",
          title: `${workspaceName ? `[${workspaceName}] ` : ""}Запланирована публикация`,
          message: `«${form.title}» — ${commLabel}, ${new Date(res.scheduledAt!).toLocaleString("ru-RU")}`,
          post_id: id,
        });
        return;
      }
      if (res.failCount === 0) {
        toast.success(`Опубликовано в ${commLabel} (${res.okCount})`);
      } else {
        toast.warning(
          `Опубликовано: ${res.okCount}, с ошибкой: ${res.failCount}. Подробнее в логе поста.`,
        );
      }
      await supabase.from("notifications").insert({
        user_id: user.id,
        type: res.failCount === 0 ? "published" : "failed",
        title: `${workspaceName ? `[${workspaceName}] ` : ""}Пост опубликован`,
        message: `«${form.title}» — ${commLabel}, успех: ${res.okCount}, ошибки: ${res.failCount}`,
        post_id: id,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBroadcasting(false);
    }
  };

  const allConnected = accounts.filter((a) => a.status !== "disconnected");
  const currentCategory = categoryId ? categories.find((c) => c.id === categoryId) : null;
  // Если у рубрики выбраны конкретные соцсети — показываем только их.
  // Если рубрика не выбрана или список пуст — показываем все соцсети пространства.
  const allowedIds =
    currentCategory && currentCategory.social_account_ids.length > 0
      ? new Set(currentCategory.social_account_ids)
      : null;
  const connectedAccounts = allowedIds
    ? allConnected.filter((a) => allowedIds.has(a.id))
    : allConnected;
  const selectedAccount = accounts.find((a) => a.id === form.social_account_id);
  const previewAuthor = selectedAccount?.display_name ?? "Сообщество";

  // Если выбранная соцсеть стала недоступна из-за смены рубрики — сбрасываем.
  useEffect(() => {
    if (
      form.social_account_id &&
      allowedIds &&
      !allowedIds.has(form.social_account_id)
    ) {
      setForm((f) => ({ ...f, social_account_id: null, publishToSocial: false }));
      setSelectedAccountIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  if (loading) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (workspaceId) {
                navigate({ to: "/w/$wsId/posts", params: { wsId: workspaceId } });
              } else {
                navigate({ to: "/workspaces" });
              }
            }}
            className="h-10 w-10 grid place-items-center rounded-xl border border-border bg-card hover:bg-muted transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? "Создание поста" : "Редактирование поста"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (workspaceId) {
                navigate({ to: "/w/$wsId/posts", params: { wsId: workspaceId } });
              } else {
                navigate({ to: "/workspaces" });
              }
            }}
          >
            Отмена
          </Button>
          {!isNew && canEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(true)}
              disabled={busy || broadcasting || deleting}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Удалить
            </Button>
          )}
          {!isNew && canPublish && (form.status === "draft" || form.status === "failed") && (
            <Button
              type="button"
              variant="default"
              disabled={busy || broadcasting}
              onClick={async () => {
                if (!form.social_account_id) {
                  toast.error("Выберите подключённое сообщество в настройках публикации");
                  return;
                }
                if (!confirm("Опубликовать сейчас?")) return;
                setBusy(true);
                try {
                  await ensureTags(form.tags);
                  await updatePost(id, {
                    title: form.title.trim(),
                    content: form.content,
                    media_url: form.media_url || null,
                    tags: form.tags,
                    platform: form.platform,
                    social_account_id: form.social_account_id,
                  });
                  const res = await publishNow({ data: { post_id: id } });
                  if (!res.ok) {
                    toast.error(`Не удалось опубликовать: ${res.error}`);
                  } else {
                    const acc = accounts.find((a) => a.id === form.social_account_id);
                    const commLabel = acc ? acc.display_name : "1 сообщество";
                    toast.success(`Опубликовано в «${commLabel}»`);
                    if (user) {
                      await supabase.from("notifications").insert({
                        user_id: user.id,
                        type: "published",
                        title: `${workspaceName ? `[${workspaceName}] ` : ""}Пост опубликован`,
                        message: `«${form.title.trim()}» — ${commLabel}`,
                        post_id: id,
                      });
                    }
                    if (workspaceId) {
                      navigate({ to: "/w/$wsId/posts", params: { wsId: workspaceId } });
                    }
                  }
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Send className="h-4 w-4 mr-1" />
              Опубликовать сейчас
            </Button>
          )}
          <Button type="submit" form="post-form" disabled={busy || !canEdit}>
            {busy ? "Сохранение…" : isNew ? "Создать" : "Сохранить"}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* LEFT: Form */}
        <form
          id="post-form"
          onSubmit={onSubmit}
          className="space-y-5 bg-card border border-border rounded-2xl p-6 shadow-[var(--shadow-card)]"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="platform" className="text-xs uppercase tracking-wide text-muted-foreground">
                Категория
              </Label>
              <select
                id="platform"
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })}
                disabled={!canEdit}
              >
                {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status" className="text-xs uppercase tracking-wide text-muted-foreground">
                Статус
              </Label>
              <select
                id="status"
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as PostStatus })}
                disabled={!canEdit || !canPublish}
              >
                {(["draft", "scheduled", "published"] as PostStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category" className="text-xs uppercase tracking-wide text-muted-foreground">
              Рубрика
            </Label>
            <select
              id="category"
              className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={categoryId ?? ""}
              onChange={async (e) => {
                const next = e.target.value || null;
                setCategoryId(next);
                if (!isNew) {
                  try {
                    await updatePost(id, { category_id: next });
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }
              }}
              disabled={!canEdit}
            >
              <option value="">Без рубрики</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {currentCategory && currentCategory.social_account_ids.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Доступны только {currentCategory.social_account_ids.length} соцсет
                {currentCategory.social_account_ids.length === 1 ? "ь" : "ей"} из настроек рубрики.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="title" className="text-xs uppercase tracking-wide text-muted-foreground">
                Заголовок
              </Label>
              <span className="text-xs text-muted-foreground">{form.title.length}/200</span>
            </div>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              disabled={!canEdit}
              className="h-11"
              placeholder="Заголовок поста (необязательно)"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content" className="text-xs uppercase tracking-wide text-muted-foreground">
                Текст поста
              </Label>
              <span className="text-xs text-muted-foreground">{form.content.length}/2000</span>
            </div>
            <Textarea
              id="content"
              rows={10}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              disabled={!canEdit}
              className="resize-y"
              placeholder="Напишите текст поста…"
            />
            <TextChecker
              value={form.content}
              onChange={(v) => setForm({ ...form, content: v })}
              disabled={!canEdit}
              workspaceDescription={workspaceDescription}
              categoryName={currentCategory?.name}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Медиафайлы</Label>
            <MediaPicker
              value={form.media_url}
              onChange={(v) => setForm({ ...form, media_url: v })}
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Теги</Label>
            <TagsPicker
              value={form.tags}
              onChange={(v) => setForm({ ...form, tags: v })}
              disabled={!canEdit}
              contextText={`${form.title}\n\n${form.content}`}
            />
          </div>

          {canPublish && (
            <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border">
              <div className="space-y-2">
                <Label
                  htmlFor="copywriter"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Копирайтер
                </Label>
                <select
                  id="copywriter"
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={copywriterId}
                  onChange={(e) => setCopywriterId(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="">— не назначен —</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.email || m.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="designer"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Дизайнер
                </Label>
                <select
                  id="designer"
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={designerId}
                  onChange={(e) => setDesignerId(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="">— не назначен —</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.email || m.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                Назначенному автоматически создастся задача с дедлайном за 24 часа до публикации.
                Сохранится при сохранении поста.
              </p>
            </div>
          )}

          {!canEdit && (
            <p className="text-sm text-muted-foreground">
              У вас нет прав на редактирование этого поста.
            </p>
          )}
        </form>

        {/* RIGHT: Preview + publish settings */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <SocialPreview
            title={form.title}
            content={form.content}
            mediaUrl={form.media_url}
            authorName={previewAuthor}
          />

          {/* Publish settings */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)] space-y-4">
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Настройки публикации</h3>
            </div>

            {!canPublish ? (
              <div className="rounded-xl bg-muted/60 border border-dashed p-4 text-sm text-muted-foreground">
                У вас роль <strong>Пользователь</strong> в этом пространстве. Вы можете создавать
                и редактировать посты, но публиковать их в соцсеть может только редактор или
                владелец пространства. Сохраните пост — редактор увидит его и опубликует.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-xs uppercase tracking-wide text-muted-foreground">
                    Дата и время
                  </Label>
                  <Input
                    id="date"
                    type="datetime-local"
                    value={form.publish_date}
                    onChange={(e) => setForm({ ...form, publish_date: e.target.value })}
                    disabled={!canEdit}
                    className="h-11"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Часовой пояс: <strong>{userTz}</strong>
                  </p>
                </div>

                {connectedAccounts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Нет подключённых сообществ.{" "}
                    <Link to="/social" className="text-primary hover:underline">
                      Подключить →
                    </Link>
                  </p>
                )}

                {connectedAccounts.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Массовая публикация
                      </Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          if (selectedAccountIds.size === connectedAccounts.length) {
                            setSelectedAccountIds(new Set());
                          } else {
                            setSelectedAccountIds(
                              new Set(connectedAccounts.map((a) => a.id)),
                            );
                          }
                        }}
                      >
                        {selectedAccountIds.size === connectedAccounts.length
                          ? "Снять все"
                          : "Выбрать все"}
                      </button>
                    </div>
                    <SocialAccountPicker
                      accounts={connectedAccounts}
                      selectedIds={selectedAccountIds}
                      showStatusError
                      onToggle={(id, checked) => {
                        setSelectedAccountIds((prev) => {
                          const n = new Set(prev);
                          if (checked) n.add(id);
                          else n.delete(id);
                          return n;
                        });
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onBroadcastAll}
                      disabled={broadcasting || busy || selectedAccountIds.size === 0 || isNew}
                      className="w-full"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {broadcasting
                        ? "Отправка…"
                        : `Опубликовать в выбранные (${selectedAccountIds.size})`}
                    </Button>
                    {isNew && (
                      <p className="text-[11px] text-muted-foreground text-center">
                        Сначала сохраните пост — затем сможете опубликовать в выбранные.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {!isNew && form.platform === "vk" && form.status === "published" && (
            <PostComments postId={id} enabled />
          )}
        </aside>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пост?</AlertDialogTitle>
            <AlertDialogDescription>
              Пост будет полностью удалён из системы. Если он уже опубликован в соцсети — там
              он останется. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async (e) => {
                e.preventDefault();
                setDeleting(true);
                try {
                  await deletePost(id);
                  toast.success("Пост удалён");
                  if (workspaceId) {
                    navigate({ to: "/w/$wsId/posts", params: { wsId: workspaceId } });
                  } else {
                    navigate({ to: "/workspaces" });
                  }
                } catch (err) {
                  toast.error((err as Error).message);
                  setDeleting(false);
                  setConfirmDelete(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
