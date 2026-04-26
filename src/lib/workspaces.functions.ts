import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
});

export const createWorkspaceServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateWorkspaceSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const ownerId = context.userId;

    const { data: workspace, error } = await supabaseAdmin
      .from("workspaces")
      .insert({
        name: data.name,
        description: data.description ?? "",
        owner_id: ownerId,
      })
      .select("*")
      .single();

    if (error || !workspace) {
      return {
        ok: false as const,
        error: error?.message ?? "Не удалось создать пространство",
      };
    }

    const { error: memberError } = await supabaseAdmin.from("workspace_users").upsert(
      {
        workspace_id: workspace.id,
        user_id: ownerId,
        role: "owner",
      },
      { onConflict: "workspace_id,user_id" },
    );

    if (memberError) {
      return { ok: false as const, error: memberError.message };
    }

    return { ok: true as const, workspace };
  });
