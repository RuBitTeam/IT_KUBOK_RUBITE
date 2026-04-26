// Server functions for managing social accounts (encrypted token storage + verification).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptSecret } from "./crypto.server";
import { verifyToken, publishToSocial } from "./social-publish.server";

// ---------- List all social accounts visible inside a workspace ----------
// Visible to every member: union of accounts owned by any workspace member +
// accounts referenced by posts of this workspace.
const WorkspaceAccountsSchema = z.object({ workspace_id: z.string().uuid() });

export const listWorkspaceSocialAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => WorkspaceAccountsSchema.parse(raw))
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

    // Read explicit links from workspace_social_accounts (many-to-many)
    const { data: links } = await supabaseAdmin
      .from("workspace_social_accounts")
      .select("social_account_id")
      .eq("workspace_id", data.workspace_id);
    const linkedIds = (links ?? []).map((l) => l.social_account_id);

    let ownerAccs: Array<{
      id: string;
      owner_id: string;
      platform: "vk" | "telegram";
      display_name: string;
      target_chat: string;
      status: "connected" | "disconnected" | "error";
      last_error: string | null;
      last_checked_at: string | null;
      created_at: string;
    }> = [];
    if (linkedIds.length > 0) {
      const { data: rows } = await supabaseAdmin
        .from("social_accounts")
        .select(
          "id, owner_id, platform, display_name, target_chat, status, last_error, last_checked_at, created_at",
        )
        .in("id", linkedIds);
      ownerAccs = (rows ?? []) as typeof ownerAccs;
    }

    // Resolve owner display names
    const ownerIds = Array.from(new Set(ownerAccs.map((a) => a.owner_id)));
    const ownerMap = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", ownerIds);
      for (const p of profiles ?? []) {
        ownerMap.set(p.id, p.display_name ?? "Без имени");
      }
    }

    const accounts = ownerAccs
      .map((a) => ({
        ...a,
        owner_display_name: ownerMap.get(a.owner_id) ?? "Неизвестно",
        is_mine: a.owner_id === userId,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return { ok: true as const, accounts };
  });

// ---------- Unlink a social account from a workspace ----------
// Allowed: workspace owner OR account owner. Does NOT delete the account itself.
const UnlinkSchema = z.object({
  account_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});

export const unlinkSocialAccountFromWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UnlinkSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: ws } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.workspace_id)
      .maybeSingle();
    const { data: acc } = await supabaseAdmin
      .from("social_accounts")
      .select("owner_id")
      .eq("id", data.account_id)
      .maybeSingle();
    if (!ws || !acc) return { ok: false as const, error: "Не найдено" };
    const isWsOwner = ws.owner_id === userId;
    const isAccOwner = acc.owner_id === userId;
    if (!isWsOwner && !isAccOwner) {
      return {
        ok: false as const,
        error: "Отвязать может только владелец пространства или владелец соцсети",
      };
    }

    const { error } = await supabaseAdmin
      .from("workspace_social_accounts")
      .delete()
      .eq("workspace_id", data.workspace_id)
      .eq("social_account_id", data.account_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ---------- Link an existing social account to a workspace ----------
// Caller must be a workspace member AND the account owner.
const LinkSchema = z.object({
  account_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});

export const linkSocialAccountToWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => LinkSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return { ok: false as const, error: "Нет доступа к пространству" };

    const { data: acc } = await supabaseAdmin
      .from("social_accounts")
      .select("owner_id")
      .eq("id", data.account_id)
      .maybeSingle();
    if (!acc || acc.owner_id !== userId) {
      return { ok: false as const, error: "Можно привязать только свою соцсеть" };
    }

    const { error } = await supabaseAdmin
      .from("workspace_social_accounts")
      .insert({
        workspace_id: data.workspace_id,
        social_account_id: data.account_id,
        added_by: userId,
      });
    // ignore unique violation (already linked)
    if (error && !error.message.includes("duplicate")) {
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });

// ---------- List my social accounts that are NOT yet linked to a workspace ----------
const MyUnlinkedSchema = z.object({ workspace_id: z.string().uuid() });

export const listMyUnlinkedAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => MyUnlinkedSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: mine } = await supabase
      .from("social_accounts")
      .select("id, platform, display_name, target_chat, status")
      .eq("owner_id", userId);
    const { data: links } = await supabaseAdmin
      .from("workspace_social_accounts")
      .select("social_account_id")
      .eq("workspace_id", data.workspace_id);
    const linked = new Set((links ?? []).map((l) => l.social_account_id));
    const accounts = (mine ?? []).filter((a) => !linked.has(a.id));
    return { ok: true as const, accounts };
  });

