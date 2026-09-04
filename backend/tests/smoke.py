"""Проверка авторизации и полного цикла заказа без Telegram.

Запуск: ./.venv/bin/python tests/smoke.py
"""

import hashlib
import hmac
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

TOKEN = "111111:TEST-TOKEN"
ADMIN_ID = 555
CUSTOMER_ID = 777
os.environ.update(BOT_TOKEN=TOKEN, ADMIN_IDS=str(ADMIN_ID), DATABASE_URL="sqlite:///./test.db", DEV_MODE="0")
Path("test.db").unlink(missing_ok=True)

from fastapi.testclient import TestClient  # noqa: E402

from app import notify  # noqa: E402
from app.main import app  # noqa: E402

sent: list[tuple] = []
notify.send_message = lambda chat_id, text, markup=None: sent.append((chat_id, text)) or True


def init_data(user_id: int, username: str = "") -> str:
    fields = {
        "auth_date": str(int(time.time())),
        "query_id": "AAA",
        "user": json.dumps({"id": user_id, "first_name": "Иван", "username": username}),
    }
    dcs = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def hdr(user_id: int, username: str = "") -> dict:
    return {"Authorization": "tma " + init_data(user_id, username)}


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"{'OK  ' if condition else 'FAIL'} {label} {detail}")
    if not condition:
        sys.exit(1)


with TestClient(app) as c:
    # 1. Подпись
    check("битая подпись отклонена", c.get("/api/me", headers={"Authorization": "tma user=%7B%22id%22%3A1%7D&hash=deadbeef"}).status_code == 401)
    check("без заголовка отклонён", c.get("/api/me").status_code == 401)
    check("админ узнан по подписи", c.get("/api/me", headers=hdr(ADMIN_ID)).json()["is_admin"] is True)
    check("обычный юзер не админ", c.get("/api/me", headers=hdr(CUSTOMER_ID)).json()["is_admin"] is False)

    # 2. Права на каталог
    body = {"name": "Darkside Supernova", "price": 1200, "stock": 2, "brand": "Darkside"}
    check("покупатель не может создать товар", c.post("/api/products", json=body, headers=hdr(CUSTOMER_ID)).status_code == 403)
    r = c.post("/api/products", json=body, headers=hdr(ADMIN_ID))
    check("админ создал товар", r.status_code == 200, r.text[:120])
    pid = r.json()["id"]

    hidden = c.post("/api/products", json={"name": "Скрытый", "price": 10, "stock": 0}, headers=hdr(ADMIN_ID)).json()
    visible = [p["id"] for p in c.get("/api/products", headers=hdr(CUSTOMER_ID)).json()]
    check("товар без остатка скрыт от покупателя", hidden["id"] not in visible and pid in visible)

    # 3. Заказ
    r = c.post("/api/orders", json={"items": [{"product_id": pid, "qty": 2}]}, headers=hdr(CUSTOMER_ID, "ivan"))
    check("заказ создан", r.status_code == 200, r.text[:160])
    order = r.json()
    check("сумма посчитана по базе", order["total"] == 2400, str(order["total"]))
    check("уведомления ушли покупателю и админу", [s[0] for s in sent] == [CUSTOMER_ID, str(ADMIN_ID)], str([s[0] for s in sent]))

    r = c.post("/api/orders", json={"items": [{"product_id": pid, "qty": 1}]}, headers=hdr(CUSTOMER_ID))
    check("остаток списан, повторный заказ отклонён", r.status_code == 409, r.text[:120])

    # 4. Заказы видит только админ
    check("покупатель не видит список заказов", c.get("/api/orders", headers=hdr(CUSTOMER_ID)).status_code == 403)
    check("админ видит заказ", len(c.get("/api/orders", headers=hdr(ADMIN_ID)).json()) == 1)
    check("статус меняется", c.patch(f"/api/orders/{order['id']}", json={"status": "done"}, headers=hdr(ADMIN_ID)).json()["status"] == "done")

Path("test.db").unlink(missing_ok=True)
print("\nвсе проверки прошли")
