const express = require("express");
const http = require("node:http");
const path = require("node:path");
const { fork } = require("node:child_process");
const { randomUUID, timingSafeEqual } = require("node:crypto");
const WebSocket = require("ws");
const twilio = require("twilio");

function authorized(value, expected) {
  if (!expected || !value) return false;
  const left = Buffer.from(value);
  const right = Buffer.from(`Bearer ${expected}`);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Each conversation gets its own process, keeping the branch's audio/VAD
// implementation and isolating the ward, medications and transcript state.
function createGateway({ env = process.env, spawn = fork, deliver = fetch } = {}) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  const server = http.createServer(app);
  const streams = new WebSocket.Server({ noServer: true });
  const calls = new Map();

  app.get("/health", (_req, res) => res.json({ ready: Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM &&
    env.OPENAI_API_KEY && env.PUBLIC_URL && env.VOICE_SERVICE_TOKEN
  ) }));

  async function callback(taskId, event) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await deliver(
          `${env.BACKEND_INTERNAL_URL || "http://backend:8000"}/api/v1/internal/calls/${taskId}/events`,
          { method: "POST", headers: {
            Authorization: `Bearer ${env.VOICE_SERVICE_TOKEN}`,
            "Content-Type": "application/json",
          }, body: JSON.stringify(event), signal: AbortSignal.timeout(10000) },
        );
        if (response.ok) return;
      } catch { /* Retry temporary backend/network failures. */ }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    console.error(`Could not persist the event for task ${taskId}`);
  }

  app.post("/internal/calls", async (req, res) => {
    if (!authorized(req.headers.authorization, env.VOICE_SERVICE_TOKEN)) {
      return res.sendStatus(401);
    }
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM ||
        !env.OPENAI_API_KEY || !env.PUBLIC_URL) {
      return res.status(503).json({ detail: "Voice provider is not configured" });
    }
    const { task_id, to, ward_name, medications, tz } = req.body;
    if (!/^[0-9a-f-]{36}$/i.test(task_id || "") || !/^\+[1-9]\d{6,14}$/.test(to || "") ||
        !Array.isArray(medications) || !medications.length ||
        !medications.every((item) => typeof item === "string" && item.length > 0)) {
      return res.status(422).json({ detail: "Invalid call context" });
    }
    if (!calls.has(task_id)) {
      const streamKey = randomUUID();
      const child = spawn(path.join(__dirname, "call-leki.js"), ["--no-call"], {
        env: { ...env, PORT: "0", LEKI_JSON: JSON.stringify(medications),
          PACJENT_IMIE: ward_name || "", PACJENT_TZ: tz || "Europe/Warsaw",
          PUBLIC_URL: `${env.PUBLIC_URL.replace(/\/$/, "")}/calls/${streamKey}`,
          SMS_TO: "", TRANSCRIPTS_DIR: env.TRANSCRIPTS_DIR || "/tmp/voice-transcripts",
        }, stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      const state = { child, streamKey, port: null, promise: null };
      calls.set(task_id, state);
      state.promise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error("Voice provider timed out"));
        }, 20000);
        child.on("message", (message) => {
          if (message.event === "ready") {
            state.port = message.port;
            child.send({ event: "start_call", to });
          } else if (message.event === "call_created") {
            clearTimeout(timeout);
            state.sid = message.sid;
            resolve({ sid: message.sid, status: message.status });
          } else if (message.event === "call_error") {
            clearTimeout(timeout);
            reject(new Error("Twilio rejected the call"));
            child.kill();
          } else if (message.event === "summary") {
            // Serialize callbacks so completion cannot overtake the result.
            state.delivery = (state.delivery || Promise.resolve()).then(() => callback(task_id, message));
          } else if (message.event === "terminal") {
            state.delivery = (state.delivery || Promise.resolve())
              .then(() => callback(task_id, message))
              .finally(() => {
                child.kill();
                // Keep the SID for idempotent provider request replays.
                state.port = null;
              });
          }
        });
        child.once("error", () => { clearTimeout(timeout); reject(new Error("Voice process failed")); });
        child.once("exit", () => {
          clearTimeout(timeout);
          if (!state.sid) reject(new Error("Voice process exited before dialing"));
        });
      });
    }
    try {
      return res.status(201).json(await calls.get(task_id).promise);
    } catch (error) {
      // Do not redial automatically after an ambiguous provider timeout.
      return res.status(502).json({ detail: error.message });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    const match = req.url.match(/^\/calls\/([^/]+)\/media-stream\/?$/);
    const state = match && [...calls.values()].find((entry) => entry.streamKey === match[1]);
    const publicUrl = `${(env.PUBLIC_URL || "").replace(/\/$/, "")}${req.url}`;
    // Twilio WSS handshakes can sign the URL with a trailing slash.
    const canonicalUrl = publicUrl.replace(/\/$/, "");
    const signedUrls = [canonicalUrl, `${canonicalUrl}/`,
      canonicalUrl.replace(/^https:/, "wss:"), `${canonicalUrl.replace(/^https:/, "wss:")}/`];
    const validSignature = signedUrls.some((url) => twilio.validateRequest(
      env.TWILIO_AUTH_TOKEN || "", req.headers["x-twilio-signature"] || "", url, {},
    ));
    if (!state?.port || !validSignature) {
      console.error(`Stream upgrade rejected: ${!state?.port ? "inactive call" : "invalid Twilio signature"}`);
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    console.log("Authenticated Twilio stream connected");
    streams.handleUpgrade(req, socket, head, (upstream) => {
      const downstream = new WebSocket(`ws://127.0.0.1:${state.port}/media-stream`);
      const pending = [];
      downstream.on("open", () => pending.splice(0).forEach((frame) => downstream.send(frame, { binary: false })));
      upstream.on("message", (frame) => {
        if (downstream.readyState === WebSocket.OPEN) downstream.send(frame, { binary: false });
        else pending.push(frame);
      });
      downstream.on("message", (frame) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(frame, { binary: false });
      });
      upstream.on("close", () => downstream.close());
      downstream.on("close", () => upstream.close());
      downstream.on("error", () => upstream.close());
      upstream.on("error", () => downstream.close());
    });
  });
  server.on("close", () => [...calls.values()].forEach(({ child }) => child.kill()));
  return { app, server };
}

if (require.main === module) {
  require("dotenv").config();
  createGateway().server.listen(Number(process.env.PORT || 3000), "0.0.0.0");
}
module.exports = { createGateway };
