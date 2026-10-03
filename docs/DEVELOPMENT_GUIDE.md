# 🛡️ Context Threat Shield: Development & Architecture Guide

Цей документ описує архітектуру проєкту, призначення папок та файлів, а також правила того, де і як створювати нові файли при подальшій розробці.

## 📂 Структура проєкту (WXT WSP Framework)

Проєкт побудований за допомогою [WXT Framework](https://wxt.dev/), який використовує Vite та Vue-подібну структуру для швидкої розробки браузерних розширень.

```text
extension/
├── entrypoints/           # ТОЧКИ ВХОДУ (Scripts, Popups, Background)
│   ├── background.ts      # Service Worker (працює у фоні, керує AI, доступом до API)
│   ├── content.ts         # Головний ін'єктор (вбудовується в усі сторінки <all_urls>)
│   ├── popup.html/ts      # UI розширення (при натисканні на іконку)
│   └── offscreen.html/ts  # Прихована сторінка для використання Chrome Built-in AI
├── src/                   # ОСНОВНА ЛОГІКА (Модулі)
│   ├── core/              # Системні компоненти, сховища та рушії прийняття рішень
│   ├── heuristics/        # Модулі сканування, парсери, класифікатори загроз
│   ├── types/             # TypeScript інтерфейси
│   ├── ui/                # Візуальні компоненти (Банери, Модалки, Оверлеї)
│   └── xai/               # Explainable AI (малювання графів, візуалізація рішень)
├── tests/                 # ТЕСТУВАННЯ (Vitest)
│   └── unit/              # Юніт-тести для перевірки логіки
└── wxt.config.ts          # Конфігурація збірки розширення та Manifest V3
```

---

## 🧩 Призначення файлів та папок (`src/`)

### 1. `src/core/` (Ядро системи)
Тут лежать глобальні менеджери, які не залежать від DOM-елементів.
- `context-manager.ts` — Керування "зшиванням" контексту (ActiveThreatContext).
- `crypto-service.ts` — Шифрування та дешифрування даних (WebCrypto API).
- `personal-vault.ts` — Робота із захищеним сховищем (Vault) для DLP-модуля.
- `risk-engine.ts` — Математичний рушій для розрахунку скорингу загрози.
- `user-whitelist.ts` / `whitelist.ts` — Керування білими списками (виключеннями).
- `adapters/storage.adapter.ts` — Адаптер для роботи зі `chrome.storage`.

### 2. `src/heuristics/` (Евристика та Аналіз)
Тут лежать модулі, які "дивляться" на сторінку або текст і шукають загрози.
- `chat-channel.ts` — Моніторинг DOM-змін у чатах (MutationObserver).
- `chat-session-state.ts` — Stateful буфер пам'яті для повідомлень (захист від фрагментації).
- `intent-classifier.ts` — NLP-класифікатор (Tier 1), який шукає патерни шахрайства.
- `input-detector.ts` — Аналізатор полів вводу (шукає CVV, паролі, номери карток).
- `input-interceptor.ts` — Глобальний перехоплювач подій (Hard Lock / Soft Lock).
- `form-action.ts` — Аналіз куди відправляється форма.
- `url-extractor.ts` / `text-normalizer.ts` — Утиліти для роботи з текстом.
- `ai-verifier.ts` / `chrome-ai-provider.ts` — Обгортки для виклику Gemini Nano (Tier 2).

### 3. `src/ui/` (Інтерфейси та компоненти)
Всі UI елементи створюються через Shadow DOM, щоб їх не міг зламати або приховати CSS самої сторінки (наприклад, OLX).
- `shadow-host.ts` — Контейнер Shadow DOM (точка монтування для всіх вікон).
- `debugger-overlay.ts` — Плаваюче вікно для відображення логів у реальному часі (Debug Mode).
- `friction.ts` — Верхній плаваючий банер (Toast) та логіка Soft Lock.
- `unified-modal.ts` — Велике повноекранне модальне вікно для Hard Lock (червоне блокування).
- `toast-notifier.ts` — Маленькі сповіщення ("Дію заблоковано...").

---

## 🛠️ Правила розробки (Як і де створювати файли)

1. **Новий сканер (наприклад, перевірка картинок):**
   - Файл: `src/heuristics/image-scanner.ts`
   - Логіка: Створіть клас, який приймає елемент (наприклад, `HTMLImageElement`) і повертає `HeuristicResult` або `IntentClassificationResult`.

2. **Новий візуальний елемент (наприклад, тултип):**
   - Файл: `src/ui/tooltip.ts`
   - Логіка: Завжди вставляйте елемент у `ShadowHost.append(element)`. Ніколи не додавайте стилі напряму в `document.head`!

3. **Зміни в архітектурі даних (наприклад, нова таблиця або сховище):**
   - Файл: `src/core/my-new-store.ts`
   - Логіка: Використовуйте статичні класи (Singleton) або інстанси з чітким життєвим циклом, які звертаються до `chrome.storage` (краще через `storage.adapter.ts`).

4. **Тестування:**
   - Будь-який файл із `src/heuristics/` або `src/core/` повинен мати відповідний тест у `tests/unit/`.
   - Назва тесту: `[назва-файлу].test.ts`. Запуск тестів: `npm test` або `npx vitest`.

## 🔄 Інтеграція AI (Tier 2)

В системі передбачено 2 рівні захисту:
- **Tier 1 (Евристика):** Працює синхронно і миттєво у `content.ts`. Розташований у `src/heuristics/`.
- **Tier 2 (AI Arbiter):** Викликається **виключно на вимогу** користувача (кнопка "Запитати ШІ"). Запит відправляється з `content.ts` (або UI) через `chrome.runtime.sendMessage` у `background.ts`, який створює Offscreen Document і викликає `window.ai`.

> **Золоте правило:** Не блокуйте потік виконання в `content.ts` очікуванням відповіді від `chrome.runtime.sendMessage` або AI, інакше ви зламаєте UX (зависання інтерфейсу браузера). Завжди використовуйте callback або Promise з Timeout.
