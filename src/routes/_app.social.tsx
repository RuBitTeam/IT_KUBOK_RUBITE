import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  Send,
  Plug,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Loader2,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { useWorkspaceId } from "@/lib/workspace-context";
import {
  listSocialAccounts,
  PLATFORM_BADGE,
  STATUS_BADGE,
  type SocialAccount,
  type SocialPlatform,
} from "@/lib/social-api";
import {
  connectSocialAccount,
  unlinkSocialAccountFromWorkspace,
  linkSocialAccountToWorkspace,
  listMyUnlinkedAccounts,
  listWorkspaceSocialAccounts,
  recheckSocialAccount,
  reconnectSocialAccount,
} from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/social")({
  component: SocialPage,
});

function extractVkToken(input: string, platform: SocialPlatform): string {
  if (platform !== "vk") return input;
  const m = input.match(/access_token=([^&\s#]+)/);
  return m ? m[1] : input;
}

type AccountRow = SocialAccount & {
  owner_display_name?: string;
  is_mine?: boolean;
};

export function SocialPage() {
  const { user } = useAuth();
  const wsId = useWorkspaceId();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openConnect, setOpenConnect] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [reconnectFor, setReconnectFor] = useState<AccountRow | null>(null);
  const listWs = useServerFn(listWorkspaceSocialAccounts);

  const refresh = async () => {
    setLoading(true);
    try {
      if (wsId) {
        const r = await listWs({ data: { workspace_id: wsId } });
        if (r.ok) {
          setAccounts(r.accounts as AccountRow[]);
        } else {
          toast.error(r.error ?? "Ошибка загрузки");
          setAccounts([]);
        }
      } else {
        const rows = await listSocialAccounts();
        setAccounts(
          rows.map((a) => ({ ...a, is_mine: a.owner_id === user?.id })) as AccountRow[],
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, user?.id]);

  const recheck = useServerFn(recheckSocialAccount);

  const onRecheck = async (a: AccountRow) => {
    const r = await recheck({ data: { id: a.id } });
    if (r.ok) toast.success(`Соединение в порядке${r.info ? ` — ${r.info}` : ""}`);
    else toast.error(r.error ?? "Ошибка проверки");
    await refresh();
  };

  const unlink = useServerFn(unlinkSocialAccountFromWorkspace);

  const onDelete = async (a: AccountRow) => {
    if (!wsId) {
      toast.error("Откройте пространство, чтобы отвязать соцсеть");
      return;
    }
    if (!confirm(`Отвязать «${a.display_name}» от этого пространства?`)) return;
    try {
      const r = await unlink({ data: { account_id: a.id, workspace_id: wsId } });
      if (!r.ok) {
        toast.error(r.error ?? "Не удалось отвязать");
        return;
      }
      toast.success("Соцсеть отвязана от пространства");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Соцсети</h1>
          <p className="text-muted-foreground mt-1">
            Подключите сообщества для автопостинга. Токены хранятся в зашифрованном виде.
          </p>
        </div>
        {user && (
          <div className="flex gap-2">
            {wsId && (
              <Button variant="outline" onClick={() => setOpenLink(true)}>
                <Plug className="h-4 w-4 mr-1" /> Привязать существующую
              </Button>
            )}
            <Button onClick={() => setOpenConnect(true)}>
              <Plus className="h-4 w-4 mr-1" /> Подключить соцсеть
            </Button>
          </div>
        )}
      </header>

      {loading ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : accounts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <Plug className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="mt-3 font-medium">Нет подключённых соцсетей</p>
          <p className="text-sm text-muted-foreground">
            Подключите Telegram-бот или сообщество ВКонтакте, чтобы автоматически публиковать посты.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((a) => (
            <article
              key={a.id}
              className="bg-card border border-border rounded-xl p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{a.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {PLATFORM_BADGE[a.platform]} · {a.target_chat}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              {a.last_error && (
                <p className="text-xs text-destructive flex gap-1.5 items-start">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="break-all">{a.last_error}</span>
                </p>
              )}
              {a.last_checked_at && (
                <p className="text-xs text-muted-foreground">
                  Проверено: {new Date(a.last_checked_at).toLocaleString("ru-RU")}
                </p>
              )}
              {a.owner_display_name && (
                <p className="text-xs text-muted-foreground">
                  Добавил: <span className="font-medium text-foreground">{a.owner_display_name}</span>
                  {a.is_mine && <span className="ml-1 text-primary">(вы)</span>}
                </p>
              )}
              {user && (
                <div className="flex gap-2 pt-1">
                  {a.is_mine && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onRecheck(a)}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Проверить
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setReconnectFor(a)}>
                        <Send className="h-3.5 w-3.5 mr-1" /> Переподключить
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive ml-auto"
                    onClick={() => onDelete(a)}
                    title="Отвязать от пространства"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <ConnectDialog
        open={openConnect}
        onOpenChange={setOpenConnect}
        onCreated={refresh}
        workspaceId={wsId}
      />
      <LinkExistingDialog
        open={openLink}
        onOpenChange={setOpenLink}
        workspaceId={wsId}
        onLinked={refresh}
      />
      <ReconnectDialog
        account={reconnectFor}
        onClose={() => setReconnectFor(null)}
        onUpdated={refresh}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: SocialAccount["status"] }) {
  const map = {
    connected: "bg-success/15 text-success-foreground border-success/30",
    disconnected: "bg-muted text-muted-foreground border-border",
    error: "bg-destructive/15 text-destructive border-destructive/30",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        map[status],
      )}
    >
      {status === "connected" && <CheckCircle2 className="h-3 w-3" />}
      {status === "error" && <AlertTriangle className="h-3 w-3" />}
      {STATUS_BADGE[status]}
    </span>
  );
}

function ConnectDialog({
  open,
  onOpenChange,
  onCreated,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  workspaceId: string | null;
}) {
  const connect = useServerFn(connectSocialAccount);
  const [platform, setPlatform] = useState<SocialPlatform>("telegram");
  const [displayName, setDisplayName] = useState("");
  const [targetChat, setTargetChat] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setDisplayName("");
    setTargetChat("");
    setToken("");
    setPlatform("telegram");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await connect({
        data: {
          platform,
          display_name: displayName,
          target_chat: targetChat,
          token,
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        },
      });
      if (r.ok) {
        toast.success(`Подключено${r.info ? ` — ${r.info}` : ""}`);
        reset();
        onOpenChange(false);
        onCreated();
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Подключение соцсети</DialogTitle>
          <DialogDescription>
            Токен сохраняется в зашифрованном виде (AES-256-GCM) и используется только для публикации.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                "border rounded-lg p-3 text-sm font-medium transition",
                platform === "telegram"
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border hover:border-primary/50",
              )}
              onClick={() => setPlatform("telegram")}
            >
              Telegram
            </button>
            <button
              type="button"
              className={cn(
                "border rounded-lg p-3 text-sm font-medium transition",
                platform === "vk"
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border hover:border-primary/50",
              )}
              onClick={() => setPlatform("vk")}
            >
              ВКонтакте
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display">Название</Label>
            <Input
              id="display"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Например: Канал молодёжного центра"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chat">
              {platform === "telegram" ? "Chat ID канала" : "ID сообщества VK"}
            </Label>
            <Input
              id="chat"
              required
              value={targetChat}
              onChange={(e) => setTargetChat(e.target.value)}
              placeholder={platform === "telegram" ? "@my_channel или -1001234567890" : "12345678"}
            />
            <p className="text-xs text-muted-foreground">
              {platform === "telegram"
                ? "Бот должен быть добавлен администратором канала с правом публикации."
                : "ID сообщества (число без минуса). Токен — community access token со scope wall, photos."}
            </p>
          </div>

          {platform === "telegram" && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
              <p className="font-medium text-foreground">Как подключить Telegram-канал:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>
                  Создайте бота через{" "}
                  <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-primary underline">
                    @BotFather
                  </a>{" "}
                  и скопируйте токен вида <code className="font-mono">123456:AA…</code>.
                </li>
                <li>Добавьте бота в свой канал как администратора с правом публикации.</li>
                <li>
                  В поле выше укажите <code className="font-mono">@username</code> публичного канала или
                  числовой <code className="font-mono">-100…</code> для приватного.
                </li>
              </ol>
            </div>
          )}

          {platform === "vk" && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
              <p className="font-medium text-foreground">Как получить токен ВКонтакте:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>
                  Перейдите по{" "}
                  <a
                    href="https://oauth.vk.com/authorize?client_id=6463690&scope=photos,wall,groups,offline&redirect_uri=https://oauth.vk.com/blank.html&display=page&response_type=token&revoke=1"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    этой ссылке
                  </a>{" "}
                  и подтвердите доступ.
                </li>
                <li>Вы попадёте на пустую страницу — скопируйте её адрес целиком из адресной строки.</li>
                <li>Вставьте адрес в поле ниже — токен извлечётся автоматически.</li>
              </ol>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="token">
              {platform === "telegram"
                ? "Bot Token"
                : "Ссылка с токеном или сам access_token"}
            </Label>
            <Input
              id="token"
              required
              type={platform === "telegram" ? "password" : "text"}
              value={token}
              onChange={(e) => setToken(extractVkToken(e.target.value, platform))}
              placeholder={
                platform === "telegram"
                  ? "123456:AA…"
                  : "https://oauth.vk.com/blank.html#access_token=…"
              }
            />
            {platform === "vk" && token && !token.startsWith("http") && (
              <p className="text-xs text-success">Токен извлечён ✓</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Отмена
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Подключить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReconnectDialog({
  account,
  onClose,
  onUpdated,
}: {
  account: SocialAccount | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const reconnect = useServerFn(reconnectSocialAccount);
  const [token, setToken] = useState("");
  const [chat, setChat] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (account) {
      setToken("");
      setChat(account.target_chat);
    }
  }, [account]);

  if (!account) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await reconnect({
        data: { id: account.id, token, target_chat: chat },
      });
      if (r.ok) {
        toast.success("Переподключено");
        onClose();
        onUpdated();
      } else {
        toast.error(r.error ?? "Не удалось");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!account} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Переподключение: {account.display_name}</DialogTitle>
          <DialogDescription>Введите новый токен и при необходимости измените получателя.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rchat">
              {account.platform === "telegram" ? "Chat ID" : "ID сообщества VK"}
            </Label>
            <Input id="rchat" required value={chat} onChange={(e) => setChat(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rtoken">Новый токен</Label>
            <Input
              id="rtoken"
              required
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkExistingDialog({
  open,
  onOpenChange,
  workspaceId,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string | null;
  onLinked: () => void;
}) {
  const listMine = useServerFn(listMyUnlinkedAccounts);
  const linkFn = useServerFn(linkSocialAccountToWorkspace);
  const [items, setItems] = useState<
    Array<{ id: string; platform: SocialPlatform; display_name: string; target_chat: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !workspaceId) return;
    setLoading(true);
    listMine({ data: { workspace_id: workspaceId } })
      .then((r) => {
        if (r.ok) {
          setItems(
            r.accounts as Array<{
              id: string;
              platform: SocialPlatform;
              display_name: string;
              target_chat: string;
            }>,
          );
        }
      })
      .finally(() => setLoading(false));
  }, [open, workspaceId, listMine]);

  const onLink = async (id: string) => {
    if (!workspaceId) return;
    setBusyId(id);
    try {
      const r = await linkFn({ data: { account_id: id, workspace_id: workspaceId } });
      if (r.ok) {
        toast.success("Привязано");
        setItems((prev) => prev.filter((x) => x.id !== id));
        onLinked();
      } else {
        toast.error(r.error ?? "Не удалось");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Привязать существующую соцсеть</DialogTitle>
          <DialogDescription>
            Выберите ранее подключённую соцсеть, чтобы сделать её доступной в этом пространстве.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Нет доступных соцсетей для привязки. Подключите новую через «Подключить соцсеть».
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 border border-border rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{a.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {PLATFORM_BADGE[a.platform]} · {a.target_chat}
                  </p>
                </div>
                <Button size="sm" disabled={busyId === a.id} onClick={() => onLink(a.id)}>
                  {busyId === a.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Привязать
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
