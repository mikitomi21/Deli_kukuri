FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
COPY frontend/package.json ./frontend/

WORKDIR /app/frontend

RUN bun install

COPY ./frontend .

# Dev server for local docker-compose usage. Production builds are baked
# into the backend image (see backend/Dockerfile).
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
