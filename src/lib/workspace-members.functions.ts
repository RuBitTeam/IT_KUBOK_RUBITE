import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

async function ensureOwner(workspaceId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Пространство не найдено");
  if (data.owner_id !== userId) throw new Error("Только владелец может управлять участниками");
  return data.owner_id as string;
}

export const listWorkspaceMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => {
    if (!input?.workspaceId) throw new Error("workspaceId обязателен");
    return input;
  })
  .handler(async ({ data, context }) => {
    // Member can view; just check membership via admin client
    const { data: membership } = await supabaseAdmin
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership) throw new Error("Нет доступа");

    const { data: rows, error } = await supabaseAdmin
      .from("workspace_users")
      .select("id, role, user_id, created_at")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.user_id);
    const [{ data: profiles }, { data: usersResp }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, avatar_url, position").in("id", ids),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    ]);
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const emailMap = new Map((usersResp?.users ?? []).map((u) => [u.id, u.email ?? ""]));

    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.workspaceId)
      .single();

    const members = (rows ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      role: r.role as WorkspaceRole,
      email: emailMap.get(r.user_id) ?? "",
      display_name: profileMap.get(r.user_id)?.display_name ?? null,
      avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
      position: profileMap.get(r.user_id)?.position ?? null,
      created_at: r.created_at,
    }));

    return { members, ownerId: ws?.owner_id ?? null };
  });

export const addWorkspaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string; email: string; role: WorkspaceRole }) => {
    if (!input?.workspaceId) throw new Error("workspaceId обязателен");
    if (!input?.email) throw new Error("email обязателен");
    if (!["admin", "editor", "viewer"].includes(input.role))
      throw new Error("Некорректная роль (нельзя назначить owner)");
    return { ...input, email: input.email.trim().toLowerCase() };
  })
  .handler(async ({ data, context }) => {
    await ensureOwner(data.workspaceId, context.userId);

    // Find user by email
    const { data: usersResp, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) throw new Error(usersErr.message);
    const target = usersResp.users.find((u) => (u.email ?? "").toLowerCase() === data.email);
    if (!target) throw new Error("Пользователь с таким email не найден");

    const { data: existing } = await supabaseAdmin
      .from("workspace_users")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", target.id)
      .maybeSingle();
    if (existing) throw new Error("Пользователь уже в пространстве");

    const { error: insErr } = await supabaseAdmin
      .from("workspace_users")
      .insert({ workspace_id: data.workspaceId, user_id: target.id, role: data.role });
    if (insErr) throw new Error(insErr.message);

    return { success: true, userId: target.id };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { workspaceId: string; userId: string; role: WorkspaceRole }) => {
      if (!input?.workspaceId || !input?.userId) throw new Error("workspaceId и userId обязательны");
      if (!["admin", "editor", "viewer"].includes(input.role))
        throw new Error("Некорректная роль");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const ownerId = await ensureOwner(data.workspaceId, context.userId);
    if (data.userId === ownerId) throw new Error("Нельзя изменить роль владельца");

    const { error } = await supabaseAdmin
      .from("workspace_users")
      .update({ role: data.role })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string; userId: string }) => {
    if (!input?.workspaceId || !input?.userId) throw new Error("workspaceId и userId обязательны");
    return input;
  })
  .handler(async ({ data, context }) => {
    const ownerId = await ensureOwner(data.workspaceId, context.userId);
    if (data.userId === ownerId) throw new Error("Нельзя удалить владельца пространства");

    const { error } = await supabaseAdmin
      .from("workspace_users")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { success: true };
  });
