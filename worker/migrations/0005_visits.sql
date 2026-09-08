-- Счётчик посетителей: одна отметка на человека в день. Считаем людей, а не
-- открытия приложения — иначе один покупатель, дёргающий витрину весь вечер,
-- выглядел бы как толпа.
CREATE TABLE IF NOT EXISTS visits (
  tg_user_id INTEGER NOT NULL,
  day        TEXT NOT NULL,   -- YYYY-MM-DD по Москве
  PRIMARY KEY (tg_user_id, day)
);
