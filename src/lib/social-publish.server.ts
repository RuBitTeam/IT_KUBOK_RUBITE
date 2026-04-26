// Server-only helpers that publish a post to the actual social network APIs.
// VK: wall.post via https://api.vk.com/method/wall.post (community access token, scope: wall,photos)
// Telegram: sendMessage / sendPhoto / sendMediaGroup via https://api.telegram.org/bot<token>/...
import { decryptSecret } from "./crypto.server";

export interface PublishInput {
  platform: "vk" | "telegram";
  encryptedToken: string;
  targetChat: string; // tg: chat_id (@channel or -100...) ; vk: group_id (positive)
  text: string;
  /** Single URL or newline-separated list of URLs. Backwards-compatible with previous string format. */
  mediaUrl?: string | null;
}

export interface PublishResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

function parseMediaUrls(v?: string | null): string[] {
  if (!v) return [];
  return v
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function publishToSocial(input: PublishInput): Promise<PublishResult> {
  const token = decryptSecret(input.encryptedToken);
  if (input.platform === "telegram") return publishTelegram(token, input);
  if (input.platform === "vk") return publishVk(token, input);
  return { ok: false, error: `Unsupported platform: ${input.platform}` };
}

async function publishTelegram(token: string, i: PublishInput): Promise<PublishResult> {
  const base = `https://api.telegram.org/bot${token}`;
  try {
    const urls = parseMediaUrls(i.mediaUrl).filter(isLikelyImageUrl);
    // No media → plain message
    if (urls.length === 0) {
      const res = await fetch(`${base}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: i.targetChat, text: i.text }),
      });
      const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
      if (!data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` };
      return { ok: true, externalId: String(data.result?.message_id ?? "") };
    }

    // Single photo → sendPhoto with caption
    if (urls.length === 1) {
      const res = await fetch(`${base}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: i.targetChat, photo: urls[0], caption: i.text }),
      });
      const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
      if (!data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` };
      return { ok: true, externalId: String(data.result?.message_id ?? "") };
    }

    // Multiple photos → sendMediaGroup (caption goes on the first item).
    // Telegram allows up to 10 items per album.
    const media = urls.slice(0, 10).map((u, idx) => ({
      type: "photo" as const,
      media: u,
      ...(idx === 0 && i.text ? { caption: i.text } : {}),
    }));
    const res = await fetch(`${base}/sendMediaGroup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: i.targetChat, media }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      result?: Array<{ message_id: number }>;
      description?: string;
    };
    if (!data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` };
    // Use the first message_id as the external id (album header).
    return { ok: true, externalId: String(data.result?.[0]?.message_id ?? "") };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function publishVk(token: string, i: PublishInput): Promise<PublishResult> {
  try {
    const groupId = i.targetChat.replace(/^-/, "");
    const ownerId = `-${groupId}`;

    const urls = parseMediaUrls(i.mediaUrl).filter(isLikelyImageUrl);
    const attachments: string[] = [];

    // VK wall.post supports up to 10 attachments. Upload each photo separately
    // via photos.getWallUploadServer/saveWallPhoto. If a community token can't
    // upload (insufficient scope), fall back to text-only post.
    for (const url of urls.slice(0, 10)) {
      const uploaded = await uploadVkWallPhoto(token, groupId, url);
      if (uploaded.ok) {
        attachments.push(uploaded.attachment);
      } else {
        console.warn("[vk] photo upload failed, skipping:", uploaded.error);
      }
    }

    const params = new URLSearchParams({
      owner_id: ownerId,
      from_group: "1",
      message: i.text,
      access_token: token,
      v: "5.199",
    });
    if (attachments.length > 0) params.set("attachments", attachments.join(","));

    const res = await fetch(`https://api.vk.com/method/wall.post?${params.toString()}`, {
      method: "POST",
    });
    const data = (await res.json()) as { response?: { post_id: number }; error?: { error_msg: string } };
    if (data.error) return { ok: false, error: data.error.error_msg };
    return { ok: true, externalId: String(data.response?.post_id ?? "") };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function isLikelyImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(url);
}

// Загружает фото на стену сообщества VK и возвращает строку attachment вида photo<owner>_<id>.
async function uploadVkWallPhoto(
  token: string,
  groupId: string,
  imageUrl: string,
): Promise<{ ok: true; attachment: string } | { ok: false; error: string }> {
  // 1) Получаем upload URL
  const getServerParams = new URLSearchParams({
    group_id: groupId,
    access_token: token,
    v: "5.199",
  });
  const serverRes = await fetch(
    `https://api.vk.com/method/photos.getWallUploadServer?${getServerParams.toString()}`,
  );
  const serverData = (await serverRes.json()) as {
    response?: { upload_url: string };
    error?: { error_msg: string };
  };
  if (serverData.error || !serverData.response?.upload_url) {
    return { ok: false, error: serverData.error?.error_msg ?? "no upload_url" };
  }

  // 2) Скачиваем картинку
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return { ok: false, error: `download ${imgRes.status}` };
  const imgBuf = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("gif")
      ? "gif"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";

  // 3) Загружаем на upload_url
  const fd = new FormData();
  fd.append("photo", new Blob([imgBuf], { type: contentType }), `photo.${ext}`);
  const upRes = await fetch(serverData.response.upload_url, { method: "POST", body: fd });
  const upData = (await upRes.json()) as {
    server?: number;
    photo?: string;
    hash?: string;
  };
  if (!upData.photo || upData.photo === "[]" || upData.hash === undefined) {
    return { ok: false, error: "upload returned empty photo" };
  }

  // 4) Сохраняем
  const saveParams = new URLSearchParams({
    group_id: groupId,
    server: String(upData.server ?? ""),
    photo: upData.photo,
    hash: upData.hash,
    access_token: token,
    v: "5.199",
  });
  const saveRes = await fetch(
    `https://api.vk.com/method/photos.saveWallPhoto?${saveParams.toString()}`,
    { method: "POST" },
  );
  const saveData = (await saveRes.json()) as {
    response?: Array<{ id: number; owner_id: number }>;
    error?: { error_msg: string };
  };
  if (saveData.error || !saveData.response?.[0]) {
    return { ok: false, error: saveData.error?.error_msg ?? "save failed" };
  }
  const p = saveData.response[0];
  return { ok: true, attachment: `photo${p.owner_id}_${p.id}` };
}

// Lightweight token validity check.
export async function verifyToken(
  platform: "vk" | "telegram",
  token: string,
  targetChat: string,
): Promise<{ ok: boolean; info?: string; error?: string }> {
  try {
    if (platform === "telegram") {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = (await res.json()) as { ok: boolean; result?: { username?: string }; description?: string };
      if (!data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` };
      return { ok: true, info: data.result?.username ? `@${data.result.username}` : "bot ok" };
    }
    if (platform === "vk") {
      const params = new URLSearchParams({
        group_ids: targetChat.replace(/^-/, ""),
        access_token: token,
        v: "5.199",
      });
      const res = await fetch(`https://api.vk.com/method/groups.getById?${params.toString()}`);
      const data = (await res.json()) as {
        response?: { groups?: Array<{ name?: string }> } | Array<{ name?: string }>;
        error?: { error_msg: string };
      };
      if (data.error) return { ok: false, error: data.error.error_msg };
      const r = data.response;
      const name = Array.isArray(r) ? r[0]?.name : r?.groups?.[0]?.name;
      return { ok: true, info: name ?? "vk ok" };
    }
    return { ok: false, error: "unknown platform" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
