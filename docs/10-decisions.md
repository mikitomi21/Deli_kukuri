# 10 — Dziennik decyzji (ADR) i otwarte pytania

> Format: krótki. Status: **zaakceptowana / odroczona / otwarta**. Nowa decyzja = nowy wpis u góry tabeli + sekcja szczegółów.

## Rejestr decyzji

| # | Decyzja | Status | Data | Uzasadnienie (skrót) |
|---|---|---|---|---|
| D1 | Silnik rozmowy: **odroczona** — start z opcją A (TwiML Gather), opcja B (LLM) jako plug-in przez `ConversationEngine` | ⏳ odroczona | 2026-10-03 | Zespół: „na razie nie gadamy, coś zrobimy" — interfejs zabezpiecza oba scenariusze, decyzja do M2 |
| D2 | Eskalacja MVP: **retry + e-mail (Mailpit)**, szczegóły polityki odłożone | ⏳ odroczona (proste defaulty w [`07-scheduling-escalation.md`](07-scheduling-escalation.md)) | 2026-10-03 | Zespół: „później pomyślimy"; defaulty: retry +15 min, max 2 próby, potem e-mail |
| D3 | Twilio: konto **założone w T01** (trial wystarczy) | ✅ zaakceptowana | 2026-10-03 | Trial dzwoni na zweryfikowane numery — wystarcza na demo; ryzyko zarządzane checklistą |
| D4 | Stack: fork full-stack-fastapi-template + doklejone Celery/Redis/Twilio, reszta bez zmian | ✅ zaakceptowana | 2026-10-03 | Auth/CI/deploy gotowe; na 21h liczy się obszar problemowy, nie boilerplate |
| D5 | Język rozmów: **polski** (Polly pl-PL + STT pl-PL, hints) | ✅ zaakceptowana | 2026-10-03 | Persony PL; STT pl-PL wspierane przez Twilio |
| D6 | Senior NIE ma żadnego UI — jedynie telefon | ✅ zaakceptowana | 2026-10-03 | Kluczowa przewaga produktowa; minimalizuje scope |
| D7 | Transkrypcja obowiązkowa dla KAŻDEJ rozmowy (nawet nieudanej) | ✅ zaakceptowana | 2026-10-03 | Wymóg briefu + wartość dowodowa/audytowa |
| D8 | `CallTask` materializowany do DB (nie „call on the fly" z crona) | ✅ zaakceptowana | 2026-10-03 | Widoczność harmonogramu w UI, retry historyczne, idempotencja łatwiejsza |
| D9 | Deploy wcześnie (FastAPI Cloud / compose VPS) zamiast ngrok-only na demo | ✅ zaakceptowana (rekomendacja) | 2026-10-03 | Stabilny publiczny URL dla webhooków; ngrok fallback |
| D10 | Edycja approved rutyny wraca do `draft` | ⏳ do weryfikacji kosztu | 2026-10-03 | Bezpieczne, ale może kosztować; jeśli za drogo na 21h → zostaw edycję bez powrotu i zapisz tu |
| D11 | Nazwa projektu: **Deli kukuri** (robocza, = nazwa repo) | otwarta | 2026-10-03 | Alternatywy w [`00-vision.md`](00-vision.md); decyzja do pitchu |

## Szczegóły kluczowych decyzji

### D1 — Silnik rozmowy (ODROCZONA — największe ryzyko)
- **Opcja A (default):** TwiML `<Gather input=speech>` + deterministyczny ScriptedEngine. Zalety: prostota, speed, darmowa transkrypcja, zero WebSockets. Wady: sztywna rozmowa.
- **Opcja B (stretch):** ConversationRelay + LLM. Zalety: naturalność, podchwytliwe pytania live. Wady: WebSocket plumbing, latency, koszty, ryzyko na 21h.
- **Wspólny interfejs** w [`06-call-flow.md`](06-call-flow.md) — decyzja może spaść nawet po M2 bez przepisywania webhooków.
- **Przypominajka:** minimalna wersja B bez WebSockets = LLM generuje teksty pytań przed połączeniem.

### D2 — Polityka eskalacji (ODROCZONA — defaulty działałyby już dziś)
Zaimplementowane defaulty (env-owalne): `took` → koniec; `unclear` → koniec+flaga; `not_taken`/`no_answer` → retry +15 min do `CALL_MAX_ATTEMPTS=2` łącznie → e-mail do opiekuna. Przyszłe rozszerzenia (SMS, wybór kanału, okna retry per opiekun) → [`09-roadmap.md`](09-roadmap.md).

## Otwarte pytania (właściciel odpowiedzi: zespół)

| # | Pytanie | Blokuje | Właściciel | Deadline |
|---|---|---|---|---|
| Q1 | Który numer będzie „numerem demo" podopiecznego? (musi być zweryfikowany w T01) | T01 | cała ekipa | T+1h |
| Q2 | Silnik: zostajemy przy A na demo, czy planujemy pokazać B? | M2/T22 | TWI + PM | T+13h |
| Q3 | Czy kupujemy minimalny kredyt Twilio, żeby ściągnąć komunikat „trial"? (lepsze wrażenie na demo) | demo | PM | T+14h |
| Q4 | Czy nagrywamy audio rozmów na demo (C4) — i komunikat o nagrywaniu? | T22 | TWI | T+17h |
| Q5 | Rozliczenie „zaraz wezmę" — zaliczamy jako `not_taken` (mocne) czy osobny wynik `deferred`? | T07 | cała ekipa | T+6h (propozycja: `not_taken` na MVP, `deferred` w roadmapie) |
| Q6 | Co z podopiecznym, który nie zna polskiego? (poza MVP — zapisane w roadmapie) | — | PM | post-hackathon |
| Q7 | RODO na demo: czy pokazujemy prawdziwe nazwy leków i prawdziwy numer? (sugestia: fikcyjne dane + prawdziwy numer telefonu zweryfikowany) | pitch | QA | T+18h |

## Lekcje na przyszłość (uzupełniamy po hackathonie)

- _do zapisania po demo: co poszło dobrze / co zrobiłbym inaczej_
