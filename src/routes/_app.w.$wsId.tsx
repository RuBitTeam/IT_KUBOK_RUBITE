import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, FolderTree, Layers, Users, CalendarDays, Share2, BarChart3, Pencil, Check, X, Lightbulb, ListChecks } from "lucide-react";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { updateWorkspaceServer } from "@/lib/social.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/w/$wsId")({
  component: WorkspaceShell,
});

const ROLE_LABEL: Record<string, string> = {
  owner: "Владелец",
  admin: "Администратор",
  editor: "Редактор",
  viewer: "Наблюдатель",
};

function WorkspaceShell() {
  const { wsId } = Route.useParams();
  return (
    <WorkspaceProvider workspaceId={wsId}>
      <Inner />
    </WorkspaceProvider>
  );
}

function Inner() {
  const { workspace, role, loading, canAdmin, refresh } = useWorkspace();
  const { wsId } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const updateWs = useServerFn(updateWorkspaceServer);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (workspace && !editing) {
      setName(workspace.name);
      setDescription(workspace.description ?? "");
    }
  }, [workspace, editing]);

  const onSave = async () => {
    if (!name.trim()) {
      toast.error("Название не может быть пустым");
      return;
    }
    setSaving(true);
    try {
      const r = await updateWs({
        data: {
          workspace_id: wsId,
          name: name.trim(),
          description: description.trim(),
        },
      });
      if (!r.ok) {
        toast.error(r.error ?? "Не удалось сохранить");
        return;
      }
      toast.success("Сохранено");
      setEditing(false);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { to: "/w/$wsId/posts", label: "Посты", icon: Layers, match: pathname.endsWith("/posts") },
    { to: "/w/$wsId/categories", label: "Рубрики", icon: FolderTree, match: pathname.includes("/categories") },
    { to: "/w/$wsId/calendar", label: "Медиаплан", icon: CalendarDays, match: pathname.endsWith("/calendar") },
    { to: "/w/$wsId/suggestions", label: "Предложка", icon: Lightbulb, match: pathname.endsWith("/suggestions") },
    { to: "/w/$wsId/tasks", label: "Задачи", icon: ListChecks, match: pathname.endsWith("/tasks") },
    { to: "/w/$wsId/social", label: "Соцсети", icon: Share2, match: pathname.endsWith("/social") },
    { to: "/w/$wsId/analytics", label: "Аналитика", icon: BarChart3, match: pathname.endsWith("/analytics") },
    { to: "/w/$wsId/members", label: "Участники", icon: Users, match: pathname.endsWith("/members") },
  ] as const;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <Link
        to="/workspaces"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> Все пространства
      </Link>

      {loading ? (
        <div className="text-muted-foreground">Загрузка…</div>
      ) : !workspace ? (
        <div className="text-muted-foreground">Пространство не найдено или нет доступа.</div>
      ) : (
        <>
          <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2 max-w-2xl">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Название пространства"
                    className="text-2xl font-bold h-12"
                    disabled={saving}
                  />
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Опишите пространство — этот контекст будет передаваться AI при генерации постов (тематика, аудитория, тон общения и т.п.)"
                    rows={4}
                    disabled={saving}
                    className="resize-y"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={onSave} disabled={saving}>
                      <Check className="h-4 w-4 mr-1" />
                      {saving ? "Сохранение…" : "Сохранить"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(false);
                        setName(workspace.name);
                        setDescription(workspace.description ?? "");
                      }}
                      disabled={saving}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">{workspace.name}</h1>
                    {canAdmin && (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
                        aria-label="Редактировать"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {workspace.description ? (
                    <p className="text-muted-foreground mt-1 max-w-3xl whitespace-pre-wrap">
                      {workspace.description}
                    </p>
                  ) : canAdmin ? (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="text-sm text-muted-foreground italic hover:text-foreground mt-1"
                    >
                      Добавьте описание — AI будет учитывать его при генерации постов
                    </button>
                  ) : null}
                </>
              )}
            </div>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted px-2 py-1 rounded-md w-fit whitespace-nowrap">
              Ваша роль: {ROLE_LABEL[role ?? ""] ?? role ?? "—"}
            </span>
          </header>

          <div className="border-b border-border flex flex-wrap gap-x-1 gap-y-0">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  params={{ wsId }}
                  className={cn(
                    "relative flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium transition-colors",
                    t.match
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {t.match && (
                    <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-primary rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>

          <Outlet />
        </>
      )}
    </div>
  );
}

