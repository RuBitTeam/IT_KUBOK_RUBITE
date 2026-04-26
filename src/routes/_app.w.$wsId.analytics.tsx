import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Eye,
  Users,
  TrendingUp,
  Lightbulb,
  RefreshCw,
  Radio,
  UserCheck,
  Heart,
  MessageCircle,
  Send,
  ExternalLink,
  ImageIcon,
  Trophy,
  AlertCircle,
  FileDown,
} from "lucide-react";
import {
  exportAnalyticsPdf,
  type AnalyticsTopPost,
  type AnalyticsDailyPoint,
  type AnalyticsComparisonItem,
  type AnalyticsRow,
} from "@/lib/analytics-pdf";
import { recommendBestTime } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  listWorkspaceVkAccounts,
  getVkCommunityStats,
  type VkCommunityStats,
} from "@/lib/vk-stats.functions";
import {
  listWorkspaceTgAccounts,
  getTgChannelStats,
  listWorkspaceTgPosts,
  listWorkspaceTgWallPosts,
  type TgChannelStats,
  type TgPostRow,
  type ExternalTgPost,
} from "@/lib/tg-stats.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/w/$wsId/analytics")({
  component: WorkspaceAnalyticsPage,
});

interface VkAcc {
  id: string;
  display_name: string;
  target_chat: string;
  status: string;
}

interface TgAcc {
  id: string;
  display_name: string;
  target_chat: string;
  status: string;
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
} as const;

type PlatformTab = "vk" | "telegram";

