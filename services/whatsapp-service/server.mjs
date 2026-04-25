/**
 * Standalone Baileys WhatsApp bridge. Run 24/7 (VPS or PM2) — not in serverless.
 * Set: WHATSAPP_SERVICE_TOKEN, PORT, SESSIONS_DIR (optional)
 */
import express from "express";
import pino from "pino";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QR from "qrcode";
import path from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const sessionsRoot = process.env.SESSIONS_DIR || path.join(__dirname, "data", "sessions");
const port = Number(process.env.PORT || 3333);
const serviceToken = process.env.WHATSAPP_SERVICE_TOKEN || "";

/** @type {Map<string, { label: string, status: string, qr: string | null, qrDataUrl: string | null, sock: any, startPromise: Promise<void> | null, pairingInFlight: boolean, lastError: string | null }>} */
const connections = new Map();

function ensureEntry(id) {
  const d = "default";
  const key = id && String(id).trim() ? String(id).trim() : d;
  if (!connections.has(key)) {
    connections.set(key, {
      label: key,
      status: "disconnected",
      qr: null,
      qrDataUrl: null,
      sock: null,
      startPromise: null,
      pairingInFlight: false,
      lastError: null,
    });
  }
  return { key, entry: connections.get(key) };
}

function requireToken(req, res, next) {
  if (!serviceToken) {
    return res.status(500).json({ error: "WHATSAPP_SERVICE_TOKEN not set on service" });
  }
  const h = req.headers.authorization || "";
  if (h !== `Bearer ${serviceToken}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
}

function jidFromDigits(digits) {
  const d = String(digits).replace(/\D/g, "");
  if (d.length < 11) return null;
  return `${d}@s.whatsapp.net`;
}

async function startConnection(key) {
  const { entry } = ensureEntry(key);
  if (entry.startPromise) return entry.startPromise;

  const authDir = path.join(sessionsRoot, key);
  await mkdir(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  entry.startPromise = (async () => {
    entry.status = "connecting";
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.macOS("Itamar-CRM"),
      getMessage: async () => undefined,
    });
    entry.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;
      if (qr) {
        entry.qr = qr;
        QR.toDataURL(qr, { margin: 1, width: 320 })
          .then((u) => {
            entry.qrDataUrl = u;
          })
          .catch((e) => {
            entry.lastError = e?.message || "qr";
          });
        entry.status = "WAITING_FOR_SCAN";
        logger.info({ key }, "waiting for QR scan");
      }
      if (connection === "close") {
        const st =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error?.output?.statusCode
            : 0;
        const reason = lastDisconnect?.error?.message || "closed";
        entry.status = "disconnected";
        entry.lastError = reason;
        entry.sock = null;
        if (st !== DisconnectReason.loggedOut) {
          entry.qr = null;
          entry.qrDataUrl = null;
        }
        logger.warn({ key, st, reason }, "connection closed");
        entry.startPromise = null;
      } else if (connection === "open") {
        entry.status = "CONNECTED";
        entry.qr = null;
        entry.qrDataUrl = null;
        entry.lastError = null;
        logger.info({ key }, "connected");
      } else {
        if (isOnline) entry.status = "CONNECTED";
      }
    });
  })();

  return entry.startPromise;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, connections: connections.size });
});

app.get("/v1/connections", requireToken, (_req, res) => {
  const list = [];
  for (const [id, e] of connections) {
    list.push({
      id,
      label: e.label,
      status: e.status,
    });
  }
  if (list.length === 0) {
    return res.json([{ id: "default", label: "default", status: "disconnected" }]);
  }
  return res.json(list);
});

app.post("/v1/connections", requireToken, (req, res) => {
  const label = (req.body?.label && String(req.body.label)) || "connection";
  const id =
    (req.body?.id && String(req.body.id).trim().replace(/[^a-z0-9_-]/gi, "")) ||
    `c_${Date.now().toString(36)}`;
  if (connections.has(id)) {
    return res.status(409).json({ error: "id_exists", id });
  }
  const { entry, key } = ensureEntry(id);
  entry.label = label;
  void startConnection(key);
  return res.json({ id: key, label, status: entry.status });
});

app.delete("/v1/connections/:id", requireToken, async (req, res) => {
  const { id } = req.params;
  const e = connections.get(id);
  if (!e) return res.status(404).json({ error: "not found" });
  try {
    if (e.sock) {
      await e.sock.end(undefined);
    }
  } catch (_) {
    /* */
  }
  connections.delete(id);
  return res.json({ ok: true });
});

app.get("/v1/connections/:id/status", requireToken, async (req, res) => {
  const { id } = req.params;
  if (!connections.has(id)) ensureEntry(id);
  const e = connections.get(id);
  if (e && !e.sock && e.status === "disconnected") {
    void startConnection(id);
  }
  if (!e) {
    return res.json({ status: "DISCONNECTED", connected: false });
  }
  const s = e.status || "disconnected";
  return res.json({
    status: s,
    connected: s === "CONNECTED" || s === "connected" || s === "open",
  });
});

app.get("/v1/connections/:id/qr", requireToken, async (req, res) => {
  const { id } = req.params;
  const clear = req.query.clear === "1" || req.query.clear === "true";
  if (!connections.has(id)) ensureEntry(id);
  const e = connections.get(id);
  if (clear) {
    e.qr = null;
    e.qrDataUrl = null;
  }
  if (e && !e.sock) {
    await startConnection(id);
  }
  await new Promise((r) => setTimeout(r, 150));
  const re = connections.get(id);
  if (re?.status === "CONNECTED") {
    return res.json({ status: "CONNECTED" });
  }
  const img = re?.qrDataUrl || re?.qr;
  return res.json({
    status: re?.status || "WAITING_FOR_SCAN",
    qr: re?.qr || null,
    qrImageUrl: typeof re?.qrDataUrl === "string" ? re.qrDataUrl : null,
  });
});

app.post("/v1/connections/:id/pairing", requireToken, async (req, res) => {
  const { id } = req.params;
  const phoneNumber = (req.body?.phoneNumber && String(req.body.phoneNumber)) || "";
  if (!phoneNumber) {
    return res.status(400).json({ error: "phoneNumber required" });
  }
  if (!connections.has(id)) ensureEntry(id);
  await startConnection(id);
  const e = connections.get(id);
  if (!e?.sock) {
    return res.json({ error: "Socket not ready", code: 503 });
  }
  try {
    const code = await e.sock.requestPairingCode(phoneNumber);
    return res.json({ code });
  } catch (err) {
    const msg = err?.message || String(err);
    return res.status(400).json({ error: msg });
  }
});

app.post("/v1/messages", requireToken, async (req, res) => {
  const connectionId = (req.body?.connectionId && String(req.body.connectionId)) || "default";
  const to = req.body?.to;
  const text = req.body?.text;
  if (!to || !text) {
    return res.status(400).json({ error: "to and text required" });
  }
  const jid = jidFromDigits(to);
  if (!jid) {
    return res.status(400).json({ error: "invalid to" });
  }
  if (!connections.has(connectionId)) ensureEntry(connectionId);
  const e = connections.get(connectionId);
  if (!e?.sock) {
    await startConnection(connectionId);
    await new Promise((r) => setTimeout(r, 500));
  }
  const s2 = connections.get(connectionId);
  if (s2?.status !== "CONNECTED" && s2?.sock) {
    /* wait a bit for connection */
  }
  const sock = connections.get(connectionId)?.sock;
  if (!sock) {
    return res.status(503).json({ error: "not_connected" });
  }
  try {
    await sock.sendMessage(jid, { text: String(text) });
    return res.json({ ok: true, id: Date.now() });
  } catch (e2) {
    return res.status(500).json({ error: e2?.message || "send failed" });
  }
});

app.listen(port, () => {
  logger.info({ port, sessionsRoot }, "WhatsApp service listening");
});
