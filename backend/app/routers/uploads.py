import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from ..auth import require_admin
from ..config import settings

router = APIRouter(prefix="/api", tags=["uploads"])

ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_BYTES = 5 * 1024 * 1024


@router.post("/upload", dependencies=[Depends(require_admin)])
async def upload_photo(request: Request, file: UploadFile = File(...)):
    if file.content_type not in ALLOWED:
        raise HTTPException(400, "Только JPEG, PNG или WebP")

    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Файл больше 5 МБ")

    name = f"{secrets.token_hex(16)}{ALLOWED[file.content_type]}"
    Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
    (Path(settings.uploads_dir) / name).write_bytes(data)

    base = settings.public_url.rstrip("/") or str(request.base_url).rstrip("/")
    return {"url": f"{base}/uploads/{name}"}
