# DzwoniLek 📞💊

**Automatyczny głosowy agent, który dzwoni do seniora i sprawdza, czy przyjął leki.** Opiekun raz ustawia harmonogram w panelu webowym — o wyznaczonych porach agent dzwoni na zwykły telefon seniora (komórkowy lub stacjonarny), pyta po polsku o przyjęcie leków, a wynik zapisuje jako zweryfikowany raport z transkrypcją. Senior nie potrzebuje smartfona, internetu ani żadnej aplikacji.

## Problem, który rozwiązujemy

- Polska się starzeje — osób 60+ jest już **9,9 mln**, a **co trzeci Polak 65+ przyjmuje 5+ leków dziennie** (polifarmacja).
- **~50% pacjentów przewlekle chorych nie przyjmuje leków zgodnie z zaleceniami** — skutki to powikłania, unikające hospitalizacje i straty sięgające **6 mld PLN rocznie**.
- Opiekun musiałby dzwonić ręcznie **3–4 razy dziennie**; aplikacje z powiadomieniami na smartfona zawodzą u seniorów przez wykluczenie cyfrowe.
- **Telefon zostaje najpewniejszym kanałem** — i dokładnie ten kanał automatyzujemy.

## Co zrobiliśmy

- **Panel webowy dla opiekuna** — podopieczni, rutyny lekowe, katalog leków (React, TanStack Router/Query, shadcn/Tailwind)
- **Rutyny z harmonogramem** — tworzenie, zatwierdzanie, wstrzymywanie, zależności między rutynami, wersje PL/EN
- **Automatyczny planer połączeń** — Celery + Redis, wywołania o porach rutyn, polityka ponowień (brak odbioru / pominięta dawka → kolejna próba)
- **Głosowy agent AI** — rozmowa przez zwykłą telefonię (Twilio), naturalny polski, rozpoznawanie mowy (STT) i interpretacja odpowiedzi (GPT)
- **Pełna przejrzystość** — historia połączeń z transkrypcjami, 7-dniowy kalendarz przyjmowania leków (zielony = przyjęte, czerwony = pominięte), statystyki regularności
- **Alerty bez „call fatigue"** — opiekun dostaje powiadomienie (SMS/e-mail) tylko gdy coś pójdzie nie tak
- **Bezpieczeństwo** — JWT, role opiekun/admin, dedykowany token serwisu głosowego
- **Infrastruktura i jakość** — Docker Compose (FastAPI + Postgres + Redis + Traefik + frontend), testy backend/frontend (pytest, Playwright, vitest), tryb demo z danymi
- **Zero barier dla seniora** — brak aplikacji, konta i internetu; działa na zwykłej komórce i na stacjonarnym

## 🏆 Demo — przetestuj aplikację w 8 krokach

Aplikacja działa na żywo pod adresem **https://dzwonilek.pl/welcome**

1. Wejdź na **https://dzwonilek.pl/welcome**
2. **Zaloguj się** — login i hasło podajemy w formularzu zgłoszeniowym
3. Na pulpicie kliknij **„Dodaj podopiecznego"**
4. Wpisz **imię i nazwisko** oraz **numer telefonu**, na który ma być wykonywane połączenie
5. Kliknij **nazwę dodanego podopiecznego** — tutaj zarządzasz jego rutynami
6. Kliknij **„Dodaj rutynę"**, wprowadź dane (nazwa, godzina, leki) i zapisz
7. Rozwiń **trzy kropki (⋮)** obok rutyny i kliknij **„Zatwierdź"**
8. Kliknij **„Zadzwoń teraz"** — agent zadzwoni na podany numer i zapyta o leki

Po rozmowie wynik i transkrypcję zobaczysz w zakładce **Połączenia**, a przyjmowanie leków dzień po dniu — w kalendarzu na dole zakładki **Rutyny**.
