# 1. Сборка фронтенда
FROM node:22-alpine AS front
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Бэкенд + собранная статика
FROM python:3.12-slim
WORKDIR /srv/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=front /build/dist /srv/frontend/dist

EXPOSE 8000
# Railway и подобные хостинги подставляют свой порт через $PORT.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
