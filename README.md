# Магазин в Telegram (Mini App)

Каталог + корзина внутри Telegram. Покупатель нажимает «Заказать» — бот пишет
заказ ему в чат и присылает его администратору. Товары добавляются прямо
в приложении: тот, чей Telegram ID указан в `ADMIN_IDS`, видит вкладку «Админ».

```
backend/    FastAPI + SQLite: каталог, заказы, загрузка фото, проверка подписи Telegram
frontend/   React + Vite: каталог, корзина, админка
```

## Как это авторизует админа

Telegram отдаёт мини-приложению строку `initData`, подписанную HMAC-SHA256 на
ключе от токена бота. Бэкенд проверяет подпись (`backend/app/auth.py`) и берёт
оттуда user id. Подделать нельзя, не зная токена, поэтому отдельный логин
и пароль не нужны — админ это просто id из `ADMIN_IDS`.

## Запуск

### 1. Настроить

```bash
cp .env.example .env      # и заполнить:
```

| Переменная | Что это |
|---|---|
| `BOT_TOKEN` | токен от [@BotFather](https://t.me/BotFather) |
| `ADMIN_IDS` | твой Telegram ID (узнать у [@userinfobot](https://t.me/userinfobot)), можно несколько через запятую |
| `ORDER_CHAT_ID` | куда слать заказы; пусто — в личку первому админу |
| `SHOP_NAME` | заголовок в шапке |
| `PUBLIC_URL` | публичный https-адрес (нужен для ссылок на загруженные фото) |
| `DEV_MODE` | `1` — пускать без Telegram под фейковым админом. Только на localhost! |

### 2. Локально

```bash
# бэкенд
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/python seed.py                     # демо-товары, по желанию
DEV_MODE=1 ADMIN_IDS=1 ./.venv/bin/uvicorn app.main:app --port 8000

# фронтенд (во втором терминале)
cd frontend && npm install && npm run dev
```

Открыть http://localhost:5173. `DEV_MODE=1` пускает в браузер без Telegram
и делает тебя админом.

### 3. Проверки

```bash
cd backend && ./.venv/bin/python tests/smoke.py
```

Проверяет подпись initData, права админа, скрытие товаров без остатка,
пересчёт суммы по базе, списание остатков и доступ к заказам.

### 4. Прод

```bash
docker compose up -d --build
```

Контейнер собирает фронт и отдаёт его тем же процессом на порту 8000.
База и загруженные фото лежат в `./data`. Дальше нужен https —
поставь перед контейнером nginx с сертификатом или Caddy.

### 4б. Деплой на Railway

1. Залить проект в репозиторий на GitHub.
2. На railway.app: **New Project → Deploy from GitHub repo** — Railway сам найдёт
   `Dockerfile` и соберёт образ. Порт подставляется через `$PORT`, ничего настраивать не нужно.
3. В **Variables** задать:

   ```
   BOT_TOKEN=...
   ADMIN_IDS=...
   SHOP_NAME=MoscowTab
   DATABASE_URL=sqlite:///./data/shop.db
   UPLOADS_DIR=./data/uploads
   PUBLIC_URL=https://<домен из Railway>
   ```

4. **Settings → Networking → Generate Domain** — появится https-адрес.
   Его же вписать в `PUBLIC_URL` и передеплоить.
5. **Обязательно: Settings → Volumes → добавить том с mount path `/srv/backend/data`.**
   Без тома SQLite и загруженные фото стираются при каждом деплое.

Когда каталог перерастёт SQLite, в Railway можно добавить Postgres и поменять
`DATABASE_URL` на строку вида `postgresql+psycopg://...` — код менять не придётся.

### 5. Привязать к боту

```bash
python3 set_menu_button.py https://твой-домен
```

Кнопка «Магазин» появится в меню бота. Там же в @BotFather можно задать
`/setdomain` и добавить пункт меню вручную.

## Что важно знать

- **Оплата.** Telegram Payments и платёжные провайдеры не пропускают табачные
  товары — поэтому оплаты в приложении нет: заказ уходит в чат, дальше
  договариваетесь напрямую.
- **Бот должен быть запущен покупателем.** Если человек открыл Mini App, но
  никогда не нажимал `/start`, бот не сможет написать ему в личку — заказ
  всё равно создастся и придёт админу, в ответе API будет `customer_notified: false`.
- **Цены и остатки считает сервер.** Корзина клиента передаёт только id и
  количество, суммы берутся из базы.
- **Возрастной гейт** — экран 18+ перед каталогом, отметка хранится в браузере.
