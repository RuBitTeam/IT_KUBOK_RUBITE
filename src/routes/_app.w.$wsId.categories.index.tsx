import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, FolderTree, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createCategory,
  deleteCategory,
  listCategories,
  listWorkspacePosts,
  updateCategory,
  type Category,
} from "@/lib/workspaces-api";
import { useWorkspace } from "@/lib/workspace-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/w/$wsId/categories/")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const { wsId } = Route.useParams();
  const { canEdit, canAdmin } = useWorkspace();
  const navigate = useNavigate();
  const [items, setItems] = useState<Category[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cats, allPosts] = await Promise.all([
        listCategories(wsId),
        listWorkspacePosts(wsId),
      ]);
      setItems(cats);
      const c: Record<string, number> = {};
      let uncat = 0;
      for (const p of allPosts) {
        if (p.category_id) c[p.category_id] = (c[p.category_id] ?? 0) + 1;
        else uncat++;
      }
      setCounts(c);
      setUncategorizedCount(uncat);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setColor("#6366f1");
    setOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description);
    setColor(cat.color);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateCategory(editing.id, { name: name.trim(), description, color });
        toast.success("Сохранено");
      } else {
        await createCategory(wsId, name.trim(), description, color);
        toast.success("Рубрика создана");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Удалить рубрику «${cat.name}»? Посты останутся без рубрики.`)) return;
    try {
      await deleteCategory(cat.id);
      toast.success("Удалено");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Рубрики</h2>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Новая рубрика
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Редактировать рубрику" : "Новая рубрика"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <label className="text-sm font-medium">Название</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="text-sm font-medium">Описание</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium">Цвет</label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-14 rounded border border-border bg-transparent"
                  />
                  <span className="text-xs text-muted-foreground">{color}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Сохранить
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground">Загрузка…</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Uncategorized */}
          <button
            onClick={() =>
              navigate({
                to: "/w/$wsId/categories/$catId",
                params: { wsId, catId: "uncategorized" },
              })
            }
            className="text-left bg-card border border-dashed border-border rounded-2xl p-5 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-muted text-muted-foreground grid place-items-center">
                <FolderTree className="h-5 w-5" />
              </div>
              <div className="font-semibold">Без рубрики</div>
            </div>
            <p className="text-sm text-muted-foreground">{uncategorizedCount} постов</p>
          </button>

          {items.map((cat) => (
            <div
              key={cat.id}
              className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/50 transition-colors"
            >
              <Link
                to="/w/$wsId/categories/$catId"
                params={{ wsId, catId: cat.id }}
                className="block"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-xl grid place-items-center text-white font-bold"
                    style={{ backgroundColor: cat.color }}
                  >
                    {cat.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="font-semibold line-clamp-1">{cat.name}</div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                  {cat.description || "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  {counts[cat.id] ?? 0} постов
                </p>
              </Link>
              {canEdit && (
                <div className="flex justify-end gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(cat);
                    }}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {canAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(cat);
                      }}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
