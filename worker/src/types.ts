export interface Env {
  BOT_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ADMIN_IDS: string;
  CLAUDE_MODEL: string;
  CLAUDE_MAX_TOKENS: string;
  CLAUDE_EFFORT: string;
  HISTORY_LIMIT: string;
  DEFAULT_SYSTEM_PROMPT: string;
  APP_BASE_URL: string;
}

export interface ChatSettings {
  autoreply: boolean;
  prompt: string | null;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// Minimal Telegram types - just the fields this bot actually reads.
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
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
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}
