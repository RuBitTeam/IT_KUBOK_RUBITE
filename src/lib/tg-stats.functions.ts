// Server functions for fetching Telegram channel + post statistics via Bot API.
// Telegram Bot API limits: per-message view counts are not exposed to bots after publish.
// We surface what's reliably available: channel info, member count, and posts that
// were published through this app (from our DB), with their stored content/media.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "./crypto.server";

const TG_API = "https://api.telegram.org";

// ---------- Types ----------
export interface TgChannelStats {
  account_id: string;
  display_name: string;
  target_chat: string;
  channel_title: string | null;
  channel_username: string | null;
  members_count: number | null;
  description: string | null;
  posts_count: number;
  total_published_at_period: number;
  error?: string | null;
}

export interface TgPostRow {
  post_id: string;
  account_id: string;
  community_name: string;
  channel_username: string | null;
  message_id: string | null;
  title: string;
  content: string;
  media_url: string | null;
  published_at: string;
  tg_url: string | null;
}

// ---------- Helpers ----------
async function tgCall<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return (await res.json()) as T;
}

function buildTgUrl(channelUsername: string | null, targetChat: string, messageId: string | null): string | null {
  if (!messageId) return null;
  // Public channels: https://t.me/<username>/<message_id>
  if (channelUsername) return `https://t.me/${channelUsername}/${messageId}`;
  // Private supergroup/channel with -100<id> -> https://t.me/c/<id>/<message_id>
  const m = targetChat.match(/^-100(\d+)$/);
  if (m) return `https://t.me/c/${m[1]}/${messageId}`;
  // Plain @username
  if (targetChat.startsWith("@")) return `https://t.me/${targetChat.slice(1)}/${messageId}`;
  return null;
}

// ---------- List Telegram accounts of workspace ----------
const WorkspaceTgAccountsSchema = z.object({ workspace_id: z.string().uuid() });

export const listWorkspaceTgAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => WorkspaceTgAccountsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) {
      return { ok: false as const, error: "Нет доступа к пространству", accounts: [] };
    }

    const { data: links } = await supabaseAdmin
      .from("workspace_social_accounts")
      .select("social_account_id")
      .eq("workspace_id", data.workspace_id);
    const linkedIds = (links ?? []).map((l) => l.social_account_id);
    if (linkedIds.length === 0) return { ok: true as const, accounts: [] };

    const { data: rows, error } = await supabaseAdmin
      .from("social_accounts")
      .select("id, display_name, target_chat, status, owner_id, platform, created_at")
      .in("id", linkedIds)
      .eq("platform", "telegram")
      .neq("status", "disconnected");
    if (error) return { ok: false as const, error: error.message, accounts: [] };

    const accs = (rows ?? [])
      .map((a) => ({
        id: a.id,
        display_name: a.display_name,
        target_chat: a.target_chat,
        status: a.status,
        owner_id: a.owner_id,
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));

    return { ok: true as const, accounts: accs };
  });

// ---------- Channel stats: getChat + getChatMemberCount + posts in DB ----------
const ChannelStatsSchema = z.object({
  account_ids: z.array(z.string().uuid()).min(1).max(20),
  workspace_id: z.string().uuid(),
  days: z.number().int().min(1).max(365).default(30),
});

export const getTgChannelStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ChannelStatsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

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
    const allowed = new Set((links ?? []).map((l) => l.social_account_id));
    const ids = data.account_ids.filter((id) => allowed.has(id));
    if (ids.length === 0) return { ok: true as const, stats: [] };

    const { data: accounts, error } = await supabaseAdmin
      .from("social_accounts")
      .select("id, display_name, target_chat, encrypted_token, platform")
      .in("id", ids)
      .eq("platform", "telegram");
    if (error) return { ok: false as const, error: error.message, stats: [] };

    const periodFromIso = new Date(Date.now() - data.days * 86400_000).toISOString();

    const stats: TgChannelStats[] = [];
    for (const acc of accounts ?? []) {
      try {
        const token = decryptSecret(acc.encrypted_token);

        const chatRes = await tgCall<{
          ok: boolean;
          result?: {
            id: number;
            title?: string;
            username?: string;
            description?: string;
            type?: string;
          };
          description?: string;
        }>(token, "getChat", { chat_id: acc.target_chat });

        const memRes = await tgCall<{ ok: boolean; result?: number; description?: string }>(
          token,
          "getChatMemberCount",
          { chat_id: acc.target_chat },
        );

        // Count posts published through service
        const { count: totalPosts } = await supabaseAdmin
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", data.workspace_id)
          .eq("platform", "telegram")
          .eq("status", "published")
          .eq("social_account_id", acc.id);

        const { count: periodPosts } = await supabaseAdmin
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", data.workspace_id)
          .eq("platform", "telegram")
          .eq("status", "published")
          .eq("social_account_id", acc.id)
          .gte("published_at", periodFromIso);

        stats.push({
          account_id: acc.id,
          display_name: acc.display_name,
          target_chat: acc.target_chat,
          channel_title: chatRes.result?.title ?? null,
          channel_username: chatRes.result?.username ?? null,
          description: chatRes.result?.description ?? null,
          members_count: memRes.ok ? (memRes.result ?? null) : null,
          posts_count: totalPosts ?? 0,
          total_published_at_period: periodPosts ?? 0,
          error: chatRes.ok ? null : chatRes.description ?? null,
        });
      } catch (e) {
        stats.push({
          account_id: acc.id,
          display_name: acc.display_name,
          target_chat: acc.target_chat,
          channel_title: null,
          channel_username: null,
          description: null,
          members_count: null,
          posts_count: 0,
          total_published_at_period: 0,
          error: (e as Error).message,
        });
      }
    }

    return { ok: true as const, stats };
  });

