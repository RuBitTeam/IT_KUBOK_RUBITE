import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  Settings,
  History,
  X,
  Link2,
  Loader2,
  Clock,
  Lightbulb,
  TrendingUp,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  listSessions,
  createSession,
  deleteSession,
  listMessages,
  listSources,
  addSource,
  deleteSource,
  runCreative,
} from "@/lib/creative.functions";

export const Route = createFileRoute("/_app/creative")({
  component: CreativePage,
});

type Action = "chat" | "trends" | "idea" | "timing" | "headlines" | "remix";

interface SessionRow {
  id: string;
  title: string;
  updated_at: string;
}
interface MessageRow {
  id: string;
  role: "user" | "assistant";
  action: Action;
  content: string;
  created_at: string;
}
interface SourceRow {
  id: string;
  url: string;
  label: string | null;
  platform: string | null;
}

const QUICK_ACTIONS: { key: Action; label: string; icon: typeof TrendingUp; placeholder: string }[] = [
  {
    key: "trends",
    label: "Тренды у молодёжи",
    icon: TrendingUp,
    placeholder: "Анализируй тренды последних 7 дней по моим сообществам",
  },
  {
    key: "idea",
    label: "Идея поста",
    icon: Lightbulb,
    placeholder: "Тема: открытие нового пространства для подростков",
  },
  {
    key: "timing",
    label: "Тайминг-советник",
    icon: Clock,
    placeholder: "Когда лучше опубликовать анонс концерта в эту субботу?",
  },
  {
    key: "headlines",
    label: "Вирусные заголовки",
    icon: Megaphone,
    placeholder: "Тема: хакатон с призовым фондом 100 000 ₽",
  },
  {
    key: "remix",
    label: "Ремикс контента",
    icon: RefreshCw,
    placeholder: "Старый пост: «Итоги летней школы волонтёров — 120 ребят, 5 проектов…»",
  },
];

