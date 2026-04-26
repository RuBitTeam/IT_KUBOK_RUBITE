import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import {
  getWorkspace,
  getMyRole,
  type Workspace,
  type WorkspaceRole,
} from "@/lib/workspaces-api";
import { useAuth } from "@/lib/auth-context";

interface WorkspaceContextValue {
  workspace: Workspace | null;
  role: WorkspaceRole | null;
  loading: boolean;
  /** Любой участник пространства может создавать посты (черновики). */
  canCreate: boolean;
  /** editor+ — может публиковать в соцсеть, менять статус, дату. */
  canEdit: boolean;
  /** owner/admin — управление пространством. */
  canAdmin: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [ws, r] = await Promise.all([getWorkspace(workspaceId), getMyRole(workspaceId, user.id)]);
      setWorkspace(ws);
      setRole(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, user?.id]);

  const canCreate = role !== null;
  const canEdit = role === "owner" || role === "admin" || role === "editor";
  const canAdmin = role === "owner" || role === "admin";

  return (
    <Ctx.Provider value={{ workspace, role, loading, canCreate, canEdit, canAdmin, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

/** Helper: read wsId param from current route */
export function useWorkspaceId() {
  const params = useParams({ strict: false }) as { wsId?: string };
  return params.wsId ?? null;
}
