# 08 — Plan hackathonowy (21 h, 6 osób)

> Godzina zero = start prac po tym dokumencie. Kamienie milowe są święte — lepiej obciąć COULD niż przesunąć M3.

## Role (6 osób)

| Rola | Skrót | Odpowiedzialność |
|---|---|---|
| **P1 — BE Core** | `BE1` | modele + migracja + CRUD API (wards/medications/routines/approve) |
| **P2 — BE Infra** | `BE2` | Redis+Celery w compose, materializer, dispatcher, polityka, eskalacja e-mail |
| **P3 — Twilio** | `TWI` | konto Twilio (godzina 0!), SDK, webhooki voice/gather/status, TwiML, engine |
| **P4 — FE Dashboard** | `FE1` | dashboard, timeline podopiecznego, historia połączeń, widok transkrypcji |
| **P5 — FE Kreator** | `FE2` | formularze: podopieczny, lek, kreator rutyn z zależnościami, przycisk „Zadzwoń teraz", regeneracja clienta |
| **P6 — QA / PM / Demo** | `QA` | seed danych, testy E2E ręczne, deploy, wideo backup, pitch deck, pilnowanie MoSCoW i czasu |

## Kamienie milowe (checkpointy — każdy komunikuje PM)

| Milowy punkt | Czas | Definicja „done" |
|---|---|---|
| **M0** Setup | T+1 h | Twilio konto+numer+**zweryfikowany numer demo**, klucze w `.env`, tunel/deploy live, wszyscy mają środowisko uruchomione |
| **M1** Pierwszy E2E call | T+8 h | „Zadzwoń teraz" → realna rozmowa pl-PL → „tak"/„nie" sparsowane → Call+CallTurns+CallResult w DB (może być przez curl/seed, bez UI) |
| **M2** Pełna pętla | T+13 h | approved rutyna → scheduled call automatycznie → wynik + transkrypcja widoczne w UI dashboardu |
| **M3** Eskalacja | T+17 h | „nie"/nieodebrano → retry → e-mail w Mailpicie; tryb symulacji działa; feature freeze |
| **DEMO** | T+20 h | dwie pełne próby zrobione, wideo backup nagrać, deck gotowy |

## Harmonogram i tabela tasków

