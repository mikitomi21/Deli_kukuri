require("dotenv").config();

const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const twilio = require("twilio");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  path: "/media-stream"
});

const PORT = Number(process.env.PORT || 3000);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ============================================================
// KONFIGURACJA ROZMOWY O LEKACH
// ============================================================

const MODEL = "gpt-realtime-2.1";

// Leki do odpytania: env LEKI=ibuprofen,paracetamol,aspiryna
const LEKI = process.env.LEKI_JSON ? JSON.parse(process.env.LEKI_JSON) : (process.env.LEKI || "ibuprofen,paracetamol,aspiryna")
  .split(",")
  .map((lek) => lek.trim())
  .filter(Boolean);

// Opcjonalne imię pacjenta (env PACJENT_IMIE) — tylko personalizacja pytań
const IMIE_PACJENTA = (process.env.PACJENT_IMIE || "").trim();

// Barge-in (przerywanie AI jak w asystentach głosowych): po ilu ms CIĄGŁEGO
// głosu rozmówcy podczas wypowiedzi AI uciąć AI. Krótkie dźwięki tła (szum,
// kaszlnięcie) nie przerywają. 0 wyłącza barge-in.
const BARGE_IN_MS = Number(process.env.BARGE_IN_MS ?? 600);

// Próg VAD 0-1 — im wyżej, tym głośniejszy/czyściej musi zabrzmieć głos,
// żeby uznać mowę (odporność na szum pomieszczenia).
const VAD_THRESHOLD = Number(process.env.VAD_THRESHOLD ?? 0.75);

// Głośność (RMS po dekodowaniu µ-law) od której dźwięk z mikrofonu podczas
// grania AI traktujemy jako mowę rozmówcy (kandydat na przerwanie). Za nisko —
// AI przerywa sobie własnym echem z głośnika; za wysoko — nie łapie przerwań.
const BARGE_IN_RMS = Number(process.env.BARGE_IN_RMS ?? 1500);

// Ile ms audio w kolejce Twilio uznajemy za "AI jeszcze gra" (zapas na jitter)
const PLAYBACK_MARGIN_MS = 20;

// Tabela dekodowania G.711 µ-law → PCM (własny VAD na surowych ramkach)
const MULAW_TABLE = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const u = ~i & 0xff;
    let t = ((u & 0x0f) << 3) + 0x84;
    t <<= (u & 0x70) >> 4;
    table[i] = (u & 0x80) ? 0x84 - t : t - 0x84;
  }
  return table;
})();

// ============================================================
// SMS Z PODSUMOWANIEM ROZMOWY
// ============================================================

// Po zakończeniu rozmowy (gdy podsumowanie jest gotowe) SMS idzie na SMS_TO.
// Własna treść wymaga pełnego konta Twilio (SMS_* w .env); gdy konto jej nie
// dopuszcza (trial bez KYC: błędy 572006/20003), leci awaryjnie szablon
// Content Template "Pan/i {{1}} nie wzięła następujących leków: {{2}}",
// który konto trial wysyła bez blokady.
const SMS_TEMPLATE_SID = "HX5902b613312fa5e9275702207a99966b";

const smsFrom = process.env.SMS_FROM || process.env.TWILIO_FROM;
const smsClient = twilio(
  process.env.SMS_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID,
  process.env.SMS_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN
);

function buildSummarySms(wynik) {
  const niepotwierdzone = LEKI.filter((lek) => wynik.leki[lek] !== 1);
  const problemy = niepotwierdzone.length
    ? [`• Nie potwierdzono przyjęcia: ${niepotwierdzone.join(", ")}.`]
    : ["• Brak wykrytych problemów."];
  const podsumowanie = String(wynik.podsumowanie || "").trim();

  return [
    "Podsumowanie rozmowy:",
    podsumowanie || "Nie udało się przygotować podsumowania rozmowy.",
    "",
    "Wykryte problemy:",
    ...problemy,
    "",
    "DzwoniLek"
  ]
    .join("\n");
}

async function generateSmsSummaryFromTranscript(transcriptFile, wynik) {
  const niepotwierdzone = LEKI.filter((lek) => wynik.leki[lek] !== 1);
  if (niepotwierdzone.length === 0) {
    return "Wszystkie leki zostały przyjęte. Wszystko jest w porządku.";
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !transcriptFile || !fs.existsSync(transcriptFile)) {
    return "Nie udało się wygenerować podsumowania z transkryptu.";
  }

  const turns = fs
    .readFileSync(transcriptFile, "utf8")
    .split("\n")
    .filter((line) => /^\[[^\]]+\] (AI|USER): /.test(line));
  if (turns.length === 0) {
    return "Nie udało się wygenerować podsumowania z transkryptu.";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Napisz krótkie, naturalne podsumowanie po polsku na podstawie pełnego " +
              "transkryptu. Skup się na niepotwierdzonych lekach i podanym przez rozmówcę " +
              "powodzie, jeśli taki podał. Nazwy leków znajdą się osobno w końcowej liście, " +
              "więc nie powtarzaj ich. Jeśli powodu nie podano, napisz to wprost. Nie " +
              "wymyślaj powodów ani nie uznawaj braku odpowiedzi za odmowę. Używaj naturalnej " +
              "polszczyzny, poprawnej odmiany i polskich znaków. Zwróć wyłącznie JSON: " +
              "{\"podsumowanie\": \"1-2 zdania\"}."
          },
          {
            role: "user",
            content:
              `Niepotwierdzone leki: ${niepotwierdzone.join(", ")}.\n\n` +
              `Pełny transkrypt rozmowy:\n${turns.join("\n")}`
          }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `HTTP ${response.status}`);
    }
    const result = JSON.parse(data.choices[0].message.content);
    return String(result.podsumowanie || "").trim() ||
      "Nie udało się wygenerować podsumowania z transkryptu.";
  } catch (error) {
    console.log("❌ Nie udało się wygenerować podsumowania SMS:", error.message);
    return "Nie udało się wygenerować podsumowania z transkryptu.";
  }
}

