#!/usr/bin/env bash
set -euo pipefail
# Use a dedicated database; the shared test fixtures delete their test users.
export DATABASE_URL="${DATABASE_URL%/*}/opiekunai_integration_tests"
export FASTAPI_ENV=development
alembic upgrade head
pytest tests/
