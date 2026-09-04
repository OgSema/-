from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    bot_token: str = ""
    # Telegram user id админов через запятую: "123456789,987654321"
    admin_ids: str = ""
    # Куда бот шлёт новые заказы. Пусто -> первому админу из admin_ids.
    order_chat_id: str = ""

    shop_name: str = "MoscowTab"
    database_url: str = "sqlite:///./shop.db"
    uploads_dir: str = "./uploads"
    # Публичный https-адрес бэкенда, нужен чтобы отдавать ссылки на фото.
    public_url: str = ""
    cors_origins: str = "*"
    # 1 -> пускает без Telegram initData под фейковым админом. ТОЛЬКО для localhost.
    dev_mode: int = 0

    @property
    def admins(self) -> set[int]:
        return {int(x) for x in self.admin_ids.replace(" ", "").split(",") if x}

    @property
    def notify_chat(self) -> str:
        if self.order_chat_id:
            return self.order_chat_id
        return str(next(iter(self.admins))) if self.admins else ""


settings = Settings()
