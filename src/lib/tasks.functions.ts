import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TablesUpdate } from "@/integrations/supabase/types";

type TaskUpdate = TablesUpdate<"post_tasks">;

export type TaskRole = "copywriter" | "designer" | "other";
export type TaskStatus = "open" | "done";

const TaskRoleEnum = z.enum(["copywriter", "designer", "other"]);

const CreateSchema = z.object({
  workspace_id: z.string().uuid(),
  post_id: z.string().uuid().nullable().optional(),
  assignee_id: z.string().uuid(),
  task_role: TaskRoleEnum.default("other"),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(""),
  deadline: z.string().datetime().nullable().optional(),
  watchers: z.array(z.string().uuid()).max(20).default([]),
});

const ListSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  post_id: z.string().uuid().optional(),
  assignee_id: z.string().uuid().optional(),
  status: z.enum(["open", "done", "all"]).default("all"),
  scope: z.enum(["mine", "all"]).default("all"),
});

const UpdateSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  deadline: z.string().datetime().nullable().optional(),
  task_role: TaskRoleEnum.optional(),
  assignee_id: z.string().uuid().optional(),
  watchers: z.array(z.string().uuid()).max(20).optional(),
});

const SetStatusSchema = z.object({
  task_id: z.string().uuid(),
  status: z.enum(["open", "done"]),
});

const DeleteSchema = z.object({ task_id: z.string().uuid() });

const TASK_ROLE_LABEL: Record<TaskRole, string> = {
  copywriter: "Копирайтер",
  designer: "Дизайнер",
  other: "Исполнитель",
};

async function fetchWorkspaceContext(workspaceId: string) {
  const [{ data: ws }, { data: members }] = await Promise.all([
    supabaseAdmin.from("workspaces").select("id, name, owner_id").eq("id", workspaceId).maybeSingle(),
    supabaseAdmin.from("workspace_users").select("user_id, role").eq("workspace_id", workspaceId),
  ]);
  return { ws, members: members ?? [] };
}

async function notifyEditors(opts: {
  workspaceId: string;
  excludeUserId?: string;
  authorId?: string | null;
  title: string;
  message: string;
  postId?: string | null;
}) {
  const { ws, members } = await fetchWorkspaceContext(opts.workspaceId);
  const wsLabel = ws?.name ? `[${ws.name}] ` : "";
  const editorIds = new Set<string>();
  for (const m of members) {
    if (["owner", "admin", "editor"].includes(m.role)) editorIds.add(m.user_id);
  }
  if (opts.authorId) editorIds.add(opts.authorId);
  if (opts.excludeUserId) editorIds.delete(opts.excludeUserId);
  if (editorIds.size === 0) return;
  const rows = Array.from(editorIds).map((uid) => ({
    user_id: uid,
    type: "task" as const,
    title: `${wsLabel}${opts.title}`,
    message: opts.message,
    post_id: opts.postId ?? null,
  }));
  await supabaseAdmin.from("notifications").insert(rows);
}

