-- Программа лояльности. Уровень считается по заказам, поэтому хранить нечего,
-- кроме отметки, что скидку в заказе дал уровень, а не промокод.

ALTER TABLE orders ADD COLUMN loyalty_tier TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(tg_user_id);
