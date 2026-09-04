/**
 * A lightweight keyword-based guardrail. This is NOT a moderation AI - it's a blunt
 * substring filter meant to catch the highest-risk categories (scams asking for money,
 * terrorism/violence, extremist recruitment) *before* the AI ever sees the message, so
 * an autoresponder can never be tricked into promising money, sharing codes, or engaging
 * with that content unsupervised. False positives are expected and acceptable here - the
 * fallback is just "a human will reply", not a block.
 */
const RISKY_PATTERNS: string[] = [
  // Pul / to'lov firibgarligi (scam / phishing for money or codes)
  "pul yubor",
  "pul o'tkaz",
  "pul bering",
  "pul kerak bo'lib qoldi",
  "qarz bering",
  "karta raqam",
  "karta raqami",
  "kartangiz raqami",
  "kartaning orqa tomonidagi",
  "cvv",
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
  "firibgarlik",
  "fishing",
  "phishing",

  // Terrorizm / zo'ravonlik
  "terrorizm",
  "террорист",
  "terrorist",
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
];

export function containsRiskyContent(text: string): boolean {
  const lower = text.toLowerCase();
  return RISKY_PATTERNS.some((pattern) => lower.includes(pattern));
}