async function notifyUser(opts: {
  userId: string;
  workspaceId: string;
  title: string;
  message: string;
  postId?: string | null;
}) {
  const { ws } = await fetchWorkspaceContext(opts.workspaceId);
  const wsLabel = ws?.name ? `[${ws.name}] ` : "";
  await supabaseAdmin.from("notifications").insert({
    user_id: opts.userId,
    type: "task",
    title: `${wsLabel}${opts.title}`,
    message: opts.message,
    post_id: opts.postId ?? null,
  });
}

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Check membership
    const { data: membership } = await supabaseAdmin
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return { ok: false as const, error: "Нет доступа к пространству" };

    const isEditor = ["owner", "admin", "editor"].includes(membership.role);
    if (!isEditor && data.assignee_id !== userId) {
      return { ok: false as const, error: "Только редактор может назначать задачи другим" };
    }

    // Validate assignee membership
    const { data: assigneeMember } = await supabaseAdmin
      .from("workspace_users")
      .select("user_id")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", data.assignee_id)
      .maybeSingle();
    if (!assigneeMember) {
      return { ok: false as const, error: "Исполнитель не состоит в пространстве" };
    }

    // If post_id provided, ensure it belongs to workspace and use its publish_date for default deadline
    let deadline = data.deadline ?? null;
    if (data.post_id) {
      const { data: post } = await supabaseAdmin
        .from("posts")
        .select("id, workspace_id, publish_date")
        .eq("id", data.post_id)
        .maybeSingle();
      if (!post || post.workspace_id !== data.workspace_id) {
        return { ok: false as const, error: "Пост не найден в пространстве" };
      }
      if (!deadline && post.publish_date) {
        deadline = new Date(new Date(post.publish_date).getTime() - 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("post_tasks")
      .insert({
        workspace_id: data.workspace_id,
        post_id: data.post_id ?? null,
        assignee_id: data.assignee_id,
        created_by: userId,
        task_role: data.task_role,
        title: data.title,
        description: data.description ?? "",
        deadline,
      })
      .select("id")
      .single();
    if (error || !inserted) return { ok: false as const, error: error?.message ?? "Ошибка" };

    // Validate + insert watchers (must all be workspace members, exclude assignee)
    const watcherIds = Array.from(
      new Set((data.watchers ?? []).filter((id) => id !== data.assignee_id)),
    );
    if (watcherIds.length > 0) {
      const { data: watcherMembers } = await supabaseAdmin
        .from("workspace_users")
        .select("user_id")
        .eq("workspace_id", data.workspace_id)
        .in("user_id", watcherIds);
      const validIds = new Set((watcherMembers ?? []).map((m) => m.user_id));
      const rows = watcherIds
        .filter((id) => validIds.has(id))
        .map((uid) => ({ task_id: inserted.id, user_id: uid }));
      if (rows.length > 0) {
        await supabaseAdmin.from("post_task_watchers").insert(rows);
      }
    }

    const deadlineLabel = deadline
      ? new Date(deadline).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
      : "без срока";

    // Notify assignee on creation (if not self)
    if (data.assignee_id !== userId) {
      await notifyUser({
        userId: data.assignee_id,
        workspaceId: data.workspace_id,
        title: `Новая задача: ${TASK_ROLE_LABEL[data.task_role]}`,
        message: `«${data.title}» — дедлайн ${deadlineLabel}`,
        postId: data.post_id ?? null,
      });
    }

    // Notify watchers
    for (const wid of watcherIds) {
      if (wid === userId) continue;
      await notifyUser({
        userId: wid,
        workspaceId: data.workspace_id,
        title: `Вас добавили к задаче: ${TASK_ROLE_LABEL[data.task_role]}`,
        message: `«${data.title}» — дедлайн ${deadlineLabel}`,
        postId: data.post_id ?? null,
      });
    }

    return { ok: true as const, id: inserted.id };
  });

export const listTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    let query = supabaseAdmin
      .from("post_tasks")
      .select(
        "id, workspace_id, post_id, assignee_id, created_by, task_role, title, description, deadline, status, completed_at, completed_by, created_at, updated_at",
      )
      .order("status", { ascending: true })
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (data.workspace_id) query = query.eq("workspace_id", data.workspace_id);
    if (data.post_id) query = query.eq("post_id", data.post_id);
    if (data.assignee_id) query = query.eq("assignee_id", data.assignee_id);
    if (data.status !== "all") query = query.eq("status", data.status);

    // Restrict scope=all to editors. Non-editors only see tasks where they
    // are assignee, watcher, or creator (effectively scope=mine+watching).
    let allowedTaskIds: string[] | null = null;
    if (data.workspace_id && data.scope === "all") {
      const { data: membership } = await supabaseAdmin
        .from("workspace_users")
        .select("role")
        .eq("workspace_id", data.workspace_id)
        .eq("user_id", userId)
        .maybeSingle();
      const isEditor = membership && ["owner", "admin", "editor"].includes(membership.role);
      if (!isEditor) {
        // limit to tasks the user is involved in
        const { data: watching } = await supabaseAdmin
          .from("post_task_watchers")
          .select("task_id")
          .eq("user_id", userId);
        allowedTaskIds = (watching ?? []).map((w) => w.task_id);
        // assignee/creator handled via OR below
      }
    }

    if (data.scope === "mine") query = query.eq("assignee_id", userId);

    // Restrict to workspaces the user is a member of
    const { data: memberships } = await supabaseAdmin
      .from("workspace_users")
      .select("workspace_id")
      .eq("user_id", userId);
    const wsIds = (memberships ?? []).map((m) => m.workspace_id);
    if (wsIds.length === 0) return { ok: true as const, tasks: [], users: [], posts: [], workspaces: [] };
    query = query.in("workspace_id", wsIds);

    const { data: rows, error } = await query.limit(500);
    if (error) return { ok: false as const, error: error.message };

    let tasks = rows ?? [];

    // Apply non-editor scope=all OR-filter (assignee || creator || watcher)
    if (allowedTaskIds !== null) {
      const watchSet = new Set(allowedTaskIds);
      tasks = tasks.filter(
        (t) => t.assignee_id === userId || t.created_by === userId || watchSet.has(t.id),
      );
    }

    const taskIds = tasks.map((t) => t.id);
    const { data: watchersRows } = taskIds.length
      ? await supabaseAdmin
          .from("post_task_watchers")
          .select("task_id, user_id")
          .in("task_id", taskIds)
      : { data: [] as { task_id: string; user_id: string }[] };

    const watchersByTask: Record<string, string[]> = {};
    for (const w of watchersRows ?? []) {
      (watchersByTask[w.task_id] ||= []).push(w.user_id);
    }

    const userIds = Array.from(
      new Set([
        ...tasks.flatMap(
          (t) => [t.assignee_id, t.created_by, t.completed_by].filter(Boolean) as string[],
        ),
        ...(watchersRows ?? []).map((w) => w.user_id),
      ]),
    );
    const postIds = Array.from(new Set(tasks.map((t) => t.post_id).filter(Boolean) as string[]));
    const usedWsIds = Array.from(new Set(tasks.map((t) => t.workspace_id)));

    const [{ data: profiles }, { data: posts }, { data: workspaces }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, display_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
      postIds.length
        ? supabaseAdmin.from("posts").select("id, title").in("id", postIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      usedWsIds.length
        ? supabaseAdmin.from("workspaces").select("id, name").in("id", usedWsIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const tasksWithWatchers = tasks.map((t) => ({
      ...t,
      watchers: watchersByTask[t.id] ?? [],
    }));

    return {
      ok: true as const,
      tasks: tasksWithWatchers,
      users: profiles ?? [],
      posts: posts ?? [],
      workspaces: workspaces ?? [],
    };
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: task } = await supabaseAdmin
      .from("post_tasks")
      .select("id, workspace_id, assignee_id, created_by")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!task) return { ok: false as const, error: "Задача не найдена" };

    const { data: membership } = await supabaseAdmin
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", task.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    const isEditor = membership && ["owner", "admin", "editor"].includes(membership.role);
    const isAuthor = task.created_by === userId;
    const isAssignee = task.assignee_id === userId;
    if (!isEditor && !isAuthor && !isAssignee) {
      return { ok: false as const, error: "Нет прав на редактирование" };
    }

    const patch: TaskUpdate = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.deadline !== undefined) {
      patch.deadline = data.deadline;
      patch.reminder_24h_sent = false;
      patch.reminder_dayof_sent = false;
    }
    if (data.task_role !== undefined) patch.task_role = data.task_role;
    if (data.assignee_id !== undefined) {
      if (!isEditor) return { ok: false as const, error: "Сменить исполнителя может редактор" };
      patch.assignee_id = data.assignee_id;
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("post_tasks").update(patch).eq("id", data.task_id);
      if (error) return { ok: false as const, error: error.message };
    }

    // Watchers replace logic — only editor or task author may change list
    if (data.watchers !== undefined) {
      if (!isEditor && !isAuthor) {
        return { ok: false as const, error: "Менять соисполнителей может редактор или автор" };
      }
      const assigneeId = data.assignee_id ?? task.assignee_id;
      const wanted = Array.from(
        new Set(data.watchers.filter((id) => id !== assigneeId)),
      );
      // Validate membership
      const { data: validMembers } = wanted.length
        ? await supabaseAdmin
            .from("workspace_users")
            .select("user_id")
            .eq("workspace_id", task.workspace_id)
            .in("user_id", wanted)
        : { data: [] as { user_id: string }[] };
      const validSet = new Set((validMembers ?? []).map((m) => m.user_id));
      const finalIds = wanted.filter((id) => validSet.has(id));

      const { data: existing } = await supabaseAdmin
        .from("post_task_watchers")
        .select("user_id")
        .eq("task_id", data.task_id);
      const existingSet = new Set((existing ?? []).map((e) => e.user_id));
      const toAdd = finalIds.filter((id) => !existingSet.has(id));
      const toRemove = Array.from(existingSet).filter((id) => !finalIds.includes(id));

      if (toRemove.length > 0) {
        await supabaseAdmin
          .from("post_task_watchers")
          .delete()
          .eq("task_id", data.task_id)
          .in("user_id", toRemove);
      }
      if (toAdd.length > 0) {
        await supabaseAdmin
          .from("post_task_watchers")
          .insert(toAdd.map((uid) => ({ task_id: data.task_id, user_id: uid })));
        // Notify newly added watchers
        const { data: t } = await supabaseAdmin
          .from("post_tasks")
          .select("title, task_role, post_id")
          .eq("id", data.task_id)
          .maybeSingle();
        if (t) {
          for (const uid of toAdd) {
            if (uid === userId) continue;
            await notifyUser({
              userId: uid,
              workspaceId: task.workspace_id,
              title: `Вас добавили к задаче: ${TASK_ROLE_LABEL[t.task_role as TaskRole]}`,
              message: `«${t.title}»`,
              postId: t.post_id,
            });
          }
        }
      }
    }

    return { ok: true as const };
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SetStatusSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: task } = await supabaseAdmin
      .from("post_tasks")
      .select("id, workspace_id, post_id, assignee_id, created_by, task_role, title, status")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!task) return { ok: false as const, error: "Задача не найдена" };

    const { data: membership } = await supabaseAdmin
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", task.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    const isEditor = membership && ["owner", "admin", "editor"].includes(membership.role);
    const canChange = isEditor || task.assignee_id === userId || task.created_by === userId;
    if (!canChange) return { ok: false as const, error: "Нет прав" };

    const patch: TaskUpdate =
      data.status === "done"
        ? { status: "done", completed_at: new Date().toISOString(), completed_by: userId }
        : { status: "open", completed_at: null, completed_by: null };

    const { error } = await supabaseAdmin.from("post_tasks").update(patch).eq("id", data.task_id);
    if (error) return { ok: false as const, error: error.message };

    // Notify editors + post author when task is marked done
    if (data.status === "done" && task.status !== "done") {
      let postAuthorId: string | null = null;
      if (task.post_id) {
        const { data: post } = await supabaseAdmin
          .from("posts")
          .select("author_id")
          .eq("id", task.post_id)
          .maybeSingle();
        postAuthorId = post?.author_id ?? null;
      }
      const { data: doneByProfile } = await supabaseAdmin
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      const doneByName = doneByProfile?.display_name ?? "Исполнитель";
      const roleLabel = TASK_ROLE_LABEL[task.task_role as TaskRole];
      await notifyEditors({
        workspaceId: task.workspace_id,
        excludeUserId: userId,
        authorId: postAuthorId,
        title: `Задача выполнена: ${roleLabel}`,
        message: `«${task.title}» — отметил(а) ${doneByName}`,
        postId: task.post_id,
      });

      // Also notify watchers
      const { data: watchers } = await supabaseAdmin
        .from("post_task_watchers")
        .select("user_id")
        .eq("task_id", task.id);
      const wsLabel = (await fetchWorkspaceContext(task.workspace_id)).ws?.name
        ? `[${(await fetchWorkspaceContext(task.workspace_id)).ws?.name}] `
        : "";
      const watcherRows = (watchers ?? [])
        .map((w) => w.user_id)
        .filter((uid) => uid !== userId)
        .map((uid) => ({
          user_id: uid,
          type: "task" as const,
          title: `${wsLabel}Задача выполнена: ${roleLabel}`,
          message: `«${task.title}» — отметил(а) ${doneByName}`,
          post_id: task.post_id,
        }));
      if (watcherRows.length > 0) {
        await supabaseAdmin.from("notifications").insert(watcherRows);
      }
    }

    return { ok: true as const };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => DeleteSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: task } = await supabaseAdmin
      .from("post_tasks")
      .select("workspace_id, created_by")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!task) return { ok: false as const, error: "Задача не найдена" };

    const { data: membership } = await supabaseAdmin
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", task.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    const isEditor = membership && ["owner", "admin", "editor"].includes(membership.role);
    if (!isEditor && task.created_by !== userId) {
      return { ok: false as const, error: "Нет прав на удаление" };
    }

    const { error } = await supabaseAdmin.from("post_tasks").delete().eq("id", data.task_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// =============================================================
// Sync per-post role tasks (copywriter / designer) from post editor
// =============================================================

const SyncPostRolesSchema = z.object({
  post_id: z.string().uuid(),
  copywriter_id: z.string().uuid().nullable(),
  designer_id: z.string().uuid().nullable(),
});

async function ensureRoleTask(opts: {
  postId: string;
  workspaceId: string;
  publishDate: string | null;
  postTitle: string;
  role: "copywriter" | "designer";
  assigneeId: string | null;
  createdBy: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from("post_tasks")
    .select("id, assignee_id, status, deadline")
    .eq("post_id", opts.postId)
    .eq("task_role", opts.role)
    .maybeSingle();

  // No assignee selected → remove existing role-task (only if open)
  if (!opts.assigneeId) {
    if (existing && existing.status === "open") {
      await supabaseAdmin.from("post_tasks").delete().eq("id", existing.id);
    }
    return;
  }

  const deadline = opts.publishDate
    ? new Date(new Date(opts.publishDate).getTime() - 24 * 60 * 60 * 1000).toISOString()
    : null;

  const titleLabel = opts.role === "copywriter" ? "Написать текст" : "Подготовить креатив";

  if (!existing) {
    await supabaseAdmin.from("post_tasks").insert({
      workspace_id: opts.workspaceId,
      post_id: opts.postId,
      assignee_id: opts.assigneeId,
      created_by: opts.createdBy,
      task_role: opts.role,
      title: `${titleLabel}: ${opts.postTitle || "Без заголовка"}`,
      description: "",
      deadline,
    });
    // Notify assignee
    if (opts.assigneeId !== opts.createdBy) {
      await notifyUser({
        userId: opts.assigneeId,
        workspaceId: opts.workspaceId,
        title: `Новая задача: ${TASK_ROLE_LABEL[opts.role]}`,
        message: `«${opts.postTitle || "Без заголовка"}» — дедлайн ${
          deadline
            ? new Date(deadline).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
            : "без срока"
        }`,
        postId: opts.postId,
      });
    }
    return;
  }

  // Update assignee/deadline if changed (only when task is still open)
  if (existing.status !== "open") return;
  const patch: TaskUpdate = {};
  if (existing.assignee_id !== opts.assigneeId) patch.assignee_id = opts.assigneeId;
  if (existing.deadline !== deadline) {
    patch.deadline = deadline;
    patch.reminder_24h_sent = false;
    patch.reminder_dayof_sent = false;
  }
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin.from("post_tasks").update(patch).eq("id", existing.id);
    if (patch.assignee_id && patch.assignee_id !== opts.createdBy) {
      await notifyUser({
        userId: patch.assignee_id,
        workspaceId: opts.workspaceId,
        title: `Назначена задача: ${TASK_ROLE_LABEL[opts.role]}`,
        message: `«${opts.postTitle || "Без заголовка"}»`,
        postId: opts.postId,
      });
    }
  }
}

export const syncPostRoleTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SyncPostRolesSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: post } = await supabaseAdmin
      .from("posts")
      .select("id, workspace_id, title, publish_date")
      .eq("id", data.post_id)
      .maybeSingle();
    if (!post) return { ok: false as const, error: "Пост не найден" };

    const { data: membership } = await supabaseAdmin
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", post.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return { ok: false as const, error: "Нет доступа к пространству" };
    const isEditor = ["owner", "admin", "editor"].includes(membership.role);
    if (!isEditor) {
      return { ok: false as const, error: "Назначать копирайтера/дизайнера может редактор" };
    }

    // Validate that selected users are workspace members
    const ids = [data.copywriter_id, data.designer_id].filter((v): v is string => !!v);
    if (ids.length > 0) {
      const { data: members } = await supabaseAdmin
        .from("workspace_users")
        .select("user_id")
        .eq("workspace_id", post.workspace_id)
        .in("user_id", ids);
      const valid = new Set((members ?? []).map((m) => m.user_id));
      if (data.copywriter_id && !valid.has(data.copywriter_id)) {
        return { ok: false as const, error: "Копирайтер не состоит в пространстве" };
      }
      if (data.designer_id && !valid.has(data.designer_id)) {
        return { ok: false as const, error: "Дизайнер не состоит в пространстве" };
      }
    }

    await ensureRoleTask({
      postId: post.id,
      workspaceId: post.workspace_id,
      publishDate: post.publish_date,
      postTitle: post.title,
      role: "copywriter",
      assigneeId: data.copywriter_id,
      createdBy: userId,
    });
    await ensureRoleTask({
      postId: post.id,
      workspaceId: post.workspace_id,
      publishDate: post.publish_date,
      postTitle: post.title,
      role: "designer",
      assigneeId: data.designer_id,
      createdBy: userId,
    });

    return { ok: true as const };
  });

export const getPostRoleTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ post_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: post } = await supabaseAdmin
      .from("posts")
      .select("workspace_id")
      .eq("id", data.post_id)
      .maybeSingle();
    if (!post) return { ok: false as const, error: "Пост не найден" };
    const { data: membership } = await supabaseAdmin
      .from("workspace_users")
      .select("role")
      .eq("workspace_id", post.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return { ok: false as const, error: "Нет доступа" };

    const { data: rows } = await supabaseAdmin
      .from("post_tasks")
      .select("task_role, assignee_id, status")
      .eq("post_id", data.post_id)
      .in("task_role", ["copywriter", "designer"]);
    let copywriter_id: string | null = null;
    let designer_id: string | null = null;
    for (const r of rows ?? []) {
      if (r.status !== "open") continue;
      if (r.task_role === "copywriter") copywriter_id = r.assignee_id;
      if (r.task_role === "designer") designer_id = r.assignee_id;
    }
    return { ok: true as const, copywriter_id, designer_id };
  });
