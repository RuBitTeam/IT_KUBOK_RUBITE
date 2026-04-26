import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  listWorkspacePosts,
  listCategories,
  type WorkspacePost,
  type Category,
} from "@/lib/workspaces-api";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  PULLED_STATUS_LABEL,
  PULLED_STATUS_COLOR,
  type PostStatus,
} from "@/lib/posts-api";
import {
  listWorkspaceVkWallPosts,
  type ExternalVkPost,
} from "@/lib/vk-stats.functions";
import {
  listWorkspaceTgWallPosts,
  type ExternalTgPost,
} from "@/lib/tg-stats.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/w/$wsId/calendar")({
  component: WorkspaceCalendarPage,
});

function pluralPosts(n: number): string {
  const display = n > 9 ? 9 : n;
  const mod10 = display % 10;
  const mod100 = display % 100;
  if (mod10 === 1 && mod100 !== 11) return "пост";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "поста";
  return "постов";
}

type StatusFilter = PostStatus | "all" | "pulled";

const STATUSES: StatusFilter[] = ["all", "draft", "scheduled", "published", "pulled"];

type CalEntry =
  | {
      kind: "internal";
      id: string;
      title: string;
      status: PostStatus;
      publish_date: string;
      category_id: string | null;
      href: { to: "/posts/$id"; params: { id: string } };
    }
  | {
      kind: "pulled";
      id: string;
      title: string;
      publish_date: string;
      external_url: string;
      community_name: string;
    };

function WorkspaceCalendarPage() {
  const { wsId } = Route.useParams();
  const [posts, setPosts] = useState<WorkspacePost[]>([]);
  const [externalVk, setExternalVk] = useState<ExternalVkPost[]>([]);
  const [externalTg, setExternalTg] = useState<ExternalTgPost[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [openDay, setOpenDay] = useState<Date | null>(null);

  const fetchVk = useServerFn(listWorkspaceVkWallPosts);
  const fetchTg = useServerFn(listWorkspaceTgWallPosts);

  useEffect(() => {
    listWorkspacePosts(wsId, { includeDrafts: true }).then(setPosts);
    listCategories(wsId).then(setCategories).catch(() => setCategories([]));
    fetchVk({ data: { workspace_id: wsId, count: 100 } })
      .then((r) => {
        if (r.ok) setExternalVk(r.posts);
      })
      .catch(() => {});
    fetchTg({ data: { workspace_id: wsId, count: 100 } })
      .then((r) => {
        if (r.ok) setExternalTg(r.posts);
      })
      .catch(() => {});
  }, [wsId, fetchVk, fetchTg]);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const days = useMemo(() => buildMonth(cursor), [cursor]);

  // Build set of external ids that already exist as service posts (to dedupe).
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

  const byDay = useMemo(() => {
    const map = new Map<string, CalEntry[]>();

    const internalEntries: CalEntry[] = posts
      .filter((p) => p.publish_date)
      .map((p) => ({
        kind: "internal" as const,
        id: p.id,
        title: p.title || "Без заголовка",
        status: p.status,
        publish_date: p.publish_date!,
        category_id: p.category_id,
        href: { to: "/posts/$id" as const, params: { id: p.id } },
      }));

    const pulledVk: CalEntry[] = externalVk
      .filter((e) => !knownExternalIds.has(`${e.account_id}:${e.vk_post_id}`))
      .map((e) => ({
        kind: "pulled" as const,
        id: `vk:${e.account_id}:${e.vk_post_id}`,
        title: e.text.split("\n")[0]?.slice(0, 80) || "Без текста",
        publish_date: e.date,
        external_url: e.vk_url,
        community_name: e.community_name,
      }));

    const pulledTg: CalEntry[] = externalTg
      .filter((e) => !knownExternalIds.has(`${e.account_id}:${e.tg_post_id}`))
      .map((e) => ({
        kind: "pulled" as const,
        id: `tg:${e.account_id}:${e.tg_post_id}`,
        title: e.text.split("\n")[0]?.slice(0, 80) || "Без текста",
        publish_date: e.date,
        external_url: e.tg_url,
        community_name: e.community_name,
      }));

    const all = [...internalEntries, ...pulledVk, ...pulledTg].filter((entry) => {
      if (filter === "all") return true;
      if (filter === "pulled") return entry.kind === "pulled";
      return entry.kind === "internal" && entry.status === filter;
    });

    for (const entry of all) {
      const key = new Date(entry.publish_date).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    }
    return map;
  }, [posts, externalVk, externalTg, knownExternalIds, filter]);

  const monthLabel = cursor.toLocaleString("ru-RU", { month: "long", year: "numeric" });
  const dayItems = openDay ? byDay.get(openDay.toDateString()) ?? [] : [];

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Медиаплан пространства</h2>
          <p className="text-muted-foreground text-sm capitalize">{monthLabel}</p>
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

      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm border transition-colors",
              filter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:bg-muted",
            )}
          >
            {s === "all"
              ? "Все"
              : s === "pulled"
                ? PULLED_STATUS_LABEL
                : STATUS_LABEL[s]}
          </button>
        ))}
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
            const dow = (d.getDay() + 6) % 7; // 5=Sat, 6=Sun
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
                const cat = entry.category_id ? categoryMap.get(entry.category_id) : null;
                return (
                  <Link
                    key={entry.id}
                    to={entry.href.to}
                    params={entry.href.params}
                    onClick={() => setOpenDay(null)}
                    className="px-3 py-2 rounded-lg text-sm border border-border hover:bg-muted transition-colors flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{entry.title}</span>
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded shrink-0",
                          STATUS_COLOR[entry.status],
                        )}
                      >
                        {STATUS_LABEL[entry.status]}
                      </span>
                    </div>
                    <span
                      className="inline-flex items-center self-start text-[10px] px-2 py-0.5 rounded font-medium"
                      style={
                        cat
                          ? { backgroundColor: `${cat.color}22`, color: cat.color }
                          : undefined
                      }
                    >
                      {cat?.name ?? "Без рубрики"}
                    </span>
                  </Link>
                );
              }
              return (
                <a
                  key={entry.id}
                  href={entry.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpenDay(null)}
                  className="px-3 py-2 rounded-lg text-sm border border-border hover:bg-muted transition-colors flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{entry.title}</span>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 shrink-0",
                        PULLED_STATUS_COLOR,
                      )}
                    >
                      {PULLED_STATUS_LABEL}
                    </span>
                  </div>
                  <span className="inline-flex items-center self-start text-[10px] px-2 py-0.5 rounded font-medium bg-muted text-muted-foreground">
                    {entry.community_name}
                  </span>
                </a>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
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
