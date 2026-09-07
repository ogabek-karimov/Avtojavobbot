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

/**
 * Meaning-based (not regex-pattern) extraction of the event's actual date/time from the
 * announcement's own body text - the listing page's "date" is just the publish date, not
 * when the defense/seminar happens. Same reliable pattern as the other AI classifiers in
 * this project (temperature 0, strict single-line output, fails to null on any error).
 */
async function extractEventDateTime(env: Env, articleText: string): Promise<string | null> {
  try {
    const systemPrompt =
      "Quyidagi e'lon matnidan tadbir (himoya/seminar/konferensiya) o'tkaziladigan ANIQ sana va soatni toping. " +
      "Faqat sana (yil bilan) va soatni qisqa, tushunarli qilib yozing (masalan: \"2026-yil 9-sentabr, soat " +
      "12:00\"). Boshqa hech narsa, izoh yoki qo'shimcha so'z yozmang. Agar matnda aniq sana yoki soat " +
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
    return answer;
  } catch (error) {
    console.error("Event date/time extraction failed", error);
    return null;
  }
}

const LAST_SEEN_KEY = "announcements:last_seen_url";

/** Runs on the Cron Trigger. Notifies the owner only when the newest announcement's URL changes. */
export async function checkAnnouncements(env: Env): Promise<void> {
  const latest = await fetchLatestAnnouncement(env);
  if (!latest || !latest.url) return;

  const lastSeenUrl = await env.BOT_KV.get(LAST_SEEN_KEY);
  if (lastSeenUrl === latest.url) return;

  await env.BOT_KV.put(LAST_SEEN_KEY, latest.url);

  // Birinchi marta ishga tushganda (hali hech narsa saqlanmagan) bildirishnoma yuborilmaydi -
  // aks holda hozir saytda turgan eng so'nggi e'lon ham "yangi" deb noto'g'ri chiqib ketadi.
  if (lastSeenUrl === null) return;

  const articleText = await fetchArticleBodyText(latest.url);

  // Faqat ZOOM orqali o'tkaziladigan e'lonlar haqida ogohlantiramiz - boshqa turdagi
  // e'lonlar (ZOOM haqida so'z yo'q) o'tkazib yuboriladi, ammo lastSeenUrl baribir
  // yangilanadi (yuqorida) - shu e'lonni "ko'rilgan" deb belgilash uchun, aks holda
  // keyingi tekshiruvda ham qayta-qayta ko'rib chiqiladi.
  const mentionsZoom = /zoom/i.test(latest.title) || (articleText ? /zoom/i.test(articleText) : false);
  if (!mentionsZoom) return;

  const eventDateTime = articleText ? await extractEventDateTime(env, articleText) : null;

  const dateLine = eventDateTime
    ? `🗓 O'tkaziladigan sana: ${eventDateTime}`
    : `📅 E'lon joylangan sana: ${latest.date}`;

  const ownerId = await getOwner(env);
  const tg = telegramApi(env.TELEGRAM_BOT_TOKEN);
  await tg.sendMessage(ownerId, `📢 Saytda yangi e'lon!\n\n${latest.title}\n${dateLine}\n🔗 ${latest.url}`);
}