| # | Task | Owner | Zależności | Szacunek | Okno |
|---|---|---|---|---|---|
| T01 | Twilio: konto, trial numer, **weryfikacja numeru demo**, SID/token do `.env` | TWI | — | 1 h | T0–T1 |
| T02 | Repo hygiene: usunąć `items` z UI/nawigacji, branding nazwy, upewnić się że wszyscy startują (`docker compose up`) | QA | — | 1 h | T0–T1 |
| T03 | Redis do compose + `celery[redis]` + szkielet celery_app (beat+worker wstają) | BE2 | — | 1.5 h | T1–T2.5 |
| T04 | Modele + autogenerowana migracja Alembic (całość z 03-data-model) | BE1 | — | 2 h | T1–T3 |
| T05 | CRUD wards (API) + katalog leków: model, skrypt seeda (20–50 leków), `GET /medications?q=` | BE1 | T04 | 1.5 h | T3–T4.5 |
| T06 | CRUD routines + approve (z walidacją zależności) | BE1 | T05 | 1.5 h | T4.5–T6 |
| T07 | Webhooki Twilio: voice/gather/status + TwiML builder + ScriptedEngine (parsowanie tak/nie) | TWI | T01, T04 | 3 h | T1–T4 |
| T08 | `place_call` + test-call endpoint (`POST /wards/{id}/test-call`) | TWI+BE2 | T07, T03 | 1.5 h | T4–T5.5 |
| T09 | Materializer + dispatcher (atomika, idempotencja) | BE2 | T03, T04 | 2 h | T2.5–T4.5 |
| T10 | **M1: pierwszy E2E call na żywo** (debug razem: TWI+BE1+BE2) | zespół | T06–T09 | 2 h buf | T6–T8 |
| T11 | `finalize_call` + `post_call_policy` + retry + `escalate` (e-mail Mailpit) | BE2 | T08 | 2.5 h | T8–T10.5 |
| T12 | FE: dashboard (lista podopiecznych + dzisiejsze badge'y) | FE1 | T05 | 2.5 h | T4–T6.5 |
| T13 | FE: kreator podopiecznego / rutyny z wyszukiwarką leków z katalogu + approve + „Zadzwoń teraz" | FE2 | T06 | 3 h | T4.5–T7.5 |
| T14 | FE: widok połączenia z transkrypcją + timeline podopiecznego | FE1 | T12, T08 | 3 h | T6.5–T9.5 |
| T15 | Regeneracja openapi-ts clienta + integracja FE↔BE (fix kontraktów) | FE2+QA | T12, T13 | 1.5 h | T7.5–T9 |
| T16 | Seed danych demo (katalog leków 20–50 pozycji, 2 podopiecznych, 4 rutyny, wygenerowana historia) | QA | T06 | 1.5 h | T9–T10.5 |
| T17 | **M2: pełna pętla przez UI** (approve → zaplanowane → wynik na dashboardzie) | zespół | T09–T14 | 2 h buf | T11–T13 |
| T18 | Statystyki adherencji (dziś/7 dni) + kosmetyka UI | FE1 | T14 | 1.5 h | T13–T14.5 |
| T19 | Tryb symulacji (S5) + testy odporności (nieodbieranie, timeout STT) | BE2+QA | T11 | 1.5 h | T13.5–T15 |
| T20 | Deploy (FastAPI Cloud / compose VPS) LUB stabilizacja tunelu + webhooki w konsoli Twilio | QA+TWI | T10 | 1.5 h | T14–T15.5 |
| T21 | **M3: demo eskalacji na żywo (retry → Mailpit)** | zespół | T19, T20 | 1 h buf | T15.5–T17 |
| T22 | COULD pull (C1 podchwytliwe pytanie / C4 nagrywanie) — tylko jeśli M3 zielony | TWI+FE1 | M3 | ≤2 h | T17–T19 |
| T23 | Rehearsal 1 (pełne demo, czas mierzony) + fixy | wszyscy | T21 | 1 h | T17–T18 |
| T24 | **Nagranie wideo backup** (pełny flow + eskalacja) | QA | T21 | 0.5 h | T18–T18.5 |
| T25 | Pitch deck + prosebo (story: problem → demo → wyniki → roadmapa) | QA+FE2 | T23 | 1.5 h | T18.5–T20 |
| T26 | Rehearsal 2 (ostateczny, z deckiem) + freeze | wszyscy | T25 | 0.5 h | T20–T20.5 |
| T27 | Buffer (naprawy, sleep, kawa) | wszyscy | — | 0.5 h | T20.5–T21 |

**Zasada 15 minut:** task przekroczony o 15 min → eskalacja na PM; nie mozolimy się w pojedynkę.

## Checklista Twilio (T01 — natychmiast, blokuje wszystko)

1. [ ] Konto na twilio.com (trial wystarczy).
2. [ ] Darmowy trial numer (kraj: Poland lub dowolny — numer nadawcy nie musi być PL).
3. [ ] **Zweryfikować numer telefonu demo podopiecznego** (Verify Caller ID — SMS/kod; to MUSI zrobić się w 1. godzinie!).
4. [ ] `ACCOUNT_SID` + `AUTH_TOKEN` → `.env` (nie do repo!).
5. [ ] W konsoli Twilio: Voice webhooki zostawiamy puste — URL-e podajemy per call (`url=` w `calls.create`), ale sprawdzić geopermissions (Polska odblokowana dla outgoing).
6. [ ] Pamiętać o ograniczeniach trialu: tylko zweryfikowane numery + komunikat „trial" na starcie rozmowy (na demo: okej, albo zdjąć po doładowaniu).
7. [ ] Smoke test z CLI: proste `calls.create` na własny numer.

## Rejestr ryzyk

| Ryzyko | Prawdopod. | Wpływ | Mitygacja / Plan B |
|---|---|---|---|
| Trial: demo na nieweryfikowany numer nie zadzwoni | wysokie | **kryt.** | weryfikacja w T01; na demo używać TYLKO zweryfikowanego numeru |
| Polski STT rozumie słabo | średnie | wysoki | hints, wymóg „tak lub nie", powtórka, `unclear` jako safe-exit; rozmawiać wyraźnie blisko mikrofonu |
| Publiczny URL znika / webhooki nieosiągalne | średnie | **kryt.** | deploy do T+15.5 (T20) zamiast ngroka; smoke-test URL-i przed demo; tryb symulacji |
| Twilio pad / brak internetu na demo | niskie | wysoki | wideo backup + tryb symulacji (S5) jako scena zapasowa |
| Celery/Redis konfiguracja zżera czas | średnie | wysoki | T03 ma 1.5 h i osobę dedykowaną; fallback: dispatcher na FastAPI BackgroundTasks (dopóki jeden instancja) |
| Scope creep („dodamy jeszcze…") | wysokie | wysoki | MoSCoW + PM odmawia; wszystko nowe → `09-roadmap.md` |
| Konflikt migracji Alembic (2 osoby w models) | średnie | średni | **tylko P1 rusza `models.py`/migracje**; reszta czeka na T04 |
| Frontend goni zmieniające się API | średnie | średni | kontrakt z `05-api-spec.md` FROZEN na T4; zmiany tylko przez T15 |
| Zdrowie/sen zespołu | średnie | średni | buffer T27, rotacja na przerwy, PM pilnuje |

## Komunikacja

- Stand-up 5 min co 2 h (M-checkpointy idealne na to).
- Kanban: kolumny `Todo / In progress / Review / Done` (Trello/Linear), każda karta = task z tabeli z ownerem.
- Blockery → komunikat na grupie + PM, nie ciche siedzenie.
