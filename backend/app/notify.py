"""Тексты и рассылка уведомлений о новом заказе."""

from .config import settings
from .models import Order
from .telegram import send_message


def _lines(order: Order) -> str:
    return "\n".join(
        f"• {i.name} — {i.qty} × {i.price} ₽ = {i.qty * i.price} ₽" for i in order.items
    )


def _client_link(order: Order) -> str:
    if order.username:
        return f'@{order.username}'
    name = order.customer_name or "клиенту"
    return f'<a href="tg://user?id={order.tg_user_id}">{name}</a>'


def notify_new_order(order: Order) -> dict:
    """Пишет покупателю и админам. Возвращает, кому дошло."""
    to_customer = (
        f"<b>Заказ №{order.id} принят</b>\n\n"
        f"{_lines(order)}\n\n"
        f"<b>Итого: {order.total} ₽</b>\n\n"
        "Скоро напишем сюда, чтобы подтвердить детали."
    )
    customer_ok = send_message(order.tg_user_id, to_customer)

    to_admin = (
        f"🛒 <b>Новый заказ №{order.id}</b>\n"
        f"Клиент: {_client_link(order)} (id {order.tg_user_id})\n\n"
        f"{_lines(order)}\n\n"
        f"<b>Итого: {order.total} ₽</b>"
    )
    markup = None
    if order.username:
        markup = {"inline_keyboard": [[{"text": "Написать клиенту", "url": f"https://t.me/{order.username}"}]]}

    admin_ok = send_message(settings.notify_chat, to_admin, markup)
    return {"customer_notified": customer_ok, "admin_notified": admin_ok}
