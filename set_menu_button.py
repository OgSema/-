"""Привязывает Mini App к кнопке меню бота.

  python3 set_menu_button.py https://myshop.example.com

Токен берётся из BOT_TOKEN в .env или из окружения.
"""

import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen
import json


def bot_token() -> str:
    if os.environ.get("BOT_TOKEN"):
        return os.environ["BOT_TOKEN"]
    env = Path(__file__).with_name(".env")
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("BOT_TOKEN="):
                return line.split("=", 1)[1].strip()
    sys.exit("Не найден BOT_TOKEN")


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
        sys.exit("Укажите https-адрес магазина: python3 set_menu_button.py https://...")

    payload = json.dumps({
        "menu_button": {"type": "web_app", "text": "Магазин", "web_app": {"url": sys.argv[1]}}
    }).encode()

    req = Request(
        f"https://api.telegram.org/bot{bot_token()}/setChatMenuButton",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    print(urlopen(req).read().decode())


if __name__ == "__main__":
    main()
