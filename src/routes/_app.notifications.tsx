import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  post_id: string | null;
  read: boolean;
  created_at: string;
}

function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Notification[]);
  };

  useEffect(() => {
    load();
  }, [user]);

  const markAll = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    load();
  };

  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const deleteOne = async (id: string) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      toast.error("Не удалось удалить");
      return;
    }
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = async () => {
    if (!user) return;
    if (!confirm("Удалить все уведомления?")) return;
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
    if (error) {
      toast.error("Не удалось очистить");
      return;
    }
    setItems([]);
    toast.success("Уведомления очищены");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Уведомления</h1>
          <p className="text-muted-foreground mt-1">События по постам и черновикам</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={markAll} disabled={!items.some((n) => !n.read)}>
            <BellOff className="h-4 w-4 mr-1" /> Прочитать все
          </Button>
          <Button variant="outline" onClick={clearAll} disabled={items.length === 0}>
            <Trash2 className="h-4 w-4 mr-1" /> Очистить все
          </Button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Уведомлений нет
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "bg-card border border-border rounded-xl p-4 flex items-start gap-3",
                !n.read && "border-primary/50 bg-accent/30"
              )}
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString("ru-RU")}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                {n.post_id && (
                  <Link
                    to="/posts/$id"
                    params={{ id: n.post_id }}
                    className="text-sm text-primary hover:underline"
                  >
                    Открыть
                  </Link>
                )}
                {!n.read && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => markOne(n.id)}
                    title="Прочитать"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteOne(n.id)}
                  title="Удалить"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
