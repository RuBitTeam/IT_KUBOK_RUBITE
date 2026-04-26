import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureGlobalAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Доступ только для глобального администратора");
}

export const listAllUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureGlobalAdmin(context.userId);

    const { data: usersResp, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);

    const ids = usersResp.users.map((u) => u.id);
    const [{ data: profiles }, { data: rolesRows }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, avatar_url, position").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rolesMap = new Map<string, string[]>();
    for (const r of rolesRows ?? []) {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role as string);
      rolesMap.set(r.user_id, arr);
    }

    const users = usersResp.users
      .map((u) => ({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        display_name: profMap.get(u.id)?.display_name ?? null,
        avatar_url: profMap.get(u.id)?.avatar_url ?? null,
        position: profMap.get(u.id)?.position ?? null,
        roles: rolesMap.get(u.id) ?? [],
      }))
      .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

    return { users };
  });

const InviteSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["admin", "editor", "viewer"]).default("editor"),
});

/**
 * Возвращает список пространств, где текущий пользователь — owner/admin/editor,
 * и где целевого пользователя ещё нет.
 */
export const listInvitableWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ targetUserId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    // Пространства, где приглашающий — editor+
    const { data: myRows, error: myErr } = await supabaseAdmin
      .from("workspace_users")
      .select("workspace_id, role, workspaces:workspaces(id, name, description)")
      .eq("user_id", context.userId)
      .in("role", ["owner", "admin", "editor"]);
    if (myErr) throw new Error(myErr.message);

    const wsIds = (myRows ?? []).map((r) => r.workspace_id);
    if (wsIds.length === 0) return { workspaces: [] as Array<{ id: string; name: string; description: string; my_role: string }> };

    // Где целевой пользователь УЖЕ есть
    const { data: targetRows } = await supabaseAdmin
      .from("workspace_users")
      .select("workspace_id")
      .eq("user_id", data.targetUserId)
      .in("workspace_id", wsIds);
    const taken = new Set((targetRows ?? []).map((r) => r.workspace_id));

    const workspaces = (myRows ?? [])
      .filter((r) => !taken.has(r.workspace_id) && r.workspaces)
      .map((r) => ({
        id: (r.workspaces as { id: string; name: string; description: string }).id,
        name: (r.workspaces as { id: string; name: string; description: string }).name,
        description: (r.workspaces as { id: string; name: string; description: string }).description,
        my_role: r.role as string,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { workspaces };
  });

/**
 * Приглашает пользователя в пространство. Доступно owner/admin/editor.
 * Использует service role, чтобы обойти ограничение RLS (insert только owner).
 */
export const inviteUserToWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InviteSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: myRow } = await supabaseAdmin
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!myRow || !["owner", "admin", "editor"].includes(myRow.role as string)) {
      throw new Error("Нет прав приглашать в это пространство");
    }

    const { data: existing } = await supabaseAdmin
      .from("workspace_users")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (existing) throw new Error("Пользователь уже в пространстве");

    const { error } = await supabaseAdmin
      .from("workspace_users")
      .insert({ workspace_id: data.workspaceId, user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const SetRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "editor", "viewer"]),
  grant: z.boolean(),
});

export const setGlobalRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SetRoleSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await ensureGlobalAdmin(context.userId);

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role });
      if (error && !error.message.includes("duplicate")) {
        throw new Error(error.message);
      }
    } else {
      // Защита: нельзя снять последнего админа
      if (data.role === "admin") {
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        if ((admins ?? []).length <= 1) {
          throw new Error("Нельзя снять права с последнего администратора");
        }
      }
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });
