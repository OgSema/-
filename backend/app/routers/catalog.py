from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import TgUser, current_user, require_admin
from ..db import get_session
from ..models import Category, Product

router = APIRouter(prefix="/api", tags=["catalog"])


class ProductIn(BaseModel):
    name: str
    category_id: Optional[int] = None
    brand: str = ""
    flavor: str = ""
    weight: str = ""
    price: int = 0
    description: str = ""
    photo_url: str = ""
    stock: int = 0
    is_active: bool = True


class CategoryIn(BaseModel):
    name: str
    sort: int = 0


@router.get("/categories")
def list_categories(session: Session = Depends(get_session)):
    return session.exec(select(Category).order_by(Category.sort, Category.name)).all()


@router.post("/categories", dependencies=[Depends(require_admin)])
def create_category(data: CategoryIn, session: Session = Depends(get_session)):
    category = Category(**data.model_dump())
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.delete("/categories/{category_id}", dependencies=[Depends(require_admin)])
def delete_category(category_id: int, session: Session = Depends(get_session)):
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(404, "Категория не найдена")
    for product in session.exec(select(Product).where(Product.category_id == category_id)):
        product.category_id = None
        session.add(product)
    session.delete(category)
    session.commit()
    return {"ok": True}


@router.get("/products")
def list_products(
    category_id: Optional[int] = None,
    q: Optional[str] = None,
    session: Session = Depends(get_session),
    user: TgUser = Depends(current_user),
):
    stmt = select(Product)
    if not user.is_admin:
        # Покупатель видит только опубликованные позиции в наличии.
        stmt = stmt.where(Product.is_active == True, Product.stock > 0)  # noqa: E712
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Product.name.like(like) | Product.brand.like(like) | Product.flavor.like(like))
    return session.exec(stmt.order_by(Product.created_at.desc())).all()


@router.post("/products", dependencies=[Depends(require_admin)])
def create_product(data: ProductIn, session: Session = Depends(get_session)):
    product = Product(**data.model_dump())
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@router.patch("/products/{product_id}", dependencies=[Depends(require_admin)])
def update_product(product_id: int, data: ProductIn, session: Session = Depends(get_session)):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Товар не найден")
    for field, value in data.model_dump().items():
        setattr(product, field, value)
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@router.delete("/products/{product_id}", dependencies=[Depends(require_admin)])
def delete_product(product_id: int, session: Session = Depends(get_session)):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Товар не найден")
    session.delete(product)
    session.commit()
    return {"ok": True}
