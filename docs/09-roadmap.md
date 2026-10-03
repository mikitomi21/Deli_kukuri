# 09 — Roadmapa post-MVP (co po hackathonie)

> Zasada: każdy pomysł, który pojawi się NA hackathonie, a nie jest w MoSCoW, ląduje tutaj — nie w kodzie. Na pitch: sekcja „i co dalej" gotowa.

## Fala 1 — Rozmowa 2.0 (najbliższy sprint)

- **Pytania podchwytliwe / weryfikacja zrozumienia:** po „tak" system dopytuje: „Proszę powiedzieć, jaki lek Pani przyjęła?" lub prosi o powtórzenie nazwy leku — wykrywa pomylenie leków i odkrywanie odpowiedzi. (C1 z MVP — pierwsza kolejka!)
- **Engine LLM (opcja B z [`06-call-flow.md`](06-call-flow.md)):** naturalna rozmowa przez ConversationRelay; strażnik: LLM nie zmienia faktów (przyjęcie leku) — wynik klasworkowany z ograniczonego zbioru.
- **Egzekwowanie zależności rutyn:** rozmowa wie, że „Wieczór 19:00 wymaga Rano 9:00": pyta, czy lek poranny wzięto; nie — eskaluje informację o interakcji.
- **Okno czasowe zamiast sztywnej godziny** („między 8:00 a 10:00") + **okno ciszy nocnej**.
- **Anulowanie/odroczenie przez rozmowę:** „Mam dziś wizytę u lekarza" → CallTask odroczone, opiekun dostaje info.
- **Nagrywanie rozmów** (C4) + odsłuch w UI (przy nagraniu: komunikat + zgoda — patrz RODO).

## Fala 2 — Ufność i informacja zwrotna

- **Analityka adherencji:** wykresy tygodniowe, trendy („mama pomija wieczorne leki od 3 dni"), heatmapy.
- **Raport tygodniowy dla opiekuna i lekarza** (PDF: adherence, transkrypcje z flagami).
- **Flagi stanu seniora:** analiza transkrypcji (splątanie, przygnębienie, chrypka) → delikatny alert.
- **SMS fallback** gdy 3× nie odbiera (Twilio SMS; działa bez odebrania) + WhatsApp channel.
- **Multi-rutyna w jednym połączeniu:** jedna rozmowa pokrywa 3 rutyny tego samego okna (mniej telefonów).

## Fala 3 — Skala i biznes

- **Tryb instytucji:** jeden opiekun → 30 podopiecznych, role (opiekun/koordynator/admin), widok tablicy.
- **Integracja z bazami leków** (Rejestr Produktów Leczniczych / ATC): autouzupełnianie, ostrzeżenia o interakcjach.
- **Płatności i plany:** per podopieczny / per instytucja; limity minut Twilio, monitoring kosztów.
- **Kody pudełkowe:** 4-cyfrowy kod z opakowania leku podawany w rozmowie (anty-fałszywe „tak").
- **Kanały dodatkowe:** smart-głośnik (Alexa/Google), aplikacja seniora z jednym wielkim przyciskiem.
- **Międzynarodowość:** EN/UA/DE, głosy lokalne.

## Higiena produktowa (przed pierwszymi prawdziwymi użytkownikami)

- **RODO/prywatność:** zgoda na nagrywanie i transkrypcję, retencja (np. 90 dni), prawo do usunięcia, DPIA dla danych zdrowotnych; dane leków = dane szczególnej kategorii.
- **Bezpieczeństwo:** rotacja tokenów Twilio, rate-limity webhooków, audit log dostępu do transkrypcji.
- **Niepewność medyczna:** wyraźny disclaimer (nie zastępuje opieki medycznej), klauzule „w nagłych przypadkach dzwoń 112" w rozmowie gdy senior zgłosi złe samopoczucie → natychmiastowa eskalacja telefoniczna do opiekuna (reguła bezpieczeństwa #1).
- **SLA i monitoring:** Sentry (już w template!), alarmy na failed calls, dead-letter queue Celery.

## Metryki sukcesu (do mierzenia od fali 1)

| Metryka | Cel |
|---|---|
| % CallTasków zakończonych wynikiem `took` | > 70% w pilotcie |
| Czas od zaplanowanej godziny do wykonania połączenia | < 2 min |
| Skuteczność parsowania (zgadza się z człowiekiem) | > 90% |
| EscalationEventy → reakcja opiekuna < 30 min | mierzone |
| Retencja opiekunów po 30 dniach | > 50% |
