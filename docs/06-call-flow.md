# 06 — Flow rozmowy (serce POC)

> **Status decyzji: ODROCZONA przez zespół** („na razie nie gadamy, coś zrobimy"). Ten dokument daje oba warianty + wspólny interfejs, więc wybór NIE blokuje prac: startujemy z **opcją A (TwiML Gather)**, opcja B to plug-in stretch. Decyzję finalną zapiszemy w [`10-decisions.md`](10-decisions.md).

## Interfejs ConversationEngine (przez co przechodzi KAŻDA opcja)

```python
# backend/app/twilio/engine.py
@dataclass
class EngineDecision:
    say_text: str            # co system mówi teraz (TTS)
    parsed: str              # "yes" | "no" | "unclear" | "timeout"
    final_outcome: str | None  # None = rozmowa trwa; albo "took"/"not_taken"/"unclear"

class ConversationEngine(Protocol):
    def handle_answer(self, call_task: CallTask, turn_no: int,
                      speech_result: str | None, confidence: float | None) -> EngineDecision: ...
    def opening_text(self, call_task: CallTask) -> str: ...
    def closing_text(self, decision: EngineDecision) -> str: ...
```

- Webhook `/twilio/gather/{id}` woła **tylko** `engine.handle_answer(...)` i buduje TwiML z `EngineDecision`.
- Zamiana silnika = nowa implementacja, zero zmian w webhookach/Celery/modelach.
- MVP: `ScriptedEngine` (opcja A). Stretch: `LlmEngine` (opcja B).

---

## Opcja A — TwiML `<Gather>` + speech recognition (MVP, REKOMENDOWANA)

Statyczny skrypt, deterministyczny, szybki, transkrypcja z Twilio za darmo.

### Skrypt rozmowy (PL)

| Krok | System mówi (TTS `Polly.Ewa`, pl-PL) | Czeka na (STT pl-PL) |
|---|---|---|
| 0 (odbierane) | „Dzień dobry, {imię}. Dzwoni asystent leków {NazwaAplikacji}." | — |
| 1 | „Czy przyjęła Pani / przyjął Pan dziś o {godzina} lek: {nazwa}, {dawka}? Proszę odpowiedzieć: tak lub nie." | `<Gather input="speech" language="pl-PL" speechTimeout="auto" hints="tak, nie, nie wiem, przyjąłem, przyjęłam, wzięłem, wzięłam, jeszcze nie, zaraz">` |
| 2a — yes | „Świetnie, dziękuję za potwierdzenie. Miłego dnia!" | — |
| 2b — no | „Rozumiem. Proszę spróbować przyjąć lek teraz. Przypomnimy się jeszcze raz później. Do usłyszenia!" | — |
| 2c — unclear (1. raz) | „Przepraszam, nie zrozumiałem. Czy przyjęła Pani lek {nazwa}? Proszę odpowiedzieć: tak lub nie." | Gather ponownie |
| 2d — unclear (2. raz) | „Nie szkodzi. Zapisuję, że nie było potwierdzenia. Miłego dnia!" | — |

### Reguły parsowania (ScriptedEngine)

```
YES_KEYWORDS = ["tak", "przyjąłem", "przyjęłam", "wziąłem", "wzięłam", "już", "wzięte", "przyjęte", "yes"]
NO_KEYWORDS  = ["nie", "jeszcze nie", "nie wzięła", "nie wziął", "no", "zapomniałem", "zapomniałam"]

1. lower(), strip, usuń interpunkcję.
2. Jeśli zawiera frazę NO ("jeszcze nie", "nie wiem" → unclear najpierw sprawdzić!):
   kolejność: "nie wiem"/"nie wiem jeszcze" → unclear; "jeszcze nie" → no; potem YES; potem NO.
   („jeszcze nie" zawiera „nie" — dlatego najpierw dłuższe frazy.)
3. Confidence < 0.5 → unclear (nawet jeśli keyword pasuje).
4. Puste SpeechResult / timeout → "timeout" (traktowane jak unclear, bez zapisu pustego dźwięku).
5. Wynik rozbieżny (są i yes i no keywords) → unclear (bezpieczniej).
```

⚠️ **Największe ryzyko jakościowe: polski STT.** Mitygacje: `hints` (wzmacnia słownictwo), krótkie pytania, wymóg „tak lub nie" w promptcie, powtórka raz, `unclear` jako bezpieczny wynik końcowy. Na demo mówimy **wyraźnie i blisko mikrofonu**.

### Struktura TwiML (przykład odpowiedzi webhooka voice)

```xml
<Response>
  <Say language="pl-PL" voice="Polly.Ewa">Dzień dobry, Halina. Dzwoni asystent leków.</Say>
  <Gather input="speech" language="pl-PL" speechTimeout="auto"
          hints="tak, nie, nie wiem, przyjąłem, przyjęłam, jeszcze nie"
          action="/api/v1/twilio/gather/4f6e..." method="POST">
    <Say language="pl-PL" voice="Polly.Ewa">Czy przyjęła Pani dziś o 9:00 lek: Warfarin, 5 mg? Proszę odpowiedzieć: tak lub nie.</Say>
  </Gather>
  <!-- fallback gdy brak mowy: Twilio wraca pod nagłówek Gather; po 2. razie kończymy -->
</Response>
```

Flow nieudanego Gather: Twilio wraca do webhooka `voice` z pustym `SpeechResult` → liczimy „nieudaną turę" (licznik w sesji = `turn_no` z DB), po 2. → Say 2d + `<Hangup/>`.

---

## Opcja B — ConversationRelay + LLM (STRETCH, efektowna)

Media streams (WebSocket) do FastAPI → LLM prowadzi naturalną rozmowę:

- **Plusy:** rozmowa naturalna, podchwytliwe pytania „na żywo", „wow" na demo.
- **Minusy:** WebSocket plumbing + prompt engineering + latency + koszty; na 21h — ryzyko pożerające cały bufor.
- **Warunkowo:** tylko gdy M1+M2 zamknięte do T+13h i jest 2 osobo-godziny wolne (patrz kamienie w [`08-hackathon-plan.md`](08-hackathon-plan.md)).
- Minimalny wariant B (rozsądniejszy): zostawić TwiML, ale **generować teksty kolejnych pytań LLM-em jednorazowo przed połączeniem** (statyczne, ale „mądrzejsze") — zero WebSockets.

## Transkrypcja — schemat zapisu (wspólny dla A i B)

Każda tura → `CallTurn` (patrz [`03-data-model.md`](03-data-model.md)); po zakończeniu sklejamy `transcript_full`:

```
[2026-10-03 09:00:12] System: Dzień dobry, Halina. Dzwoni asystent leków.
[2026-10-03 09:00:15] System: Czy przyjęła Pani dziś o 9:00 lek: Warfarin, 5 mg? Proszę odpowiedzieć: tak lub nie.
[2026-10-03 09:00:21] Halina: tak przyjęłam (conf 0.91 → yes)
[2026-10-03 09:00:22] System: Świetnie, dziękuję za potwierdzenie. Miłego dnia!
→ wynik: TOOK (conf 0.91)
```

Reguła twarda: **transkrypcja zapisuje się nawet dla rozmów nieudanych** (no-answer → turn „(brak odpowiedzi)"; timeout → „(cisza)"). Bez CallTurnów rozmowa nie może zostać uznana za zakończoną — `finalize` tego pilnuje.

## Testowanie bez telefonu (ważne na hackathon!)

1. **Twilio CLI / curl na webhooki** — symulacja POST z SpeechResult (bez realnego połączenia, wymaga wyłączenia walidacji podpisu lokalnie lub podpisania — na dev: `TWILIO_VALIDATE_SIGNATURE=false`).
2. **Tryb symulacji (S5)** — dispatcher pomija Twilio, engine dostaje zasztywnione odpowiedzi.
3. **Realny test-call na numer zweryfikowany** — ostateczny test, od T+8h kilkanaście razy dziennie.
