const API_BASE = "https://api.telegram.org/bot";

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  web_app?: { url: string };
}

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

export function telegramApi(token: string) {
  const base = `${API_BASE}${token}`;

  return {
    async sendMessage(
      chatId: number,
      text: string,
      replyToMessageId?: number,
      replyMarkup?: InlineKeyboard,
    ): Promise<void> {
      const res = await fetch(`${base}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          reply_to_message_id: replyToMessageId,
          reply_markup: replyMarkup,
        }),
      });
      if (!res.ok) {
        console.error("sendMessage failed", res.status, await res.text());
      }
    },

    async editMessageText(
      chatId: number,
      messageId: number,
      text: string,
      replyMarkup?: InlineKeyboard,
    ): Promise<void> {
      const res = await fetch(`${base}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup }),
      });
      if (!res.ok) {
        console.error("editMessageText failed", res.status, await res.text());
      }
    },

    async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false): Promise<void> {
      await fetch(`${base}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert }),
      });
    },

    async sendChatAction(chatId: number, action: string): Promise<void> {
      await fetch(`${base}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action }),
      });
    },

    async setWebhook(url: string, secretToken: string): Promise<unknown> {
      const res = await fetch(`${base}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: ["message", "callback_query"] }),
      });
      return res.json();
    },
  };
}
