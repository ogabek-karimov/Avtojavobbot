import type { Env } from "./types";

/**
 * Meaning-based (not keyword-based) intent classifier for the "service intake" feature:
 * does this message describe wanting/needing the admin-described service, regardless of
 * exact phrasing? ("Word ishlamayapti" -> Office-related; "aktivatsiya" == "faollashtirish")
 * Fails closed to false (never blocks a normal conversation just because the classifier
 * had an error) - temperature 0 for consistent yes/no verdicts on repeat calls.
 */
export async function classifyServiceRequest(env: Env, text: string, description: string): Promise<boolean> {
  try {
    const systemPrompt =
      "Siz xabarlarni tasniflaydigan yordamchisiz. Quyidagi xizmat tavsifiga qarang:\n" +
      `"${description}"\n\n` +
      "Foydalanuvchi xabari ushbu xizmatni so'rayotganini yoki shu bilan bog'liq muammoni tasvirlayotganini " +
      "aniqlang - so'zlarning aynan mos kelishi shart emas, ma'nosiga qarang (masalan \"Word ishlamayapti\" " +
      "Office bilan bog'liq muammo hisoblanadi, \"aktivatsiya\" va \"faollashtirish\" bir xil narsa). Agar " +
      "xabar shu xizmatga oid bo'lsa yoki shu bilan bog'liq muammoni tasvirlasa, faqat bitta so'z bilan javob " +
      "bering: YES. Aks holda (masalan umumiy maslahat so'rash, xarid haqida savol, yoki mutlaqo aloqasiz " +
      "mavzu bo'lsa) faqat: NO. Boshqa hech narsa yozmang, izoh bermang.";

    const result = (await env.AI.run(env.WORKERS_AI_MODEL as Parameters<Ai["run"]>[0], {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0,
    } as never)) as { response?: string };

    return (result?.response ?? "").toUpperCase().includes("YES");
  } catch (error) {
    console.error("Service intake classifier failed", error);
    return false;
  }
}
