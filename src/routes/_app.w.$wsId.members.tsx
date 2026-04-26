import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, Shield, Pencil, Eye, Trash2, UserPlus, Send, Search, Link2, Copy, X } from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import { useAuth } from "@/lib/auth-context";
import {
  listWorkspaceMembers,
  addWorkspaceMember,
  updateMemberRole,
  removeMember,
} from "@/lib/workspace-members.functions";
import {
  createWorkspaceInvite,
  listWorkspaceInvites,
  revokeWorkspaceInvite,
} from "@/lib/workspace-invites.functions";
import { sendWorkspaceNotification } from "@/lib/notifications.functions";
import { useServerFn } from "@tanstack/react-start";
import { UserInfoModal, type UserInfo } from "@/components/UserInfoModal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/w/$wsId/members")({
  component: MembersPage,
});

type Role = "owner" | "admin" | "editor" | "viewer";
type Member = {
  id: string;
  user_id: string;
  role: Role;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  position: string | null;
  created_at: string;
};

const ROLE_LABEL: Record<Role, string> = {
  owner: "Владелец",
  admin: "Админ",
  editor: "Редактор",
  viewer: "Пользователь",
};

const ROLE_HINT: Record<Role, string> = {
  owner: "Полный контроль, управление участниками",
  admin: "Может редактировать и публиковать всё",
  editor: "Создаёт, редактирует и публикует посты",
  viewer: "Только свои черновики, без публикации",
};

