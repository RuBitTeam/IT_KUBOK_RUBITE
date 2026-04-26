import { useState, type ChangeEvent } from "react";
import { Loader2, Trash2, Upload, Plus, FileText } from "lucide-react";
import { uploadMedia } from "@/lib/social-api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface MediaPickerProps {
  /** Newline-separated list of URLs (backwards-compatible: single URL still works). */
  value: string;
  onChange: (urls: string) => void;
  disabled?: boolean;
}

const MAX_ITEMS = 10;

function parseUrls(v: string): string[] {
  return v
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinUrls(items: string[]): string {
  return items.join("\n");
}

function isImage(url: string) {
  return /\.(jpe?g|png|gif|webp|avif|svg|bmp|heic|heif)(\?|$)/i.test(url);
}

function isVideo(url: string) {
  return /\.(mp4|mov|webm|mkv|avi|m4v|3gp|ogv)(\?|$)/i.test(url);
}

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? url;
    return decodeURIComponent(last);
  } catch {
    return url.split("/").filter(Boolean).pop() ?? url;
  }
}

export function MediaPicker({ value, onChange, disabled }: MediaPickerProps) {
  const { user, canEdit } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [newUrl, setNewUrl] = useState("");

  const items = parseUrls(value);

  const setItems = (next: string[]) => onChange(joinUrls(next));

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !user) return;
    if (items.length + files.length > MAX_ITEMS) {
      toast.error(`Не больше ${MAX_ITEMS} файлов в одном посте`);
      return;
    }
    setUploading(true);
    try {
      const next = [...items];
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`«${file.name}» больше 50 MB — пропущен`);
          continue;
        }
        const asset = await uploadMedia(file, user.id);
        next.push(asset.public_url);
      }
      setItems(next);
      toast.success(files.length > 1 ? "Файлы загружены" : "Файл загружен");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const addUrl = () => {
    const u = newUrl.trim();
    if (!u) return;
    if (items.length >= MAX_ITEMS) {
      toast.error(`Не больше ${MAX_ITEMS} файлов`);
      return;
    }
    setItems([...items, u]);
    setNewUrl("");
  };

  const removeAt = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          type="url"
          placeholder="https://… (или загрузите файл)"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
          disabled={disabled}
          className="flex-1 min-w-[200px]"
        />
        {newUrl.trim() && (
          <Button type="button" variant="outline" size="sm" onClick={addUrl} disabled={disabled}>
            <Plus className="h-4 w-4 mr-1" /> Добавить ссылку
          </Button>
        )}
        {canEdit && (
          <label className="inline-flex">
            <input
              type="file"
              className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip,application/x-rar-compressed,application/x-7z-compressed"
              multiple
              onChange={onUpload}
              disabled={disabled || uploading}
            />
            <Button type="button" variant="outline" size="sm" asChild disabled={disabled || uploading}>
              <span>
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                {items.length > 0 ? "Добавить файлы" : "Загрузить"}
              </span>
            </Button>
          </label>
        )}
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="relative group rounded-xl overflow-hidden border border-border bg-muted aspect-video"
            >
              {isImage(url) ? (
                <img src={url} alt={`Медиа ${i + 1}`} className="h-full w-full object-cover" />
              ) : isVideo(url) ? (
                <video
                  src={url}
                  className="h-full w-full object-cover bg-black"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-full w-full flex flex-col items-center justify-center gap-1 p-2 text-muted-foreground hover:text-foreground transition-colors"
                  title={fileNameFromUrl(url)}
                >
                  <FileText className="h-8 w-8" />
                  <span className="text-[10px] line-clamp-2 text-center break-all px-1">
                    {fileNameFromUrl(url)}
                  </span>
                </a>
              )}
              <span className="absolute top-1 left-1 text-[10px] font-semibold bg-background/85 backdrop-blur px-1.5 py-0.5 rounded-md">
                #{i + 1}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute top-1 right-1 h-7 w-7 grid place-items-center rounded-md bg-background/85 backdrop-blur text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Нет файлов. Можно добавить до {MAX_ITEMS} фото, видео или документов — они будут
          прикреплены к посту.
        </p>
      )}
      {items.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {items.length} / {MAX_ITEMS} файл{items.length === 1 ? "" : items.length < 5 ? "а" : "ов"}
        </p>
      )}
    </div>
  );
}
