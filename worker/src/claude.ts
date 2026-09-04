import Anthropic from "@anthropic-ai/sdk";
import type { Env, HistoryMessage } from "./types";

export async function getReply(
  env: Env,
  history: HistoryMessage[],
  systemPrompt: string,
): Promise<string> {
  // Cloudflare Workers have no process.env, so the API key must be passed explicitly.
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: parseInt(env.CLAUDE_MAX_TOKENS, 10),
      system: systemPrompt,
      output_config: { effort: env.CLAUDE_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" },
      messages: history,
    });

    if (response.stop_reason === "refusal") {
      return "Bu so'rovga javob bera olmayman.";
    }

    for (const block of response.content) {
      if (block.type === "text") {
        return block.text;
      }
    }
    return "Javob shakllantirib bo'lmadi.";
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic auth error", error);
      return "Kechirasiz, AI xizmatida sozlash xatosi bor (API kalit noto'g'ri). Egasiga xabar berildi.";
    }
    if (error instanceof Anthropic.RateLimitError) {
      console.error("Anthropic rate limit", error);
      return "Hozir so'rovlar juda ko'p, biroz kuting va qayta yozing.";
    }
    if (error instanceof Anthropic.APIConnectionError) {
      console.error("Anthropic connection error", error);
      return "AI xizmatiga ulanib bo'lmadi, birozdan so'ng qayta urinib ko'ring.";
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error", error);
      return "Javob berishda xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring.";
    }
    console.error("Unknown error calling Claude", error);
    return "Kutilmagan xatolik yuz berdi.";
  }
}
