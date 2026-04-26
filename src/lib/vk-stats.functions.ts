// Server functions for fetching VK community + post statistics via VK API.
// Uses the encrypted community access token stored in social_accounts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "./crypto.server";

const VK_API = "https://api.vk.com/method";
const VK_V = "5.199";

// ---------- Types ----------
export interface VkCommunityDay {
  date: string; // YYYY-MM-DD
  views: number;
  visitors: number;
  reach: number;
  reach_subscribers: number;
  likes: number;
  comments: number;
  reposts: number;
  posts: number;
}

export interface VkTopPost {
  vk_post_id: string;
  date: string; // ISO
  text: string;
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  engagement: number;
  photo_url: string | null;
  vk_url: string;
}

export interface VkCommunityStats {
  account_id: string;
  display_name: string;
  target_chat: string;
  group_name?: string | null;
  members_count?: number | null;
  days: VkCommunityDay[];
  totals: {
    views: number;
    visitors: number;
    reach: number;
    reach_subscribers: number;
    likes: number;
    comments: number;
    reposts: number;
    posts: number;
    engagement_rate: number; // (likes+comments+reposts) / reach * 100
  };
  top_posts: VkTopPost[];
  error?: string | null;
}

export interface VkPostStats {
  post_id: string;
  vk_post_id?: string | null;
  views: number;
  likes: number;
  reposts: number;
  comments: number;
  error?: string | null;
}

// ---------- Helpers ----------
async function vkCall<T>(method: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, v: VK_V });
  const res = await fetch(`${VK_API}/${method}?${qs.toString()}`);
  return (await res.json()) as T;
}

function emptyTotals(): VkCommunityStats["totals"] {
  return {
    views: 0,
    visitors: 0,
    reach: 0,
    reach_subscribers: 0,
    likes: 0,
    comments: 0,
    reposts: 0,
    posts: 0,
    engagement_rate: 0,
  };
}

// ---------- List VK accounts (workspace-agnostic; filtered client-side) ----------
export const listVkAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("social_accounts")
      .select("id, display_name, target_chat, status")
      .eq("platform", "vk")
      .neq("status", "disconnected")
      .order("created_at", { ascending: false });
    if (error) return { ok: false as const, error: error.message, accounts: [] };
    return {
      ok: true as const,
      accounts: (data ?? []) as Array<{
        id: string;
        display_name: string;
        target_chat: string;
        status: string;
      }>,
    };
  });

// ---------- List VK accounts used in a specific workspace (visible to all members) ----------
const WorkspaceVkAccountsSchema = z.object({
  workspace_id: z.string().uuid(),
});