// ---------- List Telegram posts published via service ----------
const TgPostsSchema = z.object({
  workspace_id: z.string().uuid(),
  count: z.number().int().min(1).max(200).default(50),
});

export const listWorkspaceTgPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => TgPostsSchema.parse(raw))
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
    if (linkedIds.length === 0) return { ok: true as const, posts: [] as TgPostRow[] };

    const { data: tgAccs } = await supabaseAdmin
      .from("social_accounts")
      .select("id, display_name, target_chat, encrypted_token")
      .in("id", linkedIds)
      .eq("platform", "telegram")
      .neq("status", "disconnected");
    if (!tgAccs || tgAccs.length === 0) return { ok: true as const, posts: [] as TgPostRow[] };

    const accMap = new Map<string, { display_name: string; target_chat: string; channel_username: string | null }>();
    // Fetch channel usernames once per account (best-effort)
    for (const a of tgAccs) {
      let username: string | null = null;
      try {
        const token = decryptSecret(a.encrypted_token);
        const r = await tgCall<{ ok: boolean; result?: { username?: string } }>(token, "getChat", {
          chat_id: a.target_chat,
        });
        username = r.result?.username ?? null;
      } catch {
        // ignore
      }
      accMap.set(a.id, {
        display_name: a.display_name,
        target_chat: a.target_chat,
        channel_username: username,
      });
    }

    const accIds = Array.from(accMap.keys());

    // Posts published through this workspace to any of the TG accounts
    const { data: posts } = await supabaseAdmin
      .from("posts")
      .select("id, title, content, media_url, published_at, social_account_id, external_post_ids, status")
      .eq("workspace_id", data.workspace_id)
      .eq("platform", "telegram")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(data.count);

    const rows: TgPostRow[] = [];
    for (const p of posts ?? []) {
      const ext = (p.external_post_ids ?? {}) as Record<string, string>;
      // For each account this post was published to
      const targets = Object.keys(ext).length > 0 ? Object.entries(ext) : (
        p.social_account_id ? [[p.social_account_id, ""]] : []
      );
      for (const [aid, mid] of targets) {
        if (!accIds.includes(aid)) continue;
        const acc = accMap.get(aid)!;
        rows.push({
          post_id: p.id,
          account_id: aid,
          community_name: acc.display_name,
          channel_username: acc.channel_username,
          message_id: mid || null,
          title: p.title,
          content: p.content ?? "",
          media_url: p.media_url ?? null,
          published_at: p.published_at ?? "",
          tg_url: buildTgUrl(acc.channel_username, acc.target_chat, mid || null),
        });
      }
    }

    return { ok: true as const, posts: rows };
  });

// ---------- Single TG post info (for analytics modal) ----------
const TgPostStatsSchema = z.object({ post_id: z.string().uuid() });