function WorkspaceAnalyticsPage() {
  const { wsId } = Route.useParams();
  const [platformTab, setPlatformTab] = useState<PlatformTab>("vk");
  const [vkAccounts, setVkAccounts] = useState<VkAcc[]>([]);
  const [tgAccounts, setTgAccounts] = useState<TgAcc[]>([]);
  const [activeTab, setActiveTab] = useState<string>("all"); // "all" or account_id
  const [vkStats, setVkStats] = useState<VkCommunityStats[]>([]);
  const [tgStats, setTgStats] = useState<TgChannelStats[]>([]);
  const [tgPosts, setTgPosts] = useState<TgPostRow[]>([]);
  const [tgWallPosts, setTgWallPosts] = useState<ExternalTgPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [recPlatform, setRecPlatform] = useState("vk");
  const [rec, setRec] = useState<{ hours: number[]; days: string[]; note: string } | null>(null);
  const [postCounts, setPostCounts] = useState({ total: 0, published: 0 });
  const [topPeriod, setTopPeriod] = useState<7 | 30 | 90>(7);
  const [wsName, setWsName] = useState<string>("");

  useEffect(() => {
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", wsId)
      .maybeSingle()
      .then(({ data }) => setWsName(data?.name ?? ""));
  }, [wsId]);

  // Load both platforms once
  useEffect(() => {
    (async () => {
      const [rVk, rTg] = await Promise.all([
        listWorkspaceVkAccounts({ data: { workspace_id: wsId } }),
        listWorkspaceTgAccounts({ data: { workspace_id: wsId } }),
      ]);
      if (rVk.ok) {
        setVkAccounts(
          rVk.accounts.map((a) => ({
            id: a.id,
            display_name: a.display_name,
            target_chat: a.target_chat,
            status: a.status,
          })),
        );
      }
      if (rTg.ok) {
        setTgAccounts(
          rTg.accounts.map((a) => ({
            id: a.id,
            display_name: a.display_name,
            target_chat: a.target_chat,
            status: a.status,
          })),
        );
      }
      // Auto-pick platform that has accounts (prefer existing tab if it has data)
      if (!rVk.ok || rVk.accounts.length === 0) {
        if (rTg.ok && rTg.accounts.length > 0) setPlatformTab("telegram");
      }

      const { data: posts } = await supabase
        .from("posts")
        .select("status")
        .eq("workspace_id", wsId);
      setPostCounts({
        total: posts?.length ?? 0,
        published: (posts ?? []).filter((p) => p.status === "published").length,
      });
    })();
  }, [wsId]);

  // Reset accountTab when platform changes
  useEffect(() => {
    setActiveTab("all");
  }, [platformTab]);

  const accounts = platformTab === "vk" ? vkAccounts : tgAccounts;

  const refresh = async () => {
    if (accounts.length === 0 && vkAccounts.length === 0 && tgAccounts.length === 0) return;
    setLoading(true);
    try {
      // For the active tab — respect the selected account scope.
      const activeIds = activeTab === "all" ? accounts.map((a) => a.id) : [activeTab];
      // For the OTHER platform — always pull all workspace accounts, so the
      // global "Сравнение сообществ" block has data from both networks.
      const allVkIds = vkAccounts.map((a) => a.id);
      const allTgIds = tgAccounts.map((a) => a.id);

      const vkIds = platformTab === "vk" ? activeIds : allVkIds;
      const tgIds = platformTab === "telegram" ? activeIds : allTgIds;

      const tasks: Promise<unknown>[] = [];

      if (vkIds.length > 0) {
        tasks.push(
          getVkCommunityStats({
            data: { account_ids: vkIds, days, workspace_id: wsId },
          }).then((r) => {
            if (r.ok) setVkStats(r.stats);
            else if (platformTab === "vk") toast.error(r.error ?? "Ошибка получения статистики");
          }),
        );
      } else {
        setVkStats([]);
      }

      if (tgIds.length > 0) {
        tasks.push(
          Promise.all([
            getTgChannelStats({ data: { account_ids: tgIds, workspace_id: wsId, days } }),
            listWorkspaceTgPosts({ data: { workspace_id: wsId, count: 50 } }),
            listWorkspaceTgWallPosts({ data: { workspace_id: wsId, count: 100 } }),
          ]).then(([rs, rp, rw]) => {
            if (rs.ok) setTgStats(rs.stats);
            else if (platformTab === "telegram")
              toast.error(rs.error ?? "Ошибка получения статистики Telegram");
            if (rp.ok) setTgPosts(rp.posts);
            if (rw.ok) setTgWallPosts(rw.posts);
          }),
        );
      } else {
        setTgStats([]);
        setTgPosts([]);
        setTgWallPosts([]);
      }

      await Promise.all(tasks);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vkAccounts, tgAccounts, activeTab, days, platformTab]);

  // ====== VK aggregation (existing logic) ======
  const vkChartData = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        views: number;
        reach: number;
        visitors: number;
        reach_subscribers: number;
        likes: number;
        comments: number;
        reposts: number;
        posts: number;
      }
    >();
    for (const s of vkStats) {
      for (const d of s.days) {
        const cur = map.get(d.date) ?? {
          date: d.date,
          views: 0,
          reach: 0,
          visitors: 0,
          reach_subscribers: 0,
          likes: 0,
          comments: 0,
          reposts: 0,
          posts: 0,
        };
        cur.views += d.views;
        cur.reach += d.reach;
        cur.visitors += d.visitors;
        cur.reach_subscribers += d.reach_subscribers;
        cur.likes += d.likes;
        cur.comments += d.comments;
        cur.reposts += d.reposts;
        cur.posts += d.posts;
        map.set(d.date, cur);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        engagement: d.likes + d.comments + d.reposts,
        er: d.reach > 0 ? Number((((d.likes + d.comments + d.reposts) / d.reach) * 100).toFixed(2)) : 0,
        label: new Date(d.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
      }));
  }, [vkStats]);

  const vkTotals = useMemo(
    () =>
      vkStats.reduce(
        (s, x) => ({
          views: s.views + x.totals.views,
          visitors: s.visitors + x.totals.visitors,
          reach: s.reach + x.totals.reach,
          reach_subscribers: s.reach_subscribers + x.totals.reach_subscribers,
          members: s.members + (x.members_count ?? 0),
          likes: s.likes + x.totals.likes,
          comments: s.comments + x.totals.comments,
          reposts: s.reposts + x.totals.reposts,
          posts: s.posts + x.totals.posts,
        }),
        {
          views: 0,
          visitors: 0,
          reach: 0,
          reach_subscribers: 0,
          members: 0,
          likes: 0,
          comments: 0,
          reposts: 0,
          posts: 0,
        },
      ),
    [vkStats],
  );

  // ====== TG aggregation ======
  const tgFilteredPosts = useMemo(() => {
    if (activeTab === "all") return tgPosts;
    return tgPosts.filter((p) => p.account_id === activeTab);
  }, [tgPosts, activeTab]);

  const tgTotals = useMemo(() => {
    const filtered =
      activeTab === "all" ? tgStats : tgStats.filter((s) => s.account_id === activeTab);
    return filtered.reduce(
      (s, x) => ({
        members: s.members + (x.members_count ?? 0),
        posts: s.posts + x.posts_count,
        period: s.period + x.total_published_at_period,
        channels: s.channels + 1,
      }),
      { members: 0, posts: 0, period: 0, channels: 0 },
    );
  }, [tgStats, activeTab]);

  const tgPostsByDay = useMemo(() => {
    const map = new Map<string, { date: string; posts: number }>();
    for (const p of tgFilteredPosts) {
      if (!p.published_at) continue;
      const d = p.published_at.slice(0, 10);
      const cur = map.get(d) ?? { date: d, posts: 0 };
      cur.posts += 1;
      map.set(d, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: new Date(d.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
      }));
  }, [tgFilteredPosts]);

  // Aggregate from external (pulled) TG wall posts within selected scope
  const tgWallAgg = useMemo(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let views = 0;
    let postsTotal = 0;
    let postsPeriod = 0;
    for (const p of tgWallPosts) {
      if (activeTab !== "all" && p.account_id !== activeTab) continue;
      postsTotal += 1;
      const t = p.date ? Date.parse(p.date) : NaN;
      const inPeriod = !Number.isFinite(t) || t >= cutoff;
      if (inPeriod) {
        postsPeriod += 1;
        views += p.views ?? 0;
      }
    }
    return { views, postsTotal, postsPeriod };
  }, [tgWallPosts, activeTab, days]);

  // Combined totals: pulled wall posts + posts published through the service (deduped where possible)
  const tgCombined = useMemo(() => {
    return {
      postsTotal: Math.max(tgTotals.posts, tgWallAgg.postsTotal),
      postsPeriod: Math.max(tgTotals.period, tgWallAgg.postsPeriod),
    };
  }, [tgTotals, tgWallAgg]);

  // ====== Top-5 popular posts (week / month / 90d) ======
  type TopPost = {
    key: string;
    platform: "vk" | "telegram";
    title: string;
    text: string;
    photo: string | null;
    date: string;
    views: number;
    engagement: number;
    score: number;
    url: string | null;
    community: string;
  };

  const topPosts = useMemo<TopPost[]>(() => {
    const cutoff = Date.now() - topPeriod * 24 * 60 * 60 * 1000;
    const all: TopPost[] = [];
    if (platformTab === "vk") {
      for (const s of vkStats) {
        if (activeTab !== "all" && s.account_id !== activeTab) continue;
        for (const p of s.top_posts ?? []) {
          const t = Date.parse(p.date);
          if (Number.isFinite(t) && t < cutoff) continue;
          all.push({
            key: `vk-${p.vk_post_id}`,
            platform: "vk",
            title: p.text.split("\n")[0]?.slice(0, 80) || "Без текста",
            text: p.text,
            photo: p.photo_url,
            date: p.date,
            views: p.views,
            engagement: p.engagement,
            score: p.views + p.engagement * 5,
            url: p.vk_url,
            community: s.group_name ?? s.display_name,
          });
        }
      }
    } else {
      for (const p of tgWallPosts) {
        if (activeTab !== "all" && p.account_id !== activeTab) continue;
        const t = p.date ? Date.parse(p.date) : NaN;
        if (Number.isFinite(t) && t < cutoff) continue;
        all.push({
          key: `tg-${p.account_id}-${p.tg_post_id}`,
          platform: "telegram",
          title: (p.text || "Без текста").split("\n")[0]?.slice(0, 80) || "Без текста",
          text: p.text,
          photo: p.photo_url,
          date: p.date,
          views: p.views,
          engagement: 0,
          score: p.views,
          url: p.tg_url,
          community: p.community_name,
        });
      }
    }
    return all.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [vkStats, tgWallPosts, topPeriod, activeTab, platformTab]);

  // ====== Inactivity reminder (no posts for >= 7 days) ======
  const lastPublishedAt = useMemo(() => {
    let latest = 0;
    for (const s of vkStats) {
      for (const p of s.top_posts ?? []) {
        const t = Date.parse(p.date);
        if (Number.isFinite(t) && t > latest) latest = t;
      }
    }
    for (const p of tgWallPosts) {
      const t = p.date ? Date.parse(p.date) : NaN;
      if (Number.isFinite(t) && t > latest) latest = t;
    }
    for (const p of tgPosts) {
      const t = p.published_at ? Date.parse(p.published_at) : NaN;
      if (Number.isFinite(t) && t > latest) latest = t;
    }
    return latest > 0 ? latest : null;
  }, [vkStats, tgWallPosts, tgPosts]);

  const inactivityDays = useMemo(() => {
    if (!lastPublishedAt) return null;
    return Math.floor((Date.now() - lastPublishedAt) / (24 * 60 * 60 * 1000));
  }, [lastPublishedAt]);

  // ====== Social network comparison (bar chart) ======
  type AccountSeries = {
    accountId: string;
    name: string;
    platform: "vk" | "telegram";
    color: string;
    members: number;
    posts: number;
    views: number;
    engagement: number;
  };
  const PALETTE = [
    "oklch(0.62 0.20 285)",
    "oklch(0.70 0.15 230)",
    "oklch(0.70 0.20 25)",
    "oklch(0.65 0.18 145)",
    "oklch(0.65 0.22 340)",
    "oklch(0.70 0.18 60)",
    "oklch(0.65 0.18 200)",
  ];

  // All accounts across platforms (used for PDF export)
  const allAccountSeries = useMemo<AccountSeries[]>(() => {
    const list: AccountSeries[] = [];
    let idx = 0;
    for (const s of vkStats) {
      list.push({
        accountId: s.account_id,
        name: s.group_name ?? s.display_name,
        platform: "vk",
        color: PALETTE[idx % PALETTE.length],
        members: s.members_count ?? 0,
        posts: s.totals.posts,
        views: s.totals.views,
        engagement: s.totals.likes + s.totals.comments + s.totals.reposts,
      });
      idx++;
    }
    for (const s of tgStats) {
      const tgViews = tgWallPosts
        .filter((p) => p.account_id === s.account_id)
        .reduce((sum, p) => sum + (p.views ?? 0), 0);
      list.push({
        accountId: s.account_id,
        name: s.channel_title ?? s.display_name,
        platform: "telegram",
        color: PALETTE[idx % PALETTE.length],
        members: s.members_count ?? 0,
        posts: s.posts_count,
        views: tgViews,
        engagement: 0,
      });
      idx++;
    }
    return list;
  }, [vkStats, tgStats, tgWallPosts]);

  // The on-screen "Сравнение сообществ" block is global: it shows ALL connected
  // communities from every platform regardless of the active tab.
  const accountSeries = allAccountSeries;

  const comparisonData = useMemo(() => {
    if (accountSeries.length < 2) return [];
    const metrics: Array<{ key: keyof AccountSeries; label: string }> = [
      { key: "members", label: "Подписчики" },
      { key: "posts", label: "Посты" },
      { key: "views", label: "Просмотры" },
      { key: "engagement", label: "Вовлечённость" },
    ];
    return metrics.map((m) => {
      const row: Record<string, string | number> = { metric: m.label };
      for (const a of accountSeries) {
        row[a.accountId] = a[m.key] as number;
      }
      return row;
    });
  }, [accountSeries]);

  const handleRecommend = async () => {
    const r = await recommendBestTime({ data: { platform: recPlatform } });
    setRec(r);
  };

  const handleExportPdf = () => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const platformLabel = platformTab === "vk" ? "ВКонтакте" : "Telegram";
    const scopeLabel =
      activeTab === "all"
        ? `Все ${platformTab === "vk" ? "сообщества" : "каналы"}`
        : accounts.find((a) => a.id === activeTab)?.display_name ?? "—";

    const kpis =
      platformTab === "vk"
        ? [
            { label: "Подписчики", value: new Intl.NumberFormat("ru-RU").format(vkTotals.members) },
            { label: "Просмотры", value: new Intl.NumberFormat("ru-RU").format(vkTotals.views) },
            {
              label: "Реакции",
              value: new Intl.NumberFormat("ru-RU").format(
                vkTotals.likes + vkTotals.comments + vkTotals.reposts,
              ),
            },
            { label: "Постов", value: new Intl.NumberFormat("ru-RU").format(vkTotals.posts) },
          ]
        : [
            { label: "Подписчики", value: new Intl.NumberFormat("ru-RU").format(tgTotals.members) },
            { label: "Просмотры", value: new Intl.NumberFormat("ru-RU").format(tgWallAgg.views) },
            { label: "Постов всего", value: new Intl.NumberFormat("ru-RU").format(tgCombined.postsTotal) },
            { label: "За период", value: new Intl.NumberFormat("ru-RU").format(tgCombined.postsPeriod) },
          ];

    const topPostsForPdf: AnalyticsTopPost[] = topPosts.map((p, i) => ({
      rank: i + 1,
      community: p.community,
      platform: p.platform,
      date: p.date,
      title: p.title,
      views: p.views,
      engagement: p.engagement,
      url: p.url,
    }));

    // Daily series for line chart
    const daily: AnalyticsDailyPoint[] =
      platformTab === "vk"
        ? vkChartData.map((d) => ({
            date: d.date,
            views: d.views,
            engagement: d.engagement,
          }))
        : tgPostsByDay.map((d) => ({
            date: d.date,
            views: 0,
            engagement: d.posts,
          }));

    // Comparison: ALL workspace accounts (both platforms), regardless of current tab/scope
    const comparison: AnalyticsComparisonItem[] = allAccountSeries.map((a) => ({
      name: a.name,
      platform: a.platform,
      members: a.members,
      posts: a.posts,
      views: a.views,
      engagement: a.engagement,
    }));

    // All posts for the period (VK + TG together), sorted by date desc
    const rows: AnalyticsRow[] = [];
    for (const s of vkStats) {
      for (const p of s.top_posts ?? []) {
        const t = Date.parse(p.date);
        if (Number.isFinite(t) && t < cutoff) continue;
        rows.push({
          community: s.group_name ?? s.display_name,
          platform: "vk",
          date: p.date,
          title: p.text.split("\n")[0]?.slice(0, 120) || "Без текста",
          views: p.views,
          engagement: p.engagement,
          url: p.vk_url,
        });
      }
    }
    for (const p of tgWallPosts) {
      const t = p.date ? Date.parse(p.date) : NaN;
      if (Number.isFinite(t) && t < cutoff) continue;
      rows.push({
        community: p.community_name,
        platform: "telegram",
        date: p.date,
        title: (p.text || "Без текста").split("\n")[0]?.slice(0, 120) || "Без текста",
        views: p.views,
        engagement: 0,
        url: p.tg_url,
      });
    }
    rows.sort((a, b) => {
      const ta = Date.parse(a.date) || 0;
      const tb = Date.parse(b.date) || 0;
      return tb - ta;
    });

    exportAnalyticsPdf({
      workspaceName: wsName || "Аналитика",
      platformLabel,
      scopeLabel,
      periodLabel: `Период: ${days} дн.`,
      generatedAt: new Date().toLocaleString("ru-RU"),
      kpis,
      topPosts: topPostsForPdf,
      daily,
      comparison,
      rows,
    });
  };

  const showEmpty = accounts.length === 0;

  return (
    <div className="space-y-6">
      {/* Platform switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
          <TabBtn
            active={platformTab === "vk"}
            onClick={() => setPlatformTab("vk")}
          >
            ВКонтакте {vkAccounts.length > 0 && `(${vkAccounts.length})`}
          </TabBtn>
          <TabBtn
            active={platformTab === "telegram"}
            onClick={() => setPlatformTab("telegram")}
          >
            Telegram {tgAccounts.length > 0 && `(${tgAccounts.length})`}
          </TabBtn>
        </div>
      </div>

      {/* Account tabs */}
      {!showEmpty ? (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 flex-wrap">
            <TabBtn active={activeTab === "all"} onClick={() => setActiveTab("all")}>
              Все {platformTab === "vk" ? "сообщества" : "каналы"}
            </TabBtn>
            {accounts.map((a) => (
              <TabBtn key={a.id} active={activeTab === a.id} onClick={() => setActiveTab(a.id)}>
                {a.display_name}
              </TabBtn>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
              Обновить
            </Button>
            <Button size="sm" variant="default" onClick={handleExportPdf}>
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
              Экспорт PDF
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {platformTab === "vk"
              ? "Подключите VK сообщество в разделе «Соцсети», чтобы увидеть аналитику."
              : "Подключите Telegram-канал в разделе «Соцсети», чтобы увидеть аналитику."}
          </p>
        </div>
      )}

      {/* Inactivity reminder */}
      {!showEmpty && inactivityDays !== null && inactivityDays >= 7 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Постов давно не было — {inactivityDays}{" "}
              {inactivityDays % 10 === 1 && inactivityDays % 100 !== 11
                ? "день"
                : [2, 3, 4].includes(inactivityDays % 10) &&
                    ![12, 13, 14].includes(inactivityDays % 100)
                  ? "дня"
                  : "дней"}{" "}
              без публикаций
            </p>
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-0.5">
              Регулярные публикации поддерживают вовлечённость аудитории. Запланируйте новый пост.
            </p>
          </div>
        </div>
      )}

      {/* Top-5 popular posts */}
      {!showEmpty && (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <Trophy className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold">Топ-5 популярных постов</h2>
                <p className="text-xs text-muted-foreground">
                  Помогает понять, что заходит вашей аудитории
                </p>
              </div>
            </div>
            <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
              <TabBtn active={topPeriod === 7} onClick={() => setTopPeriod(7)}>
                Неделя
              </TabBtn>
              <TabBtn active={topPeriod === 30} onClick={() => setTopPeriod(30)}>
                Месяц
              </TabBtn>
              <TabBtn active={topPeriod === 90} onClick={() => setTopPeriod(90)}>
                90 дней
              </TabBtn>
            </div>
          </div>
          {topPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              За выбранный период нет данных по постам
            </p>
          ) : (
            <ol className="space-y-3">
              {topPosts.map((p, i) => (
                <li
                  key={p.key}
                  className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors"
                >
                  <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold text-sm shrink-0">
                    {i + 1}
                  </div>
                  {p.photo ? (
                    <img
                      src={p.photo}
                      alt=""
                      className="h-12 w-12 rounded-md object-cover shrink-0 border border-border"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted grid place-items-center text-muted-foreground shrink-0">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{p.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {p.platform === "vk" ? "ВКонтакте" : "Telegram"} · {p.community}
                      {p.date &&
                        ` · ${new Date(p.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        <span className="font-semibold text-foreground tabular-nums">
                          {p.views.toLocaleString("ru-RU")}
                        </span>
                      </span>
                      {p.engagement > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          <span className="font-semibold text-foreground tabular-nums">
                            {p.engagement.toLocaleString("ru-RU")}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      Открыть
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Social network comparison */}
      {!showEmpty && accountSeries.length >= 2 && (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4">
            <h2 className="font-semibold">Сравнение сообществ</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Все подключённые сообщества и каналы пространства — VK и Telegram вместе.
            </p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.93 0.012 280)" />
              <XAxis dataKey="metric" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name) => {
                  const acc = accountSeries.find((a) => a.accountId === String(name));
                  return [value.toLocaleString("ru-RU"), acc?.name ?? String(name)];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => {
                  const acc = accountSeries.find((a) => a.accountId === String(value));
                  return acc ? `${acc.name} (${acc.platform === "vk" ? "VK" : "TG"})` : String(value);
                }}
              />
              {accountSeries.map((a) => (
                <Bar
                  key={a.accountId}
                  dataKey={a.accountId}
                  fill={a.color}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* VK panel */}
      {!showEmpty && platformTab === "vk" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard icon={<UserCheck className="h-4 w-4" />} label="Посещения" value={vkTotals.visitors} />
            <KpiCard icon={<Eye className="h-4 w-4" />} label="Просмотры контента" value={vkTotals.views} />
            <KpiCard icon={<Radio className="h-4 w-4" />} label="Охват контента" value={vkTotals.reach} />
            <KpiCard icon={<Users className="h-4 w-4" />} label="Подписчики" value={vkTotals.members} />
            <KpiCard icon={<Heart className="h-4 w-4" />} label="Лайки" value={vkTotals.likes} />
            <KpiCard icon={<MessageCircle className="h-4 w-4" />} label="Комментарии" value={vkTotals.comments} />
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-6">
              <Card title={`Охват и просмотры (${days} дн.)`}>
                {loading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Загрузка…</p>
                ) : vkChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Нет данных за выбранный период</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={vkChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="vk-reach" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="oklch(0.62 0.20 285)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="oklch(0.62 0.20 285)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="vk-views" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="oklch(0.70 0.15 230)" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="oklch(0.70 0.15 230)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.93 0.012 280)" />
                      <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="reach" name="Охват" stroke="oklch(0.62 0.20 285)" strokeWidth={2.5} fill="url(#vk-reach)" />
                      <Area type="monotone" dataKey="views" name="Просмотры" stroke="oklch(0.70 0.15 230)" strokeWidth={2} fill="url(#vk-views)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card title="Уникальные посетители и подписчики в охвате">
                {vkChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Нет данных</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={vkChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.93 0.012 280)" />
                      <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="visitors" name="Уник. посетители" stroke="oklch(0.65 0.18 200)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="reach_subscribers" name="Охват подписчиков" stroke="oklch(0.60 0.18 145)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card title="Реакции по дням (лайки, комментарии, репосты)">
                {vkChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Нет данных</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={vkChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.93 0.012 280)" />
                      <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="likes" name="Лайки" stackId="eng" fill="oklch(0.70 0.20 25)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="comments" name="Комментарии" stackId="eng" fill="oklch(0.70 0.18 60)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="reposts" name="Репосты" stackId="eng" fill="oklch(0.62 0.20 285)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card title="Вовлечённость (ER, %)">
                {vkChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Нет данных</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={vkChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="vk-er" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="oklch(0.65 0.22 340)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="oklch(0.65 0.22 340)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.93 0.012 280)" />
                      <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                      <Area type="monotone" dataKey="er" name="ER, %" stroke="oklch(0.65 0.22 340)" strokeWidth={2} fill="url(#vk-er)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card title="Сообщества">
                {vkStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет данных</p>
                ) : (
                  <ul className="space-y-3">
                    {vkStats.map((s) => (
                      <li key={s.account_id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center font-bold shrink-0">
                          {(s.group_name ?? s.display_name).slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.group_name ?? s.display_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.members_count?.toLocaleString("ru-RU") ?? "—"} подписчиков
                            {s.error && <span className="text-destructive"> · {s.error}</span>}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <div>
                            <span className="text-muted-foreground">Охват: </span>
                            <span className="font-semibold tabular-nums">
                              {s.totals.reach.toLocaleString("ru-RU")}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Просм.: </span>
                            <span className="font-semibold tabular-nums">
                              {s.totals.views.toLocaleString("ru-RU")}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <RightSidebar
              postCounts={postCounts}
              members={vkTotals.members}
              recPlatform={recPlatform}
              setRecPlatform={setRecPlatform}
              rec={rec}
              onRecommend={handleRecommend}
            />
          </div>
        </>
      )}

      {/* Telegram panel */}
      {!showEmpty && platformTab === "telegram" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard icon={<Users className="h-4 w-4" />} label="Подписчики" value={tgTotals.members} />
            <KpiCard icon={<Eye className="h-4 w-4" />} label={`Просмотры за ${days} дн.`} value={tgWallAgg.views} />
            <KpiCard icon={<Send className="h-4 w-4" />} label="Каналов" value={tgTotals.channels} />
            <KpiCard icon={<Send className="h-4 w-4" />} label="Постов в канале" value={tgCombined.postsTotal} />
            <KpiCard icon={<Send className="h-4 w-4" />} label={`Постов за ${days} дн.`} value={tgCombined.postsPeriod} />
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-4 py-3 text-xs">
            Telegram Bot API не отдаёт ботам просмотры и реакции на посты. Поэтому просмотры
            подтягиваются с публичной страницы канала (t.me/s/&lt;username&gt;) — суммируются
            по подтянутым постам за выбранный период. Для приватных каналов просмотры недоступны.
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-6">
              <Card title={`Публикации по дням (${days} дн.)`}>
                {tgPostsByDay.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Через сервис ничего не публиковалось за выбранный период
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={tgPostsByDay} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.93 0.012 280)" />
                      <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="posts" name="Публикации" fill="oklch(0.70 0.15 230)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card title="Каналы">
                {tgStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет данных</p>
                ) : (
                  <ul className="space-y-3">
                    {tgStats.map((s) => (
                      <li key={s.account_id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                        <div className="h-10 w-10 rounded-xl bg-[oklch(0.70_0.15_230)]/15 text-[oklch(0.55_0.15_230)] grid place-items-center font-bold shrink-0">
                          {(s.channel_title ?? s.display_name).slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {s.channel_title ?? s.display_name}
                            {s.channel_username && (
                              <span className="text-muted-foreground font-normal ml-1">
                                @{s.channel_username}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.members_count?.toLocaleString("ru-RU") ?? "—"} подписчиков
                            {s.error && <span className="text-destructive"> · {s.error}</span>}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <div>
                            <span className="text-muted-foreground">Постов: </span>
                            <span className="font-semibold tabular-nums">
                              {s.posts_count.toLocaleString("ru-RU")}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">За {days} дн.: </span>
                            <span className="font-semibold tabular-nums">
                              {s.total_published_at_period.toLocaleString("ru-RU")}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Опубликованные посты">
                {tgFilteredPosts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Нет постов</p>
                ) : (
                  <ul className="space-y-2">
                    {tgFilteredPosts.slice(0, 20).map((p) => (
                      <li
                        key={`${p.post_id}-${p.account_id}`}
                        className="flex items-start gap-3 p-3 rounded-xl border border-border"
                      >
                        {p.media_url ? (
                          <img
                            src={p.media_url.split(/\r?\n/)[0]?.trim() || p.media_url}
                            alt=""
                            className="h-12 w-12 rounded-md object-cover shrink-0 border border-border"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-md bg-muted grid place-items-center text-muted-foreground shrink-0">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{p.title || "Без заголовка"}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{p.content || "—"}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {p.community_name}
                            {p.published_at &&
                              ` · ${new Date(p.published_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                          </p>
                        </div>
                        {p.tg_url && (
                          <a
                            href={p.tg_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                          >
                            Открыть
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <RightSidebar
              postCounts={postCounts}
              members={tgTotals.members}
              recPlatform={recPlatform}
              setRecPlatform={setRecPlatform}
              rec={rec}
              onRecommend={handleRecommend}
            />
          </div>
        </>
      )}
    </div>
  );
}

function RightSidebar({
  postCounts,
  members,
  recPlatform,
  setRecPlatform,
  rec,
  onRecommend,
}: {
  postCounts: { total: number; published: number };
  members: number;
  recPlatform: string;
  setRecPlatform: (v: string) => void;
  rec: { hours: number[]; days: string[]; note: string } | null;
  onRecommend: () => void;
}) {
  return (
    <aside className="space-y-6">
      <Card>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Лучшее время публикации</h3>
            <p className="text-xs text-muted-foreground mt-1">
              AI подскажет оптимальные часы и дни для выбранной платформы.
            </p>
            <div className="flex gap-2 mt-3">
              <select
                className="flex h-9 flex-1 rounded-lg border border-input bg-background px-2 text-xs"
                value={recPlatform}
                onChange={(e) => setRecPlatform(e.target.value)}
              >
                <option value="vk">ВКонтакте</option>
                <option value="telegram">Telegram</option>
              </select>
              <Button size="sm" onClick={onRecommend}>
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

      <Card title="Сводка по постам">
        <ul className="text-sm space-y-2">
          <li className="flex justify-between">
            <span className="text-muted-foreground">Всего постов</span>
            <span className="font-semibold tabular-nums">{postCounts.total}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">Опубликовано</span>
            <span className="font-semibold tabular-nums">{postCounts.published}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">Подписчиков всего</span>
            <span className="font-semibold tabular-nums">{members.toLocaleString("ru-RU")}</span>
          </li>
        </ul>
      </Card>
    </aside>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center">
          {icon}
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums">
        {value.toLocaleString("ru-RU")}
        {suffix && <span className="text-lg text-muted-foreground ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
