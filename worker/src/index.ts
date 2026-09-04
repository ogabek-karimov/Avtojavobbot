import { validateInitData } from "./auth";
import { getReply } from "./reply";
import { telegramApi, type InlineKeyboard } from "./telegram";
import {
  addAdmin,
  addFaqEntry,
  appendHistory,
  clearHistory,
  getAdmins,
  getBusinessConnection,
  getChatSettings,
  getFaq,
  getOwner,
  getStats,
  isAdmin,
  isOwner,
  matchFaq,
  recordAutoReplyInteraction,
  removeAdmin,
  removeFaqEntry,
  setBusinessConnection,
  setChatSettings,
  transferOwnership,
} from "./store";
import type {
  ChatSettings,
  Env,
  TelegramBusinessConnection,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from "./types";
import { classifyRisk } from "./safety";
import { renderAppHtml } from "./webapp";

const RISKY_CONTENT_REPLY =
  "Bu xabar avtomatik javob berilmaydigan mavzuga tegishli. " +
  "Iltimos, kuting - bot egasi sizga shaxsan javob beradi.";

const PROFANITY_REPLY =
  "Haqorat qilish⚠️\n\n" +
  "To'g'ridan-to'g'ri Jinoiy javobgarlik (Jinoyat kodeksi, 140-modda, 2-qism)\n\n" +
  "Agar shaxs Telegram orqali (guruhlarda, kanallarda yoki shaxsiy yozishmada) birovni beodob so'zlar bilan " +
  "tahqirlasa, qonunga ko'ra ma'muriy jazo kutilmasdan, to'g'ridan-to'g'ri jinoiy ish qo'zg'atiladi.\n\n" +
  "Jarima: BHMning 200 baravaridan 400 baravarigacha (bugungi kunda taxminan 75 mln so'mdan 150 mln so'mgacha).\n" +
  "Majburiy ishlar: 240 soatdan 300 soatgacha majburiy jamoat ishlari.\n" +
  "Axloq tuzatish ishlari: 1 yildan 2 yilgacha ish haqining muayyan qismini davlat foydasiga ushlab qolish jazosi.";

/**
 * Prepended to every AI-generated auto-reply (regular chat and Telegram Business alike).
 * Hard-blocks a few behaviors no unsupervised autoresponder should ever perform, regardless
 * of how the conversation is steered - agreeing to meet in person, or handing out the
 * admin's phone number, Telegram ID, or group/channel/bot membership counts.
 *
 * The "I'm an AI" disclosure is deliberately NOT delegated to the model as an instruction -
 * an earlier version asked the model to open every reply with a fixed sentence, but once a
 * conversation's history already contained that sentence with an old name in it, the model
 * kept repeating the old name from its own prior turns instead of following the current
 * instruction. It's prepended in code instead (see introSentence()) - guaranteed correct
 * on every message, independent of what the model does.
 */
function guardrailPreamble(): string {
  return (
    "Siz odam emassiz - siz sun'iy intellekt (AI) agentisiz. Bu allaqachon foydalanuvchiga " +
    "ochiq aytilgan (javobingiz oldida), shuning uchun buni o'zingiz alohida takrorlashingiz shart emas.\n\n" +
    "Javobingizni FAQAT sof, adabiy, grammatik jihatdan to'g'ri o'zbek tilida yozing. Gaplarni tabiiy " +
    "va ravon tuzing, so'zlarni to'g'ri qo'shimchalar bilan bog'lang (masalan ega-kesim, egalik va kelishik " +
    "qo'shimchalarini to'g'ri qo'llang), rus yoki ingliz tilidan so'zma-so'z tarjima qilingandek noqulay " +
    "jumlalar yozmang. Javobni yuborishdan oldin grammatikasini o'zingiz tekshirib chiqing.\n\n" +
    "Quyidagilarni HECH QACHON qilmang, hatto qat'iy so'ralsa yoki suhbat shunga undasa ham:\n" +
    "- Uchrashuvga rozi bo'lmang yoki uni tasdiqlaydigan gap yozmang (\"keldim\", \"tayyorman\", \"u yerda ko'rishamiz\" kabi).\n" +
    "- Telefon raqamni bermang.\n" +
    "- Telegram ID raqamini bermang.\n" +
    "- Nechta guruh, kanal yoki botga a'zo ekanligi haqidagi savolga javob bermang.\n" +
    "Shu mavzularning har birida buni bera olmasligingizni ayting va foydalanuvchini bot egasi shaxsan javob berishini kutishini so'rang.\n\n"
  );
}

/** The literal, code-guaranteed AI-disclosure line prepended to every auto-reply. */
function introSentence(ownerName: string | null): string {
  return ownerName ? `🤖 Men ${ownerName}ning AI agentiman.` : "🤖 Men AI agentiman.";
}

const HELP_TEXT = `/panel - boshqaruv panelini ochish (tugmalar bilan, faqat adminlar)
/stats - hisobot: nechta userga javob berdi, nechtasi javob qaytardi (faqat adminlar)
/autoreply_on - shu chatda AI avto-javobni yoqish (faqat adminlar)
/autoreply_off - shu chatda AI avto-javobni o'chirish (faqat adminlar)
/setprompt <matn> - shu chat uchun AI ko'rsatmasini (persona) sozlash (faqat adminlar)
/resetprompt - ko'rsatmani standart holatga qaytarish (faqat adminlar)
/status - shu chatning joriy holatini ko'rish
/myid - o'zingizning Telegram ID raqamingizni bilish
/addadmin <ID> - boshqa foydalanuvchini kichik admin qilish (faqat asosiy admin)
/removeadmin <ID> - adminlikdan olib tashlash (faqat asosiy admin)
/listadmins - joriy adminlar ro'yxati (👑 - asosiy admin)
/transferownership <ID> - asosiy adminlik huquqini boshqa adminga o'tkazish (faqat asosiy admin)`;

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
  kb.inline_keyboard.unshift([
    { text: "🏢 Business sozlamalarini ochish", url: "tg://settings/business" },
  ]);
  kb.inline_keyboard.unshift([{ text: "🖥 To'liq ilovani ochish", web_app: { url: appUrl } }]);
  return kb;
}

