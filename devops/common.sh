#!/usr/bin/env bash
# Wspólne helpery dla skryptów devops. Skrypty robią u siebie:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "${SCRIPT_DIR}/common.sh"

# Czyta zmienną z .env.prod, potem .env (root projektu). Zwraca 1, gdy brak.
env_from_file() {
  local key="$1" f line
  for f in .env.prod .env; do
    [ -f "$f" ] || continue
    line=$(grep -E "^${key}=" "$f" | head -1 | cut -d= -f2-)
    if [ -n "$line" ]; then
      line="${line%\"}"
      line="${line#\"}"
      printf '%s\n' "$line"
      return 0
    fi
  done
  return 1
}
