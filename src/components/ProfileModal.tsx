import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Pencil, LogOut, CheckCircle2, ListTodo, Mail, ShieldCheck, BriefcaseBusiness, Save, X, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProfileRow {
  display_name: string | null;
  position: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProfileUpdate?: (profile: { display_name: string | null; avatar_url: string | null }) => void;
}

export function ProfileModal({ open, onOpenChange, onProfileUpdate }: Props) {
  const { user, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileRow>({
    display_name: null,
    position: null,
    avatar_url: null,
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [todayCount, setTodayCount] = useState(0);
  const [doneTodayCount, setDoneTodayCount] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const roleLabel = roles.includes("admin")
    ? "Администратор"
    : roles.includes("editor")
      ? "Редактор"
      : roles.includes("viewer")
        ? "Наблюдатель"
        : "Пользователь";

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, position, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const p = (data as ProfileRow | null) ?? {
        display_name: null,
        position: null,
        avatar_url: null,
      };
      setProfile(p);
      setName(p.display_name ?? "");
      setPosition(p.position ?? "");

      // Today's tasks: open tasks with deadline today, plus tasks done today
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const [{ count: openToday }, { count: doneToday }] = await Promise.all([
        supabase
          .from("post_tasks")
          .select("id", { count: "exact", head: true })
          .eq("assignee_id", user.id)
          .eq("status", "open")
          .gte("deadline", startOfDay.toISOString())
          .lte("deadline", endOfDay.toISOString()),
        supabase
          .from("post_tasks")
          .select("id", { count: "exact", head: true })
          .eq("assignee_id", user.id)
          .eq("status", "done")
          .gte("completed_at", startOfDay.toISOString())
          .lte("completed_at", endOfDay.toISOString()),
      ]);

      if (cancelled) return;
      setTodayCount(openToday ?? 0);
      setDoneTodayCount(doneToday ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const initials = (profile.display_name || user?.email || "U").slice(0, 2).toUpperCase();

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim() || null, position: position.trim() || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setProfile({ ...profile, display_name: name.trim() || null, position: position.trim() || null });
    setEditing(false);
    toast.success("Профиль обновлён");
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Выберите изображение");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Файл слишком большой (макс 5 МБ)");
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `avatars/${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("post-media")
        .upload(path, file, { upsert: false, contentType: file.type, cacheControl: "3600" });
      if (upErr) {
        console.error("[avatar] upload error", upErr);
        throw upErr;
      }
      const { data: pub } = supabase.storage.from("post-media").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.id);
      if (updErr) {
        console.error("[avatar] profile update error", updErr);
        throw updErr;
      }
      const next = { ...profile, avatar_url: url };
      setProfile(next);
      onProfileUpdate?.({ display_name: next.display_name, avatar_url: url });
      toast.success("Аватар обновлён");
    } catch (err) {
      console.error("[avatar] failed", err);
      toast.error(err instanceof Error ? err.message : "Не удалось загрузить аватар");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSignOut = async () => {
    onOpenChange(false);
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Личный кабинет</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground grid place-items-center text-xl font-bold overflow-hidden group relative"
                aria-label="Изменить аватар"
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
                <span className="absolute inset-0 bg-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="pn" className="text-xs">Имя</Label>
                    <Input
                      id="pn"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ваше имя"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pp" className="text-xs">Должность</Label>
                    <Input
                      id="pp"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      placeholder="Например: SMM-менеджер"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-lg leading-tight truncate">
                    {profile.display_name || user?.email?.split("@")[0] || "Без имени"}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{roleLabel}</span>
                  </p>
                  {profile.position && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{profile.position}</span>
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{user?.email}</span>
                  </p>
                </>
              )}
            </div>

            {editing ? (
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setName(profile.display_name ?? "");
                    setPosition(profile.position ?? "");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button size="icon" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-accent/40 border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ListTodo className="h-3.5 w-3.5" /> Задач на сегодня
              </div>
              <p className="text-2xl font-bold mt-1">{todayCount}</p>
            </div>
            <div className="bg-accent/40 border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Выполнено сегодня
              </div>
              <p className="text-2xl font-bold mt-1">{doneTodayCount}</p>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Выйти из аккаунта
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
