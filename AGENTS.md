# AGENTS.md — zasady pracy z tym repo

Projekt: **OpiekunAI** (roboczo repo „Deli kukuri") — asystent głosowy przypominający podopiecznym o lekach (FastAPI + React/TanStack, backend w `backend/`, frontend w `frontend/`). Dokumentacja produktu w `docs/` (zwłaszcza `04-user-stories.md` i `05-api-spec.md`).

## Języki (twarde zasady)

- **Komentarze w kodzie, nazwy testów i dokumentacja techniczna w kodzie — po angielsku.**
- **UI przez warstwę i18n (standard i18next), nie hardcoded stringi**: domyślny język UI to polski, ale aplikacja obsługuje przełączanie na angielski. Żadnego surowego tekstu użytkownika w komponentach — wszystkie etykiety, komunikaty, walidacje, empty-state i tytuły pochodzą z plików tłumaczeń (`locales/pl/...`, `locales/en/...`), a w komponentach wyłącznie klucze przez `t()`. Język użytkownika decyduje o tym, co widzi: może mieć po polsku albo po angielsku.
- Pliki konfiguracyjne i env — komentarze po angielsku.

## Podział pracy (nie wychodź poza swój zakres)

- Frontend = FE scope: komponenty, hooki, mocki, testy FE.
- Backend (`backend/`) może być modyfikowany w ramach zadania, gdy tego wymaga (np. godzenie konfliktów, integracja kontraktu API, poprawki modeli). Domyślnie endpointy API rozwija osoba od backendu, ale nie zgłaszaj zamiast naprawiać — jeśli zmiana w `backend/` jest potrzebna do domknięcia zadania, wprowadź ją bezpośrednio.
- Frontend pracuje na warstwie mocków (`src/mocks/`, flaga `VITE_USE_MOCKS`), która ma kształt kontraktu z `docs/05-api-spec.md`; przełączenie na realny backend = podmiana ciał funkcji w hookach (miejsca oznaczone `// TODO(api):`), bez zmian w komponentach.

## Zasady UI (obowiązkowe przy każdej pracy nad frontendem)

- **Zakaz emoji w UI** — żadnych ✅❌📵 itd. w komponentach. Zamiast tego ikony z `lucide-react` (już w zależnościach — to źródło ikon projektu, nie CDN).
- **Czysty shadcn/ui jak w oryginalnym template** — używaj istniejących komponentów z `frontend/src/components/ui/`, tokenów motywu (`text-muted-foreground`, `text-destructive`, warianty Badge/Button) i konwencji template'a (np. wzorce w `components/Items/`, `routes/_layout/`). Nie wymyślaj własnych bibliotek ani „slopa".
- **Zero hardcoded tekstu w komponentach** — cały tekst UI przez `t()` z plików tłumaczeń (patrz sekcja „Języki"); klucze po angielsku, tłumaczenie polskie kompletne i równorzędne z angielskim.
- **Dostępność**: status nigdy tylko kolorem (ikona + kolor + tekst), `aria-hidden` na ikonach dekoracyjnych, `role="status"`/`aria-busy` dla loaderów, `role="alert"` dla błędów, semantyczne listy i nagłówki. Lint biome (reguły a11y) musi przechodzić.
- **Design zasad Apple** — przy budowaniu/przeglądaniu UI stosuj skill `apple-design` (projektowy, w `.agents/skills/apple-design/`): prostota, hierarchia przez wagę/rozmiar/odstępy, natychmiastowy feedback, `prefers-reduced-motion`, zero zbędnych ozdobników.

## Konwencje środowiskowe

- **Frontend działa w dockerze na :5173** (kontener `frontend`, dev server z podmontowanym `src/`). Po dodaniu zależności do `package.json` przebuduj kontener: `docker compose build frontend && docker compose up -d frontend` — inaczej strona leży na overlayu błędu importu. CORS backendu przepuszcza tylko origin :5173 — lokalny vite na innym porcie nie zaloguje się do API.
- Skrypty frontendu uruchamiaj jako `bun --bun run dev` / `bun --bun run build` / `bun --bun run lint` — systemowy Node działa jako x64 pod Rosettą i nie odpala natywnych modułów arm64 (rolldown, biome).
- Mocki danych: flaga `VITE_USE_MOCKS` w `frontend/.env` (default = mocki, `empty` = pusta lista, `0` = realne API). Endpointy obecne w backendzie (wards, medications) w trybie `0` wołają wygenerowany klient; pozostałe (rutyny, połączenia, stats, test-call) idą przez mocki — miejsca podmiany oznaczone `// TODO(api):` w `src/hooks/`.
- Po zmianie endpointów backendu: pobierz `http://localhost:8000/api/v1/openapi.json` do `frontend/openapi.json`, potem `bun run generate-client` i podmiana ciał funkcji w hookach.
- Testy: unit `bun run test:unit` (vitest), E2E `bun --bun x playwright test` (wymaga backendu :8000 + frontendu :5173).
