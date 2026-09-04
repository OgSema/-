"""Наполняет базу демо-товарами: python seed.py"""

from sqlmodel import Session, select

from app.db import engine, init_db
from app.models import Category, Product

DEMO = {
    "Табак": [
        ("Darkside Base", "Darkside", "Supernova", "100 г", 1200, 10),
        ("MustHave", "MustHave", "Pinkman", "125 г", 1100, 8),
        ("Tangiers Noir", "Tangiers", "Cane Mint", "100 г", 1900, 4),
    ],
    "Кальяны": [
        ("Hoob Mars", "Hoob", "", "1 шт", 8500, 3),
        ("Alpha Hookah X", "Alpha", "", "1 шт", 24000, 1),
    ],
    "Угли и аксессуары": [
        ("Уголь Cocoloco", "Cocoloco", "", "1 кг", 550, 40),
        ("Калауд Lotus", "Kaloud", "", "1 шт", 4200, 5),
    ],
}


def main() -> None:
    init_db()
    with Session(engine) as session:
        if session.exec(select(Product)).first():
            print("В базе уже есть товары, сид пропущен")
            return
        for sort, (cat_name, items) in enumerate(DEMO.items()):
            category = Category(name=cat_name, sort=sort)
            session.add(category)
            session.commit()
            session.refresh(category)
            for name, brand, flavor, weight, price, stock in items:
                session.add(Product(
                    category_id=category.id, name=name, brand=brand, flavor=flavor,
                    weight=weight, price=price, stock=stock,
                ))
        session.commit()
    print("Демо-каталог создан")


if __name__ == "__main__":
    main()
