from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Category(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    sort: int = 0


class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: Optional[int] = Field(default=None, foreign_key="category.id")
    name: str
    brand: str = ""
    flavor: str = ""
    weight: str = ""          # "40 г", "100 г", "1 шт"
    price: int = 0            # рубли, целые
    description: str = ""
    photo_url: str = ""
    stock: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=utcnow)


class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tg_user_id: int
    username: str = ""
    customer_name: str = ""   # из профиля Telegram
    total: int = 0
    status: str = "new"       # new | confirmed | done | canceled
    created_at: datetime = Field(default_factory=utcnow)

    items: list["OrderItem"] = Relationship(
        back_populates="order",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class OrderItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: int = Field(foreign_key="order.id")
    product_id: Optional[int] = Field(default=None, foreign_key="product.id")
    name: str                 # снимок на момент заказа
    price: int
    qty: int

    order: Optional[Order] = Relationship(back_populates="items")
