import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useForceLightTheme } from "@/lib/force-light";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Некорректный email").max(255),
  password: z.string().min(6, "Минимум 6 символов").max(72),
});

function LoginPage() {
  useForceLightTheme();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/workspaces" });
  }, [user, loading, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Вход выполнен");
    navigate({ to: "/workspaces" });
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
            <p className="text-sm text-muted-foreground mt-1">Вход в систему</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground mt-6 text-center">
          Нет аккаунта?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
