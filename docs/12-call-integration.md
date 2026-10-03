# Call integration

The `origin/feature/twilio` branch is merged into this branch. Its Twilio/OpenAI
Realtime implementation in `twilio-test/call-leki.js` runs behind `gateway.js`.
The branch also includes `origin/main` through `cd173e6`, retaining medication
editing/deletion, routine payload mapping and API mode as the default. The shared
API client is regenerated from the combined backend schema. Local frontend `.env`
overrides remain ignored; use `frontend/.env.example` for configuration.
Each call uses a separate child process with the ward's name, timezone and
medications from the approved routine. The gateway authenticates backend
requests and Twilio WebSocket upgrades, and persists summaries and final
statuses through authenticated backend callbacks.

## Local configuration

In the repository root `.env`, configure:

```dotenv
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
OPENAI_API_KEY=
# Public HTTPS tunnel to the voice gateway on port 3000; WebSockets required.
PUBLIC_URL=
# Shared private token used by backend, worker and voice gateway.
VOICE_SERVICE_TOKEN=
VOICE_SERVICE_URL=http://voice:3000
```

`TWILIO_FROM` is also supported. API mode is the default; `VITE_USE_MOCKS=mocks`
explicitly enables demo data and `empty` previews the empty dashboard.
The existing local configuration already contains a generated private token.
Never commit credentials. Trial accounts require verified destination numbers.

Run `docker compose build voice`, then
`docker compose up -d backend voice worker beat frontend`.
After changes to `frontend/.env`, run `docker compose restart frontend`.
Forward the public tunnel to port 3000 and use its HTTPS address for `PUBLIC_URL`.
To run ngrok inside Docker, set `NGROK_AUTHTOKEN` in the root `.env` using the
account that owns `PUBLIC_URL`, then run:

```sh
docker compose --profile tunnel up -d ngrok
```

The ngrok service forwards directly to `http://voice:3000` on the Docker network.
Check `${PUBLIC_URL}/health` before calling; it must return `{"ready":true}`.
After changing credentials or the public URL, recreate `voice` with
`docker compose up -d --force-recreate voice`.

## Flows

- Manual: the frontend posts `/api/v1/wards/{ward_id}/test-call`; the API validates
  ownership and an approved routine, checks provider readiness, saves a task and
  queues `place_call` immediately. Optional `routine_id` selects the routine.
- Scheduled: approval materializes the next 48 hours in the ward's timezone;
  Beat refreshes the horizon every 30 minutes and dispatches due tasks every minute.
  Edits and pauses cancel pending tasks. Reapproval regenerates the schedule.
- Both paths reserve a unique `Call` row before requesting the gateway. Replayed
  workers do not dial the same task twice. Provider failure is visible as failure.
- The gateway returns the Twilio SID and forwards conversation summaries and
  terminal statuses. The panel polls real history/results every five seconds.
- Terminal `not_taken` and `no_answer` results schedule one retry after 15 minutes when the task's
  configured attempt limit permits it. Repeated terminal callbacks are deduplicated.
  `CALL_MAX_ATTEMPTS` and `CALL_RETRY_DELAY_MIN` configure these limits.
- When provider configuration is incomplete, manual requests return 503 and the
  periodic dispatcher leaves pending tasks untouched.
- An ambiguous gateway HTTP timeout records a failure without automatically
  redialing. A late authenticated completion callback can reconcile that failure.

## Verification

The backend integration tests cover manual and scheduled dispatch, provider
context, result persistence, history, callback authentication and retry deduplication.
Gateway tests cover isolation, authorization, replay prevention and callback order.
Frontend tests cover real API selection, payload mapping and queued-call feedback.

Use an isolated PostgreSQL database named `opiekunai_integration_tests` for
`backend/scripts/test-integration.sh`. The test fixtures clean that test database.
A live phone call additionally requires credentials, a public tunnel and an
explicitly selected test recipient; automated tests do not contact Twilio.

The browser integration suite uses `compose.integration.yml`: a separate API,
test database, Redis database 2, Celery worker, Beat (two-second dispatch interval)
and a simulated voice gateway. It exercises the real UI, HTTP requests, queued
worker execution, scheduled dispatch, persisted results and both color themes.
Create `opiekunai_integration_tests` once with
`docker compose exec db createdb -U postgres opiekunai_integration_tests`.

```sh
docker compose -f compose.yml -f compose.override.yml -f compose.integration.yml up -d backend-test voice-test worker-test beat-test
docker compose -f compose.yml -f compose.override.yml -f compose.integration.yml run --rm playwright bun --bun x playwright test --config call-integration.config.ts
docker compose -f compose.yml -f compose.override.yml -f compose.integration.yml stop backend-test voice-test worker-test beat-test
docker compose -f compose.yml -f compose.override.yml -f compose.integration.yml run --rm --no-deps backend-test uv run bash scripts/test-integration.sh
docker compose exec frontend bun --bun run test:unit
docker compose exec frontend bun --bun run build
```

Gateway tests: `npm test` in `twilio-test/` after `npm ci`, or run them with
the built Docker image and mounted test sources:

```sh
docker compose run --rm --no-deps -e NODE_PATH=/app/node_modules -v "./twilio-test:/fixtures" voice node --test /fixtures/gateway.test.js
```

The browser suite also checks medication editing through the real API, blocked
routine creation for inactive wards, call detail navigation after reload, and
session recovery. Provider calls in this suite are simulated.
