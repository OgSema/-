from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import TgUser, current_user, require_admin
from ..db import get_session
from ..models import Order, OrderItem, Product
from ..notify import notify_new_order

router = APIRouter(prefix="/api/orders", tags=["orders"])


class CartLine(BaseModel):
    product_id: int
    qty: int


class OrderIn(BaseModel):
    items: list[CartLine]


class StatusIn(BaseModel):
    status: str


def serialize(order: Order) -> dict:
    return {
        "id": order.id,
        "tg_user_id": order.tg_user_id,
        "username": order.username,
        "customer_name": order.customer_name,
        "total": order.total,
        "status": order.status,
        "created_at": order.created_at,
        "items": [{"name": i.name, "price": i.price, "qty": i.qty} for i in order.items],
    }


@router.post("")
def create_order(
    data: OrderIn,
    session: Session = Depends(get_session),
    user: TgUser = Depends(current_user),
):
    if not data.items:
        raise HTTPException(400, "Корзина пуста")

    order = Order(tg_user_id=user.id, username=user.username, customer_name=user.full_name)
    total = 0

    for line in data.items:
        if line.qty < 1:
            raise HTTPException(400, "Некорректное количество")
        product = session.get(Product, line.product_id)
        if not product or not product.is_active:
            raise HTTPException(400, f"Товар {line.product_id} недоступен")
        if product.stock < line.qty:
            raise HTTPException(409, f"«{product.name}»: осталось {product.stock} шт.")

        # Цену берём из базы, а не из корзины клиента.
        product.stock -= line.qty
        session.add(product)
        order.items.append(
            OrderItem(product_id=product.id, name=product.name, price=product.price, qty=line.qty)
        )
        total += product.price * line.qty

    order.total = total
    session.add(order)
    session.commit()
    session.refresh(order)

    delivered = notify_new_order(order)
    return serialize(order) | delivered


@router.get("", dependencies=[Depends(require_admin)])
def list_orders(session: Session = Depends(get_session)):
    orders = session.exec(select(Order).order_by(Order.created_at.desc())).all()
    return [serialize(o) for o in orders]


@router.patch("/{order_id}", dependencies=[Depends(require_admin)])
def set_status(order_id: int, data: StatusIn, session: Session = Depends(get_session)):
    if data.status not in {"new", "confirmed", "done", "canceled"}:
        raise HTTPException(400, "Неизвестный статус")
    order = session.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Заказ не найден")
    order.status = data.status
    session.add(order)
    session.commit()
    session.refresh(order)
    return serialize(order)