function MembersPage() {
  const { wsId } = Route.useParams();
  const { user } = useAuth();
  const { workspace, canEdit } = useWorkspace();
  const isOwner = !!workspace && !!user && workspace.owner_id === user.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Profile modal
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Invite by link
  const createInvite = useServerFn(createWorkspaceInvite);
  const listInvites = useServerFn(listWorkspaceInvites);
  const revokeInvite = useServerFn(revokeWorkspaceInvite);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<Exclude<Role, "owner">>("viewer");
  const [inviteExpiresHours, setInviteExpiresHours] = useState<string>("168");
  const [inviteMaxUses, setInviteMaxUses] = useState<string>("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  type Invite = {
    id: string;
    token: string;
    role: string;
    expires_at: string | null;
    max_uses: number | null;
    uses: number;
    revoked: boolean;
    created_at: string;
  };
  const [invites, setInvites] = useState<Invite[]>([]);

  const loadInvites = () => {
    if (!canEdit) return;
    listInvites({ data: { workspaceId: wsId } })
      .then((r) => setInvites(r.invites as Invite[]))
      .catch(() => {});
  };

  useEffect(() => {
    if (inviteOpen) loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteOpen, wsId]);

  const buildInviteUrl = (token: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/invite/${token}`
      : `/invite/${token}`;

  const onCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingInvite(true);
    try {
      const expiresInHours = inviteExpiresHours ? Number(inviteExpiresHours) : undefined;
      const maxUses = inviteMaxUses ? Number(inviteMaxUses) : undefined;
      const r = await createInvite({
        data: { workspaceId: wsId, role: inviteRole, expiresInHours, maxUses },
      });
      const url = buildInviteUrl(r.invite.token);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Ссылка скопирована");
      } catch {
        toast.success("Ссылка создана");
      }
      loadInvites();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInvite = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(token));
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  const onRevokeInvite = async (id: string) => {
    if (!confirm("Отозвать приглашение?")) return;
    try {
      await revokeInvite({ data: { workspaceId: wsId, inviteId: id } });
      toast.success("Отозвано");
      loadInvites();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Exclude<Role, "owner">>("viewer");
  const [adding, setAdding] = useState(false);

  const filteredMembers = members.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (m.display_name ?? "").toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q)
    );
  });

  const load = () => {
    setLoading(true);
    listWorkspaceMembers({ data: { workspaceId: wsId } })
      .then((res) => {
        setMembers(res.members);
        setOwnerId(res.ownerId);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    try {
      await addWorkspaceMember({ data: { workspaceId: wsId, email, role: newRole } });
      toast.success("Участник добавлен");
      setEmail("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (m: Member, role: Exclude<Role, "owner">) => {
    if (m.role === role) return;
    setBusy(m.user_id);
    try {
      await updateMemberRole({ data: { workspaceId: wsId, userId: m.user_id, role } });
      setMembers((prev) => prev.map((x) => (x.user_id === m.user_id ? { ...x, role } : x)));
      toast.success("Роль обновлена");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async (m: Member) => {
    if (!confirm(`Удалить ${m.email} из пространства?`)) return;
    setBusy(m.user_id);
    try {
      await removeMember({ data: { workspaceId: wsId, userId: m.user_id } });
      setMembers((prev) => prev.filter((x) => x.user_id !== m.user_id));
      toast.success("Участник удалён");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ===== Broadcast notification dialog state =====
  const sendNotif = useServerFn(sendWorkspaceNotification);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifMode, setNotifMode] = useState<"all" | "selected">("all");
  const [notifRecipients, setNotifRecipients] = useState<Set<string>>(new Set());
  const [notifSending, setNotifSending] = useState(false);

  const toggleRecipient = (id: string) => {
    setNotifRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSendNotif = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast.error("Заполните заголовок и текст");
      return;
    }
    const ids =
      notifMode === "selected" ? Array.from(notifRecipients) : undefined;
    if (notifMode === "selected" && (!ids || ids.length === 0)) {
      toast.error("Выберите получателей");
      return;
    }
    setNotifSending(true);
    try {
      const r = await sendNotif({
        data: {
          workspace_id: wsId,
          title: notifTitle.trim(),
          message: notifMessage.trim(),
          recipient_ids: ids,
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Отправлено: ${r.sent}`);
      setNotifOpen(false);
      setNotifTitle("");
      setNotifMessage("");
      setNotifRecipients(new Set());
      setNotifMode("all");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setNotifSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Участники пространства</h2>
          <p className="text-sm text-muted-foreground">
            Управляйте составом и ролями. <strong>Редактор</strong> публикует посты,{" "}
            <strong>пользователь</strong> работает только со своими черновиками.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Link2 className="h-4 w-4" />
                  Пригласить по ссылке
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Приглашение по ссылке</DialogTitle>
                  <DialogDescription>
                    Создайте ссылку и поделитесь ей с человеком. Перейдя по ней и войдя в
                    аккаунт, он автоматически попадёт в это пространство.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={onCreateInvite} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Роль</label>
                      <Select
                        value={inviteRole}
                        onValueChange={(v) => setInviteRole(v as Exclude<Role, "owner">)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Пользователь</SelectItem>
                          <SelectItem value="editor">Редактор</SelectItem>
                          <SelectItem value="admin">Админ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Действует, ч
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        value={inviteExpiresHours}
                        onChange={(e) => setInviteExpiresHours(e.target.value)}
                        placeholder="168"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Лимит, шт.
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={inviteMaxUses}
                        onChange={(e) => setInviteMaxUses(e.target.value)}
                        placeholder="без лимита"
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={creatingInvite} className="w-full gap-2">
                    <Link2 className="h-4 w-4" />
                    {creatingInvite ? "Создаём…" : "Создать ссылку и скопировать"}
                  </Button>
                </form>

                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {invites.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Активных приглашений нет
                    </p>
                  ) : (
                    invites.map((inv) => {
                      const expired =
                        inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
                      const usedUp = inv.max_uses ? inv.uses >= inv.max_uses : false;
                      const dead = inv.revoked || expired || usedUp;
                      return (
                        <div
                          key={inv.id}
                          className="flex items-center gap-2 rounded-lg border bg-card p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-mono truncate">
                              {buildInviteUrl(inv.token)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {ROLE_LABEL[inv.role as Role] ?? inv.role} ·
                              использовано {inv.uses}
                              {inv.max_uses ? `/${inv.max_uses}` : ""}
                              {inv.expires_at
                                ? ` · до ${new Date(inv.expires_at).toLocaleString("ru-RU")}`
                                : ""}
                              {inv.revoked
                                ? " · отозвано"
                                : expired
                                  ? " · истёк"
                                  : usedUp
                                    ? " · лимит"
                                    : ""}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={dead}
                            onClick={() => copyInvite(inv.token)}
                            title="Скопировать"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {!inv.revoked && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => onRevokeInvite(inv.id)}
                              title="Отозвать"
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
          {isOwner && (
          <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Send className="h-4 w-4" />
                Создать уведомление
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Новое уведомление</DialogTitle>
                <DialogDescription>
                  Уведомление получат участники пространства. Подпись отправителя и
                  название пространства добавятся автоматически.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={onSendNotif} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Заголовок
                  </label>
                  <Input
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="Например: Собрание в пятницу"
                    maxLength={200}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Текст
                  </label>
                  <Textarea
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Сообщение для участников…"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Получатели
                  </label>
                  <Select
                    value={notifMode}
                    onValueChange={(v) => setNotifMode(v as "all" | "selected")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все участники пространства</SelectItem>
                      <SelectItem value="selected">Выбранным пользователям</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {notifMode === "selected" && (
                  <div className="rounded-lg border max-h-48 overflow-y-auto p-2 space-y-1">
                    {members.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-2">
                        Нет участников
                      </p>
                    ) : (
                      members.map((m) => (
                        <label
                          key={m.user_id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={notifRecipients.has(m.user_id)}
                            onCheckedChange={() => toggleRecipient(m.user_id)}
                          />
                          <span className="text-sm flex-1 truncate">
                            {m.display_name ?? m.email}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {ROLE_LABEL[m.role]}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setNotifOpen(false)}
                  >
                    Отмена
                  </Button>
                  <Button type="submit" disabled={notifSending}>
                    {notifSending ? "Отправка…" : "Отправить"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {isOwner && (
        <form
          onSubmit={onAdd}
          className="rounded-xl border bg-card p-4 flex flex-col md:flex-row gap-3 md:items-end"
        >
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Email пользователя
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>
          <div className="md:w-48">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Роль
            </label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as Exclude<Role, "owner">)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Пользователь (черновики)</SelectItem>
                <SelectItem value="editor">Редактор (публикует)</SelectItem>
                <SelectItem value="admin">Админ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={adding} className="gap-2">
            <UserPlus className="h-4 w-4" />
            {adding ? "Добавляем…" : "Добавить"}
          </Button>
        </form>
      )}

      <div className="relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или email…"
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Роль</TableHead>
              {isOwner && <TableHead className="w-[280px]">Действия</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={isOwner ? 4 : 3} className="text-center text-muted-foreground py-8">
                  Загрузка…
                </TableCell>
              </TableRow>
            ) : filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isOwner ? 4 : 3} className="text-center text-muted-foreground py-8">
                  {search.trim() ? "Никого не найдено" : "Пока никого"}
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((m) => {
                const isOwnerRow = m.user_id === ownerId;
                const initials = (m.display_name || m.email || "U").slice(0, 2).toUpperCase();
                const Icon =
                  m.role === "owner"
                    ? Crown
                    : m.role === "admin"
                      ? Shield
                      : m.role === "editor"
                        ? Pencil
                        : Eye;
                return (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedUser({
                        id: m.user_id,
                        email: m.email,
                        display_name: m.display_name,
                        avatar_url: m.avatar_url,
                        position: m.position,
                        created_at: m.created_at,
                        roles: [],
                      });
                      setProfileOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground grid place-items-center text-xs font-bold overflow-hidden shrink-0">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials
                          )}
                        </div>
                        <div className="leading-tight">
                          <div className="font-medium">{m.display_name ?? "—"}</div>
                          {m.user_id === user?.id && (
                            <div className="text-[11px] text-muted-foreground">это вы</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          m.role === "owner"
                            ? "default"
                            : m.role === "admin"
                              ? "default"
                              : m.role === "editor"
                                ? "secondary"
                                : "outline"
                        }
                        className="gap-1"
                        title={ROLE_HINT[m.role]}
                      >
                        <Icon className="h-3 w-3" />
                        {ROLE_LABEL[m.role]}
                      </Badge>
                    </TableCell>
                    {isOwner && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isOwnerRow ? (
                          <span className="text-xs text-muted-foreground">
                            Владелец — изменение недоступно
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Select
                              value={m.role}
                              disabled={busy === m.user_id}
                              onValueChange={(v) =>
                                changeRole(m, v as Exclude<Role, "owner">)
                              }
                            >
                              <SelectTrigger className="h-8 w-[170px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="viewer">Пользователь</SelectItem>
                                <SelectItem value="editor">Редактор</SelectItem>
                                <SelectItem value="admin">Админ</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={busy === m.user_id}
                              onClick={() => onRemove(m)}
                              title="Удалить из пространства"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <UserInfoModal
        user={selectedUser}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  );
}
