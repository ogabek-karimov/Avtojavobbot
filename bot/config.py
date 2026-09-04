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

# Comma-separated Telegram user ids that are admins on first run (e.g. "123456789,987654321").
# Admins can change bot settings (/autoreply_on, /setprompt, ...) and add/remove other
# admins with /addadmin, /removeadmin. This only seeds the list on first run - after that
# the live admin list lives in storage (data/settings.json) and survives restarts.
_admin_ids_raw = os.environ.get("ADMIN_IDS", "")
INITIAL_ADMIN_IDS = [int(v) for v in _admin_ids_raw.split(",") if v.strip()]

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
