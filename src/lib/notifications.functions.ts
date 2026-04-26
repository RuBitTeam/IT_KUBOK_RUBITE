import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SendSchema = z.object({
  workspace_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000),
  // если пусто — отправить всем участникам пространства
  recipient_ids: z.array(z.string().uuid()).optional(),
});

export const sendWorkspaceNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SendSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Только владелец пространства
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("owner_id, name")
      .eq("id", data.workspace_id)
      .maybeSingle();
    if (!ws) return { ok: false as const, error: "Пространство не найдено" };
    if (ws.owner_id !== userId) {
      return { ok: false as const, error: "Только владелец пространства может отправлять уведомления" };
    }

    // Список получателей
    const { data: members } = await supabaseAdmin
      .from("workspace_users")
      .select("user_id")
      .eq("workspace_id", data.workspace_id);
    const allMemberIds = (members ?? []).map((m) => m.user_id);

    let recipients = allMemberIds;
    if (data.recipient_ids && data.recipient_ids.length > 0) {
      const set = new Set(allMemberIds);
      recipients = data.recipient_ids.filter((id) => set.has(id));
    }
    if (recipients.length === 0) {
      return { ok: false as const, error: "Нет получателей" };
    }

    // Получаем имя отправителя
    const { data: senderProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    const senderName = senderProfile?.display_name ?? "Владелец";
    const wsName = ws.name ?? "Пространство";

    const finalMessage = `${data.message}\n\n— ${senderName} (${wsName})`;

    const rows = recipients.map((uid) => ({
      user_id: uid,
      type: "published" as const,
      title: data.title,
      message: finalMessage,
      post_id: null,
    }));

    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    if (error) return { ok: false as const, error: error.message };

    return { ok: true as const, sent: recipients.length };
  });
