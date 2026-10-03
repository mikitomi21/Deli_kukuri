# 07 — Scheduling i eskalacja (Celery + Redis)

> Odpowiada na brief: *„Na podstawie wyniku możemy podejmować inne taski i je schedulować"*.
> Zespół odłożył szczegółowe decyzje na później — poniżej **proste domyślne reguły**, wszystko konfigurowalne env-ami. Zero UI do polityk (WON'T z [`01-mvp-scope.md`](01-mvp-scope.md)).

## Dwa zadania okresowe (Celery beat)

| Task beat | Coś | Interval |
|---|---|---|
| `materializer` | generuje CallTaski z approved rutyn na **nast. 48 h** | co 30 min |
| `dispatcher` | wywołuje połączenia dla CallTasków, których czas nadszedł | co 1 min |

### Materializer (rutyny → CallTask)

```
dla każdej Routine(status=approved, ward.active):
    dla każdej godziny wystąpienia w oknie [now, now+48h] (tz podopiecznego):
        jeśli nie istnieje CallTask(routine, scheduled_at, attempt_no=1) → INSERT (status=pending)
```

- **Idempotentny**: unikalny indeks `(routine_id, scheduled_at, attempt_no)` chroni przed duplikatami przy równoległych runach.
- Zmiana/zatwierdzenie rutyny działa od razu: przy `approve` wołamy materializer **od razu** (nie czekamy na beat).
- MVP: rutyny `daily`; `days_mask` przewidziany w modelu.

### Dispatcher (CallTask → połączenie)

```
co 60 s:
    taski = SELECT ... WHERE status='pending' AND scheduled_at <= now() LIMIT 20
    dla każdego:
        zmieniono = UPDATE CallTask SET status='in_progress'
                    WHERE id=? AND status='pending'      # atomowo!
        if zmieniono == 1:
            place_call.delay(task_id)                     # Celery robi resztę
```

- **Idempotencja** przez atomic UPDATE (status guard) — dwa workery nie zdzwonią podwójnie; Redis-lock jako druga warstwa (opcjonalny, gdyby UPDATE nie wystarczył przy deployu multi-worker — nie powinien na MVP).
- Dezaktualizacja: rutyna `paused`/edytowana między materializacją a wywołaniem → dispatcher sprawdza świeży status rutyny przed `place_call` (i anuluje task).

## Taski Celery (jednorazowe)

### `place_call(task_id)`
1. Wczytaj CallTask + Routine + Ward + items (join).
2. Guardy: ward.active, rutyna nadal approved — inaczej `cancelled`.
3. Tryb symulacji (S5): zamiast Twilio → zaszyty scenariusz → `finalize_call` z wymuszonym wynikiem.
4. `twilio.calls.create(to=ward.phone_e164, from_=TWILIO_FROM_NUMBER, url=f"{PUBLIC_BASE_URL}/api/v1/twilio/voice/{task_id}", status_callback=f".../status/{task_id}", status_callback_event=["completed","no-answer","busy","failed"])`
5. Zapisz `Call(twilio_call_sid, status=in_progress)`.
6. Błąd Twilio (network/4xx) → `failed` + `finalize_call` z `no_answer` (i tak zespół polityki zdecyduje o retry).

### `finalize_call(task_id, twilio_status)` — po status callbacku
1. Zapisz status/durację na Call; jeśli brak rozmowy → `CallResult(outcome=no_answer)` (+turn „(brak odbioru)").
2. Upsert po `twilio_call_sid` (Twilio powtarza callbacki).
3. `post_call_policy.delay(call_result_id)`.

### `post_call_policy(call_result_id)` — „na podstawie wyniku schedulujemy taski"

| Wynik | Akcja (default) |
|---|---|
| `took` | koniec. (Pozytywna pętla zamyka się sama.) |
| `unclear` | koniec — flaga na dashboardzie; **brak retry** (unikamy nękania seniora) |
| `not_taken` lub `no_answer` | jeśli `attempt_no < max_attempts`: **nowy CallTask `scheduled_at = now + CALL_RETRY_DELAY_MIN (15)`, attempt_no+1** |
| `not_taken` / `no_answer` przy wyczerpanych próbach | **`escalate`**: EscalationEvent + e-mail do opiekuna |

### `escalate(call_result_id)`
1. `INSERT EscalationEvent(channel=email, status=pending)`.
2. E-mail (stack z template: `emails` + Jinja template) do `caregiver.email`:
   - Temat: `⚠️ {Ward} — brak potwierdzenia leków ({rutyna}, {godzina})`
   - Treść: wynik po wszystkich próbach, godziny prób, skrót transkrypcji ostatniej, link `{FRONTEND_HOST}/calls/{id}`.
3. Dev: Mailpit (UI `:8025`) — **to pokazujemy na demo**. `status=sent`/`failed` zapisany; failed nie blokuje niczego.
4. (C2, stretch: SMS przez Twilio — tylko zweryfikowane numery na trialu.)

## Config (env → domyślne)

| Zmienna | Default | Znaczenie |
|---|---|---|
| `CALL_RETRY_DELAY_MIN` | 15 | opóźnienie retry |
| `CALL_MAX_ATTEMPTS` | 2 | łączna liczba prób na wystąpienie rutyny |
| `MATERIALIZER_HORIZON_H` | 48 | horyzont generowania |
| `SIMULATE_CALLS` | false | tryb symulacji (S5) |
| `QUIET_HOURS` | *(post-MVP)* | okno ciszy — MVP nie implementujemy |

## Pułapki, o których musimy pamiętać

1. **Strefy czasowe:** wszystko w DB w UTC (`scheduled_at`), `time_of_day` rutyny w strefie podopiecznego → materializer konwertuje. PL = CEST/CET, na hackathon nie kombinujemy (default `Europe/Warsaw` wszędzie).
2. **Beat vs deploy:** jeden proces beat (nie duplikować w compose), worker osobno; przy `fastapi dev` local beat uruchamiamy jako osobny proces.
3. **Redis w compose:** dodać usługę `redis:7-alpine` do `compose.override.yml` (+ healthcheck), broker URL `redis://redis:6379/0`.
4. **Długi webhook ≠ Celery:** webhooki odpowiadają TwiML-em natychmiast; wszystko cięższe → `.delay()`.
5. **Test-call idempotentny:** double-click przycisku → 2 połączenia; frontend disable po kliknięciu + backend może deduplikować (opcjonalnie).