function CreativePage() {
  const listSessionsFn = useServerFn(listSessions);
  const createSessionFn = useServerFn(createSession);
  const deleteSessionFn = useServerFn(deleteSession);
  const listMessagesFn = useServerFn(listMessages);
  const listSourcesFn = useServerFn(listSources);
  const addSourceFn = useServerFn(addSource);
  const deleteSourceFn = useServerFn(deleteSource);
  const runCreativeFn = useServerFn(runCreative);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [input, setInput] = useState("");
  const [pendingAction, setPendingAction] = useState<Action>("chat");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Загрузка
  const loadSessions = async () => {
    const r = await listSessionsFn();
    setSessions(r.sessions as SessionRow[]);
  };
  const loadMessages = async (id: string) => {
    const r = await listMessagesFn({ data: { sessionId: id } });
    setMessages(r.messages as MessageRow[]);
  };
  const loadSources = async () => {
    const r = await listSourcesFn();
    setSources(r.sources as SourceRow[]);
  };

  useEffect(() => {
    loadSessions();
    loadSources();
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
    else setMessages([]);
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const newChat = async () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setPendingAction("chat");
  };

  const removeSession = async (id: string) => {
    const r = await deleteSessionFn({ data: { id } });
    if (r.error) return toast.error(r.error);
    if (activeId === id) setActiveId(null);
    loadSessions();
  };

  const send = async (action: Action = pendingAction) => {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    const optimisticUser: MessageRow = {
      id: `tmp-${Date.now()}`,
      role: "user",
      action,
      content: action === "chat" ? text : `${labelFor(action)}\n${text}`,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimisticUser]);
    setInput("");
    try {
      const r = await runCreativeFn({
        data: { sessionId: activeId, action, prompt: text },
      });
      if (r.error) toast.error(r.error);
      if (r.sessionId && r.sessionId !== activeId) {
        setActiveId(r.sessionId);
      } else if (r.sessionId) {
        await loadMessages(r.sessionId);
      }
      loadSessions();
    } finally {
      setLoading(false);
      setPendingAction("chat");
    }
  };

  const submitAdd = async () => {
    const url = newUrl.trim();
    if (!url) return;
    const r = await addSourceFn({ data: { url, label: newLabel.trim() || undefined } });
    if (r.error) return toast.error(r.error);
    setNewUrl("");
    setNewLabel("");
    loadSources();
  };

  const removeSource = async (id: string) => {
    const r = await deleteSourceFn({ data: { id } });
    if (r.error) return toast.error(r.error);
    loadSources();
  };

  const empty = messages.length === 0;

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Уголок креатива</h1>
            <p className="text-xs text-muted-foreground">
              ИИ-помощник по трендам, идеям, заголовкам и таймингу
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={newChat}>
            <Plus className="h-4 w-4 mr-1" /> Новый
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1" /> История
            {sessions.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                {sessions.length}
              </Badge>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4 mr-1" /> Сообщества
            {sources.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                {sources.length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card/40 p-4 sm:p-6 space-y-4"
      >
        {empty && !loading && <EmptyState onPick={(a, p) => { setPendingAction(a); setInput(p); }} />}
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            ИИ думает…
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            const active = pendingAction === a.key;
            return (
              <button
                key={a.key}
                onClick={() => {
                  setPendingAction(a.key);
                  if (!input.trim()) setInput(a.placeholder);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {a.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              pendingAction === "chat"
                ? "Напиши сообщение или выбери действие выше…"
                : QUICK_ACTIONS.find((a) => a.key === pendingAction)?.placeholder ?? ""
            }
            className="min-h-[52px] max-h-40 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button
            size="lg"
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {sources.length === 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">
            💡 Для лучшего анализа трендов{" "}
            <button
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setSettingsOpen(true)}
            >
              добавьте ссылки на сообщества
            </button>
          </p>
        )}
      </div>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>История чатов</DialogTitle>
            <DialogDescription>Все ваши сессии креативного помощника</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto -mx-6 px-6">
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Пока нет сохранённых чатов</p>
            )}
            <ul className="space-y-1">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent cursor-pointer",
                    activeId === s.id && "bg-accent",
                  )}
                  onClick={() => {
                    setActiveId(s.id);
                    setHistoryOpen(false);
                  }}
                >
                  <span className="flex-1 truncate text-sm">{s.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(s.updated_at).toLocaleDateString()}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSession(s.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sources / Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Сообщества для анализа</DialogTitle>
            <DialogDescription>
              Добавь ссылки на паблики ВК и Telegram-каналы — ИИ будет учитывать их при анализе трендов
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="https://vk.com/club… или https://t.me/…"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Название (необязательно)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <Button onClick={submitAdd} disabled={!newUrl.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Добавить
              </Button>
            </div>
            <div className="border-t border-border pt-3 max-h-64 overflow-y-auto">
              {sources.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Пока нет добавленных сообществ
                </p>
              )}
              <ul className="space-y-1.5">
                {sources.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50"
                  >
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      {s.label && <div className="text-sm font-medium truncate">{s.label}</div>}
                      <div className="text-xs text-muted-foreground truncate">{s.url}</div>
                    </div>
                    {s.platform && (
                      <Badge variant="outline" className="text-[10px]">
                        {s.platform}
                      </Badge>
                    )}
                    <button
                      className="p-1 rounded hover:bg-destructive/10 text-destructive"
                      onClick={() => removeSource(s.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Готово
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function labelFor(a: Action): string {
  return (
    {
      chat: "💬",
      trends: "🔥 Тренды у молодёжи",
      idea: "💡 Идея поста",
      timing: "⏰ Тайминг-советник",
      headlines: "📰 Вирусные заголовки",
      remix: "♻️ Ремикс контента",
    } as Record<Action, string>
  )[a];
}

function MessageBubble({ msg }: { msg: MessageRow }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary-glow grid place-items-center shrink-0">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        {msg.content}
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (a: Action, placeholder: string) => void }) {
  return (
    <div className="text-center py-8 sm:py-12 max-w-2xl mx-auto">
      <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center">
        <Sparkles className="h-8 w-8 text-primary-foreground" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Что сейчас в тренде у молодёжи?</h2>
      <p className="text-sm text-muted-foreground mb-8">
        Выбери одно из действий или просто напиши вопрос
      </p>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              onClick={() => onPick(a.key, a.placeholder)}
              className="text-left p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-accent transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">{a.label}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{a.placeholder}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
