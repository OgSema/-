import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .auth import TgUser, current_user
from .config import settings
from .db import init_db
from .routers import catalog, orders, uploads

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title=settings.shop_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalog.router)
app.include_router(orders.router)
app.include_router(uploads.router)
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir, check_dir=False), name="uploads")


@app.get("/api/me")
def me(user: TgUser = Depends(current_user)):
    return {
        "id": user.id,
        "name": user.full_name,
        "username": user.username,
        "is_admin": user.is_admin,
        "shop_name": settings.shop_name,
    }


@app.get("/health")
def health():
    return {"ok": True, "admins": len(settings.admins), "bot_configured": bool(settings.bot_token)}


# Собранный фронтенд отдаётся тем же процессом: один домен, никакого CORS в проде.
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
