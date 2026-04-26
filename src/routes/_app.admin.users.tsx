import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, ShieldCheck, Pencil, Eye, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { listAllUsers, setGlobalRole } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { UserInfoModal, type UserInfo } from "@/components/UserInfoModal";

export const Route = createFileRoute("/_app/admin/users")({
  component: AdminUsersPage,
});

type AppRole = "admin" | "editor" | "viewer";

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  roles: string[];
}

const ROLES: { value: AppRole; label: string; icon: typeof Shield }[] = [
  { value: "admin", label: "Админ", icon: ShieldCheck },
  { value: "editor", label: "Редактор", icon: Pencil },
  { value: "viewer", label: "Зритель", icon: Eye },
];

function AdminUsersPage() {
  const { isAdmin, loading } = useAuth();
  const list = useServerFn(listAllUsers);
  const setRole = useServerFn(setGlobalRole);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredUsers = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.display_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  });

  const load = () => {
    setLoadingList(true);
    list({ data: undefined })
      .then((r) => setUsers(r.users))
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    if (!loading && isAdmin) load();
  }, [loading, isAdmin]);

  if (!loading && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto bg-card border border-border rounded-2xl p-8 text-center">
        <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Только для администраторов</h2>
        <p className="text-sm text-muted-foreground mt-1">
          У вас нет прав глобального администратора.
        </p>
      </div>
    );
  }

  const toggle = async (u: UserRow, role: AppRole) => {
    const has = u.roles.includes(role);
    setBusy(u.id + role);
    try {
      const r = await setRole({
        data: { user_id: u.id, role, grant: !has },
      });
      if (!r.ok) return;
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? {
                ...x,
                roles: has ? x.roles.filter((r) => r !== role) : [...x.roles, role],
              }
            : x,
        ),
      );
      toast.success(has ? "Права сняты" : "Роль выдана");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Все пользователи</h1>
        <p className="text-muted-foreground mt-1">
          Управление глобальными ролями. Глобальный <strong>админ</strong> видит всех
          пользователей и может назначать роли.
        </p>
      </header>

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
              <TableHead>Текущие роли</TableHead>
              <TableHead className="w-[360px]">Управление</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingList ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Загрузка…
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  {search.trim() ? "Никого не найдено" : "Нет пользователей"}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => {
                const initials = (u.display_name || u.email || "U").slice(0, 2).toUpperCase();
                return (
                  <TableRow
                    key={u.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedUser(u);
                      setModalOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground grid place-items-center text-xs font-bold overflow-hidden shrink-0">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials
                          )}
                        </div>
                        <div className="leading-tight">
                          <div className="font-medium">{u.display_name ?? "—"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString("ru-RU")}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r} variant="secondary">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1.5">
                        {ROLES.map(({ value, label, icon: Icon }) => {
                          const has = u.roles.includes(value);
                          return (
                            <Button
                              key={value}
                              size="sm"
                              variant={has ? "default" : "outline"}
                              disabled={busy === u.id + value}
                              onClick={() => toggle(u, value)}
                              className="gap-1"
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {has ? `Снять «${label}»` : label}
                            </Button>
                          );
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <UserInfoModal user={selectedUser} open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
