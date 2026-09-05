-- Для баз, созданных до 2026-09-05. На новой базе всё это уже есть в schema.sql,
-- запускать не нужно. Повторный запуск падает с «duplicate column name» — это
-- значит, что миграция уже применена.

ALTER TABLE orders ADD COLUMN phone   TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN comment TEXT NOT NULL DEFAULT '';

ALTER TABLE promos ADD COLUMN max_uses   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promos ADD COLUMN used_count INTEGER NOT NULL DEFAULT 0;
