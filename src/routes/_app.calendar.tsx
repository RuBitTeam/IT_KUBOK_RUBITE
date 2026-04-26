import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  PULLED_STATUS_LABEL,
  PULLED_STATUS_COLOR,
  type PostStatus,
  type Platform,
} from "@/lib/posts-api";
import { listMyWorkspaces, type WorkspaceWithRole } from "@/lib/workspaces-api";
import {
  listWorkspaceVkWallPosts,
  type ExternalVkPost,
} from "@/lib/vk-stats.functions";
import {
  listWorkspaceTgWallPosts,
  type ExternalTgPost,
} from "@/lib/tg-stats.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

function pluralPosts(n: number): string {
  const display = n > 9 ? 9 : n;
  const mod10 = display % 10;
  const mod100 = display % 100;
  if (mod10 === 1 && mod100 !== 11) return "пост";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "поста";
  return "постов";
}

type StatusFilter = PostStatus | "pulled";

const ALL_STATUSES: StatusFilter[] = ["draft", "scheduled", "published", "failed", "pulled"];
const PLATFORMS: Array<Platform | "all"> = ["all", "vk", "telegram"];
const PLATFORM_LABEL: Record<string, string> = {
  vk: "VK",
  telegram: "Telegram",
};

interface CalPost {
  id: string;
  title: string;
  status: PostStatus;
  platform: Platform;
  publish_date: string | null;
  workspace_id: string;
  category_id: string | null;
  external_post_ids: Record<string, string> | null;
}

interface PulledEntry {
  id: string;
  title: string;
  publish_date: string;
  workspace_id: string;
  platform: "vk" | "telegram";
  external_url: string;
  community_name: string;
}

function CalendarPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<CalPost[]>([]);
  const [pulled, setPulled] = useState<PulledEntry[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([]);
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(new Map());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [statusSelected, setStatusSelected] = useState<Set<StatusFilter>>(
    () => new Set(ALL_STATUSES),
  );
  const [wsFilter, setWsFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [openDay, setOpenDay] = useState<Date | null>(null);

  const fetchVk = useServerFn(listWorkspaceVkWallPosts);
  const fetchTg = useServerFn(listWorkspaceTgWallPosts);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const ws = await listMyWorkspaces(user.id);
      if (cancelled) return;
      setWorkspaces(ws);
      const { data } = await supabase
        .from("posts")
        .select(
          "id, title, status, platform, publish_date, workspace_id, category_id, external_post_ids",
        );
      if (cancelled) return;
      setPosts((data ?? []) as CalPost[]);
      const { data: cats } = await supabase.from("categories").select("id, name");
      if (cancelled) return;
      setCategoryNames(new Map((cats ?? []).map((c) => [c.id as string, c.name as string])));

      // Fetch external posts for every workspace in parallel
      const externalEntries: PulledEntry[] = [];
      await Promise.all(
        ws.map(async (w) => {
          try {
            const [vkRes, tgRes] = await Promise.all([
              fetchVk({ data: { workspace_id: w.id, count: 100 } }),
              fetchTg({ data: { workspace_id: w.id, count: 100 } }),
            ]);
            if (vkRes.ok) {
              for (const e of vkRes.posts) {
                externalEntries.push({
                  id: `vk:${w.id}:${e.account_id}:${e.vk_post_id}`,
                  title: e.text.split("\n")[0]?.slice(0, 80) || "Без текста",
                  publish_date: e.date,
                  workspace_id: w.id,
                  platform: "vk",
                  external_url: e.vk_url,
                  community_name: e.community_name,
                });
              }
            }
            if (tgRes.ok) {
              for (const e of tgRes.posts) {
                externalEntries.push({
                  id: `tg:${w.id}:${e.account_id}:${e.tg_post_id}`,
                  title: e.text.split("\n")[0]?.slice(0, 80) || "Без текста",
                  publish_date: e.date,
                  workspace_id: w.id,
                  platform: "telegram",
                  external_url: e.tg_url,
                  community_name: e.community_name,
                });
              }
            }
          } catch {
            /* ignore individual workspace failures */
          }
        }),
      );
      if (!cancelled) setPulled(externalEntries);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, fetchVk, fetchTg]);

  const wsNames = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w.name])),
    [workspaces],
  );

  const days = useMemo(() => buildMonth(cursor), [cursor]);

  // Dedupe pulled posts that already exist as service posts (matched via external_post_ids).
  const knownExternalIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of posts) {
      const ext = (p.external_post_ids ?? {}) as Record<string, string>;
      for (const [accId, postId] of Object.entries(ext)) {
        if (postId) s.add(`${accId}:${postId}`);
      }
    }
    return s;
  }, [posts]);

  type DayEntry =
    | { kind: "internal"; post: CalPost }
    | { kind: "pulled"; entry: PulledEntry };

  const byDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();

    const internalEntries: DayEntry[] = posts
      .filter((p) => p.publish_date)
      .filter((p) => statusSelected.has(p.status))
      .filter((p) => wsFilter === "all" || p.workspace_id === wsFilter)
      .filter((p) => platformFilter === "all" || p.platform === platformFilter)
      .map((p) => ({ kind: "internal" as const, post: p }));

    const pulledEntries: DayEntry[] = statusSelected.has("pulled")
      ? pulled
          .filter((e) => {
            // dedupe vs service posts
            const acc = e.id.split(":")[1]; // we don't have account_id directly here, fallback to id-based dedupe
            void acc;
            return true;
          })
          .filter((e) => {
            // Build the original key "accountId:postId"
            const parts = e.id.split(":");
            // id format: "<plat>:<wsId>:<accountId>:<postId>"
            const accountId = parts[2];
            const postId = parts.slice(3).join(":");
            return !knownExternalIds.has(`${accountId}:${postId}`);
          })
          .filter((e) => wsFilter === "all" || e.workspace_id === wsFilter)
          .filter((e) => platformFilter === "all" || e.platform === platformFilter)
          .map((e) => ({ kind: "pulled" as const, entry: e }))
      : [];

    for (const entry of [...internalEntries, ...pulledEntries]) {
      const date =
        entry.kind === "internal" ? entry.post.publish_date! : entry.entry.publish_date;
      const key = new Date(date).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    }
    return map;
  }, [posts, pulled, knownExternalIds, statusSelected, wsFilter, platformFilter]);

  const monthLabel = cursor.toLocaleString("ru-RU", { month: "long", year: "numeric" });
  const dayItems = openDay ? byDay.get(openDay.toDateString()) ?? [] : [];

  const toggleStatus = (s: StatusFilter) => {
    setStatusSelected((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  };

  const statusButtonLabel =
    statusSelected.size === ALL_STATUSES.length
      ? "Все статусы"
      : statusSelected.size === 0
        ? "Статус не выбран"
        : `Статусы: ${statusSelected.size}`;

  const statusFilterLabel = (s: StatusFilter): string =>
    s === "pulled" ? PULLED_STATUS_LABEL : STATUS_LABEL[s];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Общий календарь</h1>
          <p className="text-muted-foreground mt-1 capitalize">
            {monthLabel} • Все ваши пространства
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
            }
          >
            Сегодня
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <FilterSelect
          label="Пространство"
          value={wsFilter}
          onChange={setWsFilter}
          options={[
            { value: "all", label: "Все" },
            ...workspaces.map((w) => ({ value: w.id, label: w.name })),
          ]}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground px-1">Статус</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between font-normal">
                <span className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5" />
                  {statusButtonLabel}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Показывать статусы</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_STATUSES.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={statusSelected.has(s)}
                  onCheckedChange={() => toggleStatus(s)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {statusFilterLabel(s)}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={statusSelected.size === ALL_STATUSES.length}
                onCheckedChange={() =>
                  setStatusSelected(
                    statusSelected.size === ALL_STATUSES.length
                      ? new Set()
                      : new Set(ALL_STATUSES),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                Все
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <FilterSelect
          label="Соцсеть"
          value={platformFilter}
          onChange={(v) => setPlatformFilter(v as Platform | "all")}
          options={PLATFORMS.map((p) => ({
            value: p,
            label: p === "all" ? "Все" : PLATFORM_LABEL[p] ?? p,
          }))}
        />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground border-b border-border">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d, i) => (
            <div
              key={d}
              className={cn(
                "px-2 py-2 text-center",
                (i === 5 || i === 6) && "text-foreground/80",
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const today = d.toDateString() === new Date().toDateString();
            const items = byDay.get(d.toDateString()) ?? [];
            const count = items.length;
            const dow = (d.getDay() + 6) % 7; // 0=Mon, 5=Sat, 6=Sun
            const isWeekend = dow === 5 || dow === 6;
            return (
              <button
                type="button"
                key={i}
                onClick={() => count > 0 && setOpenDay(d)}
                className={cn(
                  "min-h-24 sm:min-h-28 border-r border-b border-border p-2 flex flex-col gap-2 text-left transition-colors",
                  !inMonth && "bg-muted/40 text-muted-foreground",
                  inMonth && isWeekend && "bg-accent/30",
                  count > 0 ? "hover:bg-muted cursor-pointer" : "cursor-default",
                )}
              >
                <div
                  className={cn(
                    "text-xs font-medium text-right",
                    today &&
                      "inline-flex justify-center items-center bg-primary text-primary-foreground rounded-full w-6 h-6 ml-auto",
                  )}
                >
                  {d.getDate()}
                </div>
                {count > 0 && (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-semibold">
                      {count > 9 ? "9+" : count} {pluralPosts(count)}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {openDay?.toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            {dayItems.map((entry) => {
              if (entry.kind === "internal") {
                const p = entry.post;
                const wsName = wsNames.get(p.workspace_id) ?? "";
                const catName = p.category_id ? categoryNames.get(p.category_id) : null;
                return (
                  <Link
                    key={p.id}
                    to="/posts/$id"
                    params={{ id: p.id }}
                    onClick={() => setOpenDay(null)}
                    className="px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{p.title}</span>
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded shrink-0",
                          STATUS_COLOR[p.status],
                        )}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {wsName}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {catName ?? "Без рубрики"}
                      </span>
                    </div>
                  </Link>
                );
              }
              const e = entry.entry;
              const wsName = wsNames.get(e.workspace_id) ?? "";
              return (
                <a
                  key={e.id}
                  href={e.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpenDay(null)}
                  className="px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{e.title}</span>
                    <span
                      className={cn("text-[10px] px-2 py-0.5 shrink-0", PULLED_STATUS_COLOR)}
                    >
                      {PULLED_STATUS_LABEL}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {wsName}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {e.community_name}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground px-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-border bg-card text-sm h-10"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildMonth(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startWeekday = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - startWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
