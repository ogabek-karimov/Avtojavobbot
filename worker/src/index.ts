import { validateInitData } from "./auth";
import { getReply } from "./claude";
import { telegramApi, type InlineKeyboard } from "./telegram";
import {
  addAdmin,
  addFaqEntry,
  appendHistory,
  clearHistory,
  getAdmins,
  getChatSettings,
  getFaq,
  getStats,
  isAdmin,
  matchFaq,
  recordAutoReplyInteraction,
  removeAdmin,
  removeFaqEntry,
  setChatSettings,
} from "./store";
import type { ChatSettings, Env, TelegramCallbackQuery, TelegramUpdate } from "./types";
import { renderAppHtml } from "./webapp";

const HELP_TEXT = `/panel - boshqaruv panelini ochish (tugmalar bilan, faqat adminlar)
/stats - hisobot: nechta userga javob berdi, nechtasi javob qaytardi (faqat adminlar)
/autoreply_on - shu chatda AI avto-javobni yoqish (faqat adminlar)
/autoreply_off - shu chatda AI avto-javobni o'chirish (faqat adminlar)
/setprompt <matn> - shu chat uchun AI ko'rsatmasini (persona) sozlash (faqat adminlar)
/resetprompt - ko'rsatmani standart holatga qaytarish (faqat adminlar)
/status - shu chatning joriy holatini ko'rish
/myid - o'zingizning Telegram ID raqamingizni bilish
/addadmin <ID> - boshqa foydalanuvchini admin qilish (faqat adminlar)
/removeadmin <ID> - adminlikdan olib tashlash (faqat adminlar)
/listadmins - joriy adminlar ro'yxati (faqat adminlar)`;

function panelText(settings: ChatSettings, env: Env): string {
  const state = settings.autoreply ? "🟢 yoqilgan" : "🔴 o'chirilgan";
  const prompt = settings.prompt ?? env.DEFAULT_SYSTEM_PROMPT;
  return `⚙️ Boshqaruv paneli\n\nAvto-javob: ${state}\nKo'rsatma: ${prompt}`;
}

function panelKeyboard(settings: ChatSettings): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        settings.autoreply
          ? { text: "🔴 Auto-javobni o'chirish", callback_data: "panel:autoreply_off" }
          : { text: "🟢 Auto-javobni yoqish", callback_data: "panel:autoreply_on" },
      ],
      [
        { text: "🔄 Holatni yangilash", callback_data: "panel:refresh" },
        { text: "👥 Adminlar", callback_data: "panel:listadmins" },
      ],
      [
        { text: "✏️ Ko'rsatmani o'zgartirish", callback_data: "panel:promptinfo" },
        { text: "📈 Hisobot", callback_data: "panel:stats" },
      ],
    ],
  };
}

function panelKeyboardWithApp(settings: ChatSettings, appUrl: string): InlineKeyboard {
  const kb = panelKeyboard(settings);
  kb.inline_keyboard.unshift([{ text: "🖥 To'liq ilovani ochish", web_app: { url: appUrl } }]);
  return kb;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("OK", { status: 200 });
    }

    if (request.method === "GET" && url.pathname === "/app") {
      return new Response(renderAppHtml(), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/state") {
      return handleApiState(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/action") {
      return handleApiAction(request, env);
    }

    if (request.method === "POST" && url.pathname === "/telegram-webhook") {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }

      const update = await request.json<TelegramUpdate>();
      // Answer Telegram immediately (it retries on timeout/5xx); do the real work
      // in the background so the webhook response isn't held up by the Claude call.
      ctx.waitUntil(handleUpdate(update, env));
      return new Response("OK", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },
};

/** Authenticates a Mini App request; returns the admin's user id, or null with the response to send back. */
async function authenticateApp(
  request: Request,
  env: Env,
): Promise<{ userId: number; body: Record<string, unknown> } | Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const initData = typeof body.initData === "string" ? body.initData : "";
  const user = await validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await isAdmin(env, user.id))) {
    return new Response("Siz admin emassiz.", { status: 403 });
  }
  return { userId: user.id, body };
}

