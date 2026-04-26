import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Calendar, FileText, AlertTriangle, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { listTasks, setTaskStatus, type TaskRole } from "@/lib/tasks.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tasks")({
  component: MyTasksPage,
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
  watchers: string[];
}

function MyTasksPage() {
  const { user } = useAuth();
  const listTasksFn = useServerFn(listTasks);
  const setStatusFn = useServerFn(setTaskStatus);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [posts, setPosts] = useState<{ id: string; title: string }[]>([]);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await listTasksFn({ data: { status: "all", scope: "mine" } });
      if (r.ok) {
        setTasks(r.tasks as TaskRow[]);
        setPosts(r.posts);
        setWorkspaces(r.workspaces);
      } else {
        toast.error(r.error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  const counts = useMemo(
    () => ({
      open: tasks.filter((t) => t.status === "open").length,
      done: tasks.filter((t) => t.status === "done").length,
      all: tasks.length,
    }),
    [tasks],
  );

  const handleToggle = async (task: TaskRow) => {
    const next = task.status === "done" ? "open" : "done";
    const r = await setStatusFn({ data: { task_id: task.id, status: next } });
    if (!r.ok) {
      toast.error(r.error);
    } else {
      toast.success(next === "done" ? "Задача выполнена" : "Возвращена в работу");
      refresh();
    }
  };

  const postById = useMemo(() => Object.fromEntries(posts.map((p) => [p.id, p.title])), [posts]);
  const wsById = useMemo(
    () => Object.fromEntries(workspaces.map((w) => [w.id, w.name])),
    [workspaces],
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Мои задачи</h1>
        <p className="text-muted-foreground mt-1">
          Все задачи, назначенные вам или созданные вами, во всех пространствах.
        </p>
      </header>

      <div className="flex gap-2 border-b border-border pb-2">
        {(["open", "done", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {s === "open" ? "Открытые" : s === "done" ? "Выполненные" : "Все"}{" "}
            <span className="opacity-70">({counts[s]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Задач нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const overdue =
              t.status === "open" && t.deadline && new Date(t.deadline) < new Date();
            return (
              <article
                key={t.id}
                className={cn(
                  "bg-card border border-border rounded-xl p-4 flex gap-4 items-start transition-colors",
                  t.status === "done" && "opacity-60",
                )}
              >
                <button
                  onClick={() => handleToggle(t)}
                  className="mt-0.5 shrink-0"
                  aria-label="Переключить статус"
                >
                  {t.status === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full border",
                        ROLE_COLORS[t.task_role],
                      )}
                    >
                      {ROLE_LABEL[t.task_role]}
                    </span>
                    <h3
                      className={cn(
                        "font-medium",
                        t.status === "done" && "line-through text-muted-foreground",
                      )}
                    >
                      {t.title}
                    </h3>
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                      {t.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {wsById[t.workspace_id] ?? "Пространство"}
                    </span>
                    {t.deadline && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          overdue && "text-destructive font-medium",
                        )}
                      >
                        {overdue ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <Calendar className="h-3 w-3" />
                        )}
                        {new Date(t.deadline).toLocaleString("ru-RU", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    )}
                    {t.post_id && postById[t.post_id] && (
                      <Link
                        to="/posts/$id"
                        params={{ id: t.post_id }}
                        className="inline-flex items-center gap-1 hover:text-primary"
                      >
                        <FileText className="h-3 w-3" />
                        {postById[t.post_id]}
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

