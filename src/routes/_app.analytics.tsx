import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Send,
  Eye,
  Heart,
  Users,
  TrendingUp,
  Calendar as CalendarIcon,
  Download,
  Lightbulb,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recommendBestTime } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/analytics")({
  component: AnalyticsPage,
});

interface Row {
  id: string;
  post_id: string;
  views: number;
  reactions: number;
  recorded_at: string;
}

interface PostRow {
  id: string;
  title: string;
  platform: string;
  media_url: string | null;
  publish_date: string | null;
}

const TABS = ["Обзор", "Публикации", "Аудитория", "Вовлечённость", "Охват", "Просмотры", "Конверсии"];

const PLATFORM_COLORS: Record<string, string> = {
  vk: "oklch(0.62 0.20 285)",
  telegram: "oklch(0.70 0.15 230)",
  other: "oklch(0.65 0.02 270)",
};

const PLATFORM_LABEL: Record<string, string> = {
  vk: "VK",
  telegram: "Telegram",
  other: "Другое",
};

function AnalyticsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [postsMap, setPostsMap] = useState<Map<string, PostRow>>(new Map());
  const [activeTab, setActiveTab] = useState("Обзор");
  const [platform, setPlatform] = useState("vk");
  const [rec, setRec] = useState<{ hours: number[]; days: string[]; note: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase
        .from("post_analytics")
        .select("*")
        .order("recorded_at", { ascending: true });
      const { data: p } = await supabase
        .from("posts")
        .select("id,title,platform,media_url,publish_date");
      setRows((a ?? []) as Row[]);
      const m = new Map<string, PostRow>();
      (p ?? []).forEach((x) => m.set(x.id, x as PostRow));
      setPostsMap(m);
    })();
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, { date: string; views: number; reactions: number }>();
    rows.forEach((r) => {
      const d = new Date(r.recorded_at);
      const key = `${d.getDate()} ${d.toLocaleDateString("ru-RU", { month: "short" })}`;
      const cur = m.get(key) ?? { date: key, views: 0, reactions: 0 };
      cur.views += r.views;
      cur.reactions += r.reactions;
      m.set(key, cur);
    });
    return Array.from(m.values()).slice(-30);
  }, [rows]);

  // Heatmap: 7 days × 24 hours
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    rows.forEach((r) => {
      const d = new Date(r.recorded_at);
      const day = (d.getDay() + 6) % 7; // Monday=0
      const hour = d.getHours();
      grid[day][hour] += r.views;
    });
    const max = Math.max(1, ...grid.flat());
    return { grid, max };
  }, [rows]);

  const platformShare = useMemo(() => {
    const totals = new Map<string, number>();
    rows.forEach((r) => {
      const post = postsMap.get(r.post_id);
      const pl = post?.platform ?? "other";
      totals.set(pl, (totals.get(pl) ?? 0) + r.views);
    });
    const total = Array.from(totals.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(totals.entries()).map(([k, v]) => ({
      name: PLATFORM_LABEL[k] ?? k,
      key: k,
      value: v,
      pct: ((v / total) * 100).toFixed(1),
      color: PLATFORM_COLORS[k] ?? PLATFORM_COLORS.other,
    }));
  }, [rows, postsMap]);

  const top = useMemo(() => {
    const totals = new Map<string, number>();
    rows.forEach((r) =>
      totals.set(r.post_id, (totals.get(r.post_id) ?? 0) + r.views + r.reactions * 5),
    );
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, score]) => ({ post: postsMap.get(id), score: Math.round(score) }));
  }, [rows, postsMap]);

  const totalViews = rows.reduce((s, r) => s + r.views, 0);
  const totalReactions = rows.reduce((s, r) => s + r.reactions, 0);
  const publishedCount = useMemo(
    () => Array.from(postsMap.values()).filter((p) => p.publish_date).length,
    [postsMap],
  );
  const subscribers = 2450; // placeholder until real source

  const handleRecommend = async () => {
    const r = await recommendBestTime({ data: { platform } });
    setRec(r);
  };

  const maxTopScore = Math.max(1, ...top.map((t) => t.score));

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Аналитика</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            Последние 30 дней
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Экспорт отчёта
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const active = t === activeTab;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
              {active && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Send className="h-4 w-4" />}
          label="Опубликовано постов"
          value={publishedCount}
          trend="+18%"
        />
        <KpiCard
          icon={<Eye className="h-4 w-4" />}
          label="Охват"
          value={totalViews}
          trend="+23%"
        />
        <KpiCard
          icon={<Heart className="h-4 w-4" />}
          label="Вовлечённость"
          value={totalReactions}
          trend="+15%"
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Подписчики"
          value={subscribers}
          trend="+12%"
        />
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          {/* Reach over time */}
          <Card title="Динамика охвата">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={byDay} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="reach" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.62 0.20 285)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.62 0.20 285)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.93 0.012 280)" />
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
                  fill="url(#reach)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Platforms + Top posts */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card title="Охват по платформам">
              {platformShare.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет данных</p>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <ResponsiveContainer width={200} height={200}>
                      <PieChart>
                        <Pie
                          data={platformShare}
                          dataKey="value"
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={88}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {platformShare.map((p) => (
                            <Cell key={p.key} fill={p.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 grid place-items-center pointer-events-none">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{totalViews.toLocaleString("ru-RU")}</div>
                        <div className="text-[11px] text-muted-foreground">всего</div>
                      </div>
                    </div>
                  </div>
                  <ul className="w-full space-y-2 mt-4">
                    {platformShare.map((p) => (
                      <li key={p.key} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                        <span className="flex-1">{p.name}</span>
                        <span className="font-semibold tabular-nums">
                          {p.value.toLocaleString("ru-RU")}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                          {p.pct}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card title="Топ публикаций по охвату">
              {top.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пока нет данных</p>
              ) : (
                <ul className="space-y-3">
                  {top.map((t, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary-glow/20 grid place-items-center text-primary font-bold text-sm shrink-0 overflow-hidden">
                        {t.post?.media_url ? (
                          <img src={t.post.media_url.split(/\r?\n/)[0]?.trim() || t.post.media_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          (t.post?.title ?? "—").slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">
                          {t.post?.title ?? "Удалён"}
                        </p>
                        <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(t.score / maxTopScore) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {t.score.toLocaleString("ru-RU")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        {/* Right column */}
        <aside className="space-y-6">
          {/* Heatmap */}
          <Card title="Активность аудитории">
            <Heatmap grid={heatmap.grid} max={heatmap.max} />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-3">
              <span>Низкая активность</span>
              <span>Высокая активность</span>
            </div>
          </Card>

          {/* Subscribers growth */}
          <Card title="Прирост подписчиков">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-bold">+245</span>
              <span className="text-xs text-emerald-600 font-medium">↑ 12%</span>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={byDay} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="sub" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.62 0.20 285)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="oklch(0.62 0.20 285)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="reactions"
                  stroke="oklch(0.62 0.20 285)"
                  strokeWidth={2}
                  fill="url(#sub)"
                />
                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis hide />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* AI recommendations */}
          <Card>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <Lightbulb className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">Хотите получать больше охватов?</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Получите рекомендации по лучшему времени публикации.
                </p>
                <div className="flex gap-2 mt-3">
                  <select
                    className="flex h-9 flex-1 rounded-lg border border-input bg-background px-2 text-xs"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    <option value="vk">ВКонтакте</option>
                    <option value="telegram">Telegram</option>
                  </select>
                  <Button size="sm" onClick={handleRecommend}>
                    <TrendingUp className="h-3.5 w-3.5 mr-1" /> Подсказать
                  </Button>
                </div>
                {rec && (
                  <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1">
                    <p>
                      <strong>Часы:</strong> {rec.hours.map((h) => `${h}:00`).join(", ")}
                    </p>
                    <p>
                      <strong>Дни:</strong> {rec.days.join(", ")}
                    </p>
                    <p className="text-muted-foreground">{rec.note}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)]">
      {title && <h2 className="font-semibold mb-4">{title}</h2>}
      {children}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  trend: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center">
          {icon}
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums">{value.toLocaleString("ru-RU")}</div>
      <div className="text-xs text-emerald-600 font-medium mt-1">↑ {trend}</div>
    </div>
  );
}

function Heatmap({ grid, max }: { grid: number[][]; max: number }) {
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  return (
    <div className="space-y-1">
      {grid.map((row, di) => (
        <div key={di} className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground w-6 shrink-0">{days[di]}</span>
          <div className="flex gap-0.5 flex-1">
            {row.map((v, hi) => {
              const intensity = v / max;
              return (
                <div
                  key={hi}
                  title={`${days[di]} ${hi}:00 — ${v}`}
                  className="flex-1 aspect-square rounded-sm"
                  style={{
                    background:
                      v === 0
                        ? "oklch(0.96 0.012 285)"
                        : `oklch(${0.95 - intensity * 0.45} ${0.05 + intensity * 0.18} 285)`,
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1 pt-1">
        <span className="text-[10px] text-muted-foreground w-6 shrink-0" />
        <div className="flex gap-0.5 flex-1 text-[9px] text-muted-foreground justify-between px-0.5">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>
    </div>
  );
}
