#!/usr/bin/env bash
# Build & push obrazu backendu (frontend jest wbudowany w obraz — backend/Dockerfile).
#
# Zmienne (te same co w CI):
#   IMAGE_TAG          — tag obrazu (default: krótki SHA, fallback "latest")
#   DOCKERHUB_USERNAME — default: timosch99
#   DOCKERHUB_TOKEN    — access token; lokalnie automatycznie czytany z .env w root
#
# Użycie:  bash devops/build-push.sh          (z root projektu, np. przez WSL)
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${DOCKERHUB_USERNAME:-timosch99}/dzwonilek"
TAG="${IMAGE_TAG:-$(git rev-parse --short=7 HEAD 2>/dev/null || echo latest)}"
FULL="docker.io/${IMAGE}:${TAG}"

# token: z env CI albo z lokalnego .env
if [ -z "${DOCKERHUB_TOKEN:-}" ] && [ -f .env ]; then
  DOCKERHUB_TOKEN=$(grep -E '^DOCKERHUB_TOKEN=' .env | head -1 | cut -d= -f2-)
fi

echo "==> Logowanie do Docker Hub (${DOCKERHUB_USERNAME:-timosch99})"
if [ -n "${DOCKERHUB_TOKEN:-}" ]; then
  printf '%s\n' "${DOCKERHUB_TOKEN}" | docker login -u "${DOCKERHUB_USERNAME:-timosch99}" --password-stdin
else
  echo "    Brak DOCKERHUB_TOKEN — zakładam, że już zalogowany (push może się nie udać)"
fi

echo "==> Build: ${FULL} (frontend w środku, VITE_API_URL puste = same-origin)"
docker build \
  -f backend/Dockerfile \
  --build-arg VITE_API_URL= \
  -t "${FULL}" \
  -t "docker.io/${IMAGE}:latest" \
  .

echo "==> Push: ${FULL} (+ latest)"
docker push "${FULL}"
docker push "docker.io/${IMAGE}:latest"

echo "==> OK: ${FULL}"
