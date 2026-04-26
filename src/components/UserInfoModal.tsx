import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Calendar, Building2, UserPlus, Check, Search, Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listInvitableWorkspaces, inviteUserToWorkspace } from "@/lib/admin-users.functions";

export interface UserInfo {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  position?: string | null;
  created_at: string;
  roles: string[];
}

interface Props {
  user: UserInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface InvitableWorkspace {
  id: string;
  name: string;
  description: string;
  my_role: string;
}

export function UserInfoModal({ user, open, onOpenChange }: Props) {
  const listWs = useServerFn(listInvitableWorkspaces);
  const invite = useServerFn(inviteUserToWorkspace);
  const [workspaces, setWorkspaces] = useState<InvitableWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [wsSearch, setWsSearch] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);

  const filteredWorkspaces = useMemo(() => {
    const q = wsSearch.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description ?? "").toLowerCase().includes(q),
    );
  }, [workspaces, wsSearch]);

  useEffect(() => {
    if (!open || !user) return;
    setAdded(new Set());
    setWsSearch("");
    setLoading(true);
    listWs({ data: { targetUserId: user.id } })
      .then((r) => setWorkspaces(r.workspaces))
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, user, listWs]);

  const handleInvite = async (ws: InvitableWorkspace) => {
    if (!user) return;
    setBusy(ws.id);
    try {
      await invite({ data: { workspaceId: ws.id, userId: user.id, role: "editor" } });
      setAdded((prev) => new Set(prev).add(ws.id));
      toast.success(`Добавлен в «${ws.name}»`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!user) return null;
  const initials = (user.display_name || user.email || "U").slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Профиль пользователя</DialogTitle>
          <DialogDescription>Информация и приглашение в пространства</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => user.avatar_url && setPhotoOpen(true)}
            disabled={!user.avatar_url}
            className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground grid place-items-center text-lg font-bold overflow-hidden shrink-0 enabled:cursor-zoom-in enabled:hover:ring-2 enabled:hover:ring-primary/40 transition"
            aria-label={user.avatar_url ? "Открыть фото" : "Нет фото"}
          >
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </button>
          <div className="min-w-0">
            <div className="font-semibold text-lg truncate">{user.display_name ?? "—"}</div>
            {user.position && (
              <div className="text-sm text-muted-foreground flex items-center gap-1.5 truncate mt-0.5">
                <Briefcase className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{user.position}</span>
              </div>
            )}
            <div className="text-sm text-muted-foreground flex items-center gap-1.5 truncate mt-0.5">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{user.email}</span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Calendar className="h-3 w-3" />
              Зарегистрирован {new Date(user.created_at).toLocaleDateString("ru-RU")}
            </div>
          </div>
        </div>

        {user.roles.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <Badge key={r} variant="secondary">
                {r}
              </Badge>
            ))}
          </div>
        )}

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4" />
            Добавить в пространство
          </h3>
          {loading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Загрузка…</div>
          ) : workspaces.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Нет подходящих пространств. Вы должны быть редактором или выше, и пользователь
              ещё не должен в нём состоять.
            </div>
          ) : (
            <>
              <div className="relative mb-3">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={wsSearch}
                  onChange={(e) => setWsSearch(e.target.value)}
                  placeholder="Поиск по названию пространства…"
                  className="pl-9"
                />
              </div>
              {filteredWorkspaces.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Ничего не найдено
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {filteredWorkspaces.map((ws) => {
                    const isAdded = added.has(ws.id);
                    return (
                      <div
                        key={ws.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{ws.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Ваша роль: {ws.my_role}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={isAdded ? "secondary" : "default"}
                          disabled={isAdded || busy === ws.id}
                          onClick={() => handleInvite(ws)}
                          className="gap-1 shrink-0"
                        >
                          {isAdded ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Добавлен
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3.5 w-3.5" />
                              Добавить
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>

      {user.avatar_url && (
        <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
          <DialogContent className="max-w-3xl p-2 bg-background">
            <DialogTitle className="sr-only">Фото пользователя</DialogTitle>
            <DialogDescription className="sr-only">
              {user.display_name ?? user.email}
            </DialogDescription>
            <img
              src={user.avatar_url}
              alt={user.display_name ?? user.email}
              className="w-full h-auto max-h-[80vh] object-contain rounded-md"
            />
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
