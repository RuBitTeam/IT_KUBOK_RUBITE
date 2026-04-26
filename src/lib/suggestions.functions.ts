import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateSchema = z.object({
  workspace_id: z.string().uuid(),
  text: z.string().trim().min(1).max(10000),
  media: z.array(z.string().url()).max(20).default([]),
});

export const createSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Must be a member of the workspace
    const { data: member } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return { ok: false as const, error: "Нет доступа к пространству" };

    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .eq("id", data.workspace_id)
      .maybeSingle();
    if (!ws) return { ok: false as const, error: "Пространство не найдено" };

    const { data: inserted, error } = await supabaseAdmin
      .from("suggested_posts")
      .insert({
        workspace_id: data.workspace_id,
        author_id: userId,
        text: data.text,
        media: data.media,
      })
      .select("id")
      .single();
    if (error || !inserted) return { ok: false as const, error: error?.message ?? "Ошибка" };

    // Notify editors / admins / owner
    const { data: editors } = await supabaseAdmin
      .from("workspace_users")
      .select("user_id, role")
      .eq("workspace_id", data.workspace_id)
      .in("role", ["owner", "admin", "editor"]);

    const { data: authorProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    const authorName = authorProfile?.display_name ?? "Участник";

    const recipients = (editors ?? [])
      .map((e) => e.user_id)
      .filter((id) => id !== userId);

    if (recipients.length > 0) {
      const rows = recipients.map((uid) => ({
        user_id: uid,
        type: "suggestion" as const,
        title: `[${ws.name}] Новое предложение`,
        message: `${authorName} предложил пост: ${data.text.slice(0, 140)}${
          data.text.length > 140 ? "…" : ""
        }`,
        post_id: null,
      }));
      await supabaseAdmin.from("notifications").insert(rows);
    }

    return { ok: true as const, id: inserted.id };
  });

const StatusSchema = z.object({
  suggestion_id: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected"]),
  converted_post_id: z.string().uuid().optional(),
});

export const updateSuggestionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => StatusSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    const { data: sug } = await supabaseAdmin
      .from("suggested_posts")
      .select("id, workspace_id, author_id")
      .eq("id", data.suggestion_id)
      .maybeSingle();
    if (!sug) return { ok: false as const, error: "Предложение не найдено" };

    // Must be editor+ in this workspace
    const { data: member } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", sug.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member || !["owner", "admin", "editor"].includes(member.role)) {
      return { ok: false as const, error: "Нет прав" };
    }

    const patch: {
      status: "pending" | "approved" | "rejected";
      reviewed_by: string;
      reviewed_at: string;
      converted_post_id?: string;
    } = {
      status: data.status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    };
    if (data.converted_post_id) patch.converted_post_id = data.converted_post_id;

    const { error } = await supabaseAdmin
      .from("suggested_posts")
      .update(patch)
      .eq("id", data.suggestion_id);
    if (error) return { ok: false as const, error: error.message };

    return { ok: true as const };
  });

const DeleteSchema = z.object({ suggestion_id: z.string().uuid() });

export const deleteSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => DeleteSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: sug } = await supabaseAdmin
      .from("suggested_posts")
      .select("id, workspace_id, author_id")
      .eq("id", data.suggestion_id)
      .maybeSingle();
    if (!sug) return { ok: false as const, error: "Не найдено" };

    const { data: member } = await supabase
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", sug.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    const isEditor = member && ["owner", "admin", "editor"].includes(member.role);
    if (!isEditor && sug.author_id !== userId) {
      return { ok: false as const, error: "Нет прав" };
    }

    const { error } = await supabaseAdmin
      .from("suggested_posts")
      .delete()
      .eq("id", data.suggestion_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
