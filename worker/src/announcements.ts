import { getOwner } from "./store";
import { telegramApi } from "./telegram";
import type { Env } from "./types";

interface AnnouncementInfo {
  url: string | null;
  title: string;
  date: string;
}

/**
 * Scrapes the site's announcements listing page for the newest (first) card. The page is
 * plain server-rendered HTML (verified - no client-side JS rendering needed), so
 * HTMLRewriter can extract it directly without a full DOM/browser. Only the very first
 * matching element of each selector is kept (the "recording" flags turn off once a second
 * match starts) - that's the newest announcement, since the listing sorts newest-first.
 */
async function fetchLatestAnnouncement(env: Env): Promise<AnnouncementInfo | null> {
  const res = await fetch(env.ANNOUNCEMENTS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AvtojavobBot/1.0; +https://avtojavobbot.bek8896ok.workers.dev)",
    },
  });
  if (!res.ok) return null;

  let cardsSeen = 0;
  let titleSeen = 0;
  let dateSeen = 0;
  let recordingTitle = false;
  let recordingDate = false;
  let rawTitle = "";
  let rawDate = "";
  let firstHref: string | null = null;

  const rewriter = new HTMLRewriter()
    .on("a.news-card-link", {
      element(el) {
        cardsSeen++;
        if (cardsSeen === 1) firstHref = el.getAttribute("href");
      },
    })
    .on("h3.news-card-title", {
      element() {
        titleSeen++;
        recordingTitle = titleSeen === 1;
      },
      text(t) {
        if (recordingTitle) rawTitle += t.text;
      },
    })
    .on("span.news-card-date", {
      element() {
        dateSeen++;
        recordingDate = dateSeen === 1;
      },
      text(t) {
        if (recordingDate) rawDate += t.text;
      },
    });

  // .transform() only wires up the handlers - reading the body is what actually drives
  // the stream through them. The rewritten output itself is discarded (side effects only).
  await rewriter.transform(res).text();

  if (!firstHref) return null;

  return {
    url: new URL(firstHref, env.ANNOUNCEMENTS_URL).toString(),
    title: rawTitle.trim(),
    date: rawDate.trim(),
  };
}

/** Plain text of the announcement's own body (div.blog-content) - where the actual event date/time lives. */
async function fetchArticleBodyText(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AvtojavobBot/1.0; +https://avtojavobbot.bek8896ok.workers.dev)",
    },
  });
  if (!res.ok) return null;

  let recording = false;
  let seen = 0;
  let text = "";

  const rewriter = new HTMLRewriter().on("div.blog-content", {
    element() {
      seen++;
      recording = seen === 1;
    },
    text(t) {
      if (recording) text += t.text;
      // Ko'p paragraf o'qishning hojati yo'q - sana odatda eng boshida keladi.
      if (recording && text.length > 1500) recording = false;
    },
  });

  await rewriter.transform(res).text();
  return text.trim() || null;
}

interface EventDateInfo {
  isoDate: string; // YYYY-MM-DD, taqvim hisob-kitobi uchun (1 kun oldin eslatish)
  timeText: string; // odam o'qiydigan qism, masalan "soat 12:00"
}

/**
 * Meaning-based (not regex-pattern) extraction of the event's actual date/time from the
 * announcement's own body text - the listing page's "date" is just the publish date, not
 * when the defense/seminar happens. Qat'iy "YYYY-MM-DD | soat HH:MM" formatda so'raladi,
 * shunda isoDate ustida taqvim hisob-kitobi (ertaga - bugun) ishonchli ishlaydi. Same
 * reliable pattern as the other AI classifiers in this project (temperature 0, fails to
 * null on any error or format mismatch).
 */
