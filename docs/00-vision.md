# 00 — Wizja produktu

## Pitch (30 sekund, do jury)

> Połowa seniorów z przewlekłymi chorobami nie przyjmuje leków zgodnie z zaleceniami. Opiekun — córka, syn, opiekunka zawodowa — nie ma jak tego sprawdzić bez ciągłego dzwonienia.
>
> **Deli kukuri** to asystent głosowy: opiekun raz definiuje plan leków, a nasz system **sam dzwoni** do podopiecznego o wyznaczonej godzinie, po polsku, ludzkim głosem pyta *„czy przyjął Pan dziś rano warfarin?"*, rozumie odpowiedź (TTS + STT), zapisuje transkrypcję i — jeśli coś poszło nie tak — **eskaluje: ponawia próbę i powiadamia opiekuna**.
>
> Senior nie potrzebuje aplikacji, smartfona ani internetu. Wystarczy telefon stacjonarny. To jest przewaga: działamy tam, gdzie aplikacje z przypomnieniami zawodzą.

## Problem

- Seniorzy zapominają o lekach **lub** celowo je pomijają (skutki uboczne, „dziś czuję się dobrze").
- Opiekun dowiaduje się o problemie **z opóźnieniem** (powikłania, wizyta u lekarza, hospitalizacja).
- Istniejące rozwiązania to apki z push-powiadomieniami — wymagają smartfona i samodzielności cyfrowej, której senior często nie ma.
- Kontakt telefoniczny działa, ale opiekun nie może dzwonić 3× dziennie każdemu podopiecznemu.

## Rozwiązanie — rdzeń systemu

```
Rutyna (np. codziennie 9:00 — Warfarin 5mg)
        │  (zatwierdzona przez opiekuna)
        ▼
Schedulowane Połączenie (Celery beat + Twilio)
        │
        ▼
Rozmowa głosowa pl-PL ──► TTS (pytanie) + STT (odpowiedź) ──► transkrypcja zapisana obowiązkowo
        │
        ▼
Wynik: WZIĄŁ ✅ / NIE WZIĄŁ ❌ / NIE WIEM ❓ / NIE ODBRAł 📵
        │
        ▼
Polityka po połączeniu: retry po 15 min → eskalacja (e-mail do opiekuna) → dashboard
```

**Kluczowa fraza z briefu:** *„Rozmowa na podstawie Rutyny → output: wziął lek czy nie?"* — to jest nasza jednostka wartości. Cała reszta jest dekoracją.

## Persony

### Persona 1: Opiekun (Anna, 47 lat)
- Opiekuje się mamą (78), która mieszka 40 min drogi od niej; przyjmuje 4 leki dziennie o różnych porach.
- Bolączki: niepewność („czy mama wzięła lek?"), poczucie winy, telefonowanie 4× dziennie.
- **Czego potrzebuje:** jednorazowo skonfigurować plan i dostawać spokój + alert tylko gdy coś jest nie tak.
- Sukces dla niej: otwiera dashboard i widzi ✅ przy każdej rutynie z dziś.

### Persona 2: Podopieczny (Pani Halina, 78 lat)
- Telefon stacjonarny lub zwykła komórka, zero aplikacji.
- Odpowiada na pytania krótko: „tak", „nie", „zaraz wezmę", czasem zbłąkane odpowiedzi.
- **Czego potrzebuje:** rozmowy krótkie, naturalne, grzeczne, po polsku; powtórzenia pytania gdy nie zrozumie.
- Sukces: kończy rozmowę w 20–40 sekund i wie, po co dzwoniono.

### Persona 3 (post-MVP): Instytucja opieki / lekarz
- Zakład opiekuńczy z 30 podopiecznymi: raporty adherencji tygodniowe, eksport dla lekarza.
- To otwiera monetyzację — patrz [`09-roadmap.md`](09-roadmap.md).

## Co nas wyróżnia na tle konkurencji (do pitchu)

1. **Zero aplikacji po stronie seniora** — tylko zwykłe połączenie telefoniczne.
2. **Dowód, nie przypomnienie** — zamiast pinga „weź lek" mamy *potwierdzenie z transkrypcją* że lek wzięto (albo jasny sygnał, że nie).
3. **Eskalacja jak w systemach alarmowych** — nieodebranie/niewzięcie nie znika w logach: retry + powiadomienie opiekuna.
4. **Transkrypcja każdego połączenia** — audytowalny zapis „co dokładnie powiedział".

## Bank pomysłów (do wyciągania przy rozwoju / pitchu)

- **Pytania podchwytliwe (weryfikacja):** „Proszę powiedzieć, jak nazywa się lek, który właśnie Pan przyjął?" — weryfikuje, że senior wie, co wziął; pilnuje pomyłek leków.
- **Głos bliskiej osoby:** syntetyczny głos nagrany przez rodzinę („Cześć mamo, tu Kasia!") — emocjonalny przypominacz.
- **Streaki adherencji** + tygodniowy raport do lekarza (eksport PDF).
- **Widełki czasowe** zamiast sztywnej godziny („między 8:00 a 10:00").
- **Okno ciszy nocnej** — nie dzwonimy przed 7:00 i po 21:00.
- **Rozpoznawanie stanu seniora** w rozmowie (przygnębienie, splątanie) — flaga dla opiekuna.
- **SMS fallback** gdy senior nie odbiera 3× (SMS działa nawet bez odebrania połączenia).
- **Integracja z bazami leków** (np. Rejestr Produktów Leczniczych) — autouzupełnianie dawek i postaci.
- **Wielojęzyczność** — PL/EN/UA/DE na start.
- **Tryb „potwierdź kodem"** — senior podaje 4-cyfrowy kod z pudełka leku (walka z kłamstwem „tak, wziąłem").

## Nazwa (robocza)

Repo: **Deli kukuri** (zapasowe: *MediCall*, *DzwonMed*, *Lekophone*, *PillCall*). Decyzję zapiszemy w [`10-decisions.md`](10-decisions.md).
