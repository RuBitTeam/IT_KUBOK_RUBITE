import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "editor" | "viewer";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  /** @deprecated kept for backward compatibility — теперь любой авторизованный может редактировать собственный контент */
  canEdit: boolean;
  /** @deprecated используйте isAdmin */
  canDelete: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const valid = (data ?? [])
      .map((r) => r.role as string)
      .filter((r): r is AppRole => r === "admin" || r === "editor" || r === "viewer");
    setRoles(valid);
  };

  useEffect(() => {
    // Patch fetch: attach Supabase access token to TanStack server function calls.
    if (typeof window !== "undefined" && !(window as unknown as { __sfPatched?: boolean }).__sfPatched) {
      (window as unknown as { __sfPatched?: boolean }).__sfPatched = true;
      const origFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes("/_serverFn/")) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (token) {
            const headers = new Headers(
              init?.headers ?? (input instanceof Request ? input.headers : undefined),
            );
            if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
            return origFetch(input, { ...init, headers });
          }
        }
        return origFetch(input, init);
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadRoles(sess.user.id), 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) loadRoles(sess.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin");
  // Backward-compat: с ролями только внутри пространств любой авторизованный
  // может создавать собственный контент. Реальные ограничения — на уровне workspace.
  const canEdit = !!user;
  const canDelete = isAdmin;

  const value: AuthContextValue = {
    user,
    session,
    roles,
    loading,
    hasRole,
    isAdmin,
    canEdit,
    canDelete,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshRoles: async () => {
      if (user) await loadRoles(user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
