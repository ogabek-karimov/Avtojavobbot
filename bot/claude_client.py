import logging

import anthropic

from . import config

logger = logging.getLogger(__name__)

_client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)


async def get_reply(history: list[dict], system_prompt: str) -> str:
    """Send the conversation history to Claude and return the assistant's text reply."""
    try:
        response = await _client.messages.create(
            model=config.CLAUDE_MODEL,
            max_tokens=config.CLAUDE_MAX_TOKENS,
            system=system_prompt,
            output_config={"effort": config.CLAUDE_EFFORT},
            messages=history,
        )
    except anthropic.AuthenticationError:
        logger.exception("Anthropic API key invalid")
        return "Kechirasiz, AI xizmatida sozlash xatosi bor (API kalit noto'g'ri). Egasiga xabar berildi."
    except anthropic.RateLimitError:
        logger.exception("Anthropic rate limit hit")
        return "Hozir so'rovlar juda ko'p, biroz kuting va qayta yozing."
    except anthropic.APIConnectionError:
        logger.exception("Anthropic connection error")
        return "AI xizmatiga ulanib bo'lmadi, birozdan so'ng qayta urinib ko'ring."
    except anthropic.APIStatusError:
        logger.exception("Anthropic API error")
        return "Javob berishda xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring."

    if response.stop_reason == "refusal":
        return "Bu so'rovga javob bera olmayman."

    for block in response.content:
        if block.type == "text":
            return block.text

    return "Javob shakllantirib bo'lmadi."