const ConnectSchema = z.object({
  platform: z.enum(["vk", "telegram"]),
  display_name: z.string().trim().min(1).max(120),
  target_chat: z.string().trim().min(1).max(200),
  token: z.string().trim().min(10).max(2000),
  workspace_id: z.string().uuid().optional(),
});

export const connectSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ConnectSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const v = await verifyToken(data.platform, data.token, data.target_chat);
    if (!v.ok) {
      return { ok: false as const, error: v.error ?? "Невалидный токен" };
    }

    const encrypted = encryptSecret(data.token);
    const { data: row, error } = await supabase
      .from("social_accounts")
      .insert({
        owner_id: userId,
        platform: data.platform,
        display_name: data.display_name,
        target_chat: data.target_chat,
        encrypted_token: encrypted,
        status: "connected",
        last_checked_at: new Date().toISOString(),
        meta: { info: v.info ?? null },
      })
      .select("id, platform, display_name, target_chat, status, last_checked_at")
      .single();
    if (error) return { ok: false as const, error: error.message };

    if (data.workspace_id && row) {
      await supabaseAdmin.from("workspace_social_accounts").insert({
        workspace_id: data.workspace_id,
        social_account_id: row.id,
        added_by: userId,
      });
    }
    return { ok: true as const, account: row, info: v.info ?? null };
  });

const RecheckSchema = z.object({ id: z.string().uuid() });

export const recheckSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RecheckSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: acc, error } = await supabase
      .from("social_accounts")
      .select("id, platform, target_chat, encrypted_token")
      .eq("id", data.id)
      .single();
    if (error || !acc) return { ok: false as const, error: error?.message ?? "Не найдено" };

    const { decryptSecret } = await import("./crypto.server");
    const token = decryptSecret(acc.encrypted_token);
    const v = await verifyToken(acc.platform as "vk" | "telegram", token, acc.target_chat);

    await supabase
      .from("social_accounts")
      .update({
        status: v.ok ? "connected" : "error",
        last_error: v.ok ? null : v.error ?? "error",
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    return { ok: v.ok, info: v.info ?? null, error: v.error ?? null };
  });

const ReconnectSchema = z.object({
  id: z.string().uuid(),
  token: z.string().trim().min(10).max(2000),
  target_chat: z.string().trim().min(1).max(200).optional(),
});

export const reconnectSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ReconnectSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: acc, error } = await supabase
      .from("social_accounts")
      .select("id, platform, target_chat")
      .eq("id", data.id)
      .single();
    if (error || !acc) return { ok: false as const, error: error?.message ?? "Не найдено" };

    const target = data.target_chat ?? acc.target_chat;
    const v = await verifyToken(acc.platform as "vk" | "telegram", data.token, target);
    if (!v.ok) return { ok: false as const, error: v.error ?? "Невалидный токен" };

    const encrypted = encryptSecret(data.token);
    const { error: upErr } = await supabase
      .from("social_accounts")
      .update({
        encrypted_token: encrypted,
        target_chat: target,
        status: "connected",
        last_error: null,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (upErr) return { ok: false as const, error: upErr.message };
    return { ok: true as const, info: v.info ?? null };
  });

const PublishNowSchema = z.object({ post_id: z.string().uuid() });

export const publishPostNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PublishNowSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: post, error: pErr } = await supabase
      .from("posts")
      .select("id, title, content, media_url, social_account_id, external_post_ids")
      .eq("id", data.post_id)
      .single();
    if (pErr || !post) return { ok: false as const, error: pErr?.message ?? "Пост не найден" };
    if (!post.social_account_id) {
      return { ok: false as const, error: "У поста не выбрана соцсеть" };
    }

    const { data: acc, error: aErr } = await supabase
      .from("social_accounts")
      .select("platform, target_chat, encrypted_token, status")
      .eq("id", post.social_account_id)
      .single();
    if (aErr || !acc) return { ok: false as const, error: aErr?.message ?? "Соцсеть не найдена" };
    if (acc.status === "disconnected") {
      return { ok: false as const, error: "Соцсеть отключена" };
    }

    const titleStr = (post.title ?? "").trim();
    const bodyStr = (post.content ?? "").trim();
    const result = await publishToSocial({
      platform: acc.platform as "vk" | "telegram",
      encryptedToken: acc.encrypted_token,
      targetChat: acc.target_chat,
      text: titleStr ? `${titleStr}\n\n${bodyStr}`.trim() : bodyStr,
      mediaUrl: post.media_url,
    });

    if (!result.ok) {
      await supabase
        .from("posts")
        .update({ status: "failed", error_log: result.error ?? "Unknown error" })
        .eq("id", post.id);
      return { ok: false as const, error: result.error ?? "Ошибка публикации" };
    }

    const marker =
      acc.platform === "vk" && result.externalId ? `vk_post_id:${result.externalId}` : null;
    const existingMap = (post.external_post_ids ?? {}) as Record<string, string>;
    const nextMap = { ...existingMap };
    if (result.externalId) nextMap[post.social_account_id] = result.externalId;
    const nowIso = new Date().toISOString();
    await supabase
      .from("posts")
      .update({
        status: "published",
        publish_date: nowIso,
        published_at: nowIso,
        error_log: marker,
        external_post_ids: nextMap,
      })
      .eq("id", post.id);

    return { ok: true as const, externalId: result.externalId ?? null };
  });

