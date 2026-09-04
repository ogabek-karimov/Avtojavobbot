import type { Env } from "./types";

export type RiskCategory = "profanity" | "other" | null;

/**
 * Uzbek Latin "oʻ"/"gʻ" can be typed with several different Unicode characters that all
 * look similar: a plain apostrophe ('), left/right curly quotes (' '), or the correct
 * Uzbek modifier letters (ʻ turned comma, ʼ apostrophe). A word list written with only one
 * of these would silently miss a message typed with another. Normalizing every variant to
 * a plain apostrophe before matching means each pattern only needs to be written once.
 */
const APOSTROPHE_VARIANTS = /[‘’ʻʼ`]/g;

function normalize(text: string): string {
  return text.toLowerCase().replace(APOSTROPHE_VARIANTS, "'");
}

/**
 * A lightweight keyword-based guardrail. This is NOT a moderation AI - it's a blunt
 * pattern filter meant to catch the highest-risk categories *before* the AI ever sees the
 * message, so an autoresponder can never be tricked into promising money, sharing codes, or
 * engaging with sensitive/dangerous content unsupervised. False positives are expected and
 * acceptable here - the fallback is just "a human will reply".
 *
 * Multi-word phrases are matched as plain substrings (distinctive enough on their own).
 * Single short words are matched with regex word boundaries so they don't fire inside an
 * unrelated longer word (e.g. bare "din" must not match inside "oldindan").
 */
const OTHER_PHRASE_PATTERNS: string[] = [
  // Pul / to'lov firibgarligi (scam / phishing for money or codes)
  "pul yubor",
  "pul o'tkaz",
  "pul bering",
  "pul kerak",
  "pulga muhtoj",
  "qarz bering",
  "qarz kerak",
  "moliyaviy yordam kerak",
  "karta raqam",
  "karta raqami",
  "kartangiz raqami",
  "kartaning orqa tomonidagi",
  "otp kod",
  "sms kod",
  "parolingizni yuboring",
  "перевод денег",
  "скинь деньги",
  "вышли деньги",
  "номер карты",
  "send money",
  "wire transfer",
  "gift card",
  "bitcoin yubor",
  "crypto wallet",

  // Terrorizm / zo'ravonlik
  "terrorizm",
  "террорист",
  "bomba yasash",
  "bomb making",
  "portlovchi modda",
  "qurol-yarog' sotib",
  "explosive device",
  "jangarilar safiga",

  // Diniy ekstremizm / radikallashtirish
  "diniy ekstremizm",
  "ekstremistik tashkilot",
  "radikal guruh",
  "xalifalik tuzish",

  // Zo'ravonlik / jinoyat
  "o'ldirishga chaqir",
  "o'ldirish kerak",
  "o'ldirib qo'y",
  "portlatib yubor",
  "portlatmoqchi",
  "talon-taroj",
  "talab-toroj",

  // Chet eldan pul o'tkazish taklifi (klassik firibgarlik sxemasi)
  "chet eldan pul",
  "xorijdan pul",
  "sizga pul o'tkazmoqchiman",
  "sizga pul jo'natmoqchiman",

  // Jinsiy/intim kontent
  "intim rasm",
  "intim video",
  "nude",
  "нюдс",

  // Rus / ingliz tillarida bir necha keng tarqalgan variant (asosiy himoya - pastdagi
  // AI orqali tekshiruv, chunki har bir tilni qo'lda ro'yxatlab bo'lmaydi)
  "деньги нужны",
  "хочу деньги",
  "переведи деньги",
  "need money",
  "send me money",
  "kill him",
  "kill her",
  "rob a bank",
];

// Qisqa, alohida so'zlar - faqat butun so'z sifatida uchrasa moslashtiriladi
// (masalan "din" so'zi "oldindan" ichida yo'q deb hisoblanadi).
const OTHER_WORD_PATTERNS: string[] = [
  "terakt",
  "terrorist",
  "фишинг",
  "phishing",
  "fishing",
  "firibgarlik",
  "cvv",
  "urish",
  "o'g'irlik",
  "ogirlik",
  "portlatish",
  "sex",
  "porno",
  "intim",

  // Din mavzusi - butunlay, har qanday diniy suhbat (nafaqat ekstremizm)
  "din",
  "dinlar",
  "diniy",
  "islom",
  "musulmon",
  "nasroniy",
  "xristian",
  "yahudiy",
  "budda",
  "buddizm",
  "alloh",
  "xudo",
  "payg'ambar",
  "namaz",
  "ruza",
  "ro'za",
  "haj",
  "iymon",
  "masjid",
  "cherkov",
  "sinagoga",
  "qur'on",
  "quron",
  "injil",
  "tavrot",
];

// Haqorat / so'kish - bularga alohida (qattiqroq) javob yuboriladi, umumiy RISKY javobi emas.
const PROFANITY_PHRASE_PATTERNS: string[] = [
  "onani skay",
  "onani sikay",
  "onangni sikay",
  "onangni skay",
  "enangni sikay",
  "enangni skay",
  "ayangni sikay",
  "ayangni skay",
  "kallangga sikay",
  "kallangga sikaman",
  "eshshak siksin",
  "eshak siksin",
  "ewak siksin",
  "ittan tarqagan",
  "it emgan",
  "buvini ami",
];

const PROFANITY_WORD_PATTERNS: string[] = [
  "ko't",
  "kot",
  "go't",
  "yban",
  "dalbay",
  "dalbayop",
  "xarip",
  "jalap",
  "jalab",
  "om",
  "qoto",
  "qotoq",
  "qo'toq",
  "qo'togim",
  "qo'tog'im",
  "ybanazavr",
  "gandon",
  "suka",
  "xaromi",
  "sikaman",
  "sikdim",
  "sikilding",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordRegex(words: string[]): RegExp {
  return new RegExp(`\\b(${words.map(escapeRegExp).join("|")})\\b`, "i");
}

const OTHER_WORD_REGEX = wordRegex(OTHER_WORD_PATTERNS);
const PROFANITY_WORD_REGEX = wordRegex(PROFANITY_WORD_PATTERNS);

/** Fast, free, but Uzbek/Russian/English-only - the keyword list can never cover every language. */
export function classifyRiskyKeyword(text: string): RiskCategory {
  const normalized = normalize(text);
  if (PROFANITY_PHRASE_PATTERNS.some((p) => normalized.includes(p)) || PROFANITY_WORD_REGEX.test(normalized)) {
    return "profanity";
  }
  if (OTHER_PHRASE_PATTERNS.some((p) => normalized.includes(p)) || OTHER_WORD_REGEX.test(normalized)) {
    return "other";
  }
  return null;
}

const CLASSIFIER_SYSTEM_PROMPT =
  "Siz xabarlarni xavfsizlik bo'yicha tasniflaydigan tekshiruvchisiz. Foydalanuvchi xabarini quyidagi uchta " +
  "toifadan biriga ajrating:\n" +
  "PROFANITY - xabarda haqorat, so'kinish yoki qo'pol tahqirlovchi so'zlar bo'lsa (qaysi tilda bo'lishidan qat'iy nazar).\n" +
  "RISKY - xabarda quyidagilardan biri bo'lsa: pul yoki maxfiy kod (parol/SMS/OTP/karta) so'rash yoki firibgarlik, " +
  "terrorizm yoki zo'ravonlik, o'ldirish/portlatish/o'g'irlik/talon-torojga chaqiruv, chet eldan pul o'tkazish " +
  "taklifi, jinsiy yoki intim mazmun, yoki har qanday diniy mavzu.\n" +
  "SAFE - yuqoridagilarning hech biri bo'lmasa.\n" +
  "Faqat bitta so'z bilan javob bering: PROFANITY, RISKY yoki SAFE. Boshqa hech narsa yozmang, izoh bermang. " +
  "Xabar qaysi tilda yozilgan bo'lishidan (o'zbek, rus, ingliz, xitoy yoki boshqa istalgan til) qat'iy nazar " +
  "shu qoidani bab-baravar qo'llang.";

/**
 * Language-agnostic second layer: asks the model itself whether the message falls into a
 * risky category, regardless of which language it's written in. Runs only when the fast
 * keyword filter above didn't already catch it. Fails open (treats an error as SAFE) so a
 * classifier outage can never take the whole bot down - the keyword filter still stands.
 */
export async function classifyRiskyAI(env: Env, text: string): Promise<RiskCategory> {
  try {
    const result = (await env.AI.run(env.WORKERS_AI_MODEL as Parameters<Ai["run"]>[0], {
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      // Bu klassifikator uchun ijodkorlik kerak emas - past temperature bir xil xabarga
      // doim bir xil (barqaror) javob qaytarish ehtimolini oshiradi.
      temperature: 0,
    } as never)) as { response?: string };
    const verdict = (result?.response ?? "").toUpperCase();
    if (verdict.includes("PROFANITY")) return "profanity";
    if (verdict.includes("RISKY")) return "other";
    return null;
  } catch (error) {
    console.error("AI safety classifier failed", error);
    return null;
  }
}

/** Runs the fast keyword check first, then the AI classifier only if the keyword check found nothing. */
export async function classifyRisk(env: Env, text: string): Promise<RiskCategory> {
  return classifyRiskyKeyword(text) ?? (await classifyRiskyAI(env, text));
}