export const getTgPostStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => TgPostStatsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: post, error } = await supabaseAdmin
      .from("posts")
      .select("id, title, content, media_url, published_at, platform, social_account_id, external_post_ids, workspace_id")
      .eq("id", data.post_id)
      .maybeSingle();
    if (error || !post) return { ok: false as const, error: error?.message ?? "Пост не найден" };
    if (post.platform !== "telegram") {
      return { ok: false as const, error: "Это не Telegram-пост" };
    }

    // Authz: caller must be a member of post's workspace
    const { data: authUser } = await supabase.auth.getUser();
    const callerId = authUser?.user?.id;
    if (!callerId) return { ok: false as const, error: "Не авторизовано" };
    const { data: membership } = await supabaseAdmin
      .from("workspace_users")
      .select("user_id")
      .eq("workspace_id", post.workspace_id)
      .eq("user_id", callerId)
      .maybeSingle();
    if (!membership) return { ok: false as const, error: "Нет доступа" };

    const ext = (post.external_post_ids ?? {}) as Record<string, string>;
    const targets: Array<{ account_id: string; message_id: string }> = [];
    for (const [aid, mid] of Object.entries(ext)) {
      if (mid) targets.push({ account_id: aid, message_id: mid });
    }
    if (targets.length === 0 && post.social_account_id) {
      targets.push({ account_id: post.social_account_id, message_id: "" });
    }
    if (targets.length === 0) {
      return { ok: false as const, error: "У поста нет связанного канала" };
    }

    const accountIds = targets.map((t) => t.account_id);
    const { data: accs } = await supabaseAdmin
      .from("social_accounts")
      .select("id, display_name, target_chat, encrypted_token, platform")
      .in("id", accountIds)
      .eq("platform", "telegram");

    const channels: Array<{
      account_id: string;
      community_name: string;
      message_id: string | null;
      members_count: number | null;
      channel_title: string | null;
      channel_username: string | null;
      tg_url: string | null;
      views: number | null;
    }> = [];

    for (const t of targets) {
      const acc = (accs ?? []).find((a) => a.id === t.account_id);
      if (!acc) continue;
      let memCount: number | null = null;
      let channelTitle: string | null = null;
      let username: string | null = null;
      try {
        const token = decryptSecret(acc.encrypted_token);
        const [chat, mem] = await Promise.all([
          tgCall<{ ok: boolean; result?: { title?: string; username?: string } }>(token, "getChat", {
            chat_id: acc.target_chat,
          }),
          tgCall<{ ok: boolean; result?: number }>(token, "getChatMemberCount", {
            chat_id: acc.target_chat,
          }),
        ]);
        channelTitle = chat.result?.title ?? null;
        username = chat.result?.username ?? null;
        memCount = mem.ok ? (mem.result ?? null) : null;
      } catch {
        // best-effort
      }

      // Fallback resolve username from target_chat if API didn't return it
      if (!username) {
        if (acc.target_chat.startsWith("@")) username = acc.target_chat.slice(1);
        else if (!acc.target_chat.startsWith("-")) username = acc.target_chat;
      }

      // Try to fetch view count by parsing public preview page (only for public channels)
      let views: number | null = null;
      if (username && t.message_id) {
        try {
          const { posts } = await fetchTgChannelPreview(username, 100);
          const found = posts.find((p) => p.message_id === t.message_id);
          if (found) views = found.views;
        } catch {
          // best-effort: views stay null
        }
      }

      channels.push({
        account_id: t.account_id,
        community_name: acc.display_name,
        message_id: t.message_id || null,
        members_count: memCount,
        channel_title: channelTitle,
        channel_username: username,
        tg_url: buildTgUrl(username, acc.target_chat, t.message_id || null),
        views,
      });
    }

    return {
      ok: true as const,
      post: {
        id: post.id,
        title: post.title,
        content: post.content ?? "",
        media_url: post.media_url,
        published_at: post.published_at,
      },
      channels,
    };
  });

// ---------- External TG posts (parsed from t.me/s/<username>) ----------
// Telegram Bot API does not allow fetching channel history.
// As a workaround we parse the public preview page t.me/s/<username>
// which is available for any public channel.
export interface ExternalTgPost {
  tg_post_id: string; // message id as string
  account_id: string;
  community_name: string;
  channel_username: string;
  text: string;
  photo_url: string | null;
  date: string; // ISO
  views: number;
  tg_url: string;
}

const TgWallPostsSchema = z.object({
  workspace_id: z.string().uuid(),
  count: z.number().int().min(1).max(100).default(40),
});

