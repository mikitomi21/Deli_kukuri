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
// TRANSCRIPT FILE
// ============================================================

const transcriptsDir = path.join(__dirname, "transcripts");

if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir);
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {
  res.send("Twilio AI server działa.");
});

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
  let transcriptStarted = false;

  // ----------------------------------------------------------
  // OPENAI REALTIME
  // ----------------------------------------------------------

  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1",
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
        model: "gpt-realtime-2.1",

        output_modalities: ["audio"],

        instructions: `
Jesteś polskojęzycznym asystentem telefonicznym.

Rozmawiasz z człowiekiem przez telefon.

Zawsze:
- mów po polsku,
- odpowiadaj krótko i naturalnie,
- nie przedstawiaj się jako człowiek,
- zachowuj się jak pomocny asystent AI,
- nie mów zbyt szybko,
- zadawaj jedno pytanie naraz.

Na początku rozmowy powiedz:

"Dzień dobry, tutaj asystent AI. W czym mogę pomóc?"
        `,

        audio: {
          input: {
            format: {
              type: "audio/pcmu"
            },

            transcription: {
              model: "gpt-4o-mini-transcribe",
              language: "pl"
            },

            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600,
              create_response: true,
              interrupt_response: true
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

    console.log("⚙️ Konfiguracja OpenAI wysłana");
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
      // USER SPEECH STARTED
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

        saveTranscript(
          transcriptFile,
          "USER",
          transcript
        );
      }

      // ------------------------------------------------------
      // AI TRANSCRIPT DELTA
      // ------------------------------------------------------

      else if (
        event.type ===
        "response.output_audio_transcript.delta"
      ) {
        process.stdout.write(event.delta || "");
      }

      // ------------------------------------------------------
      // AI TRANSCRIPT COMPLETE
      // ------------------------------------------------------

      else if (
        event.type ===
        "response.output_audio_transcript.done"
      ) {
        const transcript = event.transcript || "";

        console.log("");
        console.log("");
        console.log("🤖 AI:");
        console.log(transcript);

        saveTranscript(
          transcriptFile,
          "AI",
          transcript
        );
      }

      // ------------------------------------------------------
      // AI AUDIO
      // ------------------------------------------------------

      else if (
        event.type === "response.output_audio.delta"
      ) {
        if (!streamSid) {
          return;
        }

        const audioPayload = event.delta;

        if (!audioPayload) {
          return;
        }

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
      // RESPONSE DONE
      // ------------------------------------------------------

      else if (event.type === "response.done") {
        console.log("");
        console.log("🔊 AI response completed");
      }

      // ------------------------------------------------------
      // OPENAI ERROR
      // ------------------------------------------------------

      else if (event.type === "error") {
        console.log("");
        console.log("❌ OPENAI ERROR");
        console.log(
          JSON.stringify(event, null, 2)
        );
      }

    } catch (error) {
      console.log(
        "❌ Błąd przetwarzania wiadomości OpenAI:",
        error.message
      );
    }
  });

  // ----------------------------------------------------------
  // OPENAI ERROR
  // ----------------------------------------------------------

  openaiWs.on("error", (error) => {
    console.log("");
    console.log("❌ OpenAI WebSocket error:");
    console.log(error.message);
  });

  // ----------------------------------------------------------
  // OPENAI CLOSED
  // ----------------------------------------------------------

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
          "TWILIO + OPENAI REALTIME\n" +
          "======================================\n\n" +
          `Call SID: ${callSid}\n` +
          `Stream SID: ${streamSid}\n\n`
        );

        transcriptStarted = true;

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
        if (
          openaiWs.readyState === WebSocket.OPEN
        ) {
          openaiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: data.media.payload
            })
          );
        }
      }

      // ------------------------------------------------------
      // STOP
      // ------------------------------------------------------

      else if (data.event === "stop") {
        console.log("");
        console.log("📞 TWILIO CALL ENDED");

        if (
          openaiWs.readyState === WebSocket.OPEN
        ) {
          openaiWs.close();
        }
      }

    } catch (error) {
      console.log(
        "❌ Błąd przetwarzania wiadomości Twilio:",
        error.message
      );
    }
  });

  // ----------------------------------------------------------
  // TWILIO WS CLOSED
  // ----------------------------------------------------------

  twilioWs.on("close", () => {
    console.log("🔴 Twilio Media Stream closed");

    if (
      openaiWs.readyState === WebSocket.OPEN
    ) {
      openaiWs.close();
    }
  });

  // ----------------------------------------------------------
  // TWILIO WS ERROR
  // ----------------------------------------------------------

  twilioWs.on("error", (error) => {
    console.log(
      "❌ Twilio WebSocket error:",
      error.message
    );
  });

  // ==========================================================
  // SAVE TRANSCRIPT
  // ==========================================================

  function saveTranscript(
    file,
    speaker,
    text
  ) {
    if (!file || !text) {
      return;
    }

    const timestamp =
      new Date().toLocaleTimeString("pl-PL");

    fs.appendFileSync(
      file,
      `[${timestamp}] ${speaker}: ${text}\n\n`
    );
  }
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, () => {
  console.log("");
  console.log("======================================");
  console.log("🚀 SERVER STARTED");
  console.log("======================================");
  console.log(`Local: http://localhost:${PORT}`);
  console.log(
    `WebSocket: ws://localhost:${PORT}/media-stream`
  );
  console.log("");
});

// ============================================================
// MAKE TWILIO CALL
// ============================================================

async function makeCall() {
  try {
    const publicUrl = process.env.PUBLIC_URL;

    if (!publicUrl) {
      throw new Error(
        "Brakuje PUBLIC_URL w pliku .env"
      );
    }

    const websocketUrl = publicUrl
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://")
      + "/media-stream";

    console.log("");
    console.log("======================================");
    console.log("📞 TWORZĘ POŁĄCZENIE");
    console.log("======================================");

    console.log(
      "WebSocket:",
      websocketUrl
    );

    const twiml = `
<Response>
  <Connect>
    <Stream url="${websocketUrl}" />
  </Connect>
</Response>
`;

    const call = await twilioClient.calls.create({
      from: process.env.TWILIO_FROM,
      to: process.env.TWILIO_TO,
      twiml: twiml
    });

    console.log("");
    console.log("✅ CALL CREATED");
    console.log("Call SID:", call.sid);
    console.log("Status:", call.status);
    console.log("");
    console.log(
      "📱 Telefon powinien właśnie dzwonić."
    );
    console.log(
      "🎤 Po odebraniu poczekaj, aż AI się odezwie."
    );
    console.log("");
  } catch (error) {
    console.log("");
    console.log("❌ BŁĄD TWILIO");
    console.log("======================================");
    console.log(error.message);
    console.log("======================================");
  }
}

// Dajemy serwerowi chwilę na uruchomienie
setTimeout(() => {
  makeCall();
}, 1000);