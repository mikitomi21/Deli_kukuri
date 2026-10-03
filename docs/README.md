# Deli kukuri — Dokumentacja projektu

> Asystent głosowy, który **dzwoni do seniora, potwierdza przyjęcie leków i raportuje wynik opiekunowi**.
> Hackathon 24h — jesteśmy na ~T+3h, zostało **~21h**.

## Jak czytać (kolejność dla nowej osoby w zespole)

1. [`00-vision.md`](00-vision.md) — po co to robimy, pitch, persony (3 min czytania)
2. [`01-mvp-scope.md`](01-mvp-scope.md) — co robimy, a czego NIE robimy w MVP (**obowiązkowe dla wszystkich**)
3. [`02-architecture.md`](02-architecture.md) — komponenty i przepływ połączenia (dla BE/infra)
4. [`03-data-model.md`](03-data-model.md) — encje i statusy (dla BE + FE)
5. [`04-user-stories.md`](04-user-stories.md) — epiki i historie użytkownika (dla FE + PM)
6. [`05-api-spec.md`](05-api-spec.md) — kontrakt API (kontrakt FE↔BE)
7. [`06-call-flow.md`](06-call-flow.md) — jak wygląda rozmowa telefoniczna (dla pary Twilio)
8. [`07-scheduling-escalation.md`](07-scheduling-escalation.md) — Celery, retry, eskalacja
9. [`08-hackathon-plan.md`](08-hackathon-plan.md) — rozpiska 21h, role, taski, ryzyka (**dla PM**)
10. [`09-roadmap.md`](09-roadmap.md) — pomysły po MVP (do pitchu)
11. [`10-decisions.md`](10-decisions.md) — podjęte decyzje (ADR) i otwarte pytania

## Szybki skrót projektu

| Co | Decyzja |
|---|---|
| Problem | Seniorzy pomijają dawki leków; opiekun nie ma pewności, czy lek został wzięty |
| Rozwiązanie | Opiekun definiuje rutyny → system sam dzwoni (Twilio) do podopiecznego o danej godzinie → rozmowa głosowa (TTS/STT, pl-PL) → wynik „wziął / nie wziął / nie wiem" + transkrypcja → dashboard + eskalacja |
| Stack | Fork full-stack-fastapi-template: FastAPI + SQLModel + Postgres + React 19 + shadcn/ui; **doklejamy**: Celery + Redis + Twilio |
| Jądro produktu | `Rozmowa` na podstawie `Rutyna` → `Wynik` (czy lek wzięty?) → na podstawie wyniku schedulujemy kolejne taski (retry, eskalacja) |
| Język rozmów | polski (Polly pl-PL + STT pl-PL) |
| Zespół | 6 osób — role w [`08-hackathon-plan.md`](08-hackathon-plan.md) |

## Zasady hackathonowe

- **MoSCoW to prawo** — przed dodaniem czegokolwiek spoza MUST: patrz [`01-mvp-scope.md`](01-mvp-scope.md) i powiedz PM-owi.
- Każdy task w kanbanie ma ownera i zależność — tabela w [`08-hackathon-plan.md`](08-hackathon-plan.md).
- Backup demo zawsze gotowy: nagranie wideo + tryb symulacji połączenia (patrz rejestr ryzyk).
- Decyzje techniczne zapisujemy w [`10-decisions.md`](10-decisions.md) — krótko, jedno-dwa zdania.
