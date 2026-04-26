import { supabase } from "@/integrations/supabase/client";

export type PostStatus = "draft" | "scheduled" | "published" | "failed";
export type Platform = "vk" | "telegram" | "instagram" | "youtube" | "other";

export interface Post {
  id: string;
  author_id: string;
  title: string;
  content: string;
  media_url: string | null;
  status: PostStatus;
  publish_date: string | null;
  platform: Platform;
  tags: string[];
  social_account_id: string | null;
  category_id: string | null;
  workspace_id: string;
  suggested_post_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function listPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Post[];
}

export async function getPost(id: string): Promise<Post | null> {
  const { data, error } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Post | null;
}

export async function createPost(
  p: Partial<Post> & {
    author_id: string;
    title: string;
    workspace_id?: string;
    category_id?: string | null;
  },
) {
  let workspace_id = p.workspace_id;
  if (!workspace_id) {
    // pick the first workspace the user belongs to
    const { data: ws } = await supabase
      .from("workspace_users")
      .select("workspace_id")
      .eq("user_id", p.author_id)
      .limit(1)
      .maybeSingle();
    workspace_id = ws?.workspace_id;
  }
  if (!workspace_id) {
    throw new Error("Нет доступного рабочего пространства. Создайте его в разделе «Пространства».");
  }
  const { data, error } = await supabase
    .from("posts")
    .insert({ ...p, workspace_id } as never)
    .select()
    .single();
  if (error) throw error;
  return data as Post;
}

export async function updatePost(id: string, p: Partial<Post>) {
  const { data, error } = await supabase
    .from("posts")
    .update(p as never)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Post;
}

export async function deletePost(id: string) {
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw error;
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Черновик",
  scheduled: "Запланирован",
  published: "Опубликован",
  failed: "Ошибка",
};

export const STATUS_COLOR: Record<PostStatus, string> = {
  draft:
    "rounded-full border border-muted-foreground/30 bg-muted text-muted-foreground",
  scheduled:
    "rounded-full border border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-400",
  published:
    "rounded-full border border-green-600/40 bg-green-500/15 text-green-700 dark:text-green-400",
  failed:
    "rounded-full border border-destructive/40 bg-destructive/15 text-destructive",
};

// Badge for posts published through this service (overrides "Опубликован")
export const SERVICE_BADGE_LABEL = "Сервис";
export const SERVICE_BADGE_COLOR =
  "rounded-full border border-purple-500/40 bg-purple-500/15 text-purple-700 dark:text-purple-300";

// Badges for externally pulled posts (not created via service)
export const PULLED_VK_LABEL = "ВК";
export const PULLED_TG_LABEL = "Telegram";
export const PULLED_VK_COLOR =
  "rounded-full border border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300";
export const PULLED_TG_COLOR =
  "rounded-full border border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300";

// Status badge for externally pulled posts (no service duplicate)
export const PULLED_STATUS_LABEL = "Подтянут";
export const PULLED_STATUS_COLOR =
  "rounded-full border border-cyan-500/40 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300";

export const PLATFORM_LABEL: Record<Platform, string> = {
  vk: "ВКонтакте",
  telegram: "Telegram",
  instagram: "Instagram",
  youtube: "YouTube",
  other: "Другое",
};
