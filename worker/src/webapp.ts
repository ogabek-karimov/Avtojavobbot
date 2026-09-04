export function renderAppHtml(): string {
  return `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Boshqaruv paneli</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--tg-theme-bg-color, #ffffff);
    color: var(--tg-theme-text-color, #111111);
  }
  h1 { font-size: 18px; margin: 4px 0 16px; }
  .card {
    background: var(--tg-theme-secondary-bg-color, #f2f2f2);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 14px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .label { font-weight: 600; font-size: 15px; }
  .hint { color: var(--tg-theme-hint-color, #888888); font-size: 13px; margin-top: 4px; }
  .switch {
    position: relative;
    width: 46px;
    height: 26px;
    flex-shrink: 0;
  }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; cursor: pointer; inset: 0;
    background: #b0b0b0; border-radius: 26px; transition: 0.2s;
  }
  .slider:before {
    content: ""; position: absolute; height: 20px; width: 20px;
    left: 3px; top: 3px; background: white; border-radius: 50%; transition: 0.2s;
  }
  input:checked + .slider { background: var(--tg-theme-button-color, #34c759); }
  input:checked + .slider:before { transform: translateX(20px); }
  textarea {
    width: 100%; min-height: 90px; margin-top: 10px; padding: 10px;
    border-radius: 8px; border: 1px solid var(--tg-theme-hint-color, #cccccc);
    background: var(--tg-theme-bg-color, #ffffff); color: inherit;
    font-family: inherit; font-size: 14px; resize: vertical;
  }
  button {
    border: none; border-radius: 8px; padding: 10px 14px;
    font-size: 14px; font-weight: 600; cursor: pointer;
    background: var(--tg-theme-button-color, #2481cc);
    color: var(--tg-theme-button-text-color, #ffffff);
  }
  button.secondary {
    background: transparent; color: var(--tg-theme-button-color, #2481cc);
    border: 1px solid var(--tg-theme-button-color, #2481cc);
  }
  button.danger { background: #e5484d; color: white; }
  .btn-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .admin-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0; border-bottom: 1px solid rgba(128,128,128,0.2);
    font-size: 14px;
  }
  .admin-item:last-child { border-bottom: none; }
  input[type="text"] {
    flex: 1; padding: 9px 10px; border-radius: 8px;
    border: 1px solid var(--tg-theme-hint-color, #cccccc);
    background: var(--tg-theme-bg-color, #ffffff); color: inherit; font-size: 14px;
  }
  #status { text-align: center; margin-top: 40px; color: var(--tg-theme-hint-color, #888); }
</style>
</head>
<body>
  <div id="status">Yuklanmoqda...</div>
  <div id="app" style="display:none">
    <h1>⚙️ Boshqaruv paneli</h1>

    <div class="card">
      <div class="row">
        <div>
          <div class="label">AI avto-javob</div>
          <div class="hint">Botga yozilgan xabarlarga Claude avtomatik javob beradi</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="autoreplyToggle" />
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="label">AI ko'rsatmasi (persona)</div>
      <textarea id="promptInput"></textarea>
      <div class="btn-row">
        <button id="savePromptBtn">Saqlash</button>
        <button class="secondary" id="resetPromptBtn">Standartga qaytarish</button>
      </div>
    </div>

    <div class="card">
      <div class="label">📈 Hisobot</div>
      <div class="row" style="margin-top:10px">
        <div>
          <div class="hint">Bot javob bergan foydalanuvchilar</div>
        </div>
        <div id="statRepliedCount" style="font-size:20px; font-weight:700">0</div>
      </div>
      <div class="row" style="margin-top:8px">
        <div>
          <div class="hint">Javob qaytarganlar</div>
        </div>
        <div id="statRespondedCount" style="font-size:20px; font-weight:700">0</div>
      </div>
    </div>

    <div class="card">
      <div class="label">💬 Tez javoblar (FAQ)</div>
      <div class="hint">Xabarda kalit so'z uchrasa, AI o'rniga shu javob avtomatik yuboriladi</div>
      <div id="faqList"></div>
      <div class="btn-row" style="flex-direction:column; align-items:stretch">
        <input type="text" id="faqTrigger" placeholder="Kalit so'z (masalan: narx)" />
        <textarea id="faqReply" placeholder="Javob matni" style="min-height:60px"></textarea>
        <button id="addFaqBtn">Qo'shish</button>
      </div>
    </div>

    <div class="card">
      <div class="label">Adminlar</div>
      <div id="adminList"></div>
      <div class="btn-row">
        <input type="text" id="newAdminId" placeholder="Telegram ID" inputmode="numeric" />
        <button id="addAdminBtn">Qo'shish</button>
      </div>
    </div>

    <div class="card">
      <div class="label">🏢 Telegram Business'ga ulash</div>
      <div class="hint" style="margin-top:6px">
        Bu bot shaxsiy Telegram akkountingizga ulanib, sizga yozganlarga siz nomingizdan
        avtomatik javob bera oladi. Telegram bironta botga aynan bitta boshqa botni
        avtomatik ulab qo'yishga ruxsat bermaydi - shuning uchun oxirgi 2 qadamni
        (qidirish + qo'shish) o'zingiz bajarishingiz kerak, lekin tugma sizni to'g'ri
        sahifaga bir bosishda olib boradi:
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button id="openBusinessSettings" style="width:100%">Business sozlamalarini ochish</button>
      </div>
      <div class="hint" id="businessBtnHint" style="margin-top:6px">
        Agar tugma ochmasa: /panel buyrug'idagi "🏢 Business sozlamalarini ochish" tugmasi
        (chatning o'zida, oyna ichida emas) ko'proq qurilmalarda ishonchli ishlaydi.
      </div>
      <div style="margin-top:12px; font-size:14px; line-height:1.6">
        <div><b>Talab:</b> Telegram Premium obunasi kerak (Business funksiyasi shu bilan keladi).</div>
        <div style="margin-top:8px"><b>1.</b> Yuqoridagi tugmani bosing</div>
        <div><b>2.</b> "Chatbots" (yoki "Chat-botlarni avtomatlashtirish") ni tanlang</div>
        <div><b>3.</b> Bot username kiriting: <b>@AvtojavobAibot</b> va "Add"/"Ulash" bosing</div>
        <div><b>4.</b> Ruxsatlarda "Reply to messages" (xabarlarga javob berish) yoqilganini tekshiring</div>
      </div>
    </div>
  </div>

<script>
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();

  const statusEl = document.getElementById("status");
  const appEl = document.getElementById("app");
  const autoreplyToggle = document.getElementById("autoreplyToggle");
  const promptInput = document.getElementById("promptInput");
  const adminListEl = document.getElementById("adminList");

  let currentState = null;

  async function api(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData, ...body }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || ("HTTP " + res.status));
    }
    return res.json();
  }

  function renderAdmins(admins) {
    adminListEl.innerHTML = "";
    if (admins.length === 0) {
      adminListEl.innerHTML = '<div class="hint">Adminlar yo\\'q</div>';
      return;
    }
    for (const id of admins) {
      const row = document.createElement("div");
      row.className = "admin-item";
      const span = document.createElement("span");
      span.textContent = id;
      const btn = document.createElement("button");
      btn.className = "danger";
      btn.textContent = "O'chirish";
      btn.style.padding = "6px 10px";
      btn.style.fontSize = "12px";
      btn.onclick = () => removeAdmin(id);
      row.appendChild(span);
      row.appendChild(btn);
      adminListEl.appendChild(row);
    }
  }

  function renderFaq(faq) {
    const faqListEl = document.getElementById("faqList");
    faqListEl.innerHTML = "";
    if (faq.length === 0) {
      faqListEl.innerHTML = '<div class="hint" style="padding:6px 0">Hali qo\\'shilmagan</div>';
      return;
    }
    faq.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "admin-item";
      row.style.alignItems = "flex-start";
      const textWrap = document.createElement("div");
      textWrap.innerHTML =
        '<div style="font-weight:600">' + escapeHtml(entry.trigger) + "</div>" +
        '<div class="hint">' + escapeHtml(entry.reply) + "</div>";
      const btn = document.createElement("button");
      btn.className = "danger";
      btn.textContent = "O'chirish";
      btn.style.padding = "6px 10px";
      btn.style.fontSize = "12px";
      btn.style.flexShrink = "0";
      btn.onclick = () => removeFaq(index);
      row.appendChild(textWrap);
      row.appendChild(btn);
      faqListEl.appendChild(row);
    });
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function render(state) {
    currentState = state;
    autoreplyToggle.checked = state.settings.autoreply;
    promptInput.value = state.settings.prompt ?? state.defaultPrompt;
    renderAdmins(state.admins);
    renderFaq(state.faq);
    document.getElementById("statRepliedCount").textContent = state.stats.repliedCount;
    document.getElementById("statRespondedCount").textContent = state.stats.respondedCount;
  }

  async function load() {
    try {
      const state = await api("/api/state", {});
      render(state);
      statusEl.style.display = "none";
      appEl.style.display = "block";
    } catch (e) {
      statusEl.textContent = "Xatolik: " + e.message;
    }
  }

  autoreplyToggle.addEventListener("change", async () => {
    try {
      const state = await api("/api/action", {
        action: autoreplyToggle.checked ? "autoreply_on" : "autoreply_off",
      });
      render(state);
      tg.HapticFeedback.notificationOccurred("success");
    } catch (e) {
      tg.showAlert("Xatolik: " + e.message);
    }
  });

  document.getElementById("savePromptBtn").addEventListener("click", async () => {
    try {
      const state = await api("/api/action", { action: "set_prompt", value: promptInput.value });
      render(state);
      tg.showAlert("Saqlandi.");
    } catch (e) {
      tg.showAlert("Xatolik: " + e.message);
    }
  });

  document.getElementById("resetPromptBtn").addEventListener("click", async () => {
    try {
      const state = await api("/api/action", { action: "reset_prompt" });
      render(state);
      tg.showAlert("Standart holatga qaytarildi.");
    } catch (e) {
      tg.showAlert("Xatolik: " + e.message);
    }
  });

  document.getElementById("addAdminBtn").addEventListener("click", async () => {
    const input = document.getElementById("newAdminId");
    const id = input.value.trim();
    if (!id) return;
    try {
      const state = await api("/api/action", { action: "add_admin", value: id });
      render(state);
      input.value = "";
    } catch (e) {
      tg.showAlert("Xatolik: " + e.message);
    }
  });

  async function removeAdmin(id) {
    try {
      const state = await api("/api/action", { action: "remove_admin", value: String(id) });
      render(state);
    } catch (e) {
      tg.showAlert("Xatolik: " + e.message);
    }
  }

  document.getElementById("addFaqBtn").addEventListener("click", async () => {
    const triggerInput = document.getElementById("faqTrigger");
    const replyInput = document.getElementById("faqReply");
    const trigger = triggerInput.value.trim();
    const reply = replyInput.value.trim();
    if (!trigger || !reply) {
      tg.showAlert("Kalit so'z va javob matnini kiriting.");
      return;
    }
    try {
      const state = await api("/api/action", { action: "add_faq", trigger, reply });
      render(state);
      triggerInput.value = "";
      replyInput.value = "";
    } catch (e) {
      tg.showAlert("Xatolik: " + e.message);
    }
  });

  async function removeFaq(index) {
    try {
      const state = await api("/api/action", { action: "remove_faq", index });
      render(state);
    } catch (e) {
      tg.showAlert("Xatolik: " + e.message);
    }
  }

  document.getElementById("openBusinessSettings").addEventListener("click", () => {
    try {
      if (tg.openTelegramLink) {
        tg.openTelegramLink("tg://settings/business");
      } else {
        window.location.href = "tg://settings/business";
      }
    } catch (e) {
      window.location.href = "tg://settings/business";
    }
  });

  load();
</script>
</body>
</html>`;
}
