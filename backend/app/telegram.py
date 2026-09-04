"""Отправка сообщений через Bot API."""

import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)
API = "https://api.telegram.org/bot{token}/{method}"


def send_message(chat_id: str | int, text: str, reply_markup: dict | None = None) -> bool:
    if not settings.bot_token or not chat_id:
        log.warning("Telegram не настроен, сообщение не отправлено")
        return False

    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        r = httpx.post(API.format(token=settings.bot_token, method="sendMessage"), json=payload, timeout=10)
        if r.status_code != 200:
            # Частый случай: покупатель не нажимал /start, бот не может ему написать.
            log.warning("sendMessage %s -> %s %s", chat_id, r.status_code, r.text)
            return False
        return True
    except httpx.HTTPError as e:
        log.warning("sendMessage failed: %s", e)
        return False
