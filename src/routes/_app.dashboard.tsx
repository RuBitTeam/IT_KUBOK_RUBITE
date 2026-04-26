import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  FileText,
  Eye,
  Heart,
  Plus,
  ArrowUpRight,
  Sparkles,
  Send,
  TrendingUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { listPosts, type Post, STATUS_LABEL, STATUS_COLOR } from "@/lib/posts-api";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/workspaces" });
  },
  component: DashboardPage,
});


interface AnaRow {
  views: number;
  reactions: number;
  recorded_at: string;
}

function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [analytics, setAnalytics] = useState<AnaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const p = await listPosts();
        setPosts(p);
        const { data } = await supabase
          .from("post_analytics")
          .select("views,reactions,recorded_at")
          .order("recorded_at", { ascending: true });
        setAnalytics((data ?? []) as AnaRow[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const draft = posts.filter((p) => p.status === "draft").length;
  const scheduled = posts.filter((p) => p.status === "scheduled").length;
  const published = posts.filter((p) => p.status === "published").length;
  const totalViews = analytics.reduce((s, r) => s + r.views, 0);
  const totalReactions = analytics.reduce((s, r) => s + r.reactions, 0);

  const upcoming = posts
    .filter((p) => p.status === "scheduled" && p.publish_date)
    .sort((a, b) => +new Date(a.publish_date!) - +new Date(b.publish_date!))
    .slice(0, 5);

  const recent = useMemo(
    () =>
      [...posts]
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 4),
    [posts],
  );

  const trend = useMemo(() => {
    const m = new Map<string, { date: string; views: number }>();
    analytics.forEach((r) => {
      const d = new Date(r.recorded_at);
      const key = `${d.getDate()} ${d.toLocaleDateString("ru-RU", { month: "short" })}`;
      const cur = m.get(key) ?? { date: key, views: 0 };
      cur.views += r.views;
      m.set(key, cur);
    });
    return Array.from(m.values()).slice(-14);
  }, [analytics]);

  const kpis = [
    {
      icon: <Send className="h-4 w-4" />,
      label: "Опубликовано",
      value: published,
      trend: "+18%",
    },
    {
      icon: <CalendarDays className="h-4 w-4" />,
      label: "Запланировано",
      value: scheduled,
      trend: "+12%",
    },
    {
      icon: <Eye className="h-4 w-4" />,
      label: "Охват",
      value: totalViews,
      trend: "+23%",
    },
    {
      icon: <Heart className="h-4 w-4" />,
      label: "Вовлечённость",
      value: totalReactions,
      trend: "+15%",
    },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Дашборд</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Добро пожаловать, обзор активности за последний месяц
          </p>
        </div>
        <Button asChild className="shadow-[var(--shadow-elegant)]">
          <Link to="/posts/$id" params={{ id: "new" }}>
            <Plus className="h-4 w-4 mr-1" /> Создать пост
          </Link>
        </Button>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((s) => (
          <div
            key={s.label}
            className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center">
                {s.icon}
              </div>
              <span className="text-sm text-muted-foreground">{s.label}</span>
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {s.value.toLocaleString("ru-RU")}
            </div>
            <div className="text-xs text-emerald-600 font-medium mt-1">↑ {s.trend}</div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Reach chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Динамика охвата</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Последние 14 дней</p>
            </div>
            <Link
              to="/analytics"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              Подробнее <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : trend.length === 0 ? (
            <div className="h-64 grid place-items-center text-sm text-muted-foreground">
              Пока нет данных для графика
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="dash-reach" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.62 0.20 285)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.62 0.20 285)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  stroke="oklch(0.62 0.20 285)"
                  strokeWidth={2.5}
                  fill="url(#dash-reach)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Summary card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-[var(--shadow-card)] space-y-4">
          <h2 className="font-semibold">Сводка</h2>
          <SummaryRow label="Черновики" value={draft} dotClass="bg-muted-foreground" />
          <SummaryRow label="Запланировано" value={scheduled} dotClass="bg-primary" />
          <SummaryRow label="Опубликовано" value={published} dotClass="bg-emerald-500" />
          <div className="pt-2 border-t border-border">
            <Button asChild variant="outline" className="w-full">
              <Link to="/templates">
                <Sparkles className="h-4 w-4 mr-2" /> Открыть шаблоны
              </Link>
            </Button>
          </div>
        </div>

        {/* Upcoming */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Ближайшие публикации</h2>
            <Link
              to="/calendar"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              Календарь <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {loading ? (
            <p className="text-muted-foreground text-sm">Загрузка…</p>
          ) : upcoming.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Нет запланированных постов
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((p) => (
                <li key={p.id} className="py-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary-glow/20 grid place-items-center text-primary font-bold text-sm shrink-0 overflow-hidden">
                    {p.media_url ? (
                      <img src={p.media_url.split(/\r?\n/)[0]?.trim() || p.media_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      p.title.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      to="/posts/$id"
                      params={{ id: p.id }}
                      className="font-medium hover:text-primary truncate block"
                    >
                      {p.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.publish_date!).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2.5 py-1 font-medium whitespace-nowrap",
                      STATUS_COLOR[p.status as keyof typeof STATUS_COLOR],
                    )}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent posts */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Свежие посты</h2>
            <Link to="/workspaces" className="text-sm text-primary hover:underline">
              Все →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Постов пока нет</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/posts/$id"
                    params={{ id: p.id }}
                    className="flex items-start gap-2 group"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full mt-1.5 shrink-0",
                        p.status === "published"
                          ? "bg-emerald-500"
                          : p.status === "scheduled"
                            ? "bg-primary"
                            : p.status === "failed"
                              ? "bg-destructive"
                              : "bg-muted-foreground",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium line-clamp-1 group-hover:text-primary">
                        {p.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("ru-RU", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="outline" className="w-full mt-4">
            <Link to="/analytics">
              <TrendingUp className="h-4 w-4 mr-2" /> К аналитике
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: number;
  dotClass: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
