"""Проверка Telegram Mini App initData.

Telegram отдаёт фронтенду подписанную строку initData. Подпись считается
HMAC-SHA256 на ключе, производном от токена бота, поэтому подделать её без
токена нельзя. Это и есть весь наш логин: id пользователя из проверенной
подписи сверяется со списком ADMIN_IDS.
"""

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException, status

from .config import settings

MAX_AGE_SECONDS = 24 * 60 * 60


@dataclass
class TgUser:
    id: int
    username: str
    first_name: str
    last_name: str

    @property
    def is_admin(self) -> bool:
        return self.id in settings.admins

    @property
    def full_name(self) -> str:
        return " ".join(p for p in (self.first_name, self.last_name) if p)


def verify_init_data(init_data: str) -> TgUser:
    if not settings.bot_token:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "BOT_TOKEN не настроен")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", "")
    if not received_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Нет подписи initData")

    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, received_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверная подпись initData")

    try:
        if time.time() - int(pairs.get("auth_date", 0)) > MAX_AGE_SECONDS:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия истекла, откройте приложение заново")
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Битый auth_date")

    try:
        user = json.loads(pairs["user"])
    except (KeyError, json.JSONDecodeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "В initData нет пользователя")

    return TgUser(
        id=int(user["id"]),
        username=user.get("username", ""),
        first_name=user.get("first_name", ""),
        last_name=user.get("last_name", ""),
    )


def current_user(authorization: str = Header(default="")) -> TgUser:
    if authorization.startswith("tma "):
        return verify_init_data(authorization[4:])

    if settings.dev_mode:
        # Локальная разработка в обычном браузере, вне Telegram.
        fake_id = next(iter(settings.admins), 1)
        return TgUser(id=fake_id, username="dev", first_name="Dev", last_name="")

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Откройте магазин через Telegram")


def require_admin(user: TgUser = Depends(current_user)) -> TgUser:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нужны права администратора")
    return user
