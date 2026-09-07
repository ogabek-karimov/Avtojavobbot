import type { Env, HistoryMessage } from "./types";

// Har xil ko'rinishdagi bir xil "repetition collapse" nosozligining ikkita kuzatilgan turi:
// (1) so'zma-so'z aynan bir xil qisqa so'zlarni takrorlash ("of of of count of count..."),
// (2) shunga o'xshash, lekin har biriga tasodifiy "-ored"/"-ing" kabi qo'shimcha qo'shib
// "yasama" so'zlar hosil qiladigan varianti ("channelored", "belemored", "splored"...) -
// bu holatda so'zlar texnik jihatdan "noyob" bo'lib chiqadi, shuning uchun oddiy
// leksik-xilma-xillik tekshiruvi buni ushlab ololmaydi. Ikkala holatda ham umumiy narsa
// bitta: natija DEYARLI BUTUNLAY inglizcha bog'lovchi/funktsional so'zlardan iborat bo'ladi
// ("of", "the", "and", "count", "path"...) - buning o'zi allaqachon kifoya, chunki tizim
// ko'rsatmasi javobni FAQAT o'zbek tilida talab qiladi, bunday so'zlar haqiqiy o'zbekcha
// javobda deyarli hech qachon uchramaydi (haqiqiy namunalarda nisbat 0%, buzilgan
// namunalarda 44-92%).
const ENGLISH_FILLER_WORDS = new Set([
  "of", "the", "and", "a", "an", "is", "in", "to", "for", "with", "that", "this", "it", "as",
  "at", "by", "on", "are", "was", "were", "be", "been", "not", "no", "count", "path", "all",
  "each", "common", "any", "other", "just", "some", "also", "both", "neither", "or", "if", "but",
]);

function looksDegenerate(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  if (words.length < 15) return false; // qisqa javoblar bu muammoga uchramaydi

  const fillerCount = words.filter((w) => ENGLISH_FILLER_WORDS.has(w)).length;
  if (fillerCount / words.length > 0.12) return true;

  if (words.length >= 40) {
    const unique = new Set(words);
    if (unique.size / words.length < 0.3) return true;
  }

  return false;
}

async function runOnce(env: Env, messages: { role: "system" | "user" | "assistant"; content: string }[]): Promise<string | null> {
  const result = (await env.AI.run(env.WORKERS_AI_MODEL as Parameters<Ai["run"]>[0], {
    messages,
    max_tokens: 700, // qochib ketgan generatsiya juda uzoq davom etmasin - zarar chegaralanadi
    temperature: 0.6,
    repetition_penalty: 1.15, // bir xil so'zni qayta-qayta takrorlashni kamaytiradi
  } as never)) as { response?: string };
  return result?.response ?? null;
}

/** Free/no-card alternative to Claude: runs an open model on Cloudflare's own Workers AI. */
export async function getReply(env: Env, history: HistoryMessage[], systemPrompt: string): Promise<string> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    let text = await runOnce(env, messages);
    if (text && looksDegenerate(text)) {
      // Ehtimollik asosidagi nosozlik - bir marta qayta urinish odatda yetarli (jonli
      // tekshiruvda bu holat juda kam uchraydi, ketma-ket ikki marta chiqishi deyarli yo'q).
      console.error("Workers AI produced degenerate output, retrying once", text.slice(0, 200));
      text = await runOnce(env, messages);
    }
    if (!text) return "Javob shakllantirib bo'lmadi.";
    if (looksDegenerate(text)) {
      console.error("Workers AI still degenerate after retry", text.slice(0, 200));
      return "Kechirasiz, hozir javob shakllantirishda texnik nosozlik yuz berdi. Iltimos, xabaringizni birozdan so'ng qayta yuboring.";
    }
    return text;
  } catch (error) {
    console.error("Workers AI error", error);
    return "AI xizmatida xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring.";
  }
}
