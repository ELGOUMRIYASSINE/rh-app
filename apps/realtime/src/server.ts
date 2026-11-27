/**
 * YGHR realtime server (Socket.IO). Rooms: `org:{organizationId}` and `user:{userId}`.
 * Browsers authenticate with a 2-minute token from GET /api/realtime/token.
 * The web app and the worker publish events with POST /internal/emit (shared secret).
 */
import { createServer, type IncomingMessage } from "node:http";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { config } from "dotenv";
import { jwtVerify } from "jose";
import { Server } from "socket.io";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const PORT = Number(process.env.REALTIME_PORT ?? 3001);
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "");
const INTERNAL = process.env.REALTIME_INTERNAL_SECRET ?? "";
const ORIGINS = (process.env.REALTIME_CORS_ORIGINS ?? process.env.APP_URL ?? "http://localhost:3000").split(",").map((s) => s.trim());
const EVENTS = new Set(["punch:new", "attendance:update", "device:status", "notification:new", "leave:updated", "planning:published", "message:new"]);

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

async function readJson(req: IncomingMessage, limit = 256_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const http = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount }));
    return;
  }
  if (req.method === "POST" && req.url === "/internal/emit") {
    if (!safeEqual(String(req.headers["x-internal-secret"] ?? ""), INTERNAL)) {
      res.writeHead(401).end();
      return;
    }
    try {
      const { organizationId, event, payload, userId } = (await readJson(req)) as { organizationId: string; event: string; payload: unknown; userId?: string };
      if (!organizationId || !EVENTS.has(event)) throw new Error("bad event");
      if (userId) io.to(`user:${userId}`).emit(event, payload);
      else io.to(`org:${organizationId}`).emit(event, payload);
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
    return;
  }
  res.writeHead(404).end();
});

// In development, also accept the app opened from a LAN address (http://10.x / 192.168.x / 172.16-31.x:3000).
const PRIVATE = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
const allowOrigin = (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) =>
  cb(null, !origin || ORIGINS.includes(origin) || (process.env.NODE_ENV !== "production" && PRIVATE.test(origin)));
const io = new Server(http, { cors: { origin: allowOrigin, credentials: true }, pingInterval: 20_000, pingTimeout: 15_000 });

io.use(async (socket, next) => {
  try {
    const token = (socket.handshake.auth as { token?: string })?.token;
    if (!token) return next(new Error("unauthorized"));
    const { payload } = await jwtVerify(token, SECRET, { issuer: "yghr-rt" });
    socket.data.userId = payload.sub;
    socket.data.organizationId = payload.org;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  void socket.join(`org:${socket.data.organizationId}`);
  void socket.join(`user:${socket.data.userId}`);
});

http.listen(PORT, () => console.log(`[realtime] Socket.IO prêt sur :${PORT} (origines : ${ORIGINS.join(", ")})`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => io.close(() => process.exit(0)));
