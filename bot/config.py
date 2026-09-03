import os

from dotenv import load_dotenv

load_dotenv()


def _get_int(name: str) -> int | None:
    value = os.environ.get(name)
    if not value:
        return None
    return int(value)


TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

# Only this Telegram user id may change bot settings (/autoreply_on, /setprompt, ...).
# Use /myid in the bot to find your id, then set OWNER_ID.
OWNER_ID = _get_int("OWNER_ID")

CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5")
CLAUDE_MAX_TOKENS = _get_int("CLAUDE_MAX_TOKENS") or 1024
CLAUDE_EFFORT = os.environ.get("CLAUDE_EFFORT", "low")

DEFAULT_SYSTEM_PROMPT = os.environ.get(
    "DEFAULT_SYSTEM_PROMPT",
    "Siz foydalanuvchi nomidan Telegram orqali avtomatik javob beruvchi yordamchisiz. "
    "Qisqa, aniq va samimiy javob bering. Agar savolga ishonchli javob bera olmasangiz, "
    "buni ochiq ayting va foydalanuvchi tez orada shaxsan javob berishini bildiring.",
)

DATA_DIR = os.environ.get("DATA_DIR", "./data")
HISTORY_LIMIT = _get_int("HISTORY_LIMIT") or 20