export const listWorkspaceVkAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => WorkspaceVkAccountsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is a member of the workspace (RLS-checked)
    const { data: member, error: memberErr } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr || !member) {
      return { ok: false as const, error: "Нет доступа к пространству", accounts: [] };
    }

    // Source of truth: explicit links in workspace_social_accounts
    const { data: links, error: linksErr } = await supabaseAdmin
      .from("workspace_social_accounts")
      .select("social_account_id")
      .eq("workspace_id", data.workspace_id);
    if (linksErr) return { ok: false as const, error: linksErr.message, accounts: [] };
    const linkedIds = (links ?? []).map((l) => l.social_account_id);
    if (linkedIds.length === 0) {
      return { ok: true as const, accounts: [] };
    }

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("social_accounts")
      .select("id, display_name, target_chat, status, owner_id, platform, created_at")
      .in("id", linkedIds)
      .eq("platform", "vk")
      .neq("status", "disconnected");
    if (rowsErr) return { ok: false as const, error: rowsErr.message, accounts: [] };

    const accs = (rows ?? [])
      .map((a) => ({
        id: a.id,
        display_name: a.display_name,
        target_chat: a.target_chat,
        status: a.status,
        owner_id: a.owner_id,
        created_at: a.created_at,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return {
      ok: true as const,
      accounts: (accs ?? []) as Array<{
        id: string;
        display_name: string;
        target_chat: string;
        status: string;
        owner_id: string;
      }>,
    };
  });

// ---------- Community stats (stats.get + groups.getById) ----------
const CommunityStatsSchema = z.object({
  account_ids: z.array(z.string().uuid()).min(1).max(20),
  days: z.number().int().min(1).max(90).default(30),
  workspace_id: z.string().uuid().optional(),
});

export const getVkCommunityStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CommunityStatsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // If workspace context provided, verify membership and allow viewing all
    // accounts referenced by that workspace's posts (even if owned by others).
    let allowedIds: Set<string> | null = null;
    if (data.workspace_id) {
      const { data: member } = await supabase
        .from("workspace_users")
        .select("role")
        .eq("workspace_id", data.workspace_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!member) {
        return { ok: false as const, error: "Нет доступа к пространству", stats: [] };
      }
      const { data: links } = await supabaseAdmin
        .from("workspace_social_accounts")
        .select("social_account_id")
        .eq("workspace_id", data.workspace_id);
      allowedIds = new Set(
        (links ?? []).map((l) => l.social_account_id).filter(Boolean) as string[],
      );
    }

    const ids = allowedIds
      ? data.account_ids.filter((id) => allowedIds!.has(id))
      : data.account_ids;
    if (ids.length === 0) return { ok: true as const, stats: [] };

    // Use admin client when workspace membership grants access to non-owned accounts.
    const dbClient = data.workspace_id ? supabaseAdmin : supabase;
    const { data: accounts, error } = await dbClient
      .from("social_accounts")
      .select("id, display_name, target_chat, encrypted_token, platform")
      .in("id", ids)
      .eq("platform", "vk");
    if (error) return { ok: false as const, error: error.message, stats: [] };

    const now = Math.floor(Date.now() / 1000);
    const from = now - data.days * 86400;

    const stats: VkCommunityStats[] = [];
    for (const acc of accounts ?? []) {
      try {
        const token = decryptSecret(acc.encrypted_token);
        const groupId = acc.target_chat.replace(/^-/, "");

        // groups.getById for name/members
        const info = await vkCall<{
          response?:
            | { groups?: Array<{ name?: string; members_count?: number }> }
            | Array<{ name?: string; members_count?: number }>;
          error?: { error_msg: string };
        }>("groups.getById", {
          group_ids: groupId,
          fields: "members_count",
          access_token: token,
        });
        let grp: { name?: string; members_count?: number } | undefined;
        if (Array.isArray(info?.response)) {
          grp = info.response[0];
        } else if (info?.response && Array.isArray((info.response as { groups?: unknown[] }).groups)) {
          grp = (info.response as { groups: Array<{ name?: string; members_count?: number }> }).groups[0];
        }

        // stats.get
        const sg = await vkCall<{
          response?: Array<{
            day?: string;
            period_from?: number;
            visitors?:
              | Array<{ day: string; views?: number; visitors?: number }>
              | { views?: number; visitors?: number };
            reach?:
              | Array<{ day: string; reach?: number; reach_subscribers?: number }>
              | { reach?: number; reach_subscribers?: number };
          }>;
          error?: { error_msg: string };
        }>("stats.get", {
          group_id: groupId,
          timestamp_from: String(from),
          timestamp_to: String(now),
          interval: "day",
          access_token: token,
        });

        // Don't abort on stats.get error — community tokens often lack
        // the `stats` scope. We'll fall back to wall.get for views/reach.
        const statsError = sg?.error?.error_msg ?? null;

        const byDay = new Map<string, VkCommunityDay>();
        const ensure = (date: string) => {
          if (!byDay.has(date))
            byDay.set(date, {
              date,
              views: 0,
              visitors: 0,
              reach: 0,
              reach_subscribers: 0,
              likes: 0,
              comments: 0,
              reposts: 0,
              posts: 0,
            });
          return byDay.get(date)!;
        };
        const dayFromPeriod = (period?: { day?: string; period_from?: number }) => {
          if (period?.day) return period.day;
          if (period?.period_from) return new Date(period.period_from * 1000).toISOString().slice(0, 10);
          return null;
        };

        // From stats.get we take ONLY:
        //  - visitors.visitors  → "Посещения" (unique daily visitors)
        //  - reach.reach        → "Охват контента"
        //  - reach.reach_subscribers
        // "Просмотры контента" comes from wall.get (sum of post views).
        let statsHasData = false;
        for (const period of sg?.response ?? []) {
          const fallbackDay = dayFromPeriod(period);

          if (Array.isArray(period.visitors)) {
            for (const v of period.visitors) {
              const day = v?.day ?? fallbackDay;
              if (!day) continue;
              const d = ensure(day);
              d.visitors += v.visitors ?? 0;
              if ((v.visitors ?? 0) > 0) statsHasData = true;
            }
          } else if (period.visitors && fallbackDay) {
            const d = ensure(fallbackDay);
            d.visitors += period.visitors.visitors ?? 0;
            if ((period.visitors.visitors ?? 0) > 0) statsHasData = true;
          }

          if (Array.isArray(period.reach)) {
            for (const r of period.reach) {
              const day = r?.day ?? fallbackDay;
              if (!day) continue;
              const d = ensure(day);
              d.reach += r.reach ?? 0;
              d.reach_subscribers += r.reach_subscribers ?? 0;
              if ((r.reach ?? 0) > 0) statsHasData = true;
            }
          } else if (period.reach && fallbackDay) {
            const d = ensure(fallbackDay);
            d.reach += period.reach.reach ?? 0;
            d.reach_subscribers += period.reach.reach_subscribers ?? 0;
            if ((period.reach.reach ?? 0) > 0) statsHasData = true;
          }
        }

        // Engagement + content views from wall.get
        let likes = 0;
        let comments = 0;
        let reposts = 0;
        let postsCount = 0;
        let wallViewsTotal = 0;
        const topPosts: VkTopPost[] = [];
        try {
          const wall = await vkCall<{
            response?: {
              items?: Array<{
                id?: number;
                owner_id?: number;
                from_id?: number;
                date: number;
                text?: string;
                views?: { count: number };
                likes?: { count: number };
                comments?: { count: number };
                reposts?: { count: number };
                attachments?: Array<{
                  type: string;
                  photo?: { sizes?: Array<{ url: string; width: number; height: number; type: string }> };
                }>;
              }>;
            };
            error?: { error_msg: string };
          }>("wall.get", {
            owner_id: `-${groupId}`,
            count: "100",
            access_token: token,
          });
          for (const it of wall.response?.items ?? []) {
            if (!it?.date || it.date < from || it.date > now) continue;
            const dayKey = new Date(it.date * 1000).toISOString().slice(0, 10);
            const d = ensure(dayKey);
            const l = it.likes?.count ?? 0;
            const c = it.comments?.count ?? 0;
            const r = it.reposts?.count ?? 0;
            const v = it.views?.count ?? 0;
            d.likes += l;
            d.comments += c;
            d.reposts += r;
            d.posts += 1;
            d.views += v; // "Просмотры контента" = sum of post views
            postsCount += 1;
            likes += l;
            comments += c;
            reposts += r;
            wallViewsTotal += v;

            // collect top-post candidate
            if (it.id != null) {
              const ownerId = it.owner_id ?? -Number(groupId);
              let photo: string | null = null;
              const att = (it.attachments ?? []).find((a) => a.type === "photo");
              if (att?.photo?.sizes && att.photo.sizes.length > 0) {
                const sorted = [...att.photo.sizes].sort((a, b) => b.width - a.width);
                photo = sorted[0]?.url ?? null;
              }
              topPosts.push({
                vk_post_id: `${ownerId}_${it.id}`,
                date: new Date(it.date * 1000).toISOString(),
                text: (it.text ?? "").slice(0, 280),
                views: v,
                likes: l,
                comments: c,
                reposts: r,
                engagement: l + c + r,
                photo_url: photo,
                vk_url: `https://vk.com/wall${ownerId}_${it.id}`,
              });
            }
          }
        } catch {
          // best-effort
        }

        // If stats.get gave nothing but wall.get did, surface a soft hint
        // instead of swallowing the underlying VK error.
        const softError =
          !statsHasData && wallViewsTotal === 0 && statsError ? statsError : null;

        const days = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

        const baseTotals = days.reduce(
          (s, d) => ({
            views: s.views + d.views,
            visitors: s.visitors + d.visitors,
            reach: s.reach + d.reach,
            reach_subscribers: s.reach_subscribers + d.reach_subscribers,
          }),
          { views: 0, visitors: 0, reach: 0, reach_subscribers: 0 },
        );
        const totalEng = likes + comments + reposts;
        const totals = {
          ...baseTotals,
          likes,
          comments,
          reposts,
          posts: postsCount,
          engagement_rate:
            baseTotals.reach > 0
              ? Number(((totalEng / baseTotals.reach) * 100).toFixed(2))
              : 0,
        };

        stats.push({
          account_id: acc.id,
          display_name: acc.display_name,
          target_chat: acc.target_chat,
          group_name: grp?.name ?? null,
          members_count: grp?.members_count ?? null,
          days,
          totals,
          top_posts: topPosts,
          error: softError,
        });
      } catch (e) {
        stats.push({
          account_id: acc.id,
          display_name: acc.display_name,
          target_chat: acc.target_chat,
          group_name: null,
          members_count: null,
          days: [],
          totals: emptyTotals(),
          top_posts: [],
          error: (e as Error).message,
        });
      }
    }

    return { ok: true as const, stats };
  });