const SMS_HINTS = {
  21659: "'From' nie jest numerem kupionym na tym koncie — sprawdź SMS_FROM w .env",
  21266: "'To' i 'From' są identyczne — zmień SMS_TO albo SMS_FROM",
  20003: "konto wymaga zatwierdzonego KYC w Trust Hub (albo złe dane logowania)",
  572006: "konto nie wysyła własnej treści SMS — przechodzę na szablon",
  21211: "niepoprawny numer 'To' — sprawdź SMS_TO",
  63016: "szablon nie istnieje na tym koncie lub nie jest przeznaczony na SMS"
};

async function sendSummarySms(smsTo, wynik) {
  console.log(`📨 Wysyłam SMS z podsumowaniem na ${smsTo}...`);

  try {
    const msg = await smsClient.messages.create({
      to: smsTo,
      from: smsFrom,
      body: buildSummarySms(wynik)
    });
    console.log(`✅ SMS z podsumowaniem wysłany: SID ${msg.sid}, status ${msg.status}`);
    return;
  } catch (error) {
    console.log(`❌ SMS z własną treścią nie wyszedł (kod ${error.code}): ${error.message}`);
    if (SMS_HINTS[error.code]) {
      console.log(`Podpowiedź: ${SMS_HINTS[error.code]}`);
    }

    if (![572006, 20003].includes(error.code)) {
      return; // inny błąd — szablon raczej nie pomoże
    }
  }

  const niewziete = LEKI.filter((lek) => wynik.leki[lek] !== 1);
  if (niewziete.length === 0) {
    console.log("(wszystkie leki przyjęte — szablon awaryjny pominięty)");
    return;
  }

  try {
    const msg = await smsClient.messages.create({
      to: smsTo,
      from: smsFrom,
      contentSid: SMS_TEMPLATE_SID,
      contentVariables: JSON.stringify({
        "1": wynik.imie || "Jan",
        "2": niewziete.join(", ") + "!"
      })
    });
    console.log(`✅ SMS (szablon awaryjny) wysłany: SID ${msg.sid}, status ${msg.status}`);
  } catch (error) {
    console.log(`❌ SMS z szablonem też nie wyszedł (kod ${error.code}): ${error.message}`);
    if (SMS_HINTS[error.code]) {
      console.log(`Podpowiedź: ${SMS_HINTS[error.code]}`);
    }
  }
}

const transcriptsDir = process.env.TRANSCRIPTS_DIR || path.join(__dirname, "transcripts");

if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir, { recursive: true });
}

// Stan aktywnych rozmów: callSid -> { transcriptFile, podsumowanieSaved }
const activeCalls = new Map();

// ============================================================
// PODGLĄD TRANSKRYPCJI NA ŻYWO (przeglądarka)
// ============================================================

