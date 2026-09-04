import type { Env } from "./types";

/**
 * A lightweight keyword-based guardrail. This is NOT a moderation AI - it's a blunt
 * pattern filter meant to catch the highest-risk categories (scams asking for money,
 * terrorism/violence, incitement/theft/robbery, "foreign money transfer" scams, sexual
 * content, extremist recruitment, and religious topics entirely) *before* the AI ever
 * sees the message, so an autoresponder can never be tricked into promising money,
 * sharing codes, or engaging with sensitive/dangerous content unsupervised. False
 * positives are expected and acceptable here - the fallback is just "a human will reply".
 *
 * Multi-word phrases are matched as plain substrings (distinctive enough on their own).
 * Single short words are matched with regex word boundaries so they don't fire inside an
 * unrelated longer word (e.g. bare "din" must not match inside "oldindan").
 */
const PHRASE_PATTERNS: string[] = [
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

  // Haqorat / so'kish (ko'p so'zli iboralar)
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

// Qisqa, alohida so'zlar - faqat butun so'z sifatida uchrasa moslashtiriladi
// (masalan "din" so'zi "oldindan" ichida yo'q deb hisoblanadi).
const WORD_PATTERNS: string[] = [
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

  // Haqorat / so'kish (bitta so'zli)
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

const WORD_REGEX = new RegExp(`\\b(${WORD_PATTERNS.map(escapeRegExp).join("|")})\\b`, "i");

/** Fast, free, but Uzbek/Russian/English-only - the keyword list can never cover every language. */
export function containsRiskyContent(text: string): boolean {
  const lower = text.toLowerCase();
  if (PHRASE_PATTERNS.some((pattern) => lower.includes(pattern))) return true;
  return WORD_REGEX.test(text);
}

const CLASSIFIER_SYSTEM_PROMPT =
  "Siz xabarlarni xavfsizlik bo'yicha tasniflaydigan tekshiruvchisiz. Foydalanuvchi xabarida quyidagi " +
  "mavzulardan BIRI bo'lsa - pul yoki maxfiy kod (parol/SMS/OTP/karta) so'rash yoki firibgarlik, terrorizm " +
  "yoki zo'ravonlik, o'ldirish/portlatish/o'g'irlik/talon-torojga chaqiruv, chet eldan pul o'tkazish taklifi, " +
  "jinsiy yoki intim mazmun, har qanday diniy mavzu, yoki haqorat/so'kinish/qo'pol tahqirlovchi so'zlar - " +
  "shularning FAQAT birortasi bo'lsa ham, faqat bitta so'z bilan javob bering: RISKY. Aks holda faqat bitta " +
  "so'z bilan javob bering: SAFE. Boshqa hech narsa yozmang, izoh bermang. Xabar qaysi tilda yozilgan " +
  "bo'lishidan (o'zbek, rus, ingliz, xitoy yoki boshqa istalgan til) qat'iy nazar shu qoidani bab-baravar " +
  "qo'llang.";

/**
 * Language-agnostic second layer: asks the model itself whether the message falls into a
 * risky category, regardless of which language it's written in. Runs only when the fast
 * keyword filter above didn't already catch it. Fails open (treats an error as SAFE) so a
 * classifier outage can never take the whole bot down - the keyword filter still stands.
 */
export async function isRiskyViaAI(env: Env, text: string): Promise<boolean> {
  try {
    const result = (await env.AI.run(env.WORKERS_AI_MODEL as Parameters<Ai["run"]>[0], {
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    } as never)) as { response?: string };
    return (result?.response ?? "").toUpperCase().includes("RISKY");
  } catch (error) {
    console.error("AI safety classifier failed", error);
    return false;
  }
}