/**
 * Keeps the persistent Menu (☰) button in sync with admin status: only admins get the
 * button that opens the Mini App - everyone else falls back to the plain command list.
 * Assumes chat_id == user_id, true for the private 1:1 chats this bot is used in.
 */
async function syncAdminMenuButton(
  tg: ReturnType<typeof telegramApi>,
  env: Env,
  targetChatId: number,
  isNowAdmin: boolean,
): Promise<void> {
  if (isNowAdmin) {
    await tg.setChatMenuButton(targetChatId, {
      type: "web_app",
      text: "Menu",
      web_app: { url: `${env.APP_BASE_URL}/app` },
    });
  } else {
    await tg.setChatMenuButton(targetChatId, { type: "default" });
  }
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
  if (!user.is_premium) {
    return new Response("Bu ilova faqat Telegram Premium egasi bo'lgan adminlar uchun.", { status: 403 });
  }
  return { userId: user.id, body };
}

async function buildAppState(env: Env, chatId: number) {
  const [settings, admins, ownerId, faq, stats] = await Promise.all([
    getChatSettings(env, chatId),
    getAdmins(env),
    getOwner(env),
    getFaq(env, chatId),
    getStats(env),
  ]);
  return { settings, admins, ownerId, faq, stats, defaultPrompt: env.DEFAULT_SYSTEM_PROMPT };
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
      if (!(await isOwner(env, userId))) return new Response("Bu amal faqat asosiy admin uchun.", { status: 403 });
      const targetId = parseInt(value, 10);
      if (Number.isNaN(targetId)) return new Response("Noto'g'ri ID.", { status: 400 });
      const added = await addAdmin(env, targetId);
      if (added) await syncAdminMenuButton(telegramApi(env.TELEGRAM_BOT_TOKEN), env, targetId, true);
      break;
    }
    case "remove_admin": {
      if (!(await isOwner(env, userId))) return new Response("Bu amal faqat asosiy admin uchun.", { status: 403 });
      const targetId = parseInt(value, 10);
      if (Number.isNaN(targetId)) return new Response("Noto'g'ri ID.", { status: 400 });
      const removed = await removeAdmin(env, targetId);
      if (removed) await syncAdminMenuButton(telegramApi(env.TELEGRAM_BOT_TOKEN), env, targetId, false);
      break;
    }
    case "transfer_ownership": {
      if (!(await isOwner(env, userId))) return new Response("Bu amal faqat asosiy admin uchun.", { status: 403 });
      const targetId = parseInt(value, 10);
      if (Number.isNaN(targetId)) return new Response("Noto'g'ri ID.", { status: 400 });
      const transferred = await transferOwnership(env, targetId);
      if (!transferred) {
        return new Response("Bu ID hali admin emas - avval uni admin qiling.", { status: 400 });
      }
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

  if (update.business_connection) {
    await handleBusinessConnection(update.business_connection, env);
    return;
  }

  if (update.business_message) {
    await handleBusinessMessage(update.business_message, env);
    return;
  }

  const message = update.message;
  if (!message || !message.text || !message.from) return;

  const tg = telegramApi(env.TELEGRAM_BOT_TOKEN);
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text.trim();

  if (text.startsWith("/")) {
    await handleCommand(tg, env, chatId, message.from, message.message_id, text);
    return;
  }

  const settings = await getChatSettings(env, chatId);
  if (!settings.autoreply) return;

  await recordAutoReplyInteraction(env, userId);

  const riskCategory = await classifyRisk(env, text);
  if (riskCategory === "profanity") {
    await tg.sendMessage(chatId, PROFANITY_REPLY);
    return;
  }
  if (riskCategory === "other") {
    await tg.sendMessage(chatId, RISKY_CONTENT_REPLY);
    return;
  }

  const faq = await getFaq(env, chatId);
  const faqReply = matchFaq(faq, text);
  if (faqReply) {
    await tg.sendMessage(chatId, faqReply);
    return;
  }

  const systemPrompt = guardrailPreamble() + (settings.prompt ?? env.DEFAULT_SYSTEM_PROMPT);
  const limit = parseInt(env.HISTORY_LIMIT, 10);

  const history = await appendHistory(env, chatId, { role: "user", content: text }, limit);
  await tg.sendChatAction(chatId, "typing");
  const aiText = await getReply(env, history, systemPrompt);
  await appendHistory(env, chatId, { role: "assistant", content: aiText }, limit);
  const reply = `${introSentence(null)}\n\n${aiText}`;
  await tg.sendMessage(chatId, reply);
}