// ---------- Post stats (wall.getById) ----------
const PostStatsSchema = z.object({ post_id: z.string().uuid() });

export const getVkPostStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PostStatsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Use admin client to load post + linked social account so any workspace
    // member can view analytics, not only the social account owner.
    const { data: post, error } = await supabaseAdmin
      .from("posts")
      .select(
        "id, title, social_account_id, error_log, published_at, platform, external_post_ids, workspace_id",
      )
      .eq("id", data.post_id)
      .maybeSingle();
    if (error || !post)
      return { ok: false as const, error: error?.message ?? "Пост не найден" };

    // Authorize: caller must be a member of the post's workspace
    const { data: authUser } = await supabase.auth.getUser();
    const callerId = authUser?.user?.id;
    if (!callerId) return { ok: false as const, error: "Не авторизовано" };
    const { data: membership } = await supabaseAdmin
      .from("workspace_users")
      .select("user_id")
      .eq("workspace_id", post.workspace_id)
      .eq("user_id", callerId)
      .maybeSingle();
    if (!membership)
      return { ok: false as const, error: "Нет доступа к этому посту" };

    if (post.platform !== "vk")
      return { ok: false as const, error: "Аналитика VK доступна только для VK-постов" };

    // Resolve a VK social account to use for stats:
    // 1) post.social_account_id if set
    // 2) external_post_ids first key (post was published to that account)
    // 3) the only VK account linked to the post's workspace
    let socialAccountId: string | null = post.social_account_id ?? null;
    const externalMapPre = (post.external_post_ids ?? {}) as Record<string, string>;
    if (!socialAccountId) {
      const firstExt = Object.keys(externalMapPre)[0];
      if (firstExt) socialAccountId = firstExt;
    }
    if (!socialAccountId) {
      const { data: links } = await supabaseAdmin
        .from("workspace_social_accounts")
        .select("social_account_id")
        .eq("workspace_id", post.workspace_id);
      const linkedIds = (links ?? []).map((l) => l.social_account_id);
      if (linkedIds.length > 0) {
        const { data: vkAccs } = await supabaseAdmin
          .from("social_accounts")
          .select("id")
          .in("id", linkedIds)
          .eq("platform", "vk")
          .neq("status", "disconnected");
        if (vkAccs && vkAccs.length === 1) {
          socialAccountId = vkAccs[0].id;
        } else if (vkAccs && vkAccs.length > 1) {
          return {
            ok: false as const,
            error:
              "У поста не выбрано VK сообщество, а в пространстве их несколько. Откройте пост и выберите сообщество.",
          };
        }
      }
      if (!socialAccountId) {
        return {
          ok: false as const,
          error: "В пространстве не привязано ни одно VK сообщество",
        };
      }
    }

    const { data: acc, error: aErr } = await supabaseAdmin
      .from("social_accounts")
      .select("encrypted_token, target_chat, platform")
      .eq("id", socialAccountId)
      .maybeSingle();
    if (aErr || !acc) return { ok: false as const, error: aErr?.message ?? "Сообщество не найдено" };
    if (acc.platform !== "vk")
      return { ok: false as const, error: "Привязанная соцсеть не VK" };

    const token = decryptSecret(acc.encrypted_token);
    const groupId = acc.target_chat.replace(/^-/, "");
    const ownerId = `-${groupId}`;

    // Resolve VK post id with priority:
    // 1) external_post_ids[social_account_id] (most reliable)
    // 2) "vk_post_id:NN" marker in error_log
    // 3) fallback: search latest 30 wall posts by title match
    let vkPostId: string | null = null;
    const externalMap = (post.external_post_ids ?? {}) as Record<string, string>;
    if (externalMap[socialAccountId]) vkPostId = externalMap[socialAccountId];
    if (!vkPostId) {
      const tagMatch = post.error_log?.match(/vk_post_id:(\d+)/);
      if (tagMatch) vkPostId = tagMatch[1];
    }

    if (!vkPostId) {
      const wall = await vkCall<{
        response?: { items?: Array<{ id: number; text?: string }> };
        error?: { error_msg: string };
      }>("wall.get", {
        owner_id: ownerId,
        count: "30",
        access_token: token,
      });
      const found = wall.response?.items?.find((it) =>
        (it.text ?? "").includes(post.title),
      );
      if (found) vkPostId = String(found.id);
    }

    if (!vkPostId) {
      return {
        ok: false as const,
        error: "Не удалось определить VK post_id (возможно, пост ещё не опубликован)",
      };
    }

    const byId = await vkCall<{
      response?: Array<{
        id: number;
        views?: { count: number };
        likes?: { count: number };
        reposts?: { count: number };
        comments?: { count: number };
      }>;
      error?: { error_msg: string };
    }>("wall.getById", {
      posts: `${ownerId}_${vkPostId}`,
      access_token: token,
    });

    if (byId.error)
      return { ok: false as const, error: byId.error.error_msg, vk_post_id: vkPostId };

    let item = byId.response?.[0];

    // Fallback: wall.getById sometimes returns 0/empty counters for community
    // tokens that lack stats scope. Re-query the post via wall.get + filter:
    // wall.get returns full counters reliably.
    const looksEmpty =
      !item ||
      ((item.likes?.count ?? 0) === 0 &&
        (item.comments?.count ?? 0) === 0 &&
        (item.reposts?.count ?? 0) === 0 &&
        (item.views?.count ?? 0) === 0);

    if (looksEmpty) {
      const wall = await vkCall<{
        response?: {
          items?: Array<{
            id: number;
            views?: { count: number };
            likes?: { count: number };
            reposts?: { count: number };
            comments?: { count: number };
          }>;
        };
      }>("wall.get", {
        owner_id: ownerId,
        count: "100",
        access_token: token,
      });
      const found = wall.response?.items?.find((it) => String(it.id) === String(vkPostId));
      if (found) item = found;
    }

    const stats: VkPostStats = {
      post_id: post.id,
      vk_post_id: vkPostId,
      views: item?.views?.count ?? 0,
      likes: item?.likes?.count ?? 0,
      reposts: item?.reposts?.count ?? 0,
      comments: item?.comments?.count ?? 0,
    };

    // Persist a snapshot to post_analytics
    await supabase.from("post_analytics").insert({
      post_id: post.id,
      views: stats.views,
      reactions: stats.likes + stats.reposts + stats.comments,
    });

    return { ok: true as const, stats };
  });

