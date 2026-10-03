#!/usr/bin/env bash
# Deploy na VPS: wyślij pliki compose, ściągnij obraz (wybrany tag), restart stacka.
#
# Zmienne (te same co w CI; lokalnie niedobrane z .env.prod/.env albo defaulty):
#   VPS_HOST     — IP serwera (default: 185.193.114.6)
#   VPS_USER     — default: root
#   IMAGE_TAG    — tag obrazu z Docker Hub (default: latest; sha = rollback)
#   SSH_KEY_FILE — ścieżka do prywatnego klucza (lokalnie: dzwonilek_deploy)
#   SSH_KEY      — treść klucza prywatnego (tak podaje CI sekretem); ma pierwszeństwo
#
# Użycie:  bash devops/deploy.sh                (z root projektu, np. przez WSL)
#          IMAGE_TAG=<sha> bash devops/deploy.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"
cd "${SCRIPT_DIR}/.."

VPS_HOST="${VPS_HOST:-$(env_from_file VPS_HOST || true)}"
VPS_HOST="${VPS_HOST:-185.193.114.6}"
VPS_USER="${VPS_USER:-$(env_from_file VPS_USER || true)}"
VPS_USER="${VPS_USER:-root}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DEPLOY_DIR="/opt/dzwonilek"
IMAGE="docker.io/timosch99/dzwonilek"

# klucz SSH: SSH_KEY (treść, jak w CI) > SSH_KEY_FILE > ~/.ssh/dzwonilek_deploy > dzwonilek_deploy (root)
# Uwaga: klucz na /mnt/c (dysk Windows) wygląda jak 0777 i ssh go odrzuci —
# jednorazowo skopiuj go do ~/.ssh w WSL z chmod 600 (dok. §1.3).
if [ -n "${SSH_KEY:-}" ]; then
  KEY_FILE=$(mktemp)
  printf '%s\n' "${SSH_KEY}" > "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
  trap 'rm -f "${KEY_FILE}"' EXIT
elif [ -n "${SSH_KEY_FILE:-}" ]; then
  KEY_FILE="${SSH_KEY_FILE}"
elif [ -f "$HOME/.ssh/dzwonilek_deploy" ]; then
  KEY_FILE="$HOME/.ssh/dzwonilek_deploy"
elif [ -f "dzwonilek_deploy" ]; then
  KEY_FILE="dzwonilek_deploy"
  echo "⚠️  Klucz ${KEY_FILE} leży na /mnt/c (uprawnienia 0777) — ssh go odrzuci." >&2
  echo "    Jednorazowo: mkdir -p ~/.ssh && cp dzwonilek_deploy ~/.ssh/ && chmod 600 ~/.ssh/dzwonilek_deploy" >&2
else
  echo "Brak klucza SSH: ustaw SSH_KEY albo SSH_KEY_FILE (albo miej dzwonilek_deploy w root/~/.ssh)." >&2
  exit 1
fi

SSH=(ssh -i "${KEY_FILE}" -o StrictHostKeyChecking=accept-new)
TARGET="${VPS_USER}@${VPS_HOST}"

echo "==> Wysyłam pliki compose na ${TARGET}:${DEPLOY_DIR}"
"${SSH[@]}" "${TARGET}" "mkdir -p ${DEPLOY_DIR}"
scp -i "${KEY_FILE}" -o StrictHostKeyChecking=accept-new \
  compose.yml compose.deploy.yml "${TARGET}:${DEPLOY_DIR}/"

echo "==> VPS: pull ${IMAGE}:${IMAGE_TAG} + retag latest + restart stacka"
"${SSH[@]}" "${TARGET}" "IMAGE_TAG='${IMAGE_TAG}' DEPLOY_DIR='${DEPLOY_DIR}' IMAGE='${IMAGE}' bash -s" <<'EOF'
set -e
cd "$DEPLOY_DIR"
docker pull "$IMAGE:$IMAGE_TAG"
docker tag "$IMAGE:$IMAGE_TAG" "$IMAGE:latest"
# Voice gateway obraz (stable "voice" tag, built by build-push.sh) — fails the
# deploy loudly if missing, so voice is never silently left stale.
docker pull "$IMAGE:voice"
docker compose --env-file .env -f compose.yml -f compose.deploy.yml up -d --remove-orphans
docker image prune -f
EOF

echo "==> OK: stack wdrożony (tag: ${IMAGE_TAG})"