function parseViewsLabel(s: string | null | undefined): number {
  if (!s) return 0;
  const trimmed = s.trim().toUpperCase().replace(/\s/g, "");
  const m = trimmed.match(/^([\d.,]+)([KMB])?$/);
  if (!m) {
    const n = parseInt(trimmed.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }
  const num = parseFloat(m[1].replace(",", "."));
  const mult = m[2] === "K" ? 1_000 : m[2] === "M" ? 1_000_000 : m[2] === "B" ? 1_000_000_000 : 1;
  return Math.round(num * mult);
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeHtml(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
}

async function fetchTgChannelPreview(username: string, count: number): Promise<{
  username: string;
  posts: Array<{
    message_id: string;
    text: string;
    photo_url: string | null;
    date: string;
    views: number;
  }>;
}> {
  const url = `https://t.me/s/${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LovableBot/1.0; +https://lovable.dev)",
      "Accept-Language": "ru,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`t.me/s/${username} -> HTTP ${res.status}`);
  }
  const html = await res.text();

  const posts: Array<{
    message_id: string;
    text: string;
    photo_url: string | null;
    date: string;
    views: number;
  }> = [];

  // Each post is wrapped in <div class="tgme_widget_message ..." data-post="user/123" ...>
  const re = /<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"[\s\S]*?(?=<div class="tgme_widget_message |<\/section>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const dataPost = m[1]; // "username/123"
    const block = m[0];
    const messageId = dataPost.split("/")[1] ?? "";

    // Text
    let text = "";
    const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (textMatch) text = stripTags(textMatch[1]);

    // Photo (background-image:url('...'))
    let photoUrl: string | null = null;
    const photoMatch = block.match(/tgme_widget_message_photo_wrap[^"]*"[^>]*style="[^"]*background-image:url\('([^']+)'\)/);
    if (photoMatch) photoUrl = photoMatch[1];
    if (!photoUrl) {
      // video thumbnail fallback
      const vMatch = block.match(/tgme_widget_message_video_thumb[^"]*"[^>]*style="[^"]*background-image:url\('([^']+)'\)/);
      if (vMatch) photoUrl = vMatch[1];
    }

    // Date (<time datetime="2024-...Z">)
    let date = "";
    const dateMatch = block.match(/<time[^>]*datetime="([^"]+)"/);
    if (dateMatch) date = dateMatch[1];

    // Views (<span class="tgme_widget_message_views">1.2K</span>)
    let views = 0;
    const viewsMatch = block.match(/tgme_widget_message_views[^>]*>([^<]+)</);
    if (viewsMatch) views = parseViewsLabel(viewsMatch[1]);

    if (!messageId) continue;
    posts.push({ message_id: messageId, text, photo_url: photoUrl, date, views });
  }

  // Newest last on the page — sort newest first by date string when possible
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { username, posts: posts.slice(0, count) };
}

export const listWorkspaceTgWallPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => TgWallPostsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return { ok: false as const, error: "Нет доступа", posts: [] as ExternalTgPost[] };

    const { data: links } = await supabaseAdmin
      .from("workspace_social_accounts")
      .select("social_account_id")
      .eq("workspace_id", data.workspace_id);
    const linkedIds = (links ?? []).map((l) => l.social_account_id);
    if (linkedIds.length === 0) return { ok: true as const, posts: [] as ExternalTgPost[] };

    const { data: tgAccs } = await supabaseAdmin
      .from("social_accounts")
      .select("id, display_name, target_chat, encrypted_token, status")
      .in("id", linkedIds)
      .eq("platform", "telegram")
      .neq("status", "disconnected");
    if (!tgAccs || tgAccs.length === 0)
      return { ok: true as const, posts: [] as ExternalTgPost[] };

    const result: ExternalTgPost[] = [];
    for (const acc of tgAccs) {
      // Resolve username: prefer @username from target_chat, otherwise getChat
      let username: string | null = null;
      if (acc.target_chat.startsWith("@")) username = acc.target_chat.slice(1);
      else if (!acc.target_chat.startsWith("-")) username = acc.target_chat;
      if (!username) {
        try {
          const token = decryptSecret(acc.encrypted_token);
          const r = await tgCall<{ ok: boolean; result?: { username?: string } }>(
            token,
            "getChat",
            { chat_id: acc.target_chat },
          );
          username = r.result?.username ?? null;
        } catch {
          // ignore
        }
      }
      if (!username) continue; // private channel — can't parse

      try {
        const { posts } = await fetchTgChannelPreview(username, data.count);
        for (const p of posts) {
          result.push({
            tg_post_id: p.message_id,
            account_id: acc.id,
            community_name: acc.display_name,
            channel_username: username,
            text: p.text,
            photo_url: p.photo_url,
            date: p.date,
            views: p.views,
            tg_url: `https://t.me/${username}/${p.message_id}`,
          });
        }
      } catch (e) {
        console.error(`[tg-preview] ${username}: ${(e as Error).message}`);
      }
    }

    result.sort((a, b) => (a.date < b.date ? 1 : -1));
    return { ok: true as const, posts: result };
  });
