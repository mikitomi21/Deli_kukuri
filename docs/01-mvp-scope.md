# 01 — Zakres MVP (MoSCoW)

> Zasada na 21h: **MUST trzymają demo przy życiu. SHOULD robi demo ładnym. COULD robi „wow" — tylko jeśli M1 i M2 są zamknięte** (kamienie milowe w [`08-hackathon-plan.md`](08-hackathon-plan.md)).

## MUST HAVE — bez tego nie ma MVP

| # | Funkcja | Kryterium „done" |
|---|---------|------------------|
| M1 | Rejestracja/logowanie opiekuna | Reuse z template (JWT) — gotowe w 95%, zostaje branding |
| M2 | CRUD podopiecznych (Ward) | Opiekun dodaje podopiecznego: imię + telefon E.164 |
| M3 | Katalog leków (baza leków) | Współdzielony, **read-only** katalog (seed z bazy leków): nazwa + dawka + postać; wyszukiwarka dla kreatora rutyn |
| M4 | Rutyny (Routine) | Godzina + leki **z katalogu** + status **draft/approved**; zależność „rutyna B wymaga rutyny A" zapisana |
| M5 | Zatwierdzanie planu | Tylko `approved` rutyny trafiają do schedulera (bramka MVP!) |
| M6 | Materializer + dispatcher | Celery beat generuje `CallTask` i wywołuje połączenie w zaplanowanej minucie |
| M7 | Połączenie Twilio (POC) | System dzwoni na numer podopiecznego, pyta po polsku o przyjęcie leku, **akceptuje „tak"/„nie"** (STT) |
| M8 | Transkrypcja obowiązkowa | Każda tura rozmowy zapisana w DB (pytanie + SpeechResult + confidence) |
| M9 | Wynik | `took` / `not_taken` / `unclear` / `no_answer` — zapisany i widoczny |
| M10 | Dashboard wyników | Lista podopiecznych → dziś: rutyny z badge'ami wyników; podgląd transkrypcji połączenia |
| M11 | Przycisk „Zadzwoń teraz" | Test-call: tworzy natychmiastowy CallTask (do demo i debugowania — krytyczne!) |

## SHOULD HAVE — robi demo pełnym

| # | Funkcja | Kryterium „done" |
|---|---------|------------------|
| S1 | Retry | `not_taken`/`no_answer` → automatyczny retry po 15 min (max 2 próby łącznie) |
| S2 | Eskalacja e-mail | Po wyczerpaniu prób: e-mail do opiekuna (Mailpit w dev — **widoczny na demo**) |
| S3 | Timeline podopiecznego | Widok dnia: rutyny + statusy połączeń + nadchodzące CallTaski |
| S4 | Statystyki adherencji | % wziętych leków za dziś/tydzień per podopieczny |
| S5 | Tryb symulacji połączenia | „Fałszywy" call bez Twilio (wstrzykiwany wynik) — plan B dla demo |
| S6 | Historia połączeń | Lista z filtrami statusu + widok szczegółów z pełną transkrypcją |

## COULD HAVE — tylko jeśli M1+M2 zamknięte i jest bufor czasu

| # | Funkcja | Uwagi |
|---|---------|-------|
| C1 | Pytanie dodatkowe w rozmowie | „Proszę potwierdzić nazwę leku" — efektowne dla jury |
| C2 | SMS do opiekuna przy eskalacji | Trial Twilio: tylko na zweryfikowane numery |
| C3 | Konwersacja LLM (ConversationRelay) | Stretch — patrz [`06-call-flow.md`](06-call-flow.md) opcja B |
| C4 | Nagrywanie audio rozmowy | Link do nagrań w szczegółach połączenia |
| C5 | Notatki opiekuna do podopiecznego | Wolne pole tekstowe |
| C6 | Ręczne dodanie leku do katalogu | Gdy w bazie brakuje leku (MVP: katalog read-only, tylko seed) |

## WON'T HAVE (wprost poza MVP — nie robić nawet „na szybko")

- ❌ Rejestracja/samodzielne konto podopiecznego (senior nie ma UI)
- ❌ Aplikacja mobilna / PWA offline
- ❌ Płatności, plany taryfowe, multi-tenancy
- ❌ Edytor polityk eskalacji w UI (stałe domyślne z [`07-scheduling-escalation.md`](07-scheduling-escalation.md))
- ❌ Pełny framework uprawnień (rola jedna: opiekun widzi swoich podopiecznych)
- ❌ Interfejs dla seniora (jego interfejsem jest telefon)

## Kryteria sukcesu POC (definicja „działa")

E2E scena, którą pokażemy jury:

1. Opiekun loguje się, dodaje podopieczną „Halina" (+48 XXX XXX XXX — **zweryfikowany numer demo**).
2. Wyszukuje lek „Warfarin 5 mg" w katalogu leków (baza leków) i tworzy rutynę „Rano 9:00" z tym lekiem; **zatwierdza** plan.
3. (Demo: przyspieszamy) Nastaje zaplanowana godzina — lub klikamy „Zadzwoń teraz".
4. Telefon podopiecznej dzwoni; system pyta po polsku; Halina odpowiada „Tak, przyjęłam".
5. Na dashboardzie: ✅ `took`, transkrypcja obu tur, confidence.
6. Scenka druga: Halina odpowiada „Nie" → ❌ `not_taken` → po 15 min automatyczny retry → nadal „nie" → **e-mail do opiekuna** widoczny w Mailpicie.
7. (Bonus, jeśli zdążymy: pytanie podchwytliwe / SMS.)

**Jeśli punkty 1–6 przechodzą na żywo — hackathon wygrany produktowo.**

## Checklista demo (drukujemy, odhaczamy rano)

- [ ] Backend + worker + beat + Redis + Postgres up (health-check zielony)
- [ ] ngrok/cloudflared tunel działa i URL w `.env` aktualny (albo aplikacja zdeployowana)
- [ ] Konto Twilio: kredyty/trial, numer aktywny, webhooki wskazują na aktualny URL
- [ ] Numer telefonu demo podopiecznego **zweryfikowany w trialu**
- [ ] Telefon podopieczny: naładowany, głośność w górę, sygnał sprawdzony
- [ ] Mailpit otwarty w karcie (do pokazania eskalacji)
- [ ] Seedowane dane: katalog leków (20–50 pozycji), 2 podopiecznych, 3–4 rutyny, historia wyników (między 8:00 a 21:00)
- [ ] Nagrane wideo backup pełnego flow (na wypadek padu sieci)
- [ ] Tryb symulacji (S5) przetestowany
- [ ] Konto opiekuna demo: login/hasło sprawdzone
