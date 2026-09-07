import type { Env, HistoryMessage } from "./types";

// Har xil ko'rinishdagi bir xil "repetition collapse" nosozligining ikkita kuzatilgan turi:
// (1) so'zma-so'z aynan bir xil qisqa so'zni takrorlash ("of of of count of count..."),
// (2) shunga o'xshash, lekin har biriga tasodifiy "-ored"/"-ing" kabi qo'shimcha qo'shib
// "yasama" so'zlar hosil qiladigan varianti ("channelored", "belemored", "splored"...) -
// bu holatda so'zlar texnik jihatdan "noyob" bo'lib chiqadi, shuning uchun oddiy
// leksik-xilma-xillik tekshiruvi buni yolg'iz o'zi ushlab ololmaydi.
//
// MUHIM: bot endi foydalanuvchi yozgan tilda (o'zbek/rus/ingliz/h.k.) javob berishi kerak,
// shuning uchun "javobda inglizcha so'zlar ko'p bo'lsa - demak xato" degan avvalgi tekshiruv
// endi ishlamaydi (haqiqiy inglizcha javobni ham noto'g'ri "buzilgan" deb belgilab qo'yardi).
// Buning o'rniga TILGA BOG'LIQ BO'LMAGAN belgidan foydalanamiz: matndagi ENG KO'P
// takrorlangan bitta so'zning umumiy so'zlar soniga nisbati. Tabiiy matnda (qaysi tilda
// bo'lishidan qat'iy nazar) hatto eng keng tarqalgan bog'lovchi so'z ham odatda ~4-7%dan
// oshmaydi; buzilgan namunalarda esa bitta so'z ("of") 23-48% ni tashkil etgan.
function looksDegenerate(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  if (words.length < 25) return false; // qisqa javoblarda tasodifiy takror xato bermasin

  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());
  if (maxCount / words.length > 0.15) return true;

  if (words.length >= 40) {
    if (counts.size / words.length < 0.3) return true;
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
