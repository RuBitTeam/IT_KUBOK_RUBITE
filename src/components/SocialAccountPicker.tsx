import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PLATFORM_BADGE, type SocialAccount } from "@/lib/social-api";

/**
 * Reusable picker that lets the user search through workspace social accounts
 * and toggle which ones are selected. Always renders the first 5 items in view
 * and scrolls when there are more.
 */
export function SocialAccountPicker({
  accounts,
  selectedIds,
  onToggle,
  emptyText = "Нет подключённых соцсетей.",
  showStatusError = false,
}: {
  accounts: SocialAccount[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  emptyText?: string;
  showStatusError?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => {
      const platform = PLATFORM_BADGE[a.platform].toLowerCase();
      return (
        a.display_name.toLowerCase().includes(q) ||
        platform.includes(q) ||
        (a.target_chat ?? "").toLowerCase().includes(q)
      );
    });
  }, [accounts, query]);

  if (accounts.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  // 5 rows × ~36px row height (py-1.5 + text-sm) + padding
  const maxHeight = "max-h-[208px]";

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск соцсети…"
          className="pl-9 h-9"
        />
      </div>
      <div
        className={`space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-2 ${maxHeight}`}
      >
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground text-center">
            Ничего не найдено
          </p>
        ) : (
          filtered.map((a) => {
            const checked = selectedIds.has(a.id);
            return (
              <label
                key={a.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => onToggle(a.id, !!v)}
                />
                <span className="text-sm flex-1 truncate">
                  {PLATFORM_BADGE[a.platform]} · {a.display_name}
                  {showStatusError && a.status === "error" ? (
                    <span className="text-destructive"> (ошибка)</span>
                  ) : null}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
