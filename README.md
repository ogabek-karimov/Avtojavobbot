# Avtojavobbot

Claude (Anthropic) API yordamida ishlaydigan Telegram AI avto-javob boti.
Botga kimdir yozganda, siz yoqib qo'ygan chatlarda AI sizning nomingizdan
avtomatik javob beradi. Javob uslubi (persona/ko'rsatma) har bir chat uchun
alohida sozlanadi.

## Imkoniyatlar

- `/autoreply_on`, `/autoreply_off` — shu chatda AI avto-javobni yoqish/o'chirish
- `/setprompt <matn>` — AI qanday javob berishi kerakligini o'zingiz yozib qo'yasiz
- `/status` — joriy holatni ko'rish
- Barcha sozlash buyruqlari faqat adminlar uchun ishlaydi (`ADMIN_IDS` bilan boshlang'ich admin(lar) belgilanadi)
- `/addadmin <ID>`, `/removeadmin <ID>`, `/listadmins` — admin boshqa foydalanuvchini ham admin qila oladi (yoki olib tashlay oladi)
- Har bir chat uchun qisqa suhbat tarixi saqlanadi (kontekstli javob berish uchun)

**Eslatma:** bu bot faqat AI avto-javob beradi. U guruh/shaxsiy chatlardagi
boshqa odamlarning o'chirilgan xabarlarini yoki bir martalik (view-once)
media fayllarini yashirincha saqlab olmaydi — bu funksiya boshqalarning
roziligisiz shaxsiy kommunikatsiyani kuzatishga aylanib ketgani uchun ataylab
qo'shilmadi.

## Lokal ishga tushirish

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# .env faylini oching va TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY qiymatlarini kiriting

python -m bot.main
```

Botni Telegram'da toping, `/myid` yozing, chiqqan raqamni `.env` faylidagi
`ADMIN_IDS`ga yozing va botni qayta ishga tushiring. Shundan so'ng
`/autoreply_on` va `/setprompt` sizga ishlaydi. Boshqa odamlarni admin qilish
uchun `/addadmin <ularning Telegram ID>` yozing.

## Fly.io'da 24/7 ishga tushirish (bepul/arzon)

1. Fly CLI o'rnating va hisob oching:
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```
2. `fly.toml`dagi `app` nomini o'zingizga xos (global unikal) nomga o'zgartiring.
3. Sozlamalarni saqlab qolish uchun volume yarating (ixtiyoriy, lekin tavsiya etiladi):
   ```bash
   fly volumes create bot_data --size 1 --region fra
   ```
   Agar volume kerak bo'lmasa, `fly.toml` dagi `[mounts]` bo'limini o'chiring —
   bot baribir ishlaydi, faqat qayta deploy qilinganda sozlamalar (yoqilgan/
   o'chirilgan holat, custom prompt) standart holatga qaytadi.
4. Maxfiy kalitlarni Fly'ga yuboring (bular hech qachon kodga yozilmaydi):
   ```bash
   fly secrets set TELEGRAM_BOT_TOKEN=... ANTHROPIC_API_KEY=... ADMIN_IDS=123456789
   ```
5. Deploy qiling:
   ```bash
   fly deploy
   ```
6. Loglarni kuzatish: `fly logs`

Bot polling rejimida ishlaydi (Telegram serverlariga o'zi so'rov yuboradi),
shuning uchun tashqi HTTP endpoint yoki webhook kerak emas — Fly machine
doimiy ishlab turgani kifoya.

## Muhit o'zgaruvchilari

`.env.example` faylida barcha o'zgaruvchilar va izohlari bor. Eng muhimlari:

| O'zgaruvchi | Majburiymi | Izoh |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ha | @BotFather'dan olingan token |
| `ANTHROPIC_API_KEY` | ha | console.anthropic.com dan olingan kalit |
| `ADMIN_IDS` | tavsiya etiladi | boshlang'ich admin(lar), vergul bilan (masalan `123456789,987654321`) |
| `CLAUDE_MODEL` | yo'q | standart: `claude-opus-5` (eng sifatli, lekin qimmatroq — yuqori hajmda `claude-sonnet-5` yoki `claude-haiku-4-5`ga o'tish arzonroq bo'ladi) |
| `CLAUDE_MAX_TOKENS` | yo'q | standart: `1024` |
| `CLAUDE_EFFORT` | yo'q | standart: `low` (tezkor, arzon suhbat uchun) |
| `DEFAULT_SYSTEM_PROMPT` | yo'q | chatga xos prompt sozlanmagan bo'lsa ishlatiladigan standart ko'rsatma |
