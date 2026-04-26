import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Plus, Trash2, Calendar, User as UserIcon, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { listTasks, createTask, setTaskStatus, deleteTask, updateTask, type TaskRole } from "@/lib/tasks.functions";
import { listWorkspaceMembers } from "@/lib/workspace-members.functions";
import { listWorkspacePosts, type WorkspacePost } from "@/lib/workspaces-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/w/$wsId/tasks")({
  component: TasksPage,
});

const ROLE_LABEL: Record<TaskRole, string> = {
  copywriter: "Копирайтер",
  designer: "Дизайнер",
  other: "Исполнитель",
};

const ROLE_COLORS: Record<TaskRole, string> = {
  copywriter: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  designer: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  other: "bg-muted text-muted-foreground border-border",
};

interface TaskRow {
  id: string;
  workspace_id: string;
  post_id: string | null;
  assignee_id: string;
  created_by: string;
  task_role: TaskRole;
  title: string;
  description: string;
  deadline: string | null;
  status: "open" | "done";
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  watchers: string[];
}

interface Member {
  user_id: string;
  display_name: string | null;
  email: string;
  role: string;
}

function TasksPage() {
  const { wsId } = Route.useParams();
  const { user } = useAuth();
  const { role } = useWorkspace();
  const isEditor = role === "owner" || role === "admin" || role === "editor";

  const listTasksFn = useServerFn(listTasks);
  const createTaskFn = useServerFn(createTask);
  const setStatusFn = useServerFn(setTaskStatus);
  const deleteTaskFn = useServerFn(deleteTask);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [posts, setPosts] = useState<{ id: string; title: string }[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");
  const [createOpen, setCreateOpen] = useState(false);

  // Force "mine" tab for non-editors and prevent showing the "Все задачи" toggle
  useEffect(() => {
    if (!isEditor && tab === "all") setTab("mine");
  }, [isEditor, tab]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listTasksFn({
        data: { workspace_id: wsId, status: "all", scope: "all" },
      });
      if (r.ok) {
        setTasks(r.tasks as TaskRow[]);
        const map: Record<string, string> = {};
        for (const u of r.users) map[u.id] = u.display_name ?? "Без имени";
        setProfileMap(map);
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    listWorkspaceMembers({ data: { workspaceId: wsId } })
      .then((r) => setMembers(r.members as Member[]))
      .catch(() => setMembers([]));
    listWorkspacePosts(wsId, { includeDrafts: true })
      .then((ps) => setPosts((ps as WorkspacePost[]).map((p) => ({ id: p.id, title: p.title }))))
      .catch(() => setPosts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  const visible = useMemo(() => {
    let res = tasks;
    if (tab === "mine") {
      res = res.filter(
        (t) => t.assignee_id === user?.id || t.watchers.includes(user?.id ?? ""),
      );
    }
    if (statusFilter !== "all") res = res.filter((t) => t.status === statusFilter);
    return res;
  }, [tasks, tab, statusFilter, user?.id]);

  const onToggle = async (t: TaskRow) => {
    const next = t.status === "done" ? "open" : "done";
    const r = await setStatusFn({ data: { task_id: t.id, status: next } });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(next === "done" ? "Задача выполнена" : "Возвращена в работу");
    refresh();
  };

  const onDelete = async (t: TaskRow) => {
    if (!confirm(`Удалить задачу «${t.title}»?`)) return;
    const r = await deleteTaskFn({ data: { task_id: t.id } });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Удалено");
    refresh();
  };

  const postTitleMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of posts) m[p.id] = p.title;
    return m;
  }, [posts]);

  const counts = useMemo(() => {
    const mine = tasks.filter(
      (t) => t.assignee_id === user?.id || t.watchers.includes(user?.id ?? ""),
    );
    return {
      mineOpen: mine.filter((t) => t.status === "open").length,
      mineOverdue: mine.filter(
        (t) => t.status === "open" && t.deadline && new Date(t.deadline) < new Date(),
      ).length,
      allOpen: tasks.filter((t) => t.status === "open").length,
    };
  }, [tasks, user?.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Задачи</h2>
          <p className="text-sm text-muted-foreground">
            Назначайте копирайтеров и дизайнеров, отслеживайте дедлайны.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Новая задача
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="inline-flex rounded-xl border border-border p-1 bg-card">
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg transition-colors",
              tab === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Мои задачи
            {counts.mineOpen > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background/20 px-1.5 text-[11px] font-bold">
                {counts.mineOpen}
              </span>
            )}
          </button>
          {isEditor && (
            <button
              type="button"
              onClick={() => setTab("all")}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                tab === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Все задачи
              {counts.allOpen > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background/20 px-1.5 text-[11px] font-bold">
                  {counts.allOpen}
                </span>
              )}
            </button>
          )}
        </div>

        <div className="inline-flex rounded-xl border border-border p-1 bg-card">
          {(["open", "done", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors capitalize",
                statusFilter === s ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "open" ? "Открытые" : s === "done" ? "Выполненные" : "Все"}
            </button>
          ))}
        </div>

        {counts.mineOverdue > 0 && tab === "mine" && (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4" />
            Просрочено: {counts.mineOverdue}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-muted-foreground">Здесь пока пусто. Создайте первую задачу.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => {
            const overdue =
              t.status === "open" && t.deadline && new Date(t.deadline) < new Date();
            const deadlineSoon =
              t.status === "open" &&
              t.deadline &&
              new Date(t.deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000 &&
              new Date(t.deadline) >= new Date();
            const canDelete = isEditor || t.created_by === user?.id;
            return (
              <li
                key={t.id}
                className={cn(
                  "group flex items-start gap-3 p-4 rounded-2xl border bg-card transition-colors hover:bg-muted/30",
                  t.status === "done" && "opacity-60",
                  overdue && "border-destructive/40",
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggle(t)}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  aria-label="Выполнить"
                >
                  {t.status === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium uppercase tracking-wide",
                        ROLE_COLORS[t.task_role],
                      )}
                    >
                      {ROLE_LABEL[t.task_role]}
                    </span>
                    <span
                      className={cn(
                        "font-medium truncate",
                        t.status === "done" && "line-through text-muted-foreground",
                      )}
                    >
                      {t.title}
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                      {t.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <UserIcon className="h-3.5 w-3.5" />
                      {profileMap[t.assignee_id] ?? "—"}
                      {t.assignee_id === user?.id && (
                        <span className="text-primary font-medium">(вы)</span>
                      )}
                    </span>
                    {t.watchers.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        +{" "}
                        {t.watchers
                          .map((uid) => profileMap[uid] ?? "—")
                          .join(", ")}
                      </span>
                    )}
                    {t.deadline && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          overdue && "text-destructive font-medium",
                          deadlineSoon && "text-amber-600 dark:text-amber-400 font-medium",
                        )}
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(t.deadline).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {overdue && " · просрочено"}
                      </span>
                    )}
                    {t.post_id && postTitleMap[t.post_id] && (
                      <Link
                        to="/posts/$id"
                        params={{ id: t.post_id }}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {postTitleMap[t.post_id]}
                      </Link>
                    )}
                  </div>
                </div>

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(t)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={wsId}
        members={members}
        posts={posts}
        isEditor={isEditor}
        currentUserId={user?.id}
        onCreated={refresh}
        createFn={createTaskFn}
      />
    </div>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  workspaceId,
  members,
  posts,
  isEditor,
  currentUserId,
  onCreated,
  createFn,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  members: Member[];
  posts: { id: string; title: string }[];
  isEditor: boolean;
  currentUserId: string | undefined;
  onCreated: () => void;
  createFn: ReturnType<typeof useServerFn<typeof createTask>>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskRole, setTaskRole] = useState<TaskRole>("other");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [postId, setPostId] = useState<string>("");
  const [deadline, setDeadline] = useState<string>("");
  const [watchers, setWatchers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setTaskRole("other");
      setAssigneeId(currentUserId ?? "");
      setPostId("");
      setDeadline("");
      setWatchers([]);
    }
  }, [open, currentUserId]);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Введите название задачи");
      return;
    }
    if (!assigneeId) {
      toast.error("Выберите исполнителя");
      return;
    }
    setBusy(true);
    try {
      const r = await createFn({
        data: {
          workspace_id: workspaceId,
          post_id: postId || null,
          assignee_id: assigneeId,
          task_role: taskRole,
          title: title.trim(),
          description,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          watchers: watchers.filter((id) => id !== assigneeId),
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Задача создана");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleWatcher = (id: string) => {
    setWatchers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Название</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например, написать текст для анонса"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Роль</Label>
              <select
                value={taskRole}
                onChange={(e) => setTaskRole(e.target.value as TaskRole)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="copywriter">Копирайтер</option>
                <option value="designer">Дизайнер</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Исполнитель</Label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={!isEditor && false /* allow self even for non-editors */}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Выберите…</option>
                {members.map((m) => {
                  const disabled = !isEditor && m.user_id !== currentUserId;
                  return (
                    <option key={m.user_id} value={m.user_id} disabled={disabled}>
                      {(m.display_name ?? m.email) || m.user_id.slice(0, 8)}
                      {m.user_id === currentUserId ? " (вы)" : ""}
                      {disabled ? " — только редактор" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Связанный пост (опционально)</Label>
            <select
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">— без поста —</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || "Без заголовка"}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Дедлайн</Label>
            <Input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Если связан с постом и не указан — будет автоматически за 1 день до публикации.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Соисполнители (необязательно)
            </Label>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-input p-2 space-y-1">
              {members
                .filter((m) => m.user_id !== assigneeId)
                .map((m) => {
                  const checked = watchers.includes(m.user_id);
                  return (
                    <label
                      key={m.user_id}
                      className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWatcher(m.user_id)}
                      />
                      <span>
                        {(m.display_name ?? m.email) || m.user_id.slice(0, 8)}
                        {m.user_id === currentUserId ? " (вы)" : ""}
                      </span>
                    </label>
                  );
                })}
              {members.filter((m) => m.user_id !== assigneeId).length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1">Нет других участников</p>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Получат уведомление при назначении и при выполнении задачи.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Описание</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Детали, ссылки, требования…"
              maxLength={2000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Создание…" : "Создать задачу"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
