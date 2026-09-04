import { getReply as getClaudeReply } from "./claude";
import type { Env, HistoryMessage } from "./types";
import { getReply as getWorkersAiReply } from "./workersai";

/**
 * Dispatches to whichever AI provider is configured via AI_PROVIDER:
 * "anthropic" (Claude, paid, needs ANTHROPIC_API_KEY credit) or
 * "workers-ai" (Cloudflare's own hosted open models, free daily allowance, default).
 */
export async function getReply(env: Env, history: HistoryMessage[], systemPrompt: string): Promise<string> {
  if (env.AI_PROVIDER === "anthropic") {
    return getClaudeReply(env, history, systemPrompt);
  }
  return getWorkersAiReply(env, history, systemPrompt);
}
