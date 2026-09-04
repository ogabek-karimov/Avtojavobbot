import type { ChatSettings, Env, HistoryMessage } from "./types";

const ADMINS_KEY = "admins";

function chatSettingsKey(chatId: number): string {
  return `chat:${chatId}:settings`;
}

function chatHistoryKey(chatId: number): string {
  return `chat:${chatId}:history`;
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

/** Returns false if the user wasn't an admin, or removing them would leave zero admins. */
export async function removeAdmin(env: Env, userId: number): Promise<boolean> {
  const admins = await getAdmins(env);
  if (!admins.includes(userId) || admins.length <= 1) return false;
  const next = admins.filter((id) => id !== userId);
  await env.BOT_KV.put(ADMINS_KEY, JSON.stringify(next));
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