// ---------- List wall posts from workspace's VK communities ----------
// Returns posts found on the wall of every VK community linked to the workspace,
// including ones not created via this app (with text, photo, stats).
export interface ExternalVkPost {
  vk_post_id: string;
  account_id: string;
  community_name: string;
  owner_id: string;
  text: string;
  photo_url: string | null;
  date: string; // ISO
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  vk_url: string;
}

const WallPostsSchema = z.object({
  workspace_id: z.string().uuid(),
  count: z.number().int().min(1).max(100).default(50),
});

export const listWorkspaceVkWallPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => WallPostsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return { ok: false as const, error: "Нет доступа", posts: [] };

    const { data: links } = await supabaseAdmin
      .from("workspace_social_accounts")
      .select("social_account_id")
      .eq("workspace_id", data.workspace_id);
    const linkedIds = (links ?? []).map((l) => l.social_account_id);
    if (linkedIds.length === 0) return { ok: true as const, posts: [] as ExternalVkPost[] };

    const { data: accs } = await supabaseAdmin
      .from("social_accounts")
      .select("id, display_name, target_chat, encrypted_token, platform, status")
      .in("id", linkedIds)
      .eq("platform", "vk")
      .neq("status", "disconnected");
    if (!accs || accs.length === 0)
      return { ok: true as const, posts: [] as ExternalVkPost[] };

    const all: ExternalVkPost[] = [];
    for (const acc of accs) {
      try {
        const token = decryptSecret(acc.encrypted_token);
        const groupId = acc.target_chat.replace(/^-/, "");
        const ownerId = `-${groupId}`;
        const wall = await vkCall<{
          response?: {
            items?: Array<{
              id: number;
              date: number;
              text?: string;
              views?: { count: number };
              likes?: { count: number };
              comments?: { count: number };
              reposts?: { count: number };
              attachments?: Array<{
                type: string;
                photo?: {
                  sizes?: Array<{ url: string; width: number; height: number; type: string }>;
                };
                video?: {
                  image?: Array<{ url: string; width: number; height: number }>;
                };
                link?: {
                  photo?: {
                    sizes?: Array<{ url: string; width: number; height: number; type: string }>;
                  };
                };
                doc?: {
                  preview?: {
                    photo?: {
                      sizes?: Array<{ url: string; width: number; height: number; type: string }>;
                    };
                  };
                };
                album?: {
                  thumb?: {
                    sizes?: Array<{ url: string; width: number; height: number; type: string }>;
                  };
                };
              }>;
              copy_history?: Array<{
                attachments?: Array<{
                  type: string;
                  photo?: {
                    sizes?: Array<{ url: string; width: number; height: number; type: string }>;
                  };
                }>;
              }>;
            }>;
          };
          error?: { error_msg: string };
        }>("wall.get", {
          owner_id: ownerId,
          count: String(data.count),
          access_token: token,
        });

        const extractPhotoUrl = (atts?: Array<{
          type: string;
          photo?: { sizes?: Array<{ url: string; width: number }> };
          video?: { image?: Array<{ url: string; width: number }> };
          link?: { photo?: { sizes?: Array<{ url: string; width: number }> } };
          doc?: { preview?: { photo?: { sizes?: Array<{ url: string; width: number }> } } };
          album?: { thumb?: { sizes?: Array<{ url: string; width: number }> } };
        }>): string | null => {
          if (!atts) return null;
          const pickLargest = (sizes?: Array<{ url: string; width: number }>) => {
            if (!sizes || sizes.length === 0) return null;
            const sorted = [...sizes].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
            return sorted[0]?.url ?? null;
          };
          for (const a of atts) {
            if (a.type === "photo") {
              const u = pickLargest(a.photo?.sizes);
              if (u) return u;
            }
          }
          for (const a of atts) {
            if (a.type === "video") {
              const imgs = a.video?.image;
              if (imgs && imgs.length > 0) {
                const sorted = [...imgs].sort((x, y) => (y.width ?? 0) - (x.width ?? 0));
                if (sorted[0]?.url) return sorted[0].url;
              }
            }
            if (a.type === "link") {
              const u = pickLargest(a.link?.photo?.sizes);
              if (u) return u;
            }
            if (a.type === "doc") {
              const u = pickLargest(a.doc?.preview?.photo?.sizes);
              if (u) return u;
            }
            if (a.type === "album") {
              const u = pickLargest(a.album?.thumb?.sizes);
              if (u) return u;
            }
          }
          return null;
        };

        for (const it of wall.response?.items ?? []) {
          let photoUrl = extractPhotoUrl(it.attachments);
          // Fallback to copy_history (репосты)
          if (!photoUrl && it.copy_history) {
            for (const ch of it.copy_history) {
              const u = extractPhotoUrl(ch.attachments);
              if (u) {
                photoUrl = u;
                break;
              }
            }
          }
          all.push({
            vk_post_id: String(it.id),
            account_id: acc.id,
            community_name: acc.display_name,
            owner_id: ownerId,
            text: it.text ?? "",
            photo_url: photoUrl,
            date: new Date(it.date * 1000).toISOString(),
            views: it.views?.count ?? 0,
            likes: it.likes?.count ?? 0,
            comments: it.comments?.count ?? 0,
            reposts: it.reposts?.count ?? 0,
            vk_url: `https://vk.com/wall${ownerId}_${it.id}`,
          });
        }
      } catch {
        // skip account on error
      }
    }

    all.sort((a, b) => b.date.localeCompare(a.date));
    return { ok: true as const, posts: all };
  });
