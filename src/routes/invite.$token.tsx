import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, CheckCircle2, XCircle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { acceptWorkspaceInvite, getInviteInfo } from "@/lib/workspace-invites.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "Админ",
  editor: "Редактор",
  viewer: "Пользователь",
};

function InvitePage() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const getInfo = useServerFn(getInviteInfo);
  const accept = useServerFn(acceptWorkspaceInvite);

  const [info, setInfo] = useState<
    | { ok: true; workspace: { id: string; name: string; description: string }; role: string }
    | { ok: false; error: string }
    | null
  >(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    getInfo({ data: { token } })
      .then((r) => setInfo(r))
      .catch((e) => setInfo({ ok: false, error: (e as Error).message }));
  }, [token, getInfo]);

  const onAccept = async () => {
    if (!user) {
      navigate({ to: "/login", search: { redirect: `/invite/${token}` } as never });
      return;
    }
    setAccepting(true);
    try {
      const r = await accept({ data: { token } });
      toast.success(r.alreadyMember ? "Вы уже в пространстве" : "Вы присоединились!");
      navigate({ to: "/w/$wsId", params: { wsId: r.workspaceId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="max-w-md w-full bg-card border rounded-2xl p-8 shadow-sm">
        {!info ? (
          <div className="text-center text-muted-foreground py-6">Загрузка приглашения…</div>
        ) : !info.ok ? (
          <div className="text-center space-y-3">
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-xl font-semibold">Приглашение недействительно</h1>
            <p className="text-sm text-muted-foreground">{info.error}</p>
            <Button asChild variant="outline">
              <Link to="/">На главную</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground">
                <Building2 className="h-7 w-7" />
              </div>
              <h1 className="text-xl font-semibold">Приглашение в пространство</h1>
              <p className="text-sm text-muted-foreground">
                Вас приглашают присоединиться к
              </p>
              <div className="font-semibold text-lg">{info.workspace.name}</div>
              {info.workspace.description && (
                <p className="text-xs text-muted-foreground">{info.workspace.description}</p>
              )}
              <div className="text-xs text-muted-foreground">
                Роль:{" "}
                <span className="font-medium text-foreground">
                  {ROLE_LABEL[info.role] ?? info.role}
                </span>
              </div>
            </div>

            {loading ? (
              <Button disabled className="w-full">
                Загрузка…
              </Button>
            ) : user ? (
              <Button onClick={onAccept} disabled={accepting} className="w-full gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {accepting ? "Присоединяемся…" : "Присоединиться"}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  Войдите или зарегистрируйтесь, чтобы принять приглашение
                </p>
                <Button onClick={onAccept} className="w-full gap-2">
                  <LogIn className="h-4 w-4" />
                  Войти и присоединиться
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