async function extractEventDateInfo(env: Env, articleText: string): Promise<EventDateInfo | null> {
  try {
    const systemPrompt =
      "Quyidagi e'lon matnidan tadbir (himoya/seminar/konferensiya) o'tkaziladigan ANIQ sana va soatni toping. " +
      'Javobni FAQAT ushbu qat\'iy formatda yozing: YYYY-MM-DD | soat HH:MM (masalan: 2026-09-09 | soat ' +
      "12:00). Boshqa hech narsa, izoh yoki qo'shimcha so'z yozmang. Agar matnda aniq sana yoki soat " +
      "topilmasa, faqat bitta so'z bilan javob bering: NOANIQ.";

    const result = (await env.AI.run(env.WORKERS_AI_MODEL as Parameters<Ai["run"]>[0], {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: articleText },
      ],
      temperature: 0,
    } as never)) as { response?: string };

    const answer = (result?.response ?? "").trim();
    if (!answer || answer.toUpperCase().includes("NOANIQ")) return null;

    const match = answer.match(/(\d{4})-(\d{2})-(\d{2})\s*\|\s*(.+)/);
    if (!match) return null;

    const isoDate = `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null; // sun'iy/noto'g'ri sana chiqib ketmasin

    return { isoDate, timeText: match[4].trim() };
  } catch (error) {
    console.error("Event date extraction failed", error);
    return null;
  }
}

/** Toshkent vaqti (UTC+5, yozgi vaqtga o'tish yo'q) bo'yicha YYYY-MM-DD, offsetDays kun qo'shib/ayirib. */
function tashkentDateString(offsetDays: number): string {
  const ms = Date.now() + 5 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface PendingEvent {
  url: string;
  title: string;
  isoDate: string;
  timeText: string;
  reminded: boolean;
}

const LAST_SEEN_KEY = "announcements:last_seen_url";
const PENDING_KEY = "announcements:pending";

async function getPending(env: Env): Promise<PendingEvent[]> {
  const raw = await env.BOT_KV.get(PENDING_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingEvent[];
  } catch {
    return [];
  }
}

async function savePending(env: Env, list: PendingEvent[]): Promise<void> {
  await env.BOT_KV.put(PENDING_KEY, JSON.stringify(list));
}

/** Saytni tekshirib, yangi ZOOM e'lon topilsa uni "kutilayotgan eslatmalar" ro'yxatiga qo'shadi. */
async function pollForNewAnnouncement(env: Env): Promise<void> {
  const latest = await fetchLatestAnnouncement(env);
  if (!latest || !latest.url) return;

  const lastSeenUrl = await env.BOT_KV.get(LAST_SEEN_KEY);
  if (lastSeenUrl === latest.url) return;

  await env.BOT_KV.put(LAST_SEEN_KEY, latest.url);

  // Birinchi marta ishga tushganda (hali hech narsa saqlanmagan) hech narsa rejalashtirilmaydi -
  // aks holda hozir saytda turgan eng so'nggi e'lon ham "yangi" deb noto'g'ri chiqib ketadi.
  if (lastSeenUrl === null) return;

  const articleText = await fetchArticleBodyText(latest.url);

  // Faqat ZOOM orqali o'tkaziladigan e'lonlar bilan ishlaymiz - boshqa turdagi e'lonlar kerak emas.
  const mentionsZoom = /zoom/i.test(latest.title) || (articleText ? /zoom/i.test(articleText) : false);
  if (!mentionsZoom) return;

  const eventInfo = articleText ? await extractEventDateInfo(env, articleText) : null;

  if (!eventInfo) {
    // Sana aniqlanmasa 1 kun oldin eslatib bo'lmaydi - imkoniyatni boy bermaslik uchun
    // shu holatda darhol xabar beramiz.
    const ownerId = await getOwner(env);
    const tg = telegramApi(env.TELEGRAM_BOT_TOKEN);
    await tg.sendMessage(
      ownerId,
      `📢 Yangi ZOOM e'lon (aniq sanasini avtomatik topib bo'lmadi):\n\n${latest.title}\n🔗 ${latest.url}`,
    );
    return;
  }

  const pending = await getPending(env);
  pending.push({ url: latest.url, title: latest.title, isoDate: eventInfo.isoDate, timeText: eventInfo.timeText, reminded: false });
  await savePending(env, pending);
}

/** Kutilayotgan tadbirlarni ko'rib chiqadi - tadbirdan 1 kun oldin (Toshkent vaqti) eslatma yuboradi. */
async function sendDueReminders(env: Env): Promise<void> {
  const pending = await getPending(env);
  if (pending.length === 0) return;

  const today = tashkentDateString(0);
  const tomorrow = tashkentDateString(1);

  const ownerId = await getOwner(env);
  const tg = telegramApi(env.TELEGRAM_BOT_TOKEN);

  let changed = false;
  const remaining: PendingEvent[] = [];

  for (const ev of pending) {
    // Tadbir sanasi allaqachon o'tib ketgan bo'lsa - ro'yxatdan olib tashlaymiz.
    if (ev.isoDate < today) {
      changed = true;
      continue;
    }

    if (!ev.reminded && ev.isoDate === tomorrow) {
      await tg.sendMessage(
        ownerId,
        `⏰ Eslatma: ertaga (${ev.isoDate}) ${ev.timeText} ZOOM orqali bo'lib o'tadi:\n\n${ev.title}\n🔗 ${ev.url}`,
      );
      ev.reminded = true;
      changed = true;
    }

    remaining.push(ev);
  }

  if (changed) await savePending(env, remaining);
}

/**
 * Runs on the Cron Trigger (har soatda). Ikki ish qiladi: (1) saytda yangi ZOOM e'lon
 * chiqqanmi tekshiradi va uni "kutilayotgan eslatmalar" ro'yxatiga qo'shadi, (2) shu
 * ro'yxatdagi tadbirlardan qaysi biri ertaga bo'lib o'tishini tekshirib, o'sha kuni bir
 * marta (reminded flag orqali) eslatma yuboradi - darhol emas, aynan 1 kun oldin.
 */
export async function checkAnnouncements(env: Env): Promise<void> {
  await pollForNewAnnouncement(env);
  await sendDueReminders(env);
}
