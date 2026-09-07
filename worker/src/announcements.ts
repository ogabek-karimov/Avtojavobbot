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

  const ownerId = await getOwner(env);
  const tg = telegramApi(env.TELEGRAM_BOT_TOKEN);
  await tg.sendMessage(ownerId, `📢 Saytda yangi e'lon!\n\n${latest.title}\n📅 ${latest.date}\n🔗 ${latest.url}`);
}