/**
 * A user connected (or reconfigured) the bot in their Telegram Business settings.
 * We only activate it for people already on our own admin list - anyone else who
 * happens to add this bot as their business bot gets no auto-reply behavior.
 */
async function handleBusinessConnection(conn: TelegramBusinessConnection, env: Env): Promise<void> {
  const ownerIsAdmin = await isAdmin(env, conn.user.id);
  if (!ownerIsAdmin) return;

  await setBusinessConnection(env, conn.id, {
    ownerId: conn.user.id,
    ownerFirstName: conn.user.first_name,
    enabled: conn.is_enabled,
  });
}

/**
 * A message someone sent directly to an admin's personal Telegram account, which the
 * admin has connected to this bot via Telegram Business. Settings/prompt/FAQ come from
 * the connected admin's own configuration; conversation history is kept per customer.
 */
async function handleBusinessMessage(message: TelegramMessage, env: Env): Promise<void> {
  const connectionId = message.business_connection_id;
  if (!connectionId || !message.text || !message.from) return;

  const conn = await getBusinessConnection(env, connectionId);
  if (!conn || !conn.enabled) return;
  if (message.from.id === conn.ownerId) return; // egasining o'zi yozgan xabarga javob bermaymiz

  const tg = telegramApi(env.TELEGRAM_BOT_TOKEN);
  const customerChatId = message.chat.id;
  const text = message.text.trim();

  const settings = await getChatSettings(env, conn.ownerId);
  if (!settings.autoreply) return;

  await recordAutoReplyInteraction(env, message.from.id);

  const riskCategory = await classifyRisk(env, text);
  if (riskCategory === "profanity") {
    await tg.sendMessage(customerChatId, PROFANITY_REPLY, undefined, undefined, connectionId);
    return;
  }
  if (riskCategory === "other") {
    await tg.sendMessage(customerChatId, RISKY_CONTENT_REPLY, undefined, undefined, connectionId);
    return;
  }

  const faq = await getFaq(env, conn.ownerId);
  const faqReply = matchFaq(faq, text);
  if (faqReply) {
    await tg.sendMessage(customerChatId, faqReply, undefined, undefined, connectionId);
    return;
  }

  // Kesh emas - har safar jonli o'qiladi, shunda profil ismi o'zgarsa ham darhol aks etadi.
  const liveOwnerName = (await tg.getChatFirstName(conn.ownerId)) ?? conn.ownerFirstName;

  const limit = parseInt(env.HISTORY_LIMIT, 10);
  const systemPrompt = guardrailPreamble() + (settings.prompt ?? env.DEFAULT_SYSTEM_PROMPT);

  const history = await appendHistory(env, customerChatId, { role: "user", content: text }, limit);
  await tg.sendChatAction(customerChatId, "typing", connectionId);
  const aiText = await getReply(env, history, systemPrompt);
  await appendHistory(env, customerChatId, { role: "assistant", content: aiText }, limit);
  const reply = `${introSentence(liveOwnerName)}\n\n${aiText}`;
  await tg.sendMessage(customerChatId, reply, undefined, undefined, connectionId);
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
  if (!cq.from.is_premium) {
    await tg.answerCallbackQuery(cq.id, "Bu tugma faqat Telegram Premium egasi bo'lgan adminlar uchun.", true);
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
      const [admins, ownerId] = await Promise.all([getAdmins(env), getOwner(env)]);
      const list =
        admins.length > 0
          ? admins.map((id) => (id === ownerId ? `👑${id}` : `${id}`)).join(", ")
          : "yo'q";
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
  from: TelegramUser,
  messageId: number,
  text: string,
): Promise<void> {
  const userId = from.id;
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();

  // Boshqaruv buyruqlari uchun admin ro'yxatida bo'lish yetarli emas - Telegram Premium
  // egasi bo'lish ham shart, shunday qilib tasodifan admin qilingan/ID taxmin qilingan
  // hisob buyruqlarni ishlata olmaydi.
  const requireAdmin = async (): Promise<boolean> => {
    if (!(await isAdmin(env, userId))) {
      await tg.sendMessage(
        chatId,
        "Bu buyruq faqat adminlar uchun. O'z ID raqamingizni bilish uchun /myid yozing.",
        messageId,
      );
      return false;
    }
    if (!from.is_premium) {
      await tg.sendMessage(
        chatId,
        "Bu buyruq faqat Telegram Premium egasi bo'lgan adminlar uchun.",
        messageId,
      );
      return false;
    }
    return true;
  };

  const requireOwner = async (): Promise<boolean> => {
    if (!(await isOwner(env, userId))) {
      await tg.sendMessage(chatId, "Bu buyruq faqat asosiy admin (egasi) uchun.", messageId);
      return false;
    }
    if (!from.is_premium) {
      await tg.sendMessage(chatId, "Bu buyruq faqat Telegram Premium egasi bo'lgan asosiy admin uchun.", messageId);
      return false;
    }
    return true;
  };

  switch (command) {
    case "/start": {
      if ((await isAdmin(env, userId)) && from.is_premium) {
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
      if (!(await requireOwner())) return;
      const targetId = parseInt(args[0], 10);
      if (args.length !== 1 || Number.isNaN(targetId)) {
        await tg.sendMessage(chatId, "Foydalanish: /addadmin <Telegram ID>");
        return;
      }
      const added = await addAdmin(env, targetId);
      if (added) await syncAdminMenuButton(tg, env, targetId, true);
      await tg.sendMessage(
        chatId,
        added ? `${targetId} endi kichik admin.` : `${targetId} allaqachon admin edi.`,
      );
      return;
    }

    case "/removeadmin": {
      if (!(await requireOwner())) return;
      const targetId = parseInt(args[0], 10);
      if (args.length !== 1 || Number.isNaN(targetId)) {
        await tg.sendMessage(chatId, "Foydalanish: /removeadmin <Telegram ID>");
        return;
      }
      const removed = await removeAdmin(env, targetId);
      if (removed) await syncAdminMenuButton(tg, env, targetId, false);
      await tg.sendMessage(
        chatId,
        removed
          ? `${targetId} adminlikdan olib tashlandi.`
          : "Bajarilmadi: bu ID admin emas, asosiy admin (egasi)ni to'g'ridan-to'g'ri o'chirib bo'lmaydi, yoki oxirgi (yagona) adminni olib tashlab bo'lmaydi.",
      );
      return;
    }

    case "/listadmins": {
      if (!(await requireAdmin())) return;
      const [admins, ownerId] = await Promise.all([getAdmins(env), getOwner(env)]);
      const listText =
        admins.length > 0
          ? admins.map((id) => (id === ownerId ? `👑 ${id} (asosiy admin)` : `${id}`)).join("\n")
          : "Adminlar yo'q.";
      await tg.sendMessage(chatId, `Adminlar:\n${listText}`);
      return;
    }

    case "/transferownership": {
      if (!(await requireOwner())) return;
      const targetId = parseInt(args[0], 10);
      if (args.length !== 1 || Number.isNaN(targetId)) {
        await tg.sendMessage(chatId, "Foydalanish: /transferownership <Telegram ID (u avvaldan admin bo'lishi kerak)>");
        return;
      }
      const transferred = await transferOwnership(env, targetId);
      await tg.sendMessage(
        chatId,
        transferred
          ? `👑 Asosiy adminlik huquqi ${targetId}ga o'tkazildi.`
          : "Bajarilmadi: bu ID hali admin emas. Avval /addadmin bilan admin qiling, keyin egalikni o'tkazing.",
      );
      return;
    }

    default:
      return;
  }
}
