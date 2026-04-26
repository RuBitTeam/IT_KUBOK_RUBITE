import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Plus, Briefcase, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { listMyWorkspaces, type WorkspaceWithRole } from "@/lib/workspaces-api";
import { createWorkspaceServer } from "@/lib/workspaces.functions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/workspaces")({
  component: WorkspacesPage,
});

const ROLE_LABEL: Record<string, string> = {
  owner: "Владелец",
  admin: "Администратор",
  editor: "Редактор",
  viewer: "Наблюдатель",
};

function WorkspacesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const createWorkspace = useServerFn(createWorkspaceServer);
  const [items, setItems] = useState<WorkspaceWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await listMyWorkspaces(user.id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCreate = async () => {
    if (!user || !name.trim()) return;
    setCreating(true);
    try {
      const result = await createWorkspace({ data: { name: name.trim(), description: description.trim() } });
      if (!result.ok) throw new Error(result.error);
      toast.success("Пространство создано");
      setOpen(false);
      setName("");
      setDescription("");
      navigate({ to: "/w/$wsId", params: { wsId: result.workspace.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Рабочие пространства</h1>
          <p className="text-muted-foreground mt-1">
            Выберите пространство или создайте новое.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-[var(--shadow-elegant)]">
              <Plus className="h-4 w-4 mr-1" />
              Новое пространство
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новое рабочее пространство</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-sm font-medium">Название</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например, Команда маркетинга"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium">Описание</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Опционально"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || creating}>
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-lg font-medium">Пока нет пространств</p>
          <p className="text-sm text-muted-foreground mt-1">
            Создайте первое пространство, чтобы начать работу с контентом.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((ws) => (
            <button
              key={ws.id}
              onClick={() => navigate({ to: "/w/$wsId", params: { wsId: ws.id } })}
              className="group text-left bg-card border border-border rounded-2xl p-5 hover:border-primary/50 hover:shadow-[var(--shadow-elegant)] transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground grid place-items-center font-bold">
                  {ws.name.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted px-2 py-1 rounded-md">
                  {ROLE_LABEL[ws.role] ?? ws.role}
                </span>
              </div>
              <div className="font-semibold line-clamp-1">{ws.name}</div>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2 min-h-[2.5rem]">
                {ws.description || "—"}
              </p>
              <div className="mt-4 flex items-center text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Открыть <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
