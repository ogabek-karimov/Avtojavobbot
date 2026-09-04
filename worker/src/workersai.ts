import type { Env, HistoryMessage } from "./types";

/** Free/no-card alternative to Claude: runs an open model on Cloudflare's own Workers AI. */
export async function getReply(env: Env, history: HistoryMessage[], systemPrompt: string): Promise<string> {
  try {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const result = (await env.AI.run(env.WORKERS_AI_MODEL as Parameters<Ai["run"]>[0], {
      messages,
    } as never)) as { response?: string };

    const text = result?.response;
    if (!text) return "Javob shakllantirib bo'lmadi.";
    return text;
  } catch (error) {
    console.error("Workers AI error", error);
    return "AI xizmatida xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring.";
  }
}
