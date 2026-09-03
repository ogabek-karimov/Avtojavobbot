import logging
from collections import defaultdict, deque
from functools import wraps

from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from . import config
from .claude_client import get_reply
from .storage import store

logging.basicConfig(
    format="%(asctime)s %(name)s %(levelname)s %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)

# In-memory conversation history per chat: chat_id -> deque[{"role", "content"}]
_history: dict[int, deque] = defaultdict(lambda: deque(maxlen=config.HISTORY_LIMIT))


def admin_only(handler):
    @wraps(handler)
    async def wrapped(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not store.is_admin(update.effective_user.id):
            await update.message.reply_text(
                "Bu buyruq faqat adminlar uchun. O'z ID raqamingizni bilish uchun /myid yozing."
            )
            return
        await handler(update, context)

    return wrapped


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Salom! Men AI (Claude) yordamida avtomatik javob beruvchi botman.\n\n"
        "Buyruqlar ro'yxati uchun /help yozing."
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "/autoreply_on - shu chatda AI avto-javobni yoqish (faqat adminlar)\n"
        "/autoreply_off - shu chatda AI avto-javobni o'chirish (faqat adminlar)\n"
        "/setprompt <matn> - shu chat uchun AI ko'rsatmasini (persona) sozlash (faqat adminlar)\n"
        "/resetprompt - ko'rsatmani standart holatga qaytarish (faqat adminlar)\n"
        "/status - shu chatning joriy holatini ko'rish\n"
        "/myid - o'zingizning Telegram ID raqamingizni bilish\n"
        "/addadmin <ID> - boshqa foydalanuvchini admin qilish (faqat adminlar)\n"
        "/removeadmin <ID> - adminlikdan olib tashlash (faqat adminlar)\n"
        "/listadmins - joriy adminlar ro'yxati (faqat adminlar)"
    )


async def myid(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(f"Sizning Telegram ID: {update.effective_user.id}")


@admin_only
async def autoreply_on(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await store.set_autoreply(update.effective_chat.id, True)
    await update.message.reply_text("AI avto-javob shu chatda yoqildi.")


@admin_only
async def autoreply_off(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await store.set_autoreply(update.effective_chat.id, False)
    await update.message.reply_text("AI avto-javob shu chatda o'chirildi.")


@admin_only
async def setprompt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = " ".join(context.args)
    if not text:
        await update.message.reply_text("Foydalanish: /setprompt <AI uchun ko'rsatma matni>")
        return
    await store.set_prompt(update.effective_chat.id, text)
    _history[update.effective_chat.id].clear()
    await update.message.reply_text("Shu chat uchun AI ko'rsatmasi yangilandi.")


@admin_only
async def resetprompt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await store.set_prompt(update.effective_chat.id, None)
    _history[update.effective_chat.id].clear()
    await update.message.reply_text("AI ko'rsatmasi standart holatga qaytarildi.")


async def status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    settings = store.get(update.effective_chat.id)
    state = "yoqilgan" if settings.autoreply else "o'chirilgan"
    prompt = settings.prompt or config.DEFAULT_SYSTEM_PROMPT
    await update.message.reply_text(f"Avto-javob: {state}\nKo'rsatma: {prompt}")


def _parse_user_id(args: list[str]) -> int | None:
    if len(args) != 1:
        return None
    try:
        return int(args[0])
    except ValueError:
        return None


@admin_only
async def addadmin(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = _parse_user_id(context.args)
    if user_id is None:
        await update.message.reply_text("Foydalanish: /addadmin <Telegram ID>")
        return
    added = await store.add_admin(user_id)
    if added:
        await update.message.reply_text(f"{user_id} endi admin.")
    else:
        await update.message.reply_text(f"{user_id} allaqachon admin edi.")


@admin_only
async def removeadmin(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = _parse_user_id(context.args)
    if user_id is None:
        await update.message.reply_text("Foydalanish: /removeadmin <Telegram ID>")
        return
    removed = await store.remove_admin(user_id)
    if removed:
        await update.message.reply_text(f"{user_id} adminlikdan olib tashlandi.")
    else:
        await update.message.reply_text(
            "Bajarilmadi: bu ID admin emas, yoki oxirgi (yagona) adminni olib tashlab bo'lmaydi."
        )


@admin_only
async def listadmins(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    admins = store.list_admins()
    text = "\n".join(str(a) for a in admins) if admins else "Adminlar yo'q."
    await update.message.reply_text(f"Adminlar:\n{text}")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    if message is None or not message.text:
        return

    chat_id = update.effective_chat.id
    settings = store.get(chat_id)
    if not settings.autoreply:
        return

    system_prompt = settings.prompt or config.DEFAULT_SYSTEM_PROMPT

    history = _history[chat_id]
    history.append({"role": "user", "content": message.text})

    await context.bot.send_chat_action(chat_id=chat_id, action=ChatAction.TYPING)
    reply_text = await get_reply(list(history), system_prompt)
    history.append({"role": "assistant", "content": reply_text})

    await message.reply_text(reply_text)


def build_application() -> Application:
    application = ApplicationBuilder().token(config.TELEGRAM_BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("myid", myid))
    application.add_handler(CommandHandler("autoreply_on", autoreply_on))
    application.add_handler(CommandHandler("autoreply_off", autoreply_off))
    application.add_handler(CommandHandler("setprompt", setprompt))
    application.add_handler(CommandHandler("resetprompt", resetprompt))
    application.add_handler(CommandHandler("status", status))
    application.add_handler(CommandHandler("addadmin", addadmin))
    application.add_handler(CommandHandler("removeadmin", removeadmin))
    application.add_handler(CommandHandler("listadmins", listadmins))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    return application


def main() -> None:
    application = build_application()
    logger.info("Bot ishga tushdi (polling rejimida)")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