const PublishToAllSchema = z.object({
  post_id: z.string().uuid(),
  // Title may be empty — we just won't prepend it to the post body.
  title: z.string().trim().max(300).default(""),
  content: z.string().max(10000).default(""),
  media_url: z.string().nullable().optional(),
  workspace_id: z.string().uuid(),
  account_ids: z.array(z.string().uuid()).min(1).max(50),
  publish_date: z.string().datetime().nullable().optional(),
});

export const publishPostToAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PublishToAllSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify membership and get only accounts linked to this workspace AND in selected ids
    const { data: member } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return { ok: false as const, error: "Нет доступа к пространству", results: [] };

    const { data: links } = await supabaseAdmin
      .from("workspace_social_accounts")
      .select("social_account_id")
      .eq("workspace_id", data.workspace_id);
    const allowed = new Set((links ?? []).map((l) => l.social_account_id));
    const targetIds = data.account_ids.filter((id) => allowed.has(id));
    if (targetIds.length === 0) {
      return {
        ok: false as const,
        error: "Не выбрано ни одного сообщества из этого пространства",
        results: [],
      };
    }

    // If a future publish_date is set — schedule instead of posting now.
    const scheduledAt = data.publish_date ? new Date(data.publish_date) : null;
    if (scheduledAt && scheduledAt.getTime() > Date.now() + 30_000) {
      // Pick the first target account as the post's primary social_account_id
      // so the scheduler picks it up. Other accounts will be added at publish time
      // by re-running broadcast — for now scheduler publishes to the primary one.
      await supabaseAdmin
        .from("posts")
        .update({
          status: "scheduled",
          publish_date: scheduledAt.toISOString(),
          social_account_id: targetIds[0],
          error_log: `scheduled_targets:${targetIds.join(",")}`,
        })
        .eq("id", data.post_id);
      return {
        ok: true as const,
        scheduled: true,
        scheduledAt: scheduledAt.toISOString(),
        results: [],
        okCount: 0,
        failCount: 0,
      };
    }

    const { data: accounts, error: aErr } = await supabaseAdmin
      .from("social_accounts")
      .select("id, platform, display_name, target_chat, encrypted_token, status")
      .in("id", targetIds)
      .neq("status", "disconnected");
    if (aErr) return { ok: false as const, error: aErr.message, results: [] };
    if (!accounts || accounts.length === 0) {
      return { ok: false as const, error: "Нет подключённых сообществ", results: [] };
    }

    const text = (data.title ? `${data.title}\n\n${data.content ?? ""}` : (data.content ?? "")).trim();
    const results: Array<{
      account_id: string;
      display_name: string;
      platform: string;
      ok: boolean;
      error?: string;
      externalId?: string;
    }> = [];

    for (const acc of accounts) {
      const r = await publishToSocial({
        platform: acc.platform as "vk" | "telegram",
        encryptedToken: acc.encrypted_token,
        targetChat: acc.target_chat,
        text,
        mediaUrl: data.media_url ?? null,
      });
      results.push({
        account_id: acc.id,
        display_name: acc.display_name,
        platform: acc.platform,
        ok: r.ok,
        error: r.error,
        externalId: r.externalId,
      });
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    // Build map { social_account_id: external_post_id } merged with existing
    const { data: existing } = await supabaseAdmin
      .from("posts")
      .select("external_post_ids")
      .eq("id", data.post_id)
      .maybeSingle();
    const externalMap: Record<string, string> = {
      ...((existing?.external_post_ids ?? {}) as Record<string, string>),
    };
    for (const r of results) {
      if (r.ok && r.externalId) externalMap[r.account_id] = r.externalId;
    }

    const vkOk = results.find((r) => r.ok && r.platform === "vk" && r.externalId);
    const errorLog =
      failCount > 0
        ? results
            .filter((r) => !r.ok)
            .map((r) => `${r.display_name}: ${r.error ?? "ошибка"}`)
            .join("; ")
        : vkOk
          ? `vk_post_id:${vkOk.externalId}`
          : null;

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("posts")
      .update({
        status: failCount === 0 ? "published" : okCount > 0 ? "published" : "failed",
        publish_date: okCount > 0 ? nowIso : undefined,
        published_at: okCount > 0 ? nowIso : null,
        error_log: errorLog,
        external_post_ids: externalMap,
      })
      .eq("id", data.post_id);

    return { ok: true as const, results, okCount, failCount };
  });

