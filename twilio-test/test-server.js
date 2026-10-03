// Network integration fixture: use the real gateway and callbacks without Twilio/OpenAI.
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const { createGateway } = require("./gateway");

createGateway({ spawn: (_script, _args, options) => {
  const child = new EventEmitter();
  child.kill = () => {};
  child.send = () => {
    const sid = `CA${randomUUID().replaceAll("-", "")}`;
    const medications = JSON.parse(options.env.LEKI_JSON);
    queueMicrotask(() => child.emit("message", { event: "call_created", sid, status: "queued" }));
    setTimeout(() => {
      child.emit("message", { event: "summary", sid,
        medications: Object.fromEntries(medications.map((name) => [name, 1])),
        transcript: "[09:00:01] AI: Czy przyjął Pan lek?\n[09:00:03] USER: Tak, przyjąłem.",
        notes: "Test conversation: medication taken" });
      child.emit("message", { event: "terminal", sid, status: "completed", duration_sec: 23 });
    }, 750);
  };
  queueMicrotask(() => child.emit("message", { event: "ready", port: 9000 }));
  return child;
} }).server.listen(3000, "0.0.0.0");
