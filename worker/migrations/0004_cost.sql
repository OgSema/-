-- Закупочная цена товара: нужна админу для отчётности, покупателю не отдаётся.
ALTER TABLE products ADD COLUMN cost INTEGER NOT NULL DEFAULT 0;

-- Закупка на момент продажи. Снимок нужен потому, что закупочная цена меняется:
-- без него пересчёт задним числом переписывал бы прибыль по старым заказам.
ALTER TABLE order_items ADD COLUMN cost INTEGER NOT NULL DEFAULT 0;
