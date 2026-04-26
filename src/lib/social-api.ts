// Client-side queries for social accounts, tags and media library.
import { supabase } from "@/integrations/supabase/client";

export type SocialPlatform = "vk" | "telegram";
export type SocialStatus = "connected" | "disconnected" | "error";

export interface SocialAccount {
  id: string;
  owner_id: string;
  platform: SocialPlatform;
  display_name: string;
  target_chat: string;
  status: SocialStatus;
  last_error: string | null;
  last_checked_at: string | null;
  created_at: string;
}

export async function listSocialAccounts(): Promise<SocialAccount[]> {
  const { data, error } = await supabase
    .from("social_accounts")
    .select("id, owner_id, platform, display_name, target_chat, status, last_error, last_checked_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SocialAccount[];
}

export async function deleteSocialAccount(id: string) {
  const { error } = await supabase.from("social_accounts").delete().eq("id", id);
  if (error) throw error;
}

export interface Tag {
  id: string;
  name: string;
}

export async function listTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from("tags").select("id, name").order("name");
  if (error) throw error;
  return (data ?? []) as Tag[];
}

export async function ensureTags(names: string[]): Promise<void> {
  const cleaned = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (!cleaned.length) return;
  const rows = cleaned.map((name) => ({ name }));
  // ignore duplicates via unique constraint
  await supabase.from("tags").upsert(rows, { onConflict: "name", ignoreDuplicates: true });
}

export interface MediaAsset {
  id: string;
  owner_id: string;
  bucket_path: string;
  public_url: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export async function listMedia(): Promise<MediaAsset[]> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("owner_id", uid)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as MediaAsset[];
}

export async function uploadMedia(file: File, ownerId: string): Promise<MediaAsset> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("post-media").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data: pub } = supabase.storage.from("post-media").getPublicUrl(path);
  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      owner_id: ownerId,
      bucket_path: path,
      public_url: pub.publicUrl,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as MediaAsset;
}

export async function deleteMedia(asset: MediaAsset): Promise<void> {
  await supabase.storage.from("post-media").remove([asset.bucket_path]);
  await supabase.from("media_assets").delete().eq("id", asset.id);
}

export const PLATFORM_BADGE: Record<SocialPlatform, string> = {
  vk: "ВКонтакте",
  telegram: "Telegram",
};

export const STATUS_BADGE: Record<SocialStatus, string> = {
  connected: "Подключено",
  disconnected: "Отключено",
  error: "Ошибка",
};
