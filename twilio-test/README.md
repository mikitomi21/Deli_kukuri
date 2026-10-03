# twilio-test — połączenia głosowe Twilio + OpenAI Realtime

Dwa niezależne skrypty (Node.js). Wspólne wymaganie: tunel ngrok i dane w `.env`.

## `.env`

| Zmienna | Do czego |
|---|---|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | konto Twilio do wybierania połączeń |
| `TWILIO_FROM` / `TWILIO_TO` | numer od / numer docelowy (na trialu odbiorca musi być zweryfikowany) |
| `OPENAI_API_KEY` | klucz do OpenAI Realtime + podsumowania |
| `PUBLIC_URL` | publiczny URL ngroka, np. `https://xxxx.ngrok-free.dev` |
| `PORT` | port lokalnego serwera (domyślnie 3000) |

Dodatkowo dla `call-leki.js`:

| Zmienna | Do czego |
|---|---|
| `LEKI` | lista leków rozdzielona przecinkami (domyślnie `ibuprofen,paracetamol,aspiryna`) |
| `PACJENT_IMIE` | opcjonalne imię pacjenta do personalizacji pytań |
| `BARGE_IN_MS` | po ilu ms ciągłego głosu rozmówca ucina AI (domyślnie 600, `0` = wyłącza barge-in) |
| `BARGE_IN_RMS` | głośność (RMS) uznawana za mowę, gdy AI jeszcze gra (domyślnie 1500) |
| `VAD_THRESHOLD` | próg wykrywania mowy 0–1 (domyślnie 0.75; wyżej = odporniej na szum) |
| `SMS_TO` | odbiorca SMS z podsumowaniem (bez tego SMS jest pomijany) |
| `SMS_ACCOUNT_SID` / `SMS_AUTH_TOKEN` / `SMS_FROM` | pełne konto Twilio do własnej treści SMS (domyślnie używa `TWILIO_*`) |
| `OPENAI_FALLBACK_MODEL` | model podsumowania awaryjnego (domyślnie `gpt-4o-mini`) |

## `call-leki.js` — rozmowa AI o lekach (główny)

AI (gpt-realtime) dzwoni do pacjenta i prowadzi naturalną rozmowę po polsku:

1. Odpowiada i pyta po kolei o każdy lek z `LEKI` — czy przyjęty dzisiaj.
2. Dopytuje przy wymijających odpowiedziach (max 2 razy); brak potwierdzenia = lek nieprzyjęty.
3. Po zebraniu wszystkich odpowiedzi **samo pożegna się i zakończy rozmowę** — przez wywołanie
   narzędzia `end_call` (function calling), po którym serwer rozłącza połączenie przez API Twilio.
4. Zapisuje wyniki:
   - `transcripts/<czas>_<CallSid>.txt` — pełna transkrypcja pisana **na żywo** (linia po linii,
     w trakcie rozmowy) + sekcja `=== PODSUMOWANIE ROZMOWY ===` na końcu,
   - `transcripts/<czas>_<CallSid>_podsumowanie.json` — `{imie, leki: {"lek": 0|1}, podsumowanie}`.
5. Jeśli rozmówca rozłączy się przed `end_call`, podsumowanie i tak powstaje — transkrypcja
   trafia do `gpt-4o-mini` (fallback), które zwraca ten sam JSON.

### Uruchomienie

```bash
# terminal 1 — tunel na port 3000
ngrok http 3000
# (skopiuj wygenerowany URL do PUBLIC_URL w .env)

# terminal 2 — start + połączenie
node call-leki.js                # numer z TWILIO_TO
node call-leki.js +48500500500   # albo konkretny numer
node call-leki.js --no-call      # tylko serwer (np. do testów, bez dzwonienia)
node call-leki.js --test-sms     # test wysyłki SMS z fałszywym podsumowaniem
```

### SMS z podsumowaniem rozmowy

Gdy podsumowanie jest gotowe (po `end_call` AI albo z fallbacku), skrypt wysyła SMS
na `SMS_TO` z `.env`: imię, status każdego leku (przyjęty/NIEPRZYJĘTY) i streszczenie
rozmowy. SMS jest pomijany, jeśli `SMS_TO` nie jest ustawione.

- **Własna treść** (pełne podsumowanie) wymaga pełnego konta Twilio — wpisz
  `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN` i `SMS_FROM` w `.env`.
- Bez tego (trial bez KYC) własna treść padnie z błędem 572006/20003 i awaryjnie
  leci szablon Content Template `HX5902…` („Pan/i {{1}} nie wzięła następujących
  leków: {{2}}") — konto trial wysyła go bez blokady, ale to tylko lista
  niezażytych leków, nie pełne podsumowanie.

Podczas rozmowy otwórz **http://localhost:3000/** — tam jest transkrypcja na żywo
(odświeżana co ~1,5 s, AI na niebiesko, rozmówca na zielono, podsumowanie na żółto).

### Ctrl+C

Przerywanie skryptu w trakcie rozmowy rozłącza aktywne połączenie (Hangup przez API)
i dopisuje podsumowanie z transkrypcji.

### Rozwiązywanie problemów

- **Echo AI wchodzi do transkrypcji usera / AI „mówi" po `response done`** — OpenAI kończy
  generować wcześniej, niż słuchawka milknie (audio leży w kolejce Twilio i gra w czasie
  rzeczywistym). Serwer liczy tę kolejkę i **wstrzymuje mikrofon, dopóki AI gra**: echo nie
  trafia do OpenAI, więc nie pojawia się jako „USER" i AI nie odpowiada samo na siebie.
  Słuchanie wraca samo, gdy kolejka zbiegnie — albo od razu po barge-in.
- **Barge-in** — AI ucina dopiero po `BARGE_IN_MS` (600 ms) **ciągłej** mowy głośniejszej
  niż `BARGE_IN_RMS` (1500), liczonej na surowych ramkach µ-law. AI tnie się własnym echem
  z głośnika? → zwiększ `BARGE_IN_RMS` (np. 3000) albo ustaw `BARGE_IN_MS=0`. Nie łapie
  prawdziwych przerwań? → zmniejsz `BARGE_IN_RMS`. Logi: `🔇 AI jeszcze gra` (gating),
  `🎙️ BARGE-IN` (przerwano AI), `✂️`/`⚠️ AI response cancelled` (skutki).
- **Sesja OpenAI nie wstaje** — w logu pojawi się `❌ OPENAI ERROR` ze szczegółami;
  zwykle to błędne pole w konfiguracji sesji albo nieważny `OPENAI_API_KEY`.

## `call.js` — stary PoC

Pierwszy test mostka Twilio ↔ OpenAI Realtime z ogólnymi instrukcjami (asystent bez
tematu). Zostawiony jako referencja; używa tego samego portu, więc nie uruchamiać
jednocześnie z `call-leki.js` (albo zmienić `PORT`).
