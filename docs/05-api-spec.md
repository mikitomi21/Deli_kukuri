# 05 — Specyfikacja API (MVP)

> Baza: `/api/v1` (z template). Autoryzacja aplikacji: JWT Bearer (istnieje).
> **Wyjątek:** webhooki `/api/v1/twilio/*` — auth = walidacja podpisu Twilio (patrz [`02-architecture.md`](02-architecture.md)).
> Po zmianach: regeneracja klienta FE (`openapi-ts`).

## Endpointy

### Wards (podopieczni)
| Metoda | Ścieżka | Opis | Priorytet |
|---|---|---|---|
| `POST` | `/wards` | dodaj podopiecznego | MUST |
| `GET` | `/wards` | lista moich podopiecznych (+ dzisiejsze wyniki skrótowo) | MUST |
| `GET` | `/wards/{id}` | szczegóły + statystyka adherencji (dziś/7 dni) | MUST |
| `PATCH` | `/wards/{id}` | edycja (imię/telefon/tz) | MUST |
| `DELETE` | `/wards/{id}` | dezaktywacja (soft) | SHOULD |

```json
// POST /wards
{ "full_name": "Halina Kowalska", "phone_e164": "+48600100200", "tz": "Europe/Warsaw" }
```

### Medications — katalog leków (baza leków, read-only)
> Katalog **globalny i współdzielony** — nie należy do podopiecznego. **Ward nie ma własnej listy leków**; leki trafiają do podopiecznego wyłącznie przez rutyny (`RoutineItem` → `Medication`).

| Metoda | Ścieżka | Opis | Priorytet |
|---|---|---|---|
| `GET` | `/medications?q=warf` | wyszukiwanie w katalogu (ILIKE po nazwie) | MUST |
| `GET` | `/medications/{id}` | szczegóły leku | MUST |

```json
// GET /medications?q=warf
{
  "data": [
    { "id": "uuid", "name": "Warfarin", "dosage": "5 mg", "form": "tabletki powlekane", "instructions": "po posiłku" }
  ]
}
```

Zasilanie katalogu: skrypt seedujący (20–50 popularnych leków) — tylko seed, brak CRUD w MVP. Integracja z Rejestrem Produktów Leczniczych = post-MVP ([`09-roadmap.md`](09-roadmap.md)).

### Routines (rutyny)
| Metoda | Ścieżka | Opis | Priorytet |
|---|---|---|---|
| `POST` | `/wards/{ward_id}/routines` | utwórz rutynę (items + dependencies w jednym payloadzie) | MUST |
| `GET` | `/wards/{ward_id}/routines` | lista (z items, dependencies, statusem) | MUST |
| `PATCH` | `/routines/{id}` | edycja | MUST |
| `DELETE` | `/routines/{id}` | usunięcie (jeśli draft) | SHOULD |
| `POST` | `/routines/{id}/approve` | **zatwierdzenie** (bramka schedulowania) | MUST |
| `POST` | `/routines/{id}/pause` | wstrzymanie | SHOULD |

```json
// POST /wards/{ward_id}/routines
{
  "name": "Poranne leki",
  "time_of_day": "09:00",
  "days": "daily",
  "items": [
    { "medication_id": "uuid", "amount_label": "1 tabletka" },
    { "medication_id": "uuid2", "amount_label": "pół tabletki" }
  ],
  "depends_on": ["uuid-rutyny-rano"]   // opcjonalne, walidacja przy approve
}
// POST /routines/{id}/approve → 200 { "status": "approved" } | 409 gdy zależność nie approved / brak itemów
```

### Call tasks & calls
| Metoda | Ścieżka | Opis | Priorytet |
|---|---|---|---|
| `GET` | `/wards/{ward_id}/call-tasks` | `?status=pending\|completed…&from&to` — harmonogram | MUST |
| `GET` | `/wards/{ward_id}/calls` | historia połączeń z wynikami | MUST |
| `GET` | `/calls/{id}` | szczegóły: tury (transkrypcja), wynik, pełny transcript | MUST |
| `POST` | `/wards/{ward_id}/test-call` | **natychmiastowe** połączenie dla najbliższej approved rutyny (albo `?routine_id=`) | MUST |
| `GET` | `/wards/{ward_id}/stats` | `{ "today": {"took":2,"total":3}, "week_pct": 86 }` | SHOULD |

```json
// GET /calls/{id}
{
  "id": "uuid",
  "call_task_id": "uuid",
  "routine": { "name": "Poranne leki", "time_of_day": "09:00" },
  "status": "completed",
  "duration_sec": 34,
  "attempt_no": 1,
  "result": {
    "outcome": "took",
    "confidence": 0.91,
    "transcript_full": "System: Czy przyjęła Pani… | Halina: Tak, przyjęłam."
  },
  "turns": [
    { "turn_no": 1, "question": "Dzień dobry, Halina. Czy przyjęła Pani dziś o 9:00 lek: Warfarin 5 mg? Proszę odpowiedzieć: tak lub nie.",
      "speech_result": "tak przyjęłam", "confidence": 0.91, "parsed": "yes" }
  ]
}
```

### Webhooki Twilio (bez JWT, z walidacją podpisu)

| Metoda | Ścieżka | Rola |
|---|---|---|
| `POST` | `/twilio/voice/{call_task_id}` | start rozmowy → zwraca TwiML: `<Say>` pytanie + `<Gather>` |
| `POST` | `/twilio/gather/{call_task_id}` | action z `<Gather>`: odbiera `SpeechResult`+`Confidence` → parsuje → zwraca kolejne TwiML (potwierdzenie / powtórka / koniec) |
| `POST` | `/twilio/status/{call_task_id}` | status callback: `CallStatus=completed/no-answer/busy/failed/canceled` + `CallSid` + duracja |

Zasady:
- `call_task_id` to UUID — URL niezgadywalny; podpis Twilio autoryzuje.
- Webhooki muszą odpowiadać **synchronicznie XML-em** (`Content-Type: text/xml`), bez wolnych operacji w ścieżce krytycznej (parsowanie i zapis turnów są tanie; eskalację → Celery).
- `CallSid` deduplikuje powtórzone statusy (upsert po `twilio_call_sid`).

### Błędy — konwencja
Reuse template: `422` walidacja pydantic; nasze: `409` (nie można zatwierdzić rutyny), `404` (obcy zasób — **nie ujawniamy istnienia cudzych podopiecznych**), `502` (błąd Twilio przy test-call — z czytelnym komunikatem).

## Regeneracja klienta FE

```bash
# po każdej zmianie endpointów:
cd backend && uv run fastapi run  # lub dev; openapi.json na :8000
cd frontend && bun run generate-client   # (skrypt z template)
```
