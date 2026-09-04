import type { ChatSettings, Env, FaqEntry, HistoryMessage, VipEntry } from "./types";

const ADMINS_KEY = "admins";
const OWNER_KEY = "owner";
const STATS_REPLIED_KEY = "stats:replied_users";
const STATS_RESPONDED_KEY = "stats:responded_users";

function chatSettingsKey(chatId: number): string {
  return `chat:${chatId}:settings`;
}

function chatHistoryKey(chatId: number): string {
  return `chat:${chatId}:history`;
}

function chatFaqKey(chatId: number): string {
  return `chat:${chatId}:faq`;
}

function chatVipKey(chatId: number): string {
  return `chat:${chatId}:vip`;
}

function businessConnectionKey(connectionId: string): string {
  return `bizconn:${connectionId}`;
}

export interface BusinessConnectionInfo {
  ownerId: number;
  ownerFirstName: string;
  enabled: boolean;
}

/** Reads the admin list from KV, seeding it from ADMIN_IDS on first use. */
export async function getAdmins(env: Env): Promise<number[]> {
  const raw = await env.BOT_KV.get(ADMINS_KEY);
  if (raw !== null) {
    return JSON.parse(raw) as number[];
  }
  const seeded = env.ADMIN_IDS.split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => parseInt(v, 10))
    .filter((v) => !Number.isNaN(v));
  if (seeded.length > 0) {
    await env.BOT_KV.put(ADMINS_KEY, JSON.stringify(seeded));
  }
  return seeded;
}

export async function isAdmin(env: Env, userId: number): Promise<boolean> {
  const admins = await getAdmins(env);
  return admins.includes(userId);
}

/** Returns false if the user was already an admin. */
export async function addAdmin(env: Env, userId: number): Promise<boolean> {
  const admins = await getAdmins(env);
  if (admins.includes(userId)) return false;
  admins.push(userId);
  await env.BOT_KV.put(ADMINS_KEY, JSON.stringify(admins));
  return true;
}

/**
 * Returns false if the user wasn't an admin, removing them would leave zero admins, or
 * they're the current owner (owner must transfer ownership before being removed).
 */
export async function removeAdmin(env: Env, userId: number): Promise<boolean> {
  const admins = await getAdmins(env);
  if (!admins.includes(userId) || admins.length <= 1) return false;
  if ((await getOwner(env)) === userId) return false;
  const next = admins.filter((id) => id !== userId);
  await env.BOT_KV.put(ADMINS_KEY, JSON.stringify(next));
  return true;
}

/** Reads the current owner (asosiy admin), seeding it from OWNER_ID on first use. */
export async function getOwner(env: Env): Promise<number> {
  const raw = await env.BOT_KV.get(OWNER_KEY);
  if (raw !== null) return parseInt(raw, 10);
  const seeded = parseInt(env.OWNER_ID, 10);
  const ownerId = !Number.isNaN(seeded) ? seeded : ((await getAdmins(env))[0] ?? 0);
  await env.BOT_KV.put(OWNER_KEY, String(ownerId));
  return ownerId;
}

export async function isOwner(env: Env, userId: number): Promise<boolean> {
  return (await getOwner(env)) === userId;
}

/** Returns false if the target isn't already an admin - ownership can only move to an existing admin. */
export async function transferOwnership(env: Env, newOwnerId: number): Promise<boolean> {
  const admins = await getAdmins(env);
  if (!admins.includes(newOwnerId)) return false;
  await env.BOT_KV.put(OWNER_KEY, String(newOwnerId));
  return true;
}

export async function getChatSettings(env: Env, chatId: number): Promise<ChatSettings> {
  const raw = await env.BOT_KV.get(chatSettingsKey(chatId));
  if (raw === null) return { autoreply: false, prompt: null };
  return JSON.parse(raw) as ChatSettings;
}

export async function setChatSettings(env: Env, chatId: number, settings: ChatSettings): Promise<void> {
  await env.BOT_KV.put(chatSettingsKey(chatId), JSON.stringify(settings));
}

export async function getHistory(env: Env, chatId: number): Promise<HistoryMessage[]> {
  const raw = await env.BOT_KV.get(chatHistoryKey(chatId));
  if (raw === null) return [];
  return JSON.parse(raw) as HistoryMessage[];
}

export async function appendHistory(
  env: Env,
  chatId: number,
  entry: HistoryMessage,
  limit: number,
): Promise<HistoryMessage[]> {
  const history = await getHistory(env, chatId);
  history.push(entry);
  while (history.length > limit) history.shift();
  await env.BOT_KV.put(chatHistoryKey(chatId), JSON.stringify(history));
  return history;
}

