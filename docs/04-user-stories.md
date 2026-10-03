# 04 — Epiki i user stories

> Format: *Jako <rola>, chcę <co>, żeby <po co>* + kryteria akceptacji (Given/When/Then).
> Priorytetyzacja: MUST = epiki A–F, SHOULD = G–H. Numery M1–M11/S1–S6 odnoszą się do [`01-mvp-scope.md`](01-mvp-scope.md).

---

## Epik A — Onboarding opiekuna (M1)

### A1. Rejestracja i logowanie
**Jako** opiekun, **chcę** założyć konto i się zalogować, **żeby** moje dane (podopieczni, rutyny) były bezpiecznie moje.

- **Given** świeże konto nieistnieje, **When** rejestruję się e-mailem i hasłem, **Then** jestem zalogowany i widzę pusty dashboard z onboardingiem (CTA „Dodaj podopiecznego").
- **Given** istniejące konto, **When** loguję się błędnym hasłem 3×, **Then** dostaję czytelny błąd (bez blokady — to MVP).
- **Implementation note:** template ma to gotowe (JWT + formularze) — praca = kosmetyka + pominięcie niepotrzebnych ekranów (items! usunąć z nawigacji).

### A2. Dashboard startowy
**Jako** opiekun, **chcę** po zalogowaniu od razu widzieć stan podopiecznych z dzisiaj, **żeby** w 5 sekund wiedzieć, czy wszystko OK.

- **Given** 2 podopiecznych z rutynami, **When** otwieram `/`, **Then** widzę per podopieczny: listę dzisiejszych rutyn z badge'ami (✅/❌/❓/⏳/📵) i skrót statystyki dnia.
- **Given** brak podopiecznych, **When** otwieram `/`, **Then** widzę empty-state z jednym CTA.

---

## Epik B — Podopieczni (M2)

> Uwaga po zmianie zakresu: podopieczny ma **tylko** dane + rutyny. Lista leków podopiecznego nie istnieje jako osobna tabela — leki pochodzą z katalogu i są przypisywane przez rutyny.

### B1. Dodanie podopiecznego
**Jako** opiekun, **chcę** dodać podopiecznego z imieniem i numerem telefonu, **żeby** system wiedział, komu dzwonić.

- **Given** jestem zalogowany, **When** dodaję „Halina Kowalska", telefon `600 100 200`, **Then** numer zostaje znormalizowany do `+48600100200` (E.164) i podopieczny pojawia się na liście.
- **When** wpiszę numer bez kierunkowego, **Then** system normalizuje do `+48…` (polski default).
- **When** wpiszę numer niemożliwy (za krótki / litery), **Then** dostaję błąd walidacji przy polu.

### B2. Edycja i dezaktywacja
- **When** edytuję numer, **Then** zmiana dotyczy nowych połączeń, nie historycznych.
- **When** dezaktywuję podopiecznego, **Then** znika z dashboardu, a materializer nie tworzy dla niego CallTasków; historia zostaje.

---

## Epik C — Leki i rutyny (M3, M4, M5)

### C1. Wybór leku z katalogu (baza leków)
**Jako** opiekun, **chcę** wyszukać lek we współdzielonym katalogu leków, **żeby** dodać go do rutyny (nie tworzę leków ręcznie).

- **Given** zaseedowany katalog, **When** wpiszę „warf" w wyszukiwarkę leków, **Then** widzę „Warfarin 5 mg" i mogę dodać go do rutyny.
- **When** żaden lek nie pasuje, **Then** widzę komunikat „brak leku w bazie" (ręczne dodawanie leków = post-MVP, patrz [`09-roadmap.md`](09-roadmap.md)).
- **Out of scope MVP:** CRUD leków przez opiekuna — katalog jest **read-only i współdzielony**; podopieczny nie ma własnej listy leków, łączy się z nimi wyłącznie przez rutyny.

### C2. Stworzenie rutyny (kreator)
**Jako** opiekun, **chcę** zbudować rutynę: nazwa, godzina, leki z ilością, **żeby** system wiedział, o czym pytać podczas połączenia.

- **Given** 2 leki wybrane z katalogu, **When** tworzę rutynę „Rano 9:00" z oboma lekami, **Then** rutyna zapisuje się jako `draft`, widoczna w kreatorze z możliwością edycji.
- **When** rutyna nie ma żadnego leku, **Then** nie mogę jej zatwierdzić (walidacja).

### C3. Zależność między rutynami (M4)
**Jako** opiekun, **chcę** zaznaczyć, że rutyna „Wieczór 19:00" wymaga wcześniejszej „Rano 9:00", **żeby** odzwierciedlać zależności lekowe.

- **Given** rutyna „Rano 9:00" istnieje, **When** przy „Wieczór 19:00" wybiorę ją jako wymaganą, **Then** zależność zapisuje się i jest widoczna w kreatorze (np. chip „wymaga: Rano 9:00").
- **When** próbuję zatwierdzić rutynę, której wymagana rutyna nie jest approved, **Then** dostaję ostrzeżenie i zatwierdzenie jest blokowane (MVP: blokada; post-MVP: ostrzeżenie z obejściem).
- **Out of scope MVP:** egzekwowanie zależności podczas rozmowy (zapisujemy koncept w [`09-roadmap.md`](09-roadmap.md)).

### C4. Zatwierdzenie planu (M5)
**Jako** opiekun, **chcę** zatwierdzić rutynę jednym kliknięciem, **żeby** system zaczął planować połączenia.

- **Given** kompletna rutyna `draft`, **When** klikam „Zatwierdź", **Then** status → `approved`, a materializer umieści ją w harmonogramie od najbliższej zgodnej godziny.
- **When** edytuję `approved` rutynę, **Then** wraca do `draft` (bezpieczeństwo: zmiany wymagają ponownego zatwierdzenia) — **jeśli koszt za wysoki na 21h: edycja bez powrotu do draft, zapisane jako decyzja w [`10-decisions.md`](10-decisions.md)**.
- **When** pauzuję rutynę, **Then** `paused` — materializer pomija.

---

## Epik D — Call engine (M6, M7, M8, M9, M11)

### D1. Automatyczne schedulowanie połączeń
**Jako** system, **mam** generować zaplanowane połączenia dla approved rutyn, **żeby** dzwonić we właściwej minucie.

- **Given** approved rutyna „9:00" i jest 8:00, **When** materializer przejdzie (co 30 min), **Then** istnieje `CallTask(scheduled_at=09:00, status=pending, attempt_no=1)`.
- **Given** CallTask `pending` z `scheduled_at` <= now, **When** dispatcher (co 1 min) go zabierze, **Then** status → `in_progress` i do Twilio wychodzi `calls.create` — dokładnie raz (idempotencja przez atomic UPDATE).

### D2. Rozmowa POC: „tak/nie"
**Jako** podopieczny, **chcę** usłyszeć krótkie pytanie po polsku i odpowiedzieć „tak" albo „nie", **żeby** potwierdzić przyjęcie leków bez aplikacji.

- **Given** odebrane połączenie, **When** system zapyta „Czy przyjął(a) Pan(i) dziś o 9:00 lek Warfarin 5 mg?", **Then** odpowiedź mowy jest rozpoznana (STT pl-PL) i sparsowana na `yes/no/unclear` zgodnie z regułami z [`06-call-flow.md`](06-call-flow.md).
- **Given** odpowiedź niejasna („co?", „nie wiem"), **When** engine nie rozpozna, **Then** system raz powtarza pytanie z podpowiedzią „proszę odpowiedzieć: tak lub nie"; druga niejasna → `unclear`.
- **Given** brak mowy przez timeout, **Then** traktowane jak niejasna odpowiedź.
- **Given** „nie", **Then** system grzecznie potwierdza, że przypomni później, i kończy rozmowę.

### D3. Transkrypcja obowiązkowa (M8)
**Jako** opiekun, **chcę** mieć zapis co powiedział system i co odpowiedział podopieczny, **żeby** mieć dowód i kontekst.

- **Given** każda tura rozmowy, **When** przebiegnie, **Then** istnieje `CallTurn(question, speech_result, confidence, parsed)` — także dla tur nieudanych (timeout zapisuje pustą transkrypcję z flagą).
- **Given** zakończone połączenie, **Then** `CallResult.transcript_full` zawiera sklejony czytelny zapis całej rozmowy.

### D4. Wynik połączenia (M9)
- **Given** zakończona rozmowa, **Then** istnieje dokładnie jeden `CallResult` z `outcome ∈ {took, not_taken, unclear, no_answer}`.
- **Given** Twilio zgłasza `no-answer/busy/failed`, **Then** `CallResult.outcome=no_answer` z metadanymi przyczyny.

### D5. „Zadzwoń teraz" (M11)
**Jako** opiekun, **chcę** wywołać połączenie testowe natychmiast, **żeby** przetestować konfigurację bez czekania na godzinę rutyny.

- **Given** podopieczny z przynajmniej jedną approved rutyną, **When** klikam „Zadzwoń teraz", **Then** powstaje natychmiastowy CallTask i telefon podopiecznego dzwoni w < 15 s; wynik widoczny na dashboardzie jak każdy inny.

---

## Epik E — Dashboard wyników i transkrypcje (M10, S3, S4, S6)

### E1. Widok dnia podopiecznego (S3)
- **Given** podopieczny z rutynami i wynikami, **When** otwieram jego kartę, **Then** widzę timeline: rutyny dziś z badge'ami, nadchodzące CallTaski („zaplanowane 19:00"), historię połączeń.

### E2. Szczegóły połączenia + transkrypcja
- **Given** zakończone połączenie, **When** otwieram szczegóły, **Then** widzę: wynik, czas, durację, wszystkie tury (pytanie → odpowiedź → confidence) i sklejony transcript.

### E3. Statystyka adherencji (S4)
- **Given** historia wyników, **When** patrzę na kartę podopiecznego, **Then** widzę % „took" z dziś i z 7 dni (prosty licznik, bez wykresów — wykresy to C-level).

---

## Epik F — Eskalacja i powiadomienia (S1, S2)

### F1. Retry po porażce (S1)
**Jako** opiekun, **chcę**, żeby system sam ponowił próbę, **żeby** zwiększyć szansę na potwierdzenie bez mojego udziału.

- **Given** wynik `not_taken` lub `no_answer` przy `attempt_no < max_attempts`, **When** polityka po połączeniu się wykona, **Then** powstaje nowy CallTask `scheduled_at = now + 15 min`, `attempt_no + 1`.
- **Given** wynik `took` lub `unclear`, **Then** brak retry (unclear zostaje tylko flagą).

### F2. E-mail eskalacji (S2)
**Jako** opiekun, **chcę** dostać e-mail, gdy wszystkie próby zawiodły, **żeby** zareagować, zanim będzie źle.

- **Given** wyczerpane próby przy `not_taken`/`no_answer`, **When** polityka się wykona, **Then** powstaje `EscalationEvent` i e-mail do opiekuna (treść: podopieczny, rutyna, godzina, wynik, link do transkrypcji) — w dev ląduje w Mailpicie (pokaz na demo!).
- **Given** e-mail wysłany, **Then** `EscalationEvent.status=sent` (a `failed` nie blokuje działania systemu).

---

## Epik G — Odporność demo (S5)

### G1. Tryb symulacji połączenia
**Jako** prowadzący demo, **chcę** wygenerować wynik połączenia bez realnego telefonu, **żeby** pokazać pełen flow nawet jak padnie Twilio/sieć.

- **Given** tryb symulacji włączony (env/flag), **When** dispatcher zabiera CallTask, **Then** zamiast Twilio tworzone są CallTurny z ustalonym scenariuszem (np. „nie") i wynik `not_taken` — dalej pełny pipeline eskalacji działa jak żywy.
