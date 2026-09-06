-- Заставка раздела: своя картинка на плитке главной вместо фото первого товара.
-- На новой базе колонка уже есть в schema.sql. Повторный запуск падает с
-- «duplicate column name» — значит, миграция уже применена.
ALTER TABLE categories ADD COLUMN photo_url TEXT NOT NULL DEFAULT '';
