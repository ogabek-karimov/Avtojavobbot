import asyncio
import json
import os
from dataclasses import asdict, dataclass
from typing import Optional

from . import config


@dataclass
class ChatSettings:
    autoreply: bool = False
    prompt: Optional[str] = None


class SettingsStore:
    """Persists per-chat settings (autoreply on/off, custom prompt) to a JSON file."""

    def __init__(self, path: str, initial_admin_ids: Optional[list[int]] = None):
        self._path = path
        self._lock = asyncio.Lock()
        self._chats: dict[str, ChatSettings] = {}
        self._admins: set[int] = set()
        self._load(initial_admin_ids or [])

    def _load(self, initial_admin_ids: list[int]) -> None:
        if not os.path.exists(self._path):
            self._admins = set(initial_admin_ids)
            if self._admins:
                self._save_sync()
            return
        with open(self._path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        for chat_id, data in raw.get("chats", {}).items():
            self._chats[chat_id] = ChatSettings(**data)
        self._admins = set(raw.get("admins", []))
        if not self._admins and initial_admin_ids:
            self._admins = set(initial_admin_ids)
            self._save_sync()

    def _save_sync(self) -> None:
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)
        payload = {
            "chats": {cid: asdict(s) for cid, s in self._chats.items()},
            "admins": sorted(self._admins),
        }
        tmp_path = f"{self._path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, self._path)

    def is_admin(self, user_id: int) -> bool:
        return user_id in self._admins

    def list_admins(self) -> list[int]:
        return sorted(self._admins)

    async def add_admin(self, user_id: int) -> bool:
        """Returns False if the user was already an admin."""
        async with self._lock:
            if user_id in self._admins:
                return False
            self._admins.add(user_id)
            self._save_sync()
            return True

    async def remove_admin(self, user_id: int) -> bool:
        """Returns False if the user wasn't an admin, or removing would leave zero admins."""
        async with self._lock:
            if user_id not in self._admins or len(self._admins) <= 1:
                return False
            self._admins.discard(user_id)
            self._save_sync()
            return True

    def get(self, chat_id: int) -> ChatSettings:
        return self._chats.get(str(chat_id), ChatSettings())

    async def set_autoreply(self, chat_id: int, enabled: bool) -> None:
        async with self._lock:
            key = str(chat_id)
            settings = self._chats.get(key, ChatSettings())
            settings.autoreply = enabled
            self._chats[key] = settings
            self._save_sync()

    async def set_prompt(self, chat_id: int, prompt: Optional[str]) -> None:
        async with self._lock:
            key = str(chat_id)
            settings = self._chats.get(key, ChatSettings())
            settings.prompt = prompt
            self._chats[key] = settings
            self._save_sync()


store = SettingsStore(
    os.path.join(config.DATA_DIR, "settings.json"),
    initial_admin_ids=config.INITIAL_ADMIN_IDS,
)
