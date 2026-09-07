export interface Env {
  BOT_KV: KVNamespace;
  AI: Ai;
  TELEGRAM_BOT_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ADMIN_IDS: string;
  OWNER_ID: string;
  AI_PROVIDER: string;
  WORKERS_AI_MODEL: string;
  CLAUDE_MODEL: string;
  CLAUDE_MAX_TOKENS: string;
  CLAUDE_EFFORT: string;
  HISTORY_LIMIT: string;
  DEFAULT_SYSTEM_PROMPT: string;
  APP_BASE_URL: string;
  ANNOUNCEMENTS_URL: string;
}

export interface ChatSettings {
  autoreply: boolean;
  prompt: string | null;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FaqEntry {
  trigger: string;
  reply: string;
}

export interface VipEntry {
  id: number;
  role: string;
}

export interface TrustedEntry {
  id: number;
  label: string;
}

export interface ServiceIntake {
  enabled: boolean;
  description: string;
  reply: string;
}

/** One row in the downloadable PDF report - every message a real person sent and what the bot sent back. */
export interface InteractionLogEntry {
  timestamp: number; // epoch ms
  sender: string; // ism (@username yoki ID)
  channel: "oddiy" | "biznes"; // regular chat vs Telegram Business
  category: "AI" | "VIP" | "Ishonchli" | "FAQ" | "Xizmat so'rovi" | "Haqorat" | "Cheklangan mavzu";
  userText: string;
  botReply: string;
}

// Minimal Telegram types - just the fields this bot actually reads.
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  is_premium?: boolean;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  business_connection_id?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

// https://core.telegram.org/bots/api#businessconnection
export interface TelegramBusinessConnection {
  id: string;
  user: TelegramUser; // the Telegram Business (Premium) account owner who connected the bot
  user_chat_id: number;
  date: number;
  is_enabled: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  business_connection?: TelegramBusinessConnection;
  business_message?: TelegramMessage;
}
