import { supabase } from "@/integrations/supabase/client";
import { createWorkspaceServer } from "@/lib/workspaces.functions";
import type { Database } from "@/integrations/supabase/types";

export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

export interface Workspace {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
  member_count?: number;
}

export interface Category {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  social_account_ids: string[];
  created_at: string;
  updated_at: string;
}

export async function listMyWorkspaces(userId: string): Promise<WorkspaceWithRole[]> {
  const { data, error } = await supabase
    .from("workspace_users")
    .select("role, workspace:workspaces(*)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? [])
    .filter((r) => r.workspace)
    .map((r) => ({
      ...(r.workspace as Workspace),
      role: r.role as WorkspaceRole,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const { data, error } = await supabase.from("workspaces").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Workspace | null;
}

export async function getMyRole(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const { data, error } = await supabase
    .from("workspace_users")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role ?? null) as WorkspaceRole | null;
}

export async function createWorkspace(
  _ownerId: string,
  name: string,
  description = "",
): Promise<Workspace> {
  const result = await createWorkspaceServer({ data: { name, description } });
  if (!result.ok) throw new Error(result.error);
  return result.workspace as Workspace;
}

export async function updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace> {
  const { data, error } = await supabase
    .from("workspaces")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Workspace;
}

export async function deleteWorkspace(id: string): Promise<void> {
  const { error } = await supabase.from("workspaces").delete().eq("id", id);
  if (error) throw error;
}

// Categories
export async function listCategories(workspaceId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function getCategory(id: string): Promise<Category | null> {
  const { data, error } = await supabase.from("categories").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Category | null;
}

export async function createCategory(
  workspaceId: string,
  name: string,
  description = "",
  color = "#6366f1",
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({ workspace_id: workspaceId, name, description, color })
    .select()
    .single();
  if (error) throw error;
  return data as Category;
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// Workspace-scoped posts
export interface WorkspacePost {
  id: string;
  workspace_id: string;
  category_id: string | null;
  group_id: string | null;
  author_id: string;
  title: string;
  content: string;
  media_url: string | null;
  status: Database["public"]["Enums"]["post_status"];
  publish_date: string | null;
  platform: Database["public"]["Enums"]["platform_type"];
  tags: string[];
  sort_order: number;
  is_draft: boolean;
  social_account_id: string | null;
  external_post_ids: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export async function listWorkspacePosts(
  workspaceId: string,
  opts: { categoryId?: string | null; includeDrafts?: boolean } = {},
): Promise<WorkspacePost[]> {
  let q = supabase.from("posts").select("*").eq("workspace_id", workspaceId);
  if (opts.categoryId !== undefined) {
    if (opts.categoryId === null) q = q.is("category_id", null);
    else q = q.eq("category_id", opts.categoryId);
  }
  const { data, error } = await q.order("sort_order", { ascending: true }).order("created_at", {
    ascending: false,
  });
  if (error) throw error;
  return (data ?? []) as WorkspacePost[];
}

export async function reorderPosts(updates: Array<{ id: string; sort_order: number }>) {
  // Postgres RLS won't allow upsert without all required cols; use individual updates.
  await Promise.all(
    updates.map((u) =>
      supabase.from("posts").update({ sort_order: u.sort_order }).eq("id", u.id),
    ),
  );
}

export async function moveCategoryFor(postId: string, categoryId: string | null) {
  const { error } = await supabase
    .from("posts")
    .update({ category_id: categoryId })
    .eq("id", postId);
  if (error) throw error;
}