// ---------- Get VK post comments ----------
const VkCommentsSchema = z.object({ post_id: z.string().uuid() });

export const getVkPostComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => VkCommentsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: post } = await supabase
      .from("posts")
      .select("social_account_id, external_post_ids, platform")
      .eq("id", data.post_id)
      .maybeSingle();

    if (!post) return { ok: false as const, error: "Пост не найден", comments: [] };
    if (!post.social_account_id) {
      return { ok: false as const, error: "У поста не выбрана соцсеть", comments: [] };
    }

    const externalMap = (post.external_post_ids ?? {}) as Record<string, string>;
    const externalId = externalMap[post.social_account_id];
    if (!externalId) {
      return {
        ok: false as const,
        error: "Пост ещё не опубликован в VK или нет внешнего ID",
        comments: [],
      };
    }

    const { data: acc } = await supabaseAdmin
      .from("social_accounts")
      .select("platform, target_chat, encrypted_token")
      .eq("id", post.social_account_id)
      .maybeSingle();
    if (!acc || acc.platform !== "vk") {
      return { ok: false as const, error: "Комментарии доступны только для VK", comments: [] };
    }

    const { decryptSecret } = await import("./crypto.server");
    const token = decryptSecret(acc.encrypted_token);
    const groupId = acc.target_chat.replace(/^-/, "");
    const ownerId = `-${groupId}`;

    try {
      const params = new URLSearchParams({
        owner_id: ownerId,
        post_id: externalId,
        count: "100",
        sort: "desc",
        extended: "1",
        access_token: token,
        v: "5.199",
      });
      const res = await fetch(
        `https://api.vk.com/method/wall.getComments?${params.toString()}`,
      );
      const json = (await res.json()) as {
        response?: {
          items: Array<{
            id: number;
            from_id: number;
            date: number;
            text: string;
            likes?: { count: number };
          }>;
          profiles?: Array<{ id: number; first_name: string; last_name: string; photo_50?: string }>;
          groups?: Array<{ id: number; name: string; photo_50?: string }>;
          count?: number;
        };
        error?: { error_msg: string };
      };
      if (json.error) {
        return { ok: false as const, error: json.error.error_msg, comments: [] };
      }
      const profiles = new Map(
        (json.response?.profiles ?? []).map((p) => [
          p.id,
          { name: `${p.first_name} ${p.last_name}`.trim(), avatar: p.photo_50 ?? null },
        ]),
      );
      const groups = new Map(
        (json.response?.groups ?? []).map((g) => [
          g.id,
          { name: g.name, avatar: g.photo_50 ?? null },
        ]),
      );
      const comments = (json.response?.items ?? []).map((c) => {
        const meta =
          c.from_id > 0
            ? profiles.get(c.from_id)
            : groups.get(Math.abs(c.from_id));
        return {
          id: c.id,
          text: c.text,
          date: c.date * 1000,
          author: meta?.name ?? `id${c.from_id}`,
          avatar: meta?.avatar ?? null,
          likes: c.likes?.count ?? 0,
        };
      });
      return { ok: true as const, comments, total: json.response?.count ?? comments.length };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, comments: [] };
    }
  });

// ---------- Update workspace description ----------
const UpdateWorkspaceSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
});

export const updateWorkspaceServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateWorkspaceSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.workspace_id)
      .maybeSingle();
    if (!ws) return { ok: false as const, error: "Пространство не найдено" };

    const { data: member } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return { ok: false as const, error: "Только владелец или администратор может изменять пространство" };
    }

    const patch: { name?: string; description?: string } = {};
    if (typeof data.name === "string") patch.name = data.name;
    if (typeof data.description === "string") patch.description = data.description;
    if (Object.keys(patch).length === 0) return { ok: true as const };

    const { error } = await supabaseAdmin
      .from("workspaces")
      .update(patch)
      .eq("id", data.workspace_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