export async function clearHistory(env: Env, chatId: number): Promise<void> {
  await env.BOT_KV.delete(chatHistoryKey(chatId));
}

export async function getFaq(env: Env, chatId: number): Promise<FaqEntry[]> {
  const raw = await env.BOT_KV.get(chatFaqKey(chatId));
  if (raw === null) return [];
  return JSON.parse(raw) as FaqEntry[];
}

export async function addFaqEntry(env: Env, chatId: number, entry: FaqEntry): Promise<void> {
  const list = await getFaq(env, chatId);
  list.push(entry);
  await env.BOT_KV.put(chatFaqKey(chatId), JSON.stringify(list));
}

export async function removeFaqEntry(env: Env, chatId: number, index: number): Promise<boolean> {
  const list = await getFaq(env, chatId);
  if (index < 0 || index >= list.length) return false;
  list.splice(index, 1);
  await env.BOT_KV.put(chatFaqKey(chatId), JSON.stringify(list));
  return true;
}

/** Case-insensitive substring match: the first FAQ entry whose trigger appears in the message wins. */
export function matchFaq(list: FaqEntry[], text: string): string | null {
  const lower = text.toLowerCase();
  for (const entry of list) {
    const trigger = entry.trigger.trim().toLowerCase();
    if (trigger && lower.includes(trigger)) return entry.reply;
  }
  return null;
}

export async function getVipList(env: Env, chatId: number): Promise<VipEntry[]> {
  const raw = await env.BOT_KV.get(chatVipKey(chatId));
  if (raw === null) return [];
  return JSON.parse(raw) as VipEntry[];
}

export async function addVipEntry(env: Env, chatId: number, entry: VipEntry): Promise<void> {
  const list = await getVipList(env, chatId);
  list.push(entry);
  await env.BOT_KV.put(chatVipKey(chatId), JSON.stringify(list));
}

export async function removeVipEntry(env: Env, chatId: number, index: number): Promise<boolean> {
  const list = await getVipList(env, chatId);
  if (index < 0 || index >= list.length) return false;
  list.splice(index, 1);
  await env.BOT_KV.put(chatVipKey(chatId), JSON.stringify(list));
  return true;
}

export function findVip(list: VipEntry[], userId: number): VipEntry | null {
  return list.find((v) => v.id === userId) ?? null;
}

async function getIdSet(env: Env, key: string): Promise<Set<number>> {
  const raw = await env.BOT_KV.get(key);
  if (!raw) return new Set();
  return new Set(JSON.parse(raw) as number[]);
}

async function putIdSet(env: Env, key: string, ids: Set<number>): Promise<void> {
  await env.BOT_KV.put(key, JSON.stringify([...ids]));
}

/**
 * Call once per incoming auto-reply-eligible message, before sending the reply.
 * Tracks two counters: how many distinct users the bot has ever replied to, and
 * how many of those users sent a follow-up message afterwards (i.e. replied back).
 */
export async function recordAutoReplyInteraction(env: Env, userId: number): Promise<void> {
  const repliedUsers = await getIdSet(env, STATS_REPLIED_KEY);
  if (repliedUsers.has(userId)) {
    const respondedUsers = await getIdSet(env, STATS_RESPONDED_KEY);
    if (!respondedUsers.has(userId)) {
      respondedUsers.add(userId);
      await putIdSet(env, STATS_RESPONDED_KEY, respondedUsers);
    }
    return;
  }
  repliedUsers.add(userId);
  await putIdSet(env, STATS_REPLIED_KEY, repliedUsers);
}

export async function setBusinessConnection(
  env: Env,
  connectionId: string,
  info: BusinessConnectionInfo,
): Promise<void> {
  await env.BOT_KV.put(businessConnectionKey(connectionId), JSON.stringify(info));
}

export async function getBusinessConnection(env: Env, connectionId: string): Promise<BusinessConnectionInfo | null> {
  const raw = await env.BOT_KV.get(businessConnectionKey(connectionId));
  if (!raw) return null;
  return JSON.parse(raw) as BusinessConnectionInfo;
}

export async function getStats(env: Env): Promise<{ repliedCount: number; respondedCount: number }> {
  const [repliedUsers, respondedUsers] = await Promise.all([
    getIdSet(env, STATS_REPLIED_KEY),
    getIdSet(env, STATS_RESPONDED_KEY),
  ]);
  return { repliedCount: repliedUsers.size, respondedCount: respondedUsers.size };
}
