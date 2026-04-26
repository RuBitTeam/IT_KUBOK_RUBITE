import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishToSocial } from "@/lib/social-publish.server";

const MAX_RETRIES = 3;

// Запускается каждой минутой через pg_cron.
// Берёт scheduled-посты, у которых наступило время; если есть social_account_id —
// реально публикует в соцсеть (VK/Telegram), иначе помечает как published.
async function runScheduler() {
  const now = new Date().toISOString();
  const { data: due, error } = await supabaseAdmin
    .from("posts")
    .select(
      "id, title, content, author_id, media_url, social_account_id, retries, platform, external_post_ids, error_log, workspace_id",
    )
    .eq("status", "scheduled")
    .lte("publish_date", now)
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) return Response.json({ published: 0, failed: 0 });

  // Resolve workspace names for nicer notification labels
  const wsIds = Array.from(new Set(due.map((p) => p.workspace_id).filter(Boolean)));
  const wsNameMap: Record<string, string> = {};
  if (wsIds.length > 0) {
    const { data: wss } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .in("id", wsIds);
    (wss ?? []).forEach((w) => {
      wsNameMap[w.id] = w.name;
    });
  }
  const wsLabel = (id: string | null) => (id && wsNameMap[id] ? `[${wsNameMap[id]}] ` : "");

  let published = 0;
  let failed = 0;
  const notifs: Array<{
    user_id: string;
    type: "published" | "failed";
    title: string;
    message: string;
    post_id: string;
  }> = [];

  for (const post of due) {
    // Detect multi-target broadcast scheduled via publishPostToAll
    const targetsMatch =
      typeof post.error_log === "string" && post.error_log.startsWith("scheduled_targets:")
        ? post.error_log.slice("scheduled_targets:".length).split(",").filter(Boolean)
        : null;

    if (targetsMatch && targetsMatch.length > 0) {
      const { data: accounts } = await supabaseAdmin
        .from("social_accounts")
        .select("id, platform, display_name, target_chat, encrypted_token, status")
        .in("id", targetsMatch)
        .neq("status", "disconnected");

      const _title = (post.title ?? "").trim();
      const _body = (post.content ?? "").trim();
      const text = _title ? `${_title}\n\n${_body}`.trim() : _body;
      const externalMap: Record<string, string> = {
        ...((post.external_post_ids ?? {}) as Record<string, string>),
      };
      let okCount = 0;
      let failCount = 0;
      const errors: string[] = [];
      let firstVkId: string | null = null;

      for (const acc of accounts ?? []) {
        const r = await publishToSocial({
          platform: acc.platform as "vk" | "telegram",
          encryptedToken: acc.encrypted_token,
          targetChat: acc.target_chat,
          text,
          mediaUrl: post.media_url,
        });
        if (r.ok) {
          okCount++;
          if (r.externalId) externalMap[acc.id] = r.externalId;
          if (r.ok && acc.platform === "vk" && r.externalId && !firstVkId) firstVkId = r.externalId;
        } else {
          failCount++;
          errors.push(`${acc.display_name}: ${r.error ?? "ошибка"}`);
        }
      }

      const finalLog = failCount > 0 ? errors.join("; ") : firstVkId ? `vk_post_id:${firstVkId}` : null;
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("posts")
        .update({
          status: okCount > 0 ? "published" : "failed",
          publish_date: okCount > 0 ? nowIso : undefined,
          published_at: okCount > 0 ? nowIso : null,
          error_log: finalLog,
          external_post_ids: externalMap,
        })
        .eq("id", post.id);

      const accNames = (accounts ?? []).map((a) => a.display_name).filter(Boolean);
      const commLabel =
        accNames.length === 1 ? accNames[0] : `${accNames.length || targetsMatch.length} сообществ`;
      notifs.push({
        user_id: post.author_id,
        type: failCount === 0 ? "published" : "failed",
        title: `${wsLabel(post.workspace_id)}${failCount === 0 ? "Пост опубликован" : "Публикация с ошибками"}`,
        message: `«${post.title}» — ${commLabel}, успех: ${okCount}, ошибки: ${failCount}`,
        post_id: post.id,
      });
      if (okCount > 0) published++;
      if (failCount > 0 && okCount === 0) failed++;
      continue;
    }

    let result: { ok: boolean; error?: string; externalId?: string } = { ok: true };
    let singleAccName: string | null = null;

    if (post.social_account_id) {
      const { data: acc } = await supabaseAdmin
        .from("social_accounts")
        .select("platform, target_chat, encrypted_token, status, display_name")
        .eq("id", post.social_account_id)
        .maybeSingle();
      if (!acc || acc.status === "disconnected") {
        result = { ok: false, error: "Соцсеть не подключена" };
      } else {
        singleAccName = acc.display_name;
        const t2 = (post.title ?? "").trim();
        const b2 = (post.content ?? "").trim();
        result = await publishToSocial({
          platform: acc.platform as "vk" | "telegram",
          encryptedToken: acc.encrypted_token,
          targetChat: acc.target_chat,
          text: t2 ? `${t2}\n\n${b2}`.trim() : b2,
          mediaUrl: post.media_url,
        });
      }
    }

    if (result.ok) {
      const marker =
        result.externalId && post.social_account_id
          ? `vk_post_id:${result.externalId}`
          : null;
      const externalMap = {
        ...((post.external_post_ids ?? {}) as Record<string, string>),
      };
      if (post.social_account_id && result.externalId) {
        externalMap[post.social_account_id] = result.externalId;
      }
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("posts")
        .update({
          status: "published",
          publish_date: nowIso,
          published_at: nowIso,
          error_log: marker,
          external_post_ids: externalMap,
        })
        .eq("id", post.id);
      notifs.push({
        user_id: post.author_id,
        type: "published",
        title: `${wsLabel(post.workspace_id)}Пост опубликован`,
        message: singleAccName
          ? `«${post.title}» — ${singleAccName}`
          : `«${post.title}» опубликован автоматически`,
        post_id: post.id,
      });
      published++;
    } else {
      const retries = (post.retries ?? 0) + 1;
      const willFail = retries >= MAX_RETRIES;
      await supabaseAdmin
        .from("posts")
        .update({
          status: willFail ? "failed" : "scheduled",
          retries,
          error_log: result.error ?? "Unknown error",
          // если ещё ретраим — переносим публикацию на +5 минут
          publish_date: willFail
            ? undefined
            : new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        })
        .eq("id", post.id);
      if (willFail) {
        notifs.push({
          user_id: post.author_id,
          type: "failed",
          title: `${wsLabel(post.workspace_id)}Ошибка публикации`,
          message: `«${post.title}»: ${result.error ?? "не удалось опубликовать"}`,
          post_id: post.id,
        });
        failed++;
      }
    }
  }

  if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);

  return Response.json({ published, failed, processed: due.length });
}

export const Route = createFileRoute("/api/public/scheduler/run")({
  server: {
    handlers: {
      GET: () => runScheduler(),
      POST: () => runScheduler(),
    },
  },
});
