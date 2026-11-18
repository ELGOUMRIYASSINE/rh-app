#!/usr/bin/env node
// Dev fallback when Docker is not available: runs PostgreSQL from the `embedded-postgres`
// npm package on port 54329, data in ./.pgdata. Usage: pnpm db:local (Ctrl+C to stop)
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

const URL = "postgresql://yghr:yghr@localhost:54329/yghr";
const dataDir = path.resolve(import.meta.dirname, "../.pgdata");
const pidFile = path.join(dataDir, "postmaster.pid");

// A previous run may still be alive (another terminal) or may have crashed and left its lock file.
if (fs.existsSync(pidFile)) {
  const pid = Number(fs.readFileSync(pidFile, "utf8").split("\n")[0]);
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {}
  if (alive) {
    console.log(`PostgreSQL tourne déjà (PID ${pid}) : ${URL}`);
    console.log(`Rien à faire. Pour l'arrêter : kill ${pid}`);
    process.exit(0);
  }
  console.log(`Ancien verrou trouvé (PID ${pid} arrêté) : nettoyage…`);
  fs.rmSync(pidFile);
}

const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "yghr", password: "yghr", port: 54329, persistent: true });

try {
  if (fresh) await pg.initialise();
  await pg.start();
} catch (e) {
  console.error("\nImpossible de démarrer PostgreSQL.", e instanceof Error ? e.message : "");
  console.error("Vérifiez que le port 54329 est libre :  ss -ltnp | grep 54329");
  process.exit(1);
}
try {
  await pg.createDatabase("yghr");
} catch {
  /* already exists */
}
console.log(`\nPostgreSQL prêt : ${URL}  (Ctrl+C pour arrêter)`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
