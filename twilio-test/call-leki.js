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

// Planowana pora przyjęcia leków (env PLAN_GODZINA, "HH:MM" z rutyny) — znany
// fakt dla promptu, żeby AI pytało potwierdzająco, a nie "o której godzinie?"
const PLAN_GODZINA = (process.env.PLAN_GODZINA || "").trim();

// Szczegóły leków z katalogu (env LEKI_SZCZEGOLY_JSON, opcjonalne) — źródło
// odpowiedzi, gdy pacjent pyta czym jest lek albo ma wątpliwości.
const LEKI_SZCZEGOLY = (() => {
  try {
    const parsed = JSON.parse(process.env.LEKI_SZCZEGOLY_JSON || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
})();

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
  const lekiLine = LEKI.map(
    (lek) => `${lek}: ${wynik.leki[lek] === 1 ? "przyjęty" : "NIEPRZYJĘTY"}`
  ).join(", ");
  const kto = wynik.imie ? `${wynik.imie} — ` : "";

  return [
    "Podsumowanie rozmowy o lekach:",
    `${kto}${lekiLine}`,
    wynik.podsumowanie
  ]
    .filter((part) => part && part.trim())
    .join("\n");
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

  const oGodzinie = PLAN_GODZINA ? ` o godz. ${PLAN_GODZINA}` : "";
  const poraFakt = PLAN_GODZINA
    ? `Planowa pora przyjęcia dzisiejszych dawek: ${PLAN_GODZINA}.`
    : `Planowa pora przyjęcia nie jest podana — pytaj o dzisiejszą dawkę bez podawania godziny.`;

  const szczegolyLinie = LEKI.flatMap((lek) => {
    const info = LEKI_SZCZEGOLY.find((d) => d && d.label === lek);
    if (!info) {
      return [];
    }
    const parts = [];
    if (info.what_it_is) parts.push(`co to za lek: ${info.what_it_is}`);
    if (info.generic_name) parts.push(`substancja czynna: ${info.generic_name}`);
    if (info.form) parts.push(`postać: ${info.form}`);
    if (info.how_to_take) parts.push(`jak przyjmować: ${info.how_to_take}`);
    if (info.when_to_take) parts.push(`kiedy przyjmować: ${info.when_to_take}`);
    if (info.warnings) parts.push(`na co uważać: ${info.warnings}`);
    return parts.length > 0 ? [`- ${lek} — ${parts.join("; ")}`] : [];
  }).join("\n");

  const szczegolyBlok = szczegolyLinie
    ? `INFORMACJE O LEKACH (z systemu — korzystaj z nich, gdy rozmówca pyta albo ma wątpliwości):
${szczegolyLinie}

Gdy rozmówca zapyta, czym jest lek, po co go przyjmuje albo jak go zażywać, odpowiedz
krótko (1-2 zdania), własnymi słowami, wyłącznie na podstawie powyższych informacji.
Gdy czegoś tam nie ma albo pytanie idzie dalej (zmiana dawkowania, łączenie z innymi
lekami, możliwe skutki uboczne) — powiedz szczerze, że tego nie podasz, i odeślij
go do lekarza lub ulotki.`
    : "";

  return `
Jesteś polskojęzycznym asystentem telefonicznym AI. Dzwonisz do pacjenta o planowanej
porze przyjmowania leków, żeby potwierdzić, czy przyjął dzisiejszą dawkę. Twoim celem
jest zebrać odpowiedź o WSZYSTKICH lekach z listy, a potem uprzejmie się pożegnać
i zakończyć rozmowę.

FAKTY, KTÓRE ZNASZ (masz je z systemu — NIGDY o nie nie pytaj):
${poraFakt}
Leki i dawki do potwierdzenia (i wyłącznie te):
${listaLekow}

NIGDY nie pytaj „o której godzinie", „jakiej dawki" ani „jakie leki przyjmuje Pan" —
te dane znasz i podajesz je sam w pytaniach. Układaj pytania tak, żeby naturalnie
wystarczyła krótka odpowiedź, ale NIGDY nie mów rozmówcy, jak ma odpowiedzieć:
nie mów „proszę odpowiedzieć tak lub nie" ani podobnie — to brzmi jak formularz,
a nie rozmowa.

${szczegolyBlok ? `${szczegolyBlok}\n\n` : ""}${pacjent}

Rozmowa odbywa się: ${teraz} (czas polski).

Jak rozmawiać (to rozmowa z człowiekiem, nie odprawa):
- Mów po polsku, krótko, luźno i naturalnie, jak człowiek przez telefon. Godziny i
  liczby mów tak, jak mówi się je na głos („koło ósmej", „dwie tabletki"), nie czytaj
  ich jak z formularza.
- Nie czytaj żadnego zdania z tych instrukcji słowo w słowo — przykłady pokazują tylko
  brzmienie; każda wypowiedź powinna być twoja, po swojemu.
- Nie przedstawiaj się jako człowiek — jesteś asystentem AI pilnującym przyjmowania leków.
- Telefon zbiera też głosy z otoczenia. Jeśli usłyszysz rozmowę innych osób albo wypowiedź
  NIE skierowaną do Ciebie, nie odnoś się do niej i nie komentuj jej — spokojnie wróć do
  ostatniego pytania albo przejdź do kolejnego.
- Gdy rozmówca Cię przerwie w pół zdania, przestań mówić i krótko zareaguj na to, co
  powiedział — a jeśli pytanie nadal jest aktualne, wróć do niego.
- Reaguj krótko i po ludzku na odpowiedzi („super", „rozumiem", „no to dobrze"), bez
  przesadnego entuzjazmu, i płynnie przechodź do kolejnego leku.
- Nie wymyślaj leków spoza listy i nie doradzaj w dawkowaniu ani w medycynie — pytania
  o zmianę dawkowania odsyłaj do lekarza lub ulotki.
- Jeśli rozmówca schodzi na bok, uprzejmie wróć do pytań o leki.
- Jeśli pod telefonem nie jest pacjent albo rozmówca prosi o zakończenie: podziękuj,
  pożegnaj się i wywołaj end_call (leki bez potwierdzenia oznacz jako nieprzyjęte,
  a sytuację opisz w podsumowaniu).

Przebieg rozmowy:
1. Przedstaw się własnymi słowami, krótko i po ludzku, np. „Dzień dobry, dzwonię jako
   asystent AI, który pilnuje przyjmowania leków. Ma Pan chwilę, żeby potwierdzić
   dzisiejsze dawki?" — i czekaj na odpowiedź.
2. Potem zapytaj po kolei o KAŻDY lek z listy, JEDNO pytanie naraz. W każdym pytaniu
   sam podaj to, co wiesz: nazwę leku oraz — jeśli znasz — planowaną porę i dawkę.
   Pytaj tak, żeby odpowiedź przyszła naturalnie (wystarczy krótkie tak albo nie),
   ale żadnym pytaniem nie wymagaj podanej formy odpowiedzi. Ubieraj każde pytanie
   inaczej, naturalnie, na przykład:
   - „No i jak, Ibuprofen${oGodzinie} się udał? Te dwie tabletki?"
   - „A Paracetamol w południe, ta jedna tabletka — wziął Pan?"
   - „I jeszcze Apap, koło dwunastej, jedna tabletka. Poszło?"
   Żadne dwa pytania nie powinny brzmieć identycznie. Po każdym pytaniu czekaj na
   odpowiedź.
3. Jeśli pacjent potwierdzi przyjęcie — krótka, naturalna reakcja i przejdź do
   kolejnego leku.
4. Jeśli pacjent powie, że przyjął lek o innej porze albo w innej dawce — nie poprawiaj
   go i nie dyskutuj; przyjmij to jako informację i zanotuj dokładnie w podsumowaniu.
5. Jeśli pacjent nie przyjął dawki — możesz raz, delikatnie zapytać, czy zamierza ją
   jeszcze przyjąć. Nie namawiaj ponownie.
6. Odpowiedź wymijającą, niejasną albo słabo słyszalną dopytaj raz, najwyżej dwa razy,
   za każdym razem inaczej sformułowana. Jeśli nadal nie ma jasnej odpowiedzi, uznaj
   lek za NIEPRZYJĘTY.

ZAKOŃCZENIE ROZMOWY — zacznij je dopiero, gdy spełnione są OBA warunki:
- masz wynik dla KAŻDEGO leku z listy (przyjęty, nieprzyjęty albo „przyjmie później"),
- niczego nie jesteś winien rozmówcy: jeśli w jego ostatniej wypowiedzi padło pytanie
  albo prośba (np. o poradę dotyczącą leku) — najpierw krótko na nią odpowiedz
  i dopiero potem zaczynaj zakończenie.

Przebieg zakończenia, w tej kolejności:
1. Podsumuj krótko na głos, co ustaliłeś, własnymi słowami, obejmując stan każdego
   leku — przyjęty, nieprzyjęty, planowany na później — np.: „Podsumuję: Polopirynę
   Pan przyjął, a Apap jeszcze nie — planuje Pan go wziąć za chwilę."
2. Powiedz, że masz już wszystko, co potrzebne, i zapytaj o ewentualne pytania, np.
   „Mam już wszystko, co potrzebne. Czy chce Pan jeszcze o coś zapytać?" — i CZEKAJ
   na odpowiedź.
3. Jeśli pytanie padło — odpowiedz krótko, wyłącznie na podstawie informacji o lekach
   (pytania wykraczające poza nie odsyłaj do lekarza lub ulotki), po czym ponownie
   zapytaj, czy coś jeszcze — punkt 2 można powtórzyć jeden raz.
4. Jeśli pytań nie ma — podziękuj bardzo za rozmowę (np. „Dziękuję bardzo za rozmowę"),
   życz czegoś dopasowanego do AKTUALNEJ pory dnia z nagłówka (rano i do popołudnia:
   „miłego dnia", wieczorem i nocą: „dobrej nocy", „dobranoc") i pożegnaj się
   („Do widzenia!"). Całość może brzmieć: „Dziękuję bardzo za rozmowę — miłego dnia!
   Do widzenia."
5. Dopiero PO wypowiedzianym na głos pożegnaniu z punktów 1-4 wywołaj narzędzie end_call.

Wywołanie end_call bez uprzedniego, głośnego pożegnania jest BŁĘDEM — rozmówca usłyszy
wtedy nagłe zerwanie połączenia. end_call wywołujesz DOKŁADNIE RAZ, zawsze na samym
końcu rozmowy. W parametrach end_call przekaż:
- leki — wynik dla każdego leku z listy (przyjety true/false; w uwadze zapisz szczegół,
  np. „przyjęty o innej porze", „przyjął inną dawkę", „zamierza przyjąć później";
  pusty string, gdy nie ma uwag),
- imie — imię rozmówcy, jeśli go podał, inaczej pusty string,
- podsumowanie — 2-4 zdania po polsku: kto odebrał, które leki przyjęto w planowej
  porze i dawce, które nie, jak przebiegała rozmowa.
`.trim();
}

const END_CALL_TOOL = {
  type: "function",
  name: "end_call",
  description:
    "Zakończ rozmowę telefoniczną. Wywołaj DOKŁNIE RAZ i dopiero PO głośnym " +
    "pożegnaniu się z rozmówcą (podziękowanie, życzenie, „Do widzenia!”), gdy masz " +
    "już odpowiedzi o wszystkich lekach albo rozmowa musi się skończyć.",
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
            },
            uwaga: {
              type: "string",
              description:
                "Szczegół, jeśli nie jest zwykłym potwierdzeniem, np. „przyjęty o innej " +
                "porze”, „przyjął inną dawkę”, „zamierza przyjąć później”; pusty string gdy brak"
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
  const uwagi = {};
  for (const lek of LEKI) {
    const match = fromAi.find((item) => {
      if (!item || typeof item.nazwa !== "string") {
        return false;
      }
      const nazwa = item.nazwa.trim().toLowerCase();
      if (!nazwa) {
        return false;
      }
      // Tolerate the model echoing the name shorter or longer than the list entry.
      return nazwa.includes(lek.toLowerCase()) || lek.toLowerCase().includes(nazwa);
    });
    lekiWynik[lek] = match && match.przyjety === true ? 1 : 0;
    const uwaga =
      match && typeof match.uwaga === "string" ? match.uwaga.trim() : "";
    if (uwaga) {
      uwagi[lek] = uwaga;
    }
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
    uwagi: uwagi,
    podsumowanie: String(args.podsumowanie || "").trim()
  };
}

function savePodsumowanie(transcriptFile, callSid, wynik, zrodlo) {
  const state = activeCalls.get(callSid);

  if (!transcriptFile || !fs.existsSync(transcriptFile)) {
    return null;
  }

  if (state && state.podsumowanieSaved) {
    console.log("(podsumowanie tej rozmowy już zapisane — pomijam duplikat)");
    return null;
  }

  const podsumowanieFile = transcriptFile.replace(/\.txt$/, "_podsumowanie.json");

  const data = {
    call_sid: callSid,
    zrodlo: zrodlo,
    zapisano_o: new Date().toISOString(),
    imie: wynik.imie,
    leki: wynik.leki,
    uwagi: wynik.uwagi || {},
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
        ...LEKI.map((lek) => {
          const status =
            wynik.leki[lek] === 1 ? "PRZYJĘTY (1)" : "NIEPRZYJĘTY (0)";
          const uwaga = wynik.uwagi && wynik.uwagi[lek];
          return `  - ${lek}: ${status}${uwaga ? ` — ${uwaga}` : ""}`;
        }),
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
              "brak jasnego potwierdzenia}, \"podsumowanie\": \"<2-4 zdania po polsku>\"}. " +
              "Jeśli podano planową porę przyjęcia, uwzględnij w podsumowaniu, czy dawki " +
              "przyjęto w planowej porze i dawce."
          },
          {
            role: "user",
            content:
              "Leki: " +
              LEKI.join(", ") +
              (PLAN_GODZINA
                ? "\nPlanowa pora przyjęcia: " + PLAN_GODZINA
                : "") +
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

    savePodsumowanie(
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

  // Last spoken AI utterance — used to detect a missing farewell before hangup.
  let lastAiText = "";
  let farewellNudges = 0;
  // Recent AI utterances (last few) — used to detect the closing sequence
  // (recap + "any questions?") even a turn or two before end_call.
  let aiUtterances = [];
  let closingNudges = 0;

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

    console.log("⚙️ Konfiguracja OpenAI wysłana (rozmowa o lekach: " + LEKI.join(", ") +
      (PLAN_GODZINA ? ", plan: " + PLAN_GODZINA : "") + ")");
  });

  // ----------------------------------------------------------
  // OPENAI MESSAGES
  // ----------------------------------------------------------

  openaiWs.on("message", (message) => {
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

        lastAiText = transcript;
        aiUtterances.push(transcript);
        if (aiUtterances.length > 3) {
          aiUtterances.shift();
        }
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
          handleEndCall(event.call_id, event.arguments);
        }
      }

      // zapasowo: funkcja może przyjść tylko jako output item
      else if (
        event.type === "response.output_item.done" &&
        event.item &&
        event.item.type === "function_call" &&
        event.item.name === "end_call"
      ) {
        handleEndCall(event.item.call_id, event.item.arguments);
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

  function handleEndCall(callId, rawArguments) {
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
    savePodsumowanie(transcriptFile, callSid, wynik, "AI (end_call)");

    console.log("");
    console.log("========== AI KONCZY ROZMOWE ==========");
    console.log("Imię:", wynik.imie || "(nie podano)");
    for (const lek of LEKI) {
      const uwaga = wynik.uwagi && wynik.uwagi[lek];
      console.log(`  ${lek}: ${wynik.leki[lek] === 1 ? "PRZYJĘTY" : "NIEPRZYJĘTY"}${uwaga ? ` — ${uwaga}` : ""}`);
    }
    console.log("Podsumowanie:", wynik.podsumowanie || "(brak)");
    console.log("=======================================");
    console.log("");

    // potwierdzenie wywołania narzędzia
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

    // The model tends to jump straight to end_call once the medication
    // checklist is complete — skipping the recap and the "any questions?"
    // step, and sometimes leaving the caller's own question unanswered.
    // If no closing question was spoken recently, reject this ending: nudge
    // the model through the closing sequence and keep the call open. Hangup
    // is NOT armed here; the next end_call goes through the farewell guard.
    const closingQuestionRe =
      /(o coś zapytać|jakieś pytani|coś jeszcze|jeszcze coś|coś doda)/i;
    if (
      !closingQuestionRe.test(aiUtterances.join(" ")) &&
      closingNudges < 1 &&
      openaiWs.readyState === WebSocket.OPEN
    ) {
      closingNudges++;
      console.log("");
      console.log("⚠️ end_call bez podsumowania i pytania zamykającego — wstrzykuję zakończenie");
      openaiWs.send(
        JSON.stringify({
          type: "response.create",
          response: {
            output_modalities: ["audio"],
            instructions:
              "Jeszcze nie zakańczaj rozmowy. Zanim pożegnasz rozmówcę: po pierwsze, jeśli w jego " +
              "ostatniej wypowiedzi padło pytanie albo prośba (np. o poradę dotyczącą leku) — " +
              "najpierw krótko na nie odpowiedz, wyłącznie na podstawie informacji o lekach, " +
              "którymi dysponujesz. Po drugie, podsumuj krótko na głos stan każdego leku: " +
              "przyjęty, nieprzyjęty albo planowany na później. Po trzecie, zapytaj: „Czy chce " +
              "Pan jeszcze o coś zapytać?” — i czekaj na odpowiedź. Nie wywołuj teraz narzędzia " +
              "end_call; wywołasz je dopiero, gdy rozmówca odpowie, a Ty się pożegnasz."
          }
        })
      );
      return;
    }

    // The model sometimes calls end_call without speaking the goodbye first —
    // that hangs up mid-call. If the last spoken utterance holds no farewell,
    // ask the model to say it now; disconnect only once that response is done.
    // One nudge max — if the model still refuses, we hang up gracefully.
    const farewellRe = /do\s?widzenia|dobranoc/i;
    if (!farewellRe.test(lastAiText) && farewellNudges < 1) {
      farewellNudges++;
      console.log("");
      console.log("⚠️ end_call bez pożegnania — proszę AI, żeby się pożegnało przed rozłączeniem");
      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              output_modalities: ["audio"],
              instructions:
                "Jeszcze się nie pożegnałeś z rozmówcą. Powiedz teraz krótkie pożegnanie: że masz już " +
                "wszystkie potrzebne informacje, podziękuj bardzo za rozmowę, dodaj życzenie dopasowane " +
                "do pory dnia (rano i do popołudnia: „miłego dnia”, wieczorem i nocą: „dobrej nocy”, " +
                "„dobranoc”) i skończ słowami „Do widzenia!”. Nic więcej nie mów i nie wywołuj żadnych narzędzi."
            }
          })
        );
      }
      hangupArmed = true;
      hangupTimer = setTimeout(scheduleHangup, 30000);
      return;
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

      // During the closing farewell (hangup armed) the caller's own "goodbye"
      // must not barge in and wipe the queued farewell audio.
      if (BARGE_IN_MS > 0 && !hangupArmed && heldSpeechMs >= BARGE_IN_MS) {
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

    // "response done" means OpenAI finished GENERATING audio, but Twilio is
    // still playing the queued farewell in real time — a fixed grace period
    // cuts the goodbye mid-sentence. Disconnect only once the playback queue
    // has drained (capped, in case the tracking fails to converge).
    const deadline = Date.now() + 10000;
    const hangupWhenPlayed = () => {
      if (drainQueue() > PLAYBACK_MARGIN_MS && Date.now() < deadline) {
        setTimeout(hangupWhenPlayed, 200);
        return;
      }

      setTimeout(() => {
        hangupCall(callSid, "AI zakończyło rozmowę");

        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.close();
        }
      }, 500);
    };

    hangupWhenPlayed();
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