const LIVE_PAGE = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>Transkrypcja na żywo — rozmowa o lekach</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { background:#0f172a; color:#e2e8f0; font-family: ui-monospace, Consolas, monospace; margin:0; padding:24px; }
  h1 { font-size:18px; color:#93c5fd; margin:0 0 4px; }
  #meta { color:#64748b; font-size:12px; margin-bottom:16px; min-height:16px; }
  pre { white-space:pre-wrap; word-break:break-word; font-size:14px; line-height:1.55; margin:0; }
  .ai { color:#93c5fd; }
  .user { color:#86efac; }
  .head { color:#64748b; }
  .sum { color:#fcd34d; }
</style>
</head>
<body>
<h1>📞 Transkrypcja na żywo — rozmowa o lekach</h1>
<div id="meta">czekam na dane…</div>
<pre id="out"></pre>
<script>
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
async function tick(){
  try{
    const r = await fetch("/api/transcript");
    const d = await r.json();
    document.getElementById("meta").textContent = d.call_sid
      ? ("Call SID: " + d.call_sid + "  •  aktualizacja: " + new Date().toLocaleTimeString("pl-PL"))
      : "brak transkrypcji — jeszcze nie było rozmowy";
    let html = "";
    for (const line of (d.text || "").split("\\n")){
      const e = esc(line);
      if (line.indexOf("=== PODSUMOWANIE") >= 0) html += '<span class="sum">' + e + "</span>\\n";
      else if (line.indexOf(" AI: ") >= 0) html += '<span class="ai">' + e + "</span>\\n";
      else if (line.indexOf(" USER: ") >= 0) html += '<span class="user">' + e + "</span>\\n";
      else html += '<span class="head">' + e + "</span>\\n";
    }
    document.getElementById("out").innerHTML = html;
    window.scrollTo(0, document.body.scrollHeight);
  }catch(e){}
}
setInterval(tick, 1500);
tick();
</script>
</body>
</html>
`;

function latestTranscriptFile() {
  const files = fs
    .readdirSync(transcriptsDir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => path.join(transcriptsDir, f));

  if (files.length === 0) {
    return null;
  }

  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function findTranscriptFile(callSid) {
  if (!callSid) {
    return null;
  }

  const file = fs
    .readdirSync(transcriptsDir)
    .find((f) => f.includes(callSid) && f.endsWith(".txt"));

  return file ? path.join(transcriptsDir, file) : null;
}

app.get("/", (req, res) => {
  res.type("html").send(LIVE_PAGE);
});

app.get("/api/transcript", (req, res) => {
  const file = req.query.sid
    ? findTranscriptFile(String(req.query.sid)) || latestTranscriptFile()
    : latestTranscriptFile();

  if (!file || !fs.existsSync(file)) {
    res.json({ call_sid: null, text: "" });
    return;
  }

  const text = fs.readFileSync(file, "utf8");
  const match = path.basename(file).match(/CA[0-9a-f]+/i);

  res.json({
    call_sid: match ? match[0] : null,
    text: text
  });
});

// ============================================================
// INSTRUKCJE I NARZĘDZIE END_CALL
// ============================================================

function buildInstructions() {
  const listaLekow = LEKI.map((lek) => `- ${lek}`).join("\n");

  const pacjent = IMIE_PACJENTA
    ? `Pacjent prawdopodobnie nazywa się ${IMIE_PACJENTA} — użyj tego imienia, ale najpierw upewnij się, że rozmawiasz z właściwą osobą.`
    : `Nie znasz imienia rozmówcy — jeśli poda je w rozmowie, zapamiętaj je do podsumowania.`;

  const teraz = new Intl.DateTimeFormat("pl-PL", {
    timeZone: process.env.PACJENT_TZ || "Europe/Warsaw",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());

  return `
Jesteś polskojęzycznym asystentem telefonicznym AI. Dzwonisz do pacjenta, żeby zbadać,
czy przyjął dzisiejsze dawki swoich leków. Twoim celem jest zebrać odpowiedzi o WSZYSTKICH
lekach z listy, a potem uprzejmie zakończyć rozmowę.

Leki do odpytania (i wyłącznie te):
${listaLekow}

${pacjent}

Rozmowa odbywa się: ${teraz} (czas polski).

Zasady rozmowy:
- Mów zawsze po polsku, krótko i naturalnie, jak człowiek przez telefon.
- Nie przedstawiaj się jako człowiek — jesteś asystentem AI pilnującym przyjmowania leków.
- Telefon zbiera też głosy z otoczenia. Jeśli usłyszysz rozmowę innych osób albo wypowiedź
  NIE skierowaną do Ciebie, nie odnoś się do niej i nie komentuj jej — spokojnie powtórz
  swoje ostatnie pytanie albo przejdź do kolejnego.
- Gdy rozmówca Cię przerwie w pół zdania, przestań mówić i krótko zareaguj na to, co
  powiedział — a jeśli pytanie nadal jest aktualne, dokończ je.
- Rozmowę zacznij od przedstawienia się, np. "Dzień dobry, dzwoni asystent AI przypominający
  o lekach. Czy mogę zapytać o dzisiejsze leki?" — i dopiero potem przechodź do pytań.
- Zadawaj JEDNO pytanie naraz i czekaj na odpowiedź.
- Zapytaj po kolei o KAŻDY lek z listy, np. "Czy przyjął lub przyjęła Pan(i) dzisiaj lek X?".
  Jeśli rozmówca mówi, że brał lek, możesz dopytać o porę (rano, wieczorem).
- Odpowiedź wymijającą, niejasną albo słabo słyszalną dopytaj raz, najwyżej dwa razy.
  Jeśli nadal nie ma jasnej odpowiedzi, uznaj lek za NIEPRZYJĘTY.
- Nie wymyślaj leków spoza listy i nie doradzaj w dawkowaniu — pytania o dawki odsyłaj
  do lekarza lub ulotki.
- Jeśli rozmówca zmienia temat, uprzejmie wróć do pytań o leki.
- Jeśli pod telefonem nie jest pacjent albo rozmówca prosi o zakończenie: podziękuj,
  pożegnaj się i wywołaj end_call (leki bez potwierdzenia oznacz jako nieprzyjęte,
  a sytuację opisz w podsumowaniu).

Zakończenie rozmowy:
- Gdy masz jasną odpowiedź o każdym leku (albo rozmowa musi się skończyć): poinformuj
  rozmówcę, że zebrałeś już wszystkie potrzebne informacje, podziękuj mu za rozmowę
  i życz mu wszystkiego dobrego, dobierając życzenie do pory dnia z nagłówka
  (rano i do popołudnia: "życzę udanego dnia", wieczorem i nocą: "życzę spokojnej
  nocy, dobranoc"). Np.: "Zebrałem już wszystkie potrzebne informacje. Dziękuję bardzo
  za rozmowę i życzę udanego dnia. Do widzenia!". Potem wywołaj narzędzie end_call.
- Narzędzie end_call wywołaj DOKŁNIE RAZ, zawsze na samym końcu rozmowy, po pożegnaniu.
- W parametrach end_call przekaż: leki (wynik dla każdego leku z listy: przyjety
  true/false), imie (imię rozmówcy, jeśli go podać, inaczej pusty string) oraz
  podsumowanie (1-2 zdania naturalną, poprawną polszczyzną o przebiegu rozmowy
  i istotnym kontekście. Nie wymieniaj leków ani ich statusów — zostaną pokazane
  osobno na końcu SMS-a. Nie dodawaj informacji, których nie ma w rozmowie).
`.trim();
}

const END_CALL_TOOL = {
  type: "function",
  name: "end_call",
  description:
    "Zakończ rozmowę telefoniczną. Wywołaj dokładnie raz, po pożegnaniu się " +
    "z rozmówcą, gdy masz już odpowiedzi o wszystkich lekach albo rozmowa musi się skończyć.",
  parameters: {
    type: "object",
    properties: {
      leki: {
        type: "array",
        description:
          "Wynik dla każdego leku z listy — dokładnie te nazwy, które były w instrukcjach.",
        items: {
          type: "object",
          properties: {
            nazwa: {
              type: "string",
              description: "Nazwa leku (dokładnie jak w instrukcjach)"
            },
            przyjety: {
              type: "boolean",
              description:
                "true — pacjent potwierdził przyjęcie dawki, false — brak potwierdzenia"
            }
          },
          required: ["nazwa", "przyjety"]
        }
      },
      imie: {
        type: "string",
        description:
          "Imię rozmówcy wypowiedziane w rozmowie (nigdy etykieta typu USER/AI); pusty string gdy brak"
      },
      podsumowanie: {
        type: "string",
        description: "Krótkie streszczenie rozmowy po polsku (2-4 zdania)"
      }
    },
    required: ["leki", "podsumowanie"]
  }
};

// ============================================================
// PODSUMOWANIE ROZMOWY
// ============================================================

function summarizeFromAi(args) {
  const fromAi = Array.isArray(args.leki) ? args.leki : [];

  const lekiWynik = {};
  for (const lek of LEKI) {
    const match = fromAi.find(
      (item) =>
        item &&
        typeof item.nazwa === "string" &&
        item.nazwa.trim().toLowerCase().includes(lek.toLowerCase())
    );
    lekiWynik[lek] = match && match.przyjety === true ? 1 : 0;
  }

  // "USER"/"AI" to etykiety z transkrypcji, nie imiona — model potrafi je
  // wpisać, gdy rozmówca nie podał imienia
  const etykiety = new Set([
    "user",
    "ai",
    "bot",
    "asystent",
    "rozmowca",
    "rozmówca",
    "pacjent"
  ]);

  const imie = String(args.imie || "").trim();
  const imiePoprawne =
    imie && !/\d/.test(imie) && !etykiety.has(imie.toLowerCase());

  return {
    imie: imiePoprawne ? imie : "",
    leki: lekiWynik,
    podsumowanie: String(args.podsumowanie || "").trim()
  };
}

async function savePodsumowanie(
  transcriptFile,
  callSid,
  wynik,
  zrodlo
) {
  const state = activeCalls.get(callSid);

  if (!transcriptFile || !fs.existsSync(transcriptFile)) {
    return null;
  }

  if (state && state.podsumowanieSaved) {
    console.log("(podsumowanie tej rozmowy już zapisane — pomijam duplikat)");
    return null;
  }

  wynik = {
    ...wynik,
    podsumowanie: await generateSmsSummaryFromTranscript(transcriptFile, wynik)
  };

  const podsumowanieFile = transcriptFile.replace(/\.txt$/, "_podsumowanie.json");

  const data = {
    call_sid: callSid,
    zrodlo: zrodlo,
    zapisano_o: new Date().toISOString(),
    imie: wynik.imie,
    leki: wynik.leki,
    podsumowanie: wynik.podsumowanie
  };

  fs.writeFileSync(podsumowanieFile, JSON.stringify(data, null, 2) + "\n");

  fs.appendFileSync(
    transcriptFile,
    "\n" +
      [
        "=== PODSUMOWANIE ROZMOWY ===",
        `źródło: ${zrodlo}`,
        `imię: ${wynik.imie || "(nie podano)"}`,
        "leki:",
        ...LEKI.map(
          (lek) => `  - ${lek}: ${wynik.leki[lek] === 1 ? "PRZYJĘTY (1)" : "NIEPRZYJĘTY (0)"}`
        ),
        `podsumowanie: ${wynik.podsumowanie || "(brak)"}`
      ].join("\n") +
      "\n"
  );

  if (state) {
    state.podsumowanieSaved = true;
  }

  // Persist the result in the application when hosted by the gateway.
  if (process.send) process.send({ event: "summary", sid: callSid,
    medications: wynik.leki, notes: wynik.podsumowanie,
    transcript: fs.readFileSync(transcriptFile, "utf8") });

  console.log("📝 Podsumowanie zapisane:", podsumowanieFile);

  const smsTo = (process.env.SMS_TO || "").trim();
  if (!smsTo) {
    console.log("(pomijam SMS — ustaw SMS_TO w .env)");
    return podsumowanieFile;
  }

  sendSummarySms(smsTo, wynik).catch((error) => {
    console.log("❌ Błąd wysyłki SMS:", error.message);
  });

  return podsumowanieFile;
}

// Awaryjne podsumowanie, gdy rozmówca się rozłączy, zanim AI wywoła end_call:
// transkrypcja idzie do modelu chat (taniego) i wraca jako JSON.
// finalize (koniec streamu) i poller statusu potrafią odpalić fallback
// niemal jednocześnie — stąd blokada: jedno podsumowanie = jeden SMS.
const summariesInFlight = new Map();

async function fallbackSummarize(callSid, transcriptFile) {
  const state = activeCalls.get(callSid);
  if (state && state.podsumowanieSaved) {
    return;
  }
  if (summariesInFlight.has(callSid)) return summariesInFlight.get(callSid);
  const pending = runFallbackSummarize(callSid, transcriptFile);
  summariesInFlight.set(callSid, pending);

  try {
    await pending;
  } finally {
    summariesInFlight.delete(callSid);
  }
}

async function runFallbackSummarize(callSid, transcriptFile) {
  if (!transcriptFile || !fs.existsSync(transcriptFile)) {
    console.log("(brak transkrypcji — pomijam podsumowanie awaryjne)");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("(brak OPENAI_API_KEY — pomijam podsumowanie awaryjne)");
    return;
  }

  const text = fs.readFileSync(transcriptFile, "utf8");
  const turny = text
    .split("\n")
    .filter((line) => line.includes(" AI: ") || line.includes(" USER: "));

  if (turny.length === 0) {
    console.log("(brak wypowiedzi — pomijam podsumowanie awaryjne)");
    return;
  }

  console.log("🧠 Rozmowa zakończona bez end_call — generuję podsumowanie z transkrypcji...");

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Jesteś ekstraktorem danych z transkrypcji rozmowy telefonicznej o przyjmowaniu " +
              "leków. Zwróć WYŁĄCZNIE obiekt JSON postaci: {\"imie\": \"<imię rozmówcy — tylko " +
              "jeśli rozmówca je WYPOWIEDZIAŁ w rozmowie; NIGDY etykiety USER/AI z transkrypcji; " +
              "pusty string gdy brak>\", \"leki\": {\"<lek>\": 0 lub 1 dla każdego leku z listy, 0 gdy " +
              "brak jasnego potwierdzenia}, \"podsumowanie\": \"<1-2 naturalne zdania poprawną polszczyzną, bez nazw leków i ich statusów>\"}."
          },
          {
            role: "user",
            content:
              "Leki: " +
              LEKI.join(", ") +
              "\n\nTranskrypcja:\n" +
              turny.join("\n")
          }
        ]
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error ? data.error.message : `HTTP ${resp.status}`);
    }

    const content = data.choices[0].message.content.trim();

    let wynik;
    try {
      wynik = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error("model zwrócił nie-JSON: " + content.slice(0, 200));
      }
      wynik = JSON.parse(match[0]);
    }

    await savePodsumowanie(
      transcriptFile,
      callSid,
      summarizeFromAi({
        imie: wynik.imie,
        podsumowanie: wynik.podsumowanie,
        leki: Object.entries(wynik.leki || {}).map(([nazwa, przyjety]) => ({
          nazwa: nazwa,
          przyjety: przyjety === 1 || przyjety === true
        }))
      }),
      "GPT (fallback po rozłączeniu)"
    );
  } catch (error) {
    console.log("❌ Podsumowanie awaryjne nie powiodło się:", error.message);
  }
}

// ============================================================
// KOŃCZENIE POŁĄCZENIA
// ============================================================

async function hangupCall(callSid, reason) {
  if (!callSid) {
    return;
  }

  try {
    await twilioClient.calls(callSid).update({
      twiml: "<Response><Hangup/></Response>"
    });
    console.log(`📞 Rozmowa zakończona przez serwer (${reason})`);
  } catch (error) {
    console.log(`❌ Nie udało się rozłączyć (${reason}):`, error.message);
  }
}

// ============================================================
// TWILIO MEDIA STREAM
// ============================================================

wss.on("connection", (twilioWs) => {
  console.log("");
  console.log("======================================");
  console.log("🔌 TWILIO MEDIA STREAM CONNECTED");
  console.log("======================================");

  let streamSid = null;
  let callSid = null;

  let transcriptFile = null;

  let hangupArmed = false;
  let hangupDone = false;
  let hangupTimer = null;
  let finalized = false;

  // Tłumienie audio po barge-in (resztki anulowanej odpowiedzi)
  let suppressAudio = false;

  // Gating wejścia: dopóki w słuchawce gra audio AI (kolejka odtwarzania),
  // mikrofon NIE trafia do OpenAI — echo z głośnika wracałoby jako "USER"
  // i AI odpowiadałoby samo na siebie. Zamiast tego ramki trzymamy lokalnie
  // z własnym VAD — z nich liczy się barge-in.
  let queuedAudioMs = 0;
  let queueLastAt = null;
  let heldFrames = [];
  let heldSpeechMs = 0;
  let bargeInFired = false;
  let gatingLogged = false;

  const handledFunctionCalls = new Set();

  // ----------------------------------------------------------
  // OPENAI REALTIME
  // ----------------------------------------------------------

  const openaiWs = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${MODEL}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  // ----------------------------------------------------------
  // OPENAI CONNECTED
  // ----------------------------------------------------------

  openaiWs.on("open", () => {
    console.log("🤖 OpenAI Realtime connected");

    const sessionUpdate = {
      type: "session.update",
      session: {
        type: "realtime",
        model: MODEL,

        output_modalities: ["audio"],

        instructions: buildInstructions(),

        tools: [END_CALL_TOOL],
        tool_choice: "auto",

        audio: {
          input: {
            format: {
              type: "audio/pcmu"
            },

            // telefon leży w pomieszczeniu z rozmowami w tle — redukcja szumu
            noise_reduction: {
              type: "near_field"
            },

            transcription: {
              model: "gpt-4o-mini-transcribe",
              language: "pl"
            },

            // interrupt_response: false — barge-in sterujemy sami w serwerze
            // (handleIncomingAudio): dopiero dłuższa, głośna mowa rozmówcy
            // przerywa AI; echo z głośnika i krótkie dźwięki tła nie
            turn_detection: {
              type: "server_vad",
              threshold: VAD_THRESHOLD,
              prefix_padding_ms: 500,
              silence_duration_ms: 800,
              create_response: true,
              interrupt_response: false
            }
          },

          output: {
            format: {
              type: "audio/pcmu"
            },

            voice: "marin"
          }
        }
      }
    };

    openaiWs.send(JSON.stringify(sessionUpdate));

    console.log("⚙️ Konfiguracja OpenAI wysłana (rozmowa o lekach: " + LEKI.join(", ") + ")");
  });

  // ----------------------------------------------------------
  // OPENAI MESSAGES
  // ----------------------------------------------------------

  openaiWs.on("message", async (message) => {
    try {
      const event = JSON.parse(message.toString());

      // ------------------------------------------------------
      // SESSION READY
      // ------------------------------------------------------

      if (event.type === "session.updated") {
        console.log("✅ OpenAI session ready");

        // AI rozpoczyna rozmowę
        openaiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              output_modalities: ["audio"]
            }
          })
        );

        console.log("🤖 AI rozpoczyna rozmowę");
      }

      // ------------------------------------------------------
      // RESPONSE CREATED (AI zaczyna wypowiedź)
      // ------------------------------------------------------

      else if (event.type === "response.created") {
        suppressAudio = false;
      }

      // ------------------------------------------------------
      // USER SPEECH STARTED (serwerowy VAD — tylko w trybie słuchania)
      // ------------------------------------------------------

      else if (event.type === "input_audio_buffer.speech_started") {
        console.log("");
        console.log("🎤 USER SPEAKING...");
      }

      // ------------------------------------------------------
      // USER TRANSCRIPT DELTA
      // ------------------------------------------------------

      else if (
        event.type ===
        "conversation.item.input_audio_transcription.delta"
      ) {
        process.stdout.write(event.delta || "");
      }

      // ------------------------------------------------------
      // USER TRANSCRIPT COMPLETE
      // ------------------------------------------------------

      else if (
        event.type ===
        "conversation.item.input_audio_transcription.completed"
      ) {
        const transcript = event.transcript || "";

        console.log("");
        console.log("");
        console.log("👤 USER:");
        console.log(transcript);

        saveTranscript(transcriptFile, "USER", transcript);
      }

      // ------------------------------------------------------
      // AI TRANSCRIPT DELTA
      // ------------------------------------------------------

      else if (event.type === "response.output_audio_transcript.delta") {
        process.stdout.write(event.delta || "");
      }

      // ------------------------------------------------------
      // AI TRANSCRIPT COMPLETE
      // ------------------------------------------------------

      else if (event.type === "response.output_audio_transcript.done") {
        const transcript = event.transcript || "";

        console.log("");
        console.log("");
        console.log("🤖 AI:");
        console.log(transcript);

        saveTranscript(transcriptFile, "AI", transcript);
      }

      // ------------------------------------------------------
      // AI AUDIO
      // ------------------------------------------------------

      else if (event.type === "response.output_audio.delta") {
        if (!streamSid || suppressAudio) {
          return;
        }

        const audioPayload = event.delta;

        if (!audioPayload) {
          return;
        }

        // kolejka odtwarzania: Twilio gra ten fragment przez payload/8 ms
        // (PCMU 8 kHz), dopóki nie zbiegnie — słuchawka "jeszcze mówi"
        drainQueue();
        queuedAudioMs += Buffer.from(audioPayload, "base64").length / 8;

        // OpenAI -> Twilio
        twilioWs.send(
          JSON.stringify({
            event: "media",
            streamSid: streamSid,
            media: {
              payload: audioPayload
            }
          })
        );
      }

      // ------------------------------------------------------
      // TOOL CALL: END_CALL
      // ------------------------------------------------------

      else if (event.type === "response.function_call_arguments.done") {
        if (event.name === "end_call") {
          await handleEndCall(event.call_id, event.arguments);
        }
      }

      // zapasowo: funkcja może przyjść tylko jako output item
      else if (
        event.type === "response.output_item.done" &&
        event.item &&
        event.item.type === "function_call" &&
        event.item.name === "end_call"
      ) {
        await handleEndCall(event.item.call_id, event.item.arguments);
      }

      // ------------------------------------------------------
      // AI AUDIO TRUNCATED (wypowiedź ucięta)
      // ------------------------------------------------------

      else if (event.type === "conversation.item.truncated") {
        console.log("");
        console.log("✂️ AI wypowiedź ucięta (przerwana, zanim skończyła mówić)");
      }

      // ------------------------------------------------------
      // RESPONSE DONE (koniec wypowiedzi AI)
      // ------------------------------------------------------

      else if (event.type === "response.done") {
        const status = (event.response && event.response.status) || "completed";

        console.log("");
        if (status === "completed") {
          console.log("🔊 AI response completed");
        } else {
          console.log(`⚠️ AI response ${status}`);
          if (event.response.status_details) {
            console.log(JSON.stringify(event.response.status_details, null, 2));
          }
        }

        suppressAudio = false;

        // AI pożegnało się i wywołało end_call — teraz można rozłączyć
        if (hangupArmed) {
          scheduleHangup();
        }
      }

      // ------------------------------------------------------
      // OPENAI ERROR
      // ------------------------------------------------------

      else if (event.type === "error") {
        console.log("");
        console.log("❌ OPENAI ERROR");
        console.log(JSON.stringify(event, null, 2));
      }

    } catch (error) {
      console.log("❌ Błąd przetwarzania wiadomości OpenAI:", error.message);
    }
  });

  // ----------------------------------------------------------
  // END_CALL HANDLER
  // ----------------------------------------------------------

  async function handleEndCall(callId, rawArguments) {
    if (!callId || handledFunctionCalls.has(callId)) {
      return;
    }

    handledFunctionCalls.add(callId);

    let args = {};
    try {
      args = JSON.parse(rawArguments || "{}");
    } catch {
      // nieparsowalne argumenty — traktuj jako puste
    }

    const wynik = summarizeFromAi(args);
    await savePodsumowanie(transcriptFile, callSid, wynik, "AI (end_call)");

    console.log("");
    console.log("========== AI KONCZY ROZMOWE ==========");
    console.log("Imię:", wynik.imie || "(nie podano)");
    for (const lek of LEKI) {
      console.log(`  ${lek}: ${wynik.leki[lek] === 1 ? "PRZYJĘTY" : "NIEPRZYJĘTY"}`);
    }
    console.log("Podsumowanie:", wynik.podsumowanie || "(brak)");
    console.log("=======================================");
    console.log("");

    // potwierdzenie wywołania narzędzia — bez response.create, żeby AI
    // nie odezwało się już po pożegnaniu
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ ok: true })
          }
        })
      );
    }

    // pożegnalna wypowiedź zwykle płynie w tej samej odpowiedzi — rozłączamy
    // dopiero, gdy response.done ją zamknie (albo awaryjnie po 30 s)
    hangupArmed = true;
    hangupTimer = setTimeout(scheduleHangup, 30000);
  }

  function doBargeIn() {
    if (bargeInFired) {
      return;
    }

    bargeInFired = true;

    console.log("");
    console.log("🎙️ BARGE-IN: rozmówca mówi podczas wypowiedzi AI — ucinam AI");

    // stop generowania po stronie OpenAI...
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(JSON.stringify({ type: "response.cancel" }));
    }

    // ...i wyczyść audio AI zakolejkowane w Twilio, żeby resztki uciętego
    // zdania nie doszły do słuchawki
    queueClear();
    suppressAudio = true;

    if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(JSON.stringify({ event: "clear", streamSid: streamSid }));
    }
  }

  // ==========================================================
  // AUDIO WEJŚCIOWE: gating echa + własny VAD + barge-in
  // ==========================================================

  function handleIncomingAudio(payload) {
    const bytes = Buffer.from(payload, "base64");
    const frameMs = bytes.length / 8; // PCMU 8 kHz: 1 bajt = 1 próbka

    // Dopóki w słuchawce gra audio AI (kolejka odtwarzania > zapas), mikrofon
    // jest wstrzymany: echo nie trafia do OpenAI, więc nie pojawia się jako
    // "USER". Mowę rozmówcy trzymamy lokalnie i patrzymy, czy to przerwanie.
    if (drainQueue() > PLAYBACK_MARGIN_MS) {
      const rms = frameRms(bytes);

      if (rms < BARGE_IN_RMS) {
        return; // cisza / szum / tłumione echo — nic nie trzymaj
      }

      if (!gatingLogged) {
        gatingLogged = true;
        console.log("🔇 AI jeszcze gra — wstrzymuję słuchanie (echo nie trafia do transkrypcji)");
      }

      heldFrames.push(payload);
      heldSpeechMs += frameMs;

      if (BARGE_IN_MS > 0 && heldSpeechMs >= BARGE_IN_MS) {
        doBargeIn();
      }
      return;
    }

    // Tryb słuchania: AI ucichło — audio idzie do OpenAI (serwerowy VAD
    // prowadzi tury). Nagromadzona mowa (np. początek wtrącenia tuż przed
    // końcem wypowiedzi AI) wchodzi teraz do bufora, żeby jej nie urwać.
    gatingLogged = false;
    bargeInFired = false;

    if (heldFrames.length > 0) {
      flushHeldAudio();
    }

    appendInputAudio(payload);
  }

  function frameRms(bytes) {
    if (bytes.length === 0) {
      return 0;
    }

    let sum = 0;
    for (let i = 0; i < bytes.length; i++) {
      const sample = MULAW_TABLE[bytes[i]];
      sum += sample * sample;
    }
    return Math.sqrt(sum / bytes.length);
  }

  function appendInputAudio(payload) {
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: payload
        })
      );
    }
  }

  function flushHeldAudio() {
    for (const frame of heldFrames) {
      appendInputAudio(frame);
    }
    heldFrames = [];
    heldSpeechMs = 0;
  }

  // Kolejka odtwarzania Twilio: audio zleca w kolejce i gra w czasie
  // rzeczywistym — model odpowiada "response done" wcześniej, niż słuchawka
  // milknie, więc słuchanie otwieramy dopiero, gdy kolejka zbiegnie.
  function drainQueue() {
    if (queueLastAt !== null) {
      queuedAudioMs -= Date.now() - queueLastAt;
      if (queuedAudioMs < 0) {
        queuedAudioMs = 0;
      }
    }
    queueLastAt = Date.now();
    return queuedAudioMs;
  }

  function queueClear() {
    queuedAudioMs = 0;
    queueLastAt = Date.now();
  }

  function scheduleHangup() {
    if (hangupDone) {
      return;
    }

    hangupDone = true;
    clearTimeout(hangupTimer);

    // krótki zapas, żeby audio pożegnania zdążyło dojść do rozmówcy
    setTimeout(() => {
      hangupCall(callSid, "AI zakończyło rozmowę");

      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    }, 2000);
  }

  // ----------------------------------------------------------
  // OPENAI ERROR / CLOSED
  // ----------------------------------------------------------

  openaiWs.on("error", (error) => {
    console.log("");
    console.log("❌ OpenAI WebSocket error:");
    console.log(error.message);
  });

  openaiWs.on("close", () => {
    console.log("🔴 OpenAI connection closed");
  });

  // ==========================================================
  // TWILIO MESSAGES
  // ==========================================================

  twilioWs.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      // ------------------------------------------------------
      // START
      // ------------------------------------------------------

      if (data.event === "start") {
        streamSid = data.start.streamSid;
        callSid = data.start.callSid;

        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-");

        transcriptFile = path.join(
          transcriptsDir,
          `${timestamp}_${callSid}.txt`
        );

        fs.writeFileSync(
          transcriptFile,
          "======================================\n" +
            "TWILIO + OPENAI REALTIME — ROZMOWA O LEKACH\n" +
            "======================================\n\n" +
            `Call SID: ${callSid}\n` +
            `Stream SID: ${streamSid}\n` +
            `Leki do odpytania: ${LEKI.join(", ")}\n\n`
        );

        const state = activeCalls.get(callSid) || {};
        state.transcriptFile = transcriptFile;
        activeCalls.set(callSid, state);

        console.log("");
        console.log("📞 TWILIO CALL STARTED");
        console.log("Call SID:", callSid);
        console.log("Stream SID:", streamSid);
        console.log("📄 Transcript:", transcriptFile);
      }

      // ------------------------------------------------------
      // MEDIA
      // ------------------------------------------------------

      else if (data.event === "media") {
        handleIncomingAudio(data.media.payload);
      }

      // ------------------------------------------------------
      // STOP
      // ------------------------------------------------------

      else if (data.event === "stop") {
        console.log("");
        console.log("📞 TWILIO CALL ENDED");

        finalizeCall();
      }

    } catch (error) {
      console.log("❌ Błąd przetwarzania wiadomości Twilio:", error.message);
    }
  });

  // ----------------------------------------------------------
  // FINALIZACJA (stop albo nagłe zerwanie WS)
  // ----------------------------------------------------------

  function finalizeCall() {
    if (finalized) {
      return;
    }

    finalized = true;
    clearTimeout(hangupTimer);

    // rozmówca rozłączył się przed end_call? podsumujemy z transkrypcji
    if (callSid && transcriptFile) {
      const state = activeCalls.get(callSid);
      if (!state || !state.podsumowanieSaved) {
        fallbackSummarize(callSid, transcriptFile);
      }
    }

    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  }

  twilioWs.on("close", () => {
    console.log("🔴 Twilio Media Stream closed");

    finalizeCall();
  });

  twilioWs.on("error", (error) => {
    console.log("❌ Twilio WebSocket error:", error.message);
  });

  // ==========================================================
  // SAVE TRANSCRIPT
  // ==========================================================

  function saveTranscript(file, speaker, text) {
    if (!file || !text) {
      return;
    }

    const timestamp = new Date().toLocaleTimeString("pl-PL");

    fs.appendFileSync(file, `[${timestamp}] ${speaker}: ${text}\n\n`);
  }
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, () => {
  if (process.send) process.send({ event: "ready", port: server.address().port });
  console.log("");
  console.log("======================================");
  console.log("🚀 SERVER STARTED — rozmowa o lekach");
  console.log("======================================");
  console.log(`Leki: ${LEKI.join(", ")}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/media-stream`);
  console.log(`Podgląd transkrypcji: http://localhost:${PORT}/`);
  console.log("");
});

// ============================================================
// MAKE TWILIO CALL
// ============================================================

async function makeCall(toNumber) {
  const publicUrl = process.env.PUBLIC_URL;

  if (!publicUrl) {
    console.log("❌ Brakuje PUBLIC_URL w pliku .env — nie wykonuję połączenia.");
    return;
  }

  const websocketUrl =
    publicUrl
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://") + "/media-stream";

  console.log("");
  console.log("======================================");
  console.log("📞 TWORZĘ POŁĄCZENIE (rozmowa o lekach)");
  console.log("======================================");

  console.log("WebSocket:", websocketUrl);

  const twiml = `
<Response>
  <Connect>
    <Stream url="${websocketUrl}" />
  </Connect>
</Response>
`;

  const call = await twilioClient.calls.create({
    from: process.env.TWILIO_FROM,
    to: toNumber,
    twiml: twiml
  });

  if (process.send) process.send({ event: "call_created", sid: call.sid, status: call.status });

  console.log("");
  console.log("✅ CALL CREATED");
  console.log("Call SID:", call.sid);
  console.log("Status:", call.status);
  console.log("");
  console.log("📱 Telefon powinien właśnie dzwonić.");
  console.log("🖥️  Transkrypcja na żywo: http://localhost:" + PORT + "/");
  console.log("");

  activeCalls.set(call.sid, { transcriptFile: null, podsumowanieSaved: false });

  // śledzenie statusu — gdy rozmowa skończy się bez end_call (nikt nie odebrał,
  // rozmówca się rozłączył), podsumowanie i tak powstanie z transkrypcji
  const startedAt = Date.now();
  let lastStatus = call.status;

  const pollTimer = setInterval(async () => {
    try {
      const c = await twilioClient.calls(call.sid).fetch();

      if (c.status !== lastStatus) {
        console.log("  status:", c.status);
        lastStatus = c.status;
      }

      const terminal = ["completed", "busy", "failed", "no-answer", "canceled"].includes(
        c.status
      );

      if (terminal || Date.now() - startedAt > 300000) {
        if (!terminal) {
          await hangupCall(call.sid, "Call duration limit reached");
          c.status = "canceled";
        }
        clearInterval(pollTimer);

        console.log(`📞 Rozmowa zakończona (status: ${c.status})`);

        const state = activeCalls.get(call.sid);
        const file =
          (state && state.transcriptFile) || findTranscriptFile(call.sid);

        if (file && (!state || !state.podsumowanieSaved)) {
          await fallbackSummarize(call.sid, file);
        }
        if (process.send) process.send({ event: "terminal", sid: call.sid,
          status: c.status, duration_sec: Number(c.duration || 0) });
      }
    } catch {
      // chwilowe błędy API — spróbujemy przy następnym odpytaniu
    }
  }, 5000);
}

// ============================================================
// START: ARGUMENTY I AUTO-DZWONIENIE
// ============================================================

const args = process.argv.slice(2);

// The gateway starts dialing only after the private stream listener is ready.
process.on("message", (message) => {
  if (message.event === "start_call") {
    makeCall(message.to).catch(() => {
      if (process.send) process.send({ event: "call_error" });
    });
  }
});
const noCall = args.includes("--no-call");
const testSms = args.includes("--test-sms");
const toNumber = args.find((a) => a.startsWith("+")) || process.env.TWILIO_TO;

if (testSms) {
  // test wysyłki bez rozmowy: fałszywe podsumowanie idzie na SMS_TO z .env
  const smsTo = (process.env.SMS_TO || "").trim();
  if (!smsTo) {
    console.log("❌ Brak SMS_TO w .env — nie wysyłam testowego SMS");
    process.exit(1);
  }

  const fakeWynik = {
    imie: IMIE_PACJENTA || "Jan",
    leki: Object.fromEntries(LEKI.map((lek, i) => [lek, i === 1 ? 0 : 1])),
    podsumowanie:
      "SMS TESTOWY — tak będzie wyglądało podsumowanie rozmowy o lekach."
  };

  sendSummarySms(smsTo, fakeWynik)
    .catch((error) => console.log("❌ Błąd:", error.message))
    .finally(() => process.exit(0));
} else if (!noCall) {
  if (!toNumber) {
    console.log(
      "❌ Brak numeru docelowego: podaj argument +48... albo ustaw TWILIO_TO w .env"
    );
  } else {
    // Dajemy serwerowi chwilę na uruchomienie
    setTimeout(() => {
      makeCall(toNumber).catch((error) => {
        console.log("");
        console.log("❌ BŁĄD TWILIO");
        console.log("======================================");
        console.log(error.message);
        console.log("======================================");
      });
    }, 1000);
  }
}

// ============================================================
// CTRL+C: rozłącz aktywną rozmowę i dokończ podsumowanie
// ============================================================

process.on("SIGINT", async () => {
  console.log("\n⏹  Zamykam...");

  const pending = [...activeCalls.entries()].filter(
    ([, state]) => !state.podsumowanieSaved
  );

  for (const [callSid, state] of pending) {
    hangupCall(callSid, "Ctrl+C");

    const file = state.transcriptFile || findTranscriptFile(callSid);
    if (file) {
      await fallbackSummarize(callSid, file);
    }
  }

  setTimeout(() => process.exit(0), activeCalls.size > 0 ? 3000 : 0);
});
