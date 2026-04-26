import { BarChart3, Eye, Heart, Repeat, MessageCircle, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  vkUrl: string;
  communityName: string;
  stats: { views: number; likes: number; comments: number; reposts: number };
  open: boolean;
  onClose: () => void;
}

export function ExternalPostAnalyticsModal({
  title,
  vkUrl,
  communityName,
  stats,
  open,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold truncate">Аналитика поста</h2>
              <p className="text-xs text-muted-foreground truncate">
                {communityName} · {title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Metric icon={<Eye className="h-4 w-4" />} label="Просмотры" value={stats.views} />
            <Metric icon={<Heart className="h-4 w-4" />} label="Лайки" value={stats.likes} />
            <Metric icon={<Repeat className="h-4 w-4" />} label="Репосты" value={stats.reposts} />
            <Metric
              icon={<MessageCircle className="h-4 w-4" />}
              label="Комментарии"
              value={stats.comments}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" asChild className="flex-1">
              <a href={vkUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Открыть в VK
              </a>
            </Button>
            <Button size="sm" onClick={onClose} className="flex-1">
              Закрыть
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border p-3 bg-background">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}
