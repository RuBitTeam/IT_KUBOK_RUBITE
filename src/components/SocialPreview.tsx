import { useState } from "react";
import { cn } from "@/lib/utils";
import { Heart, MessageCircle, Share2, Eye, Send } from "lucide-react";

type Tab = "vk" | "telegram";

interface Props {
  title: string;
  content: string;
  mediaUrl: string;
  authorName?: string;
}

function firstMedia(v: string): string {
  return (v ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] ?? "";
}
function mediaCount(v: string): number {
  return (v ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length;
}

export function SocialPreview({ title, content, mediaUrl, authorName = "Сообщество" }: Props) {
  const [tab, setTab] = useState<Tab>("vk");
  const previewUrl = firstMedia(mediaUrl);
  const extraCount = Math.max(0, mediaCount(mediaUrl) - 1);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "vk", label: "VK", icon: <span className="font-bold text-[10px]">VK</span> },
    { key: "telegram", label: "Telegram", icon: <Send className="h-3.5 w-3.5" /> },
  ];

  const initials = authorName.slice(0, 2).toUpperCase();

  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-[var(--shadow-card)]">
      <h3 className="font-semibold mb-3 text-sm">Предпросмотр</h3>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-muted/50 rounded-lg">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all",
              tab === t.key
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Preview body */}
      {tab === "vk" && (
        <VkPreview title={title} content={content} mediaUrl={previewUrl} extraCount={extraCount} authorName={authorName} initials={initials} />
      )}
      {tab === "telegram" && (
        <TgPreview title={title} content={content} mediaUrl={previewUrl} extraCount={extraCount} authorName={authorName} />
      )}
    </div>
  );
}

function VkPreview({
  title,
  content,
  mediaUrl,
  extraCount,
  authorName,
  initials,
}: {
  title: string;
  content: string;
  mediaUrl: string;
  extraCount: number;
  authorName: string;
  initials: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <div className="p-3 flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-full bg-blue-500 text-white grid place-items-center text-xs font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{authorName}</p>
          <p className="text-[11px] text-muted-foreground">сегодня</p>
        </div>
      </div>
      <div className="px-3 pb-3 text-sm whitespace-pre-wrap break-words">
        {title && <p className="font-semibold mb-1">{title}</p>}
        <p className="line-clamp-6">{content || "Текст поста появится здесь…"}</p>
      </div>
      {mediaUrl && (
        <div className="relative">
          <img src={mediaUrl} alt="" className="w-full max-h-72 object-cover" />
          {extraCount > 0 && (
            <span className="absolute bottom-2 right-2 text-xs font-semibold bg-background/85 backdrop-blur px-2 py-1 rounded-lg">
              +{extraCount} ещё
            </span>
          )}
        </div>
      )}
      <div className="px-3 py-2.5 flex items-center gap-4 text-muted-foreground text-xs border-t border-border">
        <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> 0</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> 0</span>
        <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> 0</span>
        <span className="flex items-center gap-1 ml-auto"><Eye className="h-3.5 w-3.5" /> 0</span>
      </div>
    </div>
  );
}

function TgPreview({
  title,
  content,
  mediaUrl,
  extraCount,
  authorName,
}: {
  title: string;
  content: string;
  mediaUrl: string;
  extraCount: number;
  authorName: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-sky-50/40 dark:bg-sky-950/20 p-3">
      <div className="bg-card rounded-2xl rounded-tl-sm p-3 shadow-sm max-w-[90%]">
        <p className="text-xs font-semibold text-sky-600 mb-1">{authorName}</p>
        {mediaUrl && (
          <div className="relative mb-2">
            <img src={mediaUrl} alt="" className="w-full max-h-56 object-cover rounded-lg" />
            {extraCount > 0 && (
              <span className="absolute bottom-2 right-2 text-xs font-semibold bg-background/85 backdrop-blur px-2 py-1 rounded-lg">
                +{extraCount}
              </span>
            )}
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap break-words">
          {title && <p className="font-semibold mb-1">{title}</p>}
          <p>{content || "Текст поста появится здесь…"}</p>
        </div>
        <p className="text-[10px] text-muted-foreground text-right mt-1">
          {new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

