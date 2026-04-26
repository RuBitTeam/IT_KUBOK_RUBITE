import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Briefcase,
  Bell,
  ShieldCheck,
  Sparkles,
  ListTodo,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProfileModal } from "@/components/ProfileModal";
import logo from "@/assets/logo.png";

const nav = [
  { to: "/calendar", label: "Общий календарь", icon: CalendarDays },
  { to: "/workspaces", label: "Рабочие пространства", icon: Briefcase },
  { to: "/notifications", label: "Уведомления", icon: Bell },
  { to: "/creative", label: "Уголок креатива", icon: Sparkles },
  { to: "/tasks", label: "Мои задачи", icon: ListTodo },
];

const adminNav = [
  { to: "/admin/users", label: "Все пользователи", icon: ShieldCheck },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null }>({
    display_name: null,
    avatar_url: null,
  });
  const { user, roles, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }
    const uid = user.id;
    let cancelled = false;

    const load = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("read", false);
      if (!cancelled) setUnreadCount(count ?? 0);
    };

    load();

    const channel = supabase
      .channel(`notif-count-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setProfile({ display_name: null, avatar_url: null });
      return;
    }
    const uid = user.id;
    let cancelled = false;

    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", uid)
        .maybeSingle();
      if (!cancelled && data) {
        setProfile({
          display_name: data.display_name ?? null,
          avatar_url: data.avatar_url ?? null,
        });
      }
    };

    loadProfile();

    const channel = supabase
      .channel(`profile-${uid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        () => loadProfile(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const displayName = profile.display_name?.trim() || user?.email?.split("@")[0] || "Пользователь";
  const initials = (profile.display_name || user?.email || "U").slice(0, 2).toUpperCase();
  const roleLabel = roles.includes("admin")
    ? "Администратор"
    : roles.includes("editor")
      ? "Редактор"
      : roles.includes("viewer")
        ? "Наблюдатель"
        : "Пользователь";

  return (
    <div className="min-h-screen bg-background flex">
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:sticky top-0 left-0 z-50 h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar transition-transform md:translate-x-0 flex flex-col",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="h-20 px-3 flex items-center justify-between border-b border-sidebar-border/60">
          <Link to="/dashboard" className="flex items-center gap-0.5">
            <img src={logo} alt="" className="h-20 w-20 object-contain shrink-0" />
            <div className="leading-tight">
              <div className="text-xl font-medium tracking-tight">ПОСТЕР</div>
              <div className="text-[10px] text-muted-foreground -mt-0.5">медиахаб</div>
            </div>
          </Link>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            const showBadge = item.to === "/notifications" && unreadCount > 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] transition-colors",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <div className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Администрирование
              </div>
              {adminNav.map((item) => {
                const active = pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] transition-colors",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Profile card */}
        <div className="p-3 border-t border-sidebar-border/60">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-sidebar-accent/50 transition-colors text-left"
          >
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground grid place-items-center text-xs font-bold overflow-hidden shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-[11px] text-muted-foreground capitalize truncate">{roleLabel}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-1 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start text-muted-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" /> Выйти
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
          <button onClick={() => setOpen(true)} aria-label="Меню">
            <Menu className="h-6 w-6" />
          </button>
          <img src={logo} alt="" className="h-24 w-24 object-contain" />
          <span className="text-sm font-medium tracking-tight">ПОСТЕР <span className="text-muted-foreground text-[10px] font-normal">медиахаб</span></span>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
