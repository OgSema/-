# MoscowTab — магазин в Telegram (Mini App)

Каталог и корзина внутри Telegram. Покупатель нажимает «Заказать» — бот пишет
состав заказа ему в чат и присылает тот же заказ администратору с кнопкой
«Написать клиенту». Товары добавляются прямо в приложении: тот, чей Telegram ID
указан в `ADMIN_IDS`, видит вкладку «Админ».

Есть две витрины поверх одной базы:

- **Магазин в чате бота** — каталог кнопками, карточки с фото, корзина, заказ
  и админка прямо в переписке. Работает даже там, где провайдер режет домен
  приложения: телефон общается только с Telegram, а до Worker достукивается
  сам Telegram.
- **Mini App** — то же самое отдельным приложением с сеткой товаров. Требует,
  чтобы телефон сам открыл наш домен, поэтому при блокировках может не грузиться.

Хостинг полностью бесплатный: Cloudflare Workers (бэкенд, бот и раздача фронта),
D1 (база), фото хранятся в самом Telegram по `file_id` — ни диска, ни бакета,
ни платёжной карты.

```
worker/src/bot/   магазин в чате: витрина, корзина, пошаговая админка
worker/src/       API Mini App, проверка подписи Telegram, общая логика заказов
frontend/         React + Vite: каталог, корзина, админка приложения
```

## Как авторизуется админ

Telegram отдаёт мини-приложению строку `initData`, подписанную HMAC-SHA256 на
ключе от токена бота. Worker проверяет подпись (`worker/src/auth.js`) и берёт
оттуда user id. Подделать подпись, не зная токена, нельзя — поэтому отдельный
логин и пароль не нужны: админ это просто id из `ADMIN_IDS`.

## Настройки

| Переменная | Где задаётся | Что это |
|---|---|---|
| `BOT_TOKEN` | секрет: `npx wrangler secret put BOT_TOKEN` | токен от [@BotFather](https://t.me/BotFather) |
| `ADMIN_IDS` | `wrangler.toml` → `[vars]` | Telegram ID админов через запятую |
| `ORDER_CHAT_ID` | `wrangler.toml` → `[vars]` | куда слать заказы; пусто — в личку первому админу |
| `SHOP_NAME` | `wrangler.toml` → `[vars]` | заголовок в шапке |
| `DEV_MODE` | только локально | `1` — пускать без Telegram под фейковым админом |

## Локальный запуск

```bash
cd frontend && npm install && npm run build      # фронт собирается в frontend/dist
cd ../worker && npm install
npx wrangler d1 execute moscowtab --local --file=./schema.sql
npx wrangler d1 execute moscowtab --local --file=./seed.sql     # демо-товары, по желанию
npx wrangler dev --var BOT_TOKEN:тест --var DEV_MODE:1
```

Открыть http://localhost:8787 — `DEV_MODE=1` пускает без Telegram и делает
тебя админом. Фронт при правках нужно пересобирать (`npm run build`).

### Проверки

```bash
# 1. подставной Telegram API — ловит исходящие вызовы бота
TG_LOG=/tmp/tgcalls.jsonl node tests/mock.mjs &

# 2. worker с боевой авторизацией и моком вместо Telegram
npx wrangler dev --var BOT_TOKEN:111111:TEST-TOKEN \
  --var TELEGRAM_API_BASE:http://localhost:9099 --var WEBHOOK_SECRET:testsecret

# 3. проверки
node tests/api.mjs                              # подпись, права, остатки, заказы Mini App
TG_LOG=/tmp/tgcalls.jsonl node tests/bot.mjs    # весь путь покупателя и админа в чате
```

## Деплой на Cloudflare

```bash
cd worker
npx wrangler login                                  # один раз
npx wrangler d1 create moscowtab                    # id из вывода вписать в wrangler.toml
npx wrangler d1 execute moscowtab --remote --file=./schema.sql
npx wrangler secret put BOT_TOKEN                   # вставить токен бота
npx wrangler secret put WEBHOOK_SECRET              # любая случайная строка
cd ../frontend && npm run build
cd ../worker && npx wrangler deploy
```

Wrangler выдаст адрес вида `https://moscowtab.moscowtab.workers.dev`.

## Привязать к боту

Магазин в чате (основной режим) — подключается вебхуком:

```bash
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://moscowtab.moscowtab.workers.dev/tg",
       "secret_token":"тот же WEBHOOK_SECRET",
       "allowed_updates":["message","callback_query"]}'
```

Mini App (если домен доступен) вешается кнопкой меню:

```bash
BOT_TOKEN=... python3 set_menu_button.py https://moscowtab.moscowtab.workers.dev
```

## Что важно знать

- **Оплата.** Telegram Payments и платёжные провайдеры не пропускают табачные
  товары — поэтому оплаты в приложении нет: заказ уходит в чат, дальше
  договариваетесь напрямую.
- **Бот должен быть запущен покупателем.** Если человек открыл Mini App, но
  никогда не нажимал `/start`, бот не сможет написать ему в личку — заказ всё
  равно создастся и придёт админу, в ответе API будет `customer_notified: false`.
- **Цены и остатки считает сервер.** Корзина клиента передаёт только id и
  количество; суммы берутся из базы, остаток списывается условием `stock >= qty`,
  так что две одновременные покупки последней пачки не уведут склад в минус.
- **Фото.** Админ загружает картинку → Worker отправляет её боту → в базе лежит
  `file_id`, отдаётся через `/photo/<file_id>` с кэшем на неделю.
- **Возрастной гейт** — экран 18+ перед каталогом: в приложении отметка хранится
  в браузере, в боте — в таблице `sessions`.
- **Блокировки.** `*.workers.dev` у части мобильных операторов не открывается —
  поэтому основная витрина живёт в чате. Если появится свой домен, его можно
  привязать к тому же Worker как Custom Domain, и Mini App заработает у всех.