async function buildAppState(env: Env, chatId: number) {
  const [settings, admins, faq, stats] = await Promise.all([
    getChatSettings(env, chatId),
    getAdmins(env),
    getFaq(env, chatId),
    getStats(env),
  ]);
  return { settings, admins, faq, stats, defaultPrompt: env.DEFAULT_SYSTEM_PROMPT };
}

async function handleApiState(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateApp(request, env);
  if (auth instanceof Response) return auth;
  const state = await buildAppState(env, auth.userId);
  return new Response(JSON.stringify(state), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleApiAction(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateApp(request, env);
  if (auth instanceof Response) return auth;
  const { userId, body } = auth;
  const action = typeof body.action === "string" ? body.action : "";
  const value = typeof body.value === "string" ? body.value : "";

  const settings = await getChatSettings(env, userId);

  switch (action) {
    case "autoreply_on":
      settings.autoreply = true;
      await setChatSettings(env, userId, settings);
      break;
    case "autoreply_off":
      settings.autoreply = false;
      await setChatSettings(env, userId, settings);
      break;
    case "set_prompt":
      if (!value.trim()) return new Response("Bo'sh matn kiritilmadi.", { status: 400 });
      settings.prompt = value;
      await setChatSettings(env, userId, settings);
      await clearHistory(env, userId);
      break;
    case "reset_prompt":
      settings.prompt = null;
      await setChatSettings(env, userId, settings);
      await clearHistory(env, userId);
      break;
    case "add_admin": {
      const targetId = parseInt(value, 10);
      if (Number.isNaN(targetId)) return new Response("Noto'g'ri ID.", { status: 400 });
      await addAdmin(env, targetId);
      break;
    }
    case "remove_admin": {
      const targetId = parseInt(value, 10);
      if (Number.isNaN(targetId)) return new Response("Noto'g'ri ID.", { status: 400 });
      await removeAdmin(env, targetId);
      break;
    }
    case "add_faq": {
      const trigger = typeof body.trigger === "string" ? body.trigger.trim() : "";
      const reply = typeof body.reply === "string" ? body.reply.trim() : "";
      if (!trigger || !reply) return new Response("Kalit so'z va javob bo'sh bo'lmasin.", { status: 400 });
      await addFaqEntry(env, userId, { trigger, reply });
      break;
    }
    case "remove_faq": {
      const index = typeof body.index === "number" ? body.index : parseInt(value, 10);
      if (Number.isNaN(index)) return new Response("Noto'g'ri index.", { status: 400 });
      await removeFaqEntry(env, userId, index);
      break;
    }
    default:
      return new Response("Noma'lum amal.", { status: 400 });
  }

  const state = await buildAppState(env, userId);
  return new Response(JSON.stringify(state), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
    return;
  }

  const message = update.message;
  if (!message || !message.text || !message.from) return;

  const tg = telegramApi(env.TELEGRAM_BOT_TOKEN);
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text.trim();

  if (text.startsWith("/")) {
    await handleCommand(tg, env, chatId, userId, message.message_id, text);
    return;
  }

  const settings = await getChatSettings(env, chatId);
  if (!settings.autoreply) return;

  await recordAutoReplyInteraction(env, userId);

  const faq = await getFaq(env, chatId);
  const faqReply = matchFaq(faq, text);
  if (faqReply) {
    await tg.sendMessage(chatId, faqReply);
    return;
  }

  const systemPrompt = settings.prompt ?? env.DEFAULT_SYSTEM_PROMPT;
  const limit = parseInt(env.HISTORY_LIMIT, 10);

  const history = await appendHistory(env, chatId, { role: "user", content: text }, limit);
  await tg.sendChatAction(chatId, "typing");
  const reply = await getReply(env, history, systemPrompt);
  await appendHistory(env, chatId, { role: "assistant", content: reply }, limit);
  await tg.sendMessage(chatId, reply);
}

async function handleCallbackQuery(cq: TelegramCallbackQuery, env: Env): Promise<void> {
  const tg = telegramApi(env.TELEGRAM_BOT_TOKEN);

  if (!cq.message || !cq.data || !cq.data.startsWith("panel:")) {
    await tg.answerCallbackQuery(cq.id);
    return;
  }

  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;

  if (!(await isAdmin(env, cq.from.id))) {
    await tg.answerCallbackQuery(cq.id, "Bu tugma faqat adminlar uchun.", true);
    return;
  }

  const action = cq.data.slice("panel:".length);
  const settings = await getChatSettings(env, chatId);

  switch (action) {
    case "autoreply_on":
      settings.autoreply = true;
      await setChatSettings(env, chatId, settings);
      await tg.answerCallbackQuery(cq.id, "Auto-javob yoqildi.");
      break;

    case "autoreply_off":
      settings.autoreply = false;
      await setChatSettings(env, chatId, settings);
      await tg.answerCallbackQuery(cq.id, "Auto-javob o'chirildi.");
      break;

    case "refresh":
      await tg.answerCallbackQuery(cq.id, "Yangilandi.");
      break;

    case "listadmins": {
      const admins = await getAdmins(env);
      const list = admins.length > 0 ? admins.join(", ") : "yo'q";
      await tg.answerCallbackQuery(cq.id, `Adminlar: ${list}`, true);
      return; // panel matni o'zgarmadi, qayta chizish shart emas
    }

    case "stats": {
      const stats = await getStats(env);
      await tg.answerCallbackQuery(
        cq.id,
        `📈 Bot javob bergan: ${stats.repliedCount}\n💬 Javob qaytarganlar: ${stats.respondedCount}`,
        true,
      );
      return; // panel matni o'zgarmadi
    }

    case "promptinfo":
      await tg.answerCallbackQuery(
        cq.id,
        "O'zgartirish uchun: /setprompt <matn>. Standartga qaytarish: /resetprompt",
        true,
      );
      return; // panel matni o'zgarmadi

    default:
      await tg.answerCallbackQuery(cq.id);
      return;
  }

  await tg.editMessageText(
    chatId,
    messageId,
    panelText(settings, env),
    panelKeyboardWithApp(settings, `${env.APP_BASE_URL}/app`),
  );
}

async function handleCommand(
  tg: ReturnType<typeof telegramApi>,
  env: Env,
  chatId: number,
  userId: number,
  messageId: number,
  text: string,
): Promise<void> {
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();

  const requireAdmin = async (): Promise<boolean> => {
    if (await isAdmin(env, userId)) return true;
    await tg.sendMessage(
      chatId,
      "Bu buyruq faqat adminlar uchun. O'z ID raqamingizni bilish uchun /myid yozing.",
      messageId,
    );
    return false;
  };

  switch (command) {
    case "/start": {
      if (await isAdmin(env, userId)) {
        const settings = await getChatSettings(env, chatId);
        await tg.sendMessage(
          chatId,
          `Salom! Men AI (Claude) yordamida avtomatik javob beruvchi botman.\n\n${panelText(settings, env)}`,
          undefined,
          panelKeyboardWithApp(settings, `${env.APP_BASE_URL}/app`),
        );
      } else {
        await tg.sendMessage(
          chatId,
          "Salom! Men AI (Claude) yordamida avtomatik javob beruvchi botman.\n\nBuyruqlar ro'yxati uchun /help yozing.",
        );
      }
      return;
    }

    case "/help":
      await tg.sendMessage(chatId, HELP_TEXT);
      return;

    case "/panel": {
      if (!(await requireAdmin())) return;
      const settings = await getChatSettings(env, chatId);
      await tg.sendMessage(
        chatId,
        panelText(settings, env),
        undefined,
        panelKeyboardWithApp(settings, `${env.APP_BASE_URL}/app`),
      );
      return;
    }

    case "/stats": {
      if (!(await requireAdmin())) return;
      const stats = await getStats(env);
      await tg.sendMessage(
        chatId,
        `📈 Bot javob bergan foydalanuvchilar: ${stats.repliedCount}\n💬 Javob qaytarganlar: ${stats.respondedCount}`,
      );
      return;
    }

    case "/myid":
      await tg.sendMessage(chatId, `Sizning Telegram ID: ${userId}`);
      return;

    case "/autoreply_on": {
      if (!(await requireAdmin())) return;
      const settings = await getChatSettings(env, chatId);
      settings.autoreply = true;
      await setChatSettings(env, chatId, settings);
      await tg.sendMessage(chatId, "AI avto-javob shu chatda yoqildi.");
      return;
    }

    case "/autoreply_off": {
      if (!(await requireAdmin())) return;
      const settings = await getChatSettings(env, chatId);
      settings.autoreply = false;
      await setChatSettings(env, chatId, settings);
      await tg.sendMessage(chatId, "AI avto-javob shu chatda o'chirildi.");
      return;
    }

    case "/setprompt": {
      if (!(await requireAdmin())) return;
      const prompt = args.join(" ").trim();
      if (!prompt) {
        await tg.sendMessage(chatId, "Foydalanish: /setprompt <AI uchun ko'rsatma matni>");
        return;
      }
      const settings = await getChatSettings(env, chatId);
      settings.prompt = prompt;
      await setChatSettings(env, chatId, settings);
      await clearHistory(env, chatId);
      await tg.sendMessage(chatId, "Shu chat uchun AI ko'rsatmasi yangilandi.");
      return;
    }

    case "/resetprompt": {
      if (!(await requireAdmin())) return;
      const settings = await getChatSettings(env, chatId);
      settings.prompt = null;
      await setChatSettings(env, chatId, settings);
      await clearHistory(env, chatId);
      await tg.sendMessage(chatId, "AI ko'rsatmasi standart holatga qaytarildi.");
      return;
    }

    case "/status": {
      const settings = await getChatSettings(env, chatId);
      const state = settings.autoreply ? "yoqilgan" : "o'chirilgan";
      const prompt = settings.prompt ?? env.DEFAULT_SYSTEM_PROMPT;
      await tg.sendMessage(chatId, `Avto-javob: ${state}\nKo'rsatma: ${prompt}`);
      return;
    }

    case "/addadmin": {
      if (!(await requireAdmin())) return;
      const targetId = parseInt(args[0], 10);
      if (args.length !== 1 || Number.isNaN(targetId)) {
        await tg.sendMessage(chatId, "Foydalanish: /addadmin <Telegram ID>");
        return;
      }
      const added = await addAdmin(env, targetId);
      await tg.sendMessage(chatId, added ? `${targetId} endi admin.` : `${targetId} allaqachon admin edi.`);
      return;
    }

    case "/removeadmin": {
      if (!(await requireAdmin())) return;
      const targetId = parseInt(args[0], 10);
      if (args.length !== 1 || Number.isNaN(targetId)) {
        await tg.sendMessage(chatId, "Foydalanish: /removeadmin <Telegram ID>");
        return;
      }
      const removed = await removeAdmin(env, targetId);
      await tg.sendMessage(
        chatId,
        removed
          ? `${targetId} adminlikdan olib tashlandi.`
          : "Bajarilmadi: bu ID admin emas, yoki oxirgi (yagona) adminni olib tashlab bo'lmaydi.",
      );
      return;
    }

    case "/listadmins": {
      if (!(await requireAdmin())) return;
      const admins = await getAdmins(env);
      const listText = admins.length > 0 ? admins.join("\n") : "Adminlar yo'q.";
      await tg.sendMessage(chatId, `Adminlar:\n${listText}`);
      return;
    }

    default:
      return;
  }
}
