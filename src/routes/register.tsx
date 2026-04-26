import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useForceLightTheme } from "@/lib/force-light";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

const schema = z.object({
  displayName: z.string().trim().min(2, "Имя слишком короткое").max(80),
  email: z.string().trim().email("Некорректный email").max(255),
  password: z.string().min(6, "Минимум 6 символов").max(72),
});

function RegisterPage() {
  useForceLightTheme();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ displayName, email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { display_name: parsed.data.displayName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Аккаунт создан, можно войти");
    navigate({ to: "/login" });
  };

  return (
    <div
      className="min-h-screen grid place-items-center px-4 relative light bg-background text-foreground"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-[var(--shadow-elegant)]">
        <div className="flex flex-col items-center gap-3 mb-6">
          <img src={logo} alt="" className="h-16 w-16 object-contain" />
          <div className="text-center leading-tight">
            <div className="text-xl font-extrabold tracking-tight">ПОСТЕР <span className="text-muted-foreground font-medium">медиахаб</span></div>
            <p className="text-sm text-muted-foreground mt-1">Создание аккаунта</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Имя</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Создаём…" : "Создать аккаунт"}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground mt-6 text-center">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
