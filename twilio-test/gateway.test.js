const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const { createGateway } = require("./gateway");
const WebSocket = require("ws");
const twilio = require("twilio");
const { fork } = require("node:child_process");
const path = require("node:path");

test("the real voice process reports its private listener without dialing", { timeout: 10000 }, async () => {
  const child = fork(path.join(__dirname, "call-leki.js"), ["--no-call"], {
    env: { ...process.env, PORT: "0", TWILIO_ACCOUNT_SID: `AC${"0".repeat(32)}`,
      TWILIO_AUTH_TOKEN: "test", TWILIO_FROM: "+48600100200", OPENAI_API_KEY: "test",
      LEKI_JSON: JSON.stringify(["Medicine 5 mg, 1 tablet"]), SMS_TO: "" },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  try {
    const ready = await new Promise((resolve, reject) => {
      child.once("message", resolve);
      child.once("error", reject);
      child.once("exit", () => reject(new Error("Voice process exited before reporting readiness")));
    });
    assert.equal(ready.event, "ready");
    assert.ok(ready.port > 0);
    assert.equal(child.connected, true);
  } finally {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }
});

for (const [scheme, suffix] of [["https", ""], ["https", "/"], ["wss", ""], ["wss", "/"]]) {
test(`signed Twilio streams preserve text frames with ${scheme} and suffix '${suffix}'`, async () => {
  const echo = new WebSocket.Server({ port: 0, host: "127.0.0.1" });
  await new Promise((resolve) => echo.once("listening", resolve));
  echo.on("connection", (socket) => socket.on("message", (frame) => socket.send(frame, { binary: false })));
  let streamPath;
  const env = { VOICE_SERVICE_TOKEN: "token", PUBLIC_URL: "https://voice.example",
    TWILIO_AUTH_TOKEN: "secret", TWILIO_ACCOUNT_SID: "ACtest", TWILIO_FROM: "+48600100200", OPENAI_API_KEY: "test" };
  const { server } = createGateway({ env, spawn: (_file, _args, options) => {
    streamPath = new URL(options.env.PUBLIC_URL).pathname + "/media-stream";
    const child = new EventEmitter();
    child.kill = () => {};
    child.send = () => queueMicrotask(() => child.emit("message", { event: "call_created", sid: "CAtest", status: "queued" }));
    queueMicrotask(() => child.emit("message", { event: "ready", port: echo.address().port }));
    return child;
  } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const local = `127.0.0.1:${server.address().port}`;
    await fetch(`http://${local}/internal/calls`, { method: "POST", headers: {
      Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: randomUUID(), to: "+48600100200", medications: ["Medication"] }) });
    const signature = twilio.getExpectedTwilioSignature("secret", `${env.PUBLIC_URL.replace("https:", `${scheme}:`)}${streamPath}${suffix}`, {});
    const socket = new WebSocket(`ws://${local}${streamPath}`, { headers: { "x-twilio-signature": signature } });
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject) });
    const response = new Promise((resolve) => socket.once("message", (frame, binary) => resolve({ text: frame.toString(), binary })));
    socket.send('{"event":"media"}');
    assert.deepEqual(await response, { text: '{"event":"media"}', binary: false });
    socket.close();
    await new Promise((resolve) => socket.once("close", resolve));
    const unauthorized = new WebSocket(`ws://${local}${streamPath}`);
    await new Promise((resolve) => unauthorized.once("error", resolve));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => echo.close(resolve));
  }
});
}

test("gateway isolates call contexts, dials once and persists ordered events", async () => {
  const children = [];
  const events = [];
  const env = { VOICE_SERVICE_TOKEN: "test-token", PUBLIC_URL: "https://voice.example",
    TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "test", TWILIO_FROM: "+48600100200",
    OPENAI_API_KEY: "test" };
  const { server } = createGateway({ env, spawn: (_file, _args, options) => {
    const child = new EventEmitter();
    child.kill = () => {};
    child.send = (message) => queueMicrotask(() => child.emit("message", {
      event: "call_created", sid: `CA${message.to.slice(-5)}`, status: "queued",
    }));
    children.push({ child, options });
    queueMicrotask(() => child.emit("message", { event: "ready", port: 9000 }));
    return child;
  }, deliver: async (_url, options) => {
    events.push(JSON.parse(options.body));
    return new Response("{}", { status: 200 });
  } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const payload = { task_id: randomUUID(), to: "+48600100200", ward_name: "Ward A", tz: "Europe/Warsaw",
      medications: ["Medication A, 5 mg (1 tablet)"] };
    const request = (body, token = "test-token") => fetch(`${base}/internal/calls`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal((await request(payload, "wrong")).status, 401);
    assert.equal((await request({ ...payload, to: "invalid" })).status, 422);
    assert.equal((await request(payload)).status, 201);
    assert.equal((await request(payload)).status, 201);
    assert.equal(children.length, 1);
    assert.deepEqual(JSON.parse(children[0].options.env.LEKI_JSON), payload.medications);
    assert.equal(children[0].options.env.PACJENT_IMIE, "Ward A");
    assert.equal(children[0].options.env.SMS_TO, "");
    children[0].child.emit("message", { event: "summary", sid: "CA00200", medications: { "Medication A": 1 } });
    children[0].child.emit("message", { event: "terminal", sid: "CA00200", status: "completed", duration_sec: 34 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(events.map((event) => event.event), ["summary", "terminal"]);
    await request({ ...payload, task_id: randomUUID(), ward_name: "Ward B", medications: ["Medication B"] });
    assert.equal(children.length, 2);
    assert.notEqual(children[0].options.env.PUBLIC_URL, children[1].options.env.PUBLIC_URL);
    assert.equal(children[1].options.env.PACJENT_IMIE, "Ward B");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("gateway rejects dialing when provider configuration is incomplete", async () => {
  const { server } = createGateway({ env: { VOICE_SERVICE_TOKEN: "token" } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/internal/calls`, {
      method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
