import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type WorkspaceRole = "admin" | "editor" | "viewer";

function generateToken(): string {
  // 24 random bytes -> 32 url-safe chars
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function ensureEditor(workspaceId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("workspace_users")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !["owner", "admin", "editor"].includes(data.role as string)) {
    throw new Error("Нет прав создавать приглашения");
  }
}

const CreateSchema = z.object({
  workspaceId: z.string().uuid(),
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
  expiresInHours: z.number().int().min(1).max(24 * 30).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
});

export const createWorkspaceInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await ensureEditor(data.workspaceId, context.userId);

    const token = generateToken();
    const expires_at = data.expiresInHours
      ? new Date(Date.now() + data.expiresInHours * 3600_000).toISOString()
      : null;

    const { data: row, error } = await supabaseAdmin
      .from("workspace_invites")
      .insert({
        workspace_id: data.workspaceId,
        token,
        role: data.role,
        created_by: context.userId,
        expires_at,
        max_uses: data.maxUses ?? null,
      })
      .select("id, token, role, expires_at, max_uses, uses, revoked, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { invite: row };
  });

export const listWorkspaceInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await ensureEditor(data.workspaceId, context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("workspace_invites")
      .select("id, token, role, expires_at, max_uses, uses, revoked, created_at, created_by")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { invites: rows ?? [] };
  });

export const revokeWorkspaceInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().uuid(), inviteId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await ensureEditor(data.workspaceId, context.userId);
    const { error } = await supabaseAdmin
      .from("workspace_invites")
      .update({ revoked: true })
      .eq("id", data.inviteId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Получить публичную информацию о приглашении (название пространства). */
export const getInviteInfo = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(8).max(128) }).parse(raw))
  .handler(async ({ data }) => {
    const { data: invite } = await supabaseAdmin
      .from("workspace_invites")
      .select("id, workspace_id, role, expires_at, max_uses, uses, revoked")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) return { ok: false as const, error: "Приглашение не найдено" };
    if (invite.revoked) return { ok: false as const, error: "Приглашение отозвано" };
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now())
      return { ok: false as const, error: "Срок действия истёк" };
    if (invite.max_uses && invite.uses >= invite.max_uses)
      return { ok: false as const, error: "Лимит использований исчерпан" };

    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, description")
      .eq("id", invite.workspace_id)
      .maybeSingle();
    if (!ws) return { ok: false as const, error: "Пространство не найдено" };

    return {
      ok: true as const,
      workspace: ws,
      role: invite.role as WorkspaceRole,
    };
  });

export const acceptWorkspaceInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(8).max(128) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: invite } = await supabaseAdmin
      .from("workspace_invites")
      .select("id, workspace_id, role, expires_at, max_uses, uses, revoked")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) throw new Error("Приглашение не найдено");
    if (invite.revoked) throw new Error("Приглашение отозвано");
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now())
      throw new Error("Срок действия истёк");
    if (invite.max_uses && invite.uses >= invite.max_uses)
      throw new Error("Лимит использований исчерпан");

    // Already a member?
    const { data: existing } = await supabaseAdmin
      .from("workspace_users")
      .select("id")
      .eq("workspace_id", invite.workspace_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      return { ok: true as const, workspaceId: invite.workspace_id, alreadyMember: true };
    }

    const { error: insErr } = await supabaseAdmin.from("workspace_users").insert({
      workspace_id: invite.workspace_id,
      user_id: context.userId,
      role: invite.role,
    });
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin
      .from("workspace_invites")
      .update({ uses: invite.uses + 1 })
      .eq("id", invite.id);

    return { ok: true as const, workspaceId: invite.workspace_id, alreadyMember: false };
  });
