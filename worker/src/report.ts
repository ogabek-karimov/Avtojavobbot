import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, rgb } from "pdf-lib";
import { NOTO_SANS_REGULAR_BASE64 } from "./font-data";
import { REPORT_LOG_CAP, getInteractionLog, getStats } from "./store";
import type { Env } from "./types";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Toshkent vaqti (UTC+5) bo'yicha "YYYY-MM-DD SS:DD" formatida. */
function tashkentTimestamp(epochMs: number): string {
  const d = new Date(epochMs + 5 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const PAGE_WIDTH = 595.28; // A4, pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// font.widthOfTextAtSize() is the expensive part of laying out a report with hundreds of
// entries (it re-measures every candidate line while word-wrapping) - CPU-heavy enough with
// a custom embedded font to blow past the Workers Free plan's per-request CPU budget once the
// log has more than ~100 entries. Measuring one sample string per font size ONCE and wrapping
// by character count instead (cheap arithmetic, no font calls) cuts that cost by orders of
// magnitude; the line breaks are very slightly less pixel-perfect, which is an easy trade.
const avgCharWidthCache = new Map<number, number>();
const WIDTH_SAMPLE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";

function averageCharWidth(font: PDFFont, size: number): number {
  const cached = avgCharWidthCache.get(size);
  if (cached !== undefined) return cached;
  const width = font.widthOfTextAtSize(WIDTH_SAMPLE, size) / WIDTH_SAMPLE.length;
  avgCharWidthCache.set(size, width);
  return width;
}

// Noto Sans - matn shrifti, rangli emoji uchun glif yo'q (buning uchun alohida, og'ir
// rasm-asosli shrift kerak bo'lardi). pdf-lib bunday belgini jimgina .notdef (bo'sh) glifga
// almashtiradi - xato bermaydi, lekin natijada PDF matnida ko'rinmas NULL (U+0000) belgi
// qolib ketadi (jonli tekshirib topilgan haqiqiy nosozlik - masalan robot-emoji bilan
// boshlangan javob matni buzilib chiqqan edi). Chizishdan oldin PDF shrifti chiza olmaydigan
// belgilarni (emoji va ularning variatsiya tanlagichlarini) olib tashlaymiz - matnning
// o'zi saqlanib qoladi, faqat bezak belgisi tushib qoladi.
function sanitizeForPdf(text: string): string {
  return text.replace(/\p{Extended_Pictographic}️?/gu, "");
}

/** Greedy word-wrap - matnni berilgan kenglikka (belgilar soni orqali, taxminan) sig'adigan qatorlarga bo'ladi. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / averageCharWidth(font, size)));
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && candidate.length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/**
 * Har bir foydalanuvchi yozgan xabar va botning javobini o'z ichiga olgan to'liq hisobot -
 * har safar shu funksiya chaqirilganda KV'dagi ENG YANGI holatdan qayta yig'iladi (kesh
 * saqlanmaydi), shuning uchun Mini App'dan "yuklab olish" bosilganda doim dolzarb ma'lumot
 * keladi. Kirill va o'zbekcha apostrof belgilarini to'g'ri chizish uchun Noto Sans shrifti
 * (Unicode-ga to'liq mos) ishlatiladi - standart PDF shriftlari bunga yaramaydi.
 */
export async function buildReportPdf(env: Env): Promise<Uint8Array> {
  const [log, stats] = await Promise.all([getInteractionLog(env), getStats(env)]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(base64ToBytes(NOTO_SANS_REGULAR_BASE64), { subset: true });

  const colorTitle = rgb(0.1, 0.1, 0.1);
  const colorHint = rgb(0.45, 0.45, 0.45);
  const colorUser = rgb(0.1, 0.1, 0.1);
  const colorBot = rgb(0.05, 0.35, 0.6);
  const colorDivider = rgb(0.85, 0.85, 0.85);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage(): void {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(height: number): void {
    if (y - height < MARGIN) newPage();
  }

  function drawLine(text: string, size: number, color: ReturnType<typeof rgb>, gap = 4): void {
    ensureSpace(size + gap);
    page.drawText(sanitizeForPdf(text), { x: MARGIN, y: y - size, size, font, color });
    y -= size + gap;
  }

  function drawWrapped(text: string, size: number, color: ReturnType<typeof rgb>, indent = 0): void {
    for (const line of wrapText(sanitizeForPdf(text), font, size, CONTENT_WIDTH - indent)) {
      ensureSpace(size + 3);
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font, color });
      y -= size + 3;
    }
  }

  drawLine("Hisobot", 20, colorTitle, 6);
  drawLine(`Yaratilgan: ${tashkentTimestamp(Date.now())} (Toshkent vaqti)`, 10, colorHint, 14);

  drawLine(`Bot javob bergan foydalanuvchilar: ${stats.repliedCount}`, 11, colorTitle, 4);
  drawLine(`Javob qaytarganlar: ${stats.respondedCount}`, 11, colorTitle, 4);
  const logNote = log.length >= REPORT_LOG_CAP ? ` (so'nggi ${REPORT_LOG_CAP} tasi saqlanadi)` : "";
  drawLine(`Jami qayd etilgan yozishmalar: ${log.length}${logNote}`, 11, colorTitle, 16);

  if (log.length === 0) {
    drawLine("Hali hech qanday yozishma qayd etilmagan.", 12, colorHint, 0);
  }

  // Eng yangisi tepada - so'nggi voqealar birinchi ko'rinadi.
  const sorted = [...log].sort((a, b) => b.timestamp - a.timestamp);

  for (const entry of sorted) {
    ensureSpace(30);
    const channelLabel = entry.channel === "biznes" ? "Business" : "Oddiy";
    drawLine(`${entry.sender}  •  ${entry.category}  •  ${channelLabel}  •  ${tashkentTimestamp(entry.timestamp)}`, 11, colorTitle, 4);
    drawWrapped(`Foydalanuvchi: ${entry.userText}`, 10, colorUser, 8);
    drawWrapped(`Bot: ${entry.botReply}`, 10, colorBot, 8);
    ensureSpace(14);
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: colorDivider });
    y -= 10;
  }

  return pdfDoc.save();
}
