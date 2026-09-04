INSERT INTO categories (name, sort) VALUES ('Табак', 0), ('Кальяны', 1), ('Угли и аксессуары', 2);

INSERT INTO products (category_id, name, brand, flavor, weight, price, stock) VALUES
  (1, 'Darkside Base', 'Darkside', 'Supernova', '100 г', 1200, 10),
  (1, 'MustHave', 'MustHave', 'Pinkman', '125 г', 1100, 8),
  (1, 'Tangiers Noir', 'Tangiers', 'Cane Mint', '100 г', 1900, 4),
  (2, 'Hoob Mars', 'Hoob', '', '1 шт', 8500, 3),
  (2, 'Alpha Hookah X', 'Alpha', '', '1 шт', 24000, 1),
  (3, 'Уголь Cocoloco', 'Cocoloco', '', '1 кг', 550, 40),
  (3, 'Калауд Lotus', 'Kaloud', '', '1 шт', 4200, 5);
