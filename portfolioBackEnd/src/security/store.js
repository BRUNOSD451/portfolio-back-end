import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const digest = (token) => createHash("sha256").update(token).digest("hex");
export const SESSION_MS = 8 * 60 * 60 * 1000;

export function openSecurityStore(
  filename = process.env.AUTH_DATABASE_PATH ||
    fileURLToPath(new URL("../../data/security.sqlite3", import.meta.url)),
) {
  if (filename !== ":memory:")
    mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, expires INTEGER NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS upload_budget (day TEXT PRIMARY KEY, bytes INTEGER NOT NULL);
  `);
  return {
    async configure(email, password) {
      const salt = randomBytes(16).toString("hex");
      const hash = (await derive(password, salt, 64, options)).toString("hex");
      // Trocar a senha invalida todas as sessões, inclusive na API Python.
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT OR REPLACE INTO admin VALUES (1, ?, ?, ?)").run(
          email.trim().toLowerCase(),
          salt,
          hash,
        );
        db.exec("DELETE FROM sessions; COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async login(email, password) {
      const admin = db.prepare("SELECT * FROM admin WHERE id=1").get();
      if (!admin) return null;
      const hash = await derive(password, admin.salt, 64, options);
      const valid = timingSafeEqual(hash, Buffer.from(admin.hash, "hex"));
      if (
        !valid ||
        email.trim().toLowerCase() !== admin.email ||
        db.prepare("SELECT hash FROM admin WHERE id=1").get()?.hash !==
          admin.hash
      )
        return null;
      const now = Date.now();
      const token = randomBytes(32).toString("base64url");
      db.prepare("DELETE FROM sessions WHERE expires <= ?").run(now);
      db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(
        digest(token),
        now + SESSION_MS,
        now,
      );
      db.exec(
        "DELETE FROM sessions WHERE digest NOT IN (SELECT digest FROM sessions ORDER BY created DESC, rowid DESC LIMIT 5)",
      );
      return {
        token,
        expiresAt: now + SESSION_MS,
        admin: { email: admin.email, role: "admin" },
      };
    },
    session(token) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token || "")) return null;
      const row = db
        .prepare(
          "SELECT email, expires FROM sessions CROSS JOIN admin WHERE digest=? AND expires>? AND admin.id=1",
        )
        .get(digest(token), Date.now());
      return row
        ? { admin: { email: row.email, role: "admin" }, expiresAt: row.expires }
        : null;
    },
    revoke(token) {
      db.prepare("DELETE FROM sessions WHERE digest=?").run(digest(token));
    },
    reserveUpload(bytes, limit) {
      if (bytes > limit) return false;
      const day = new Date().toISOString().slice(0, 10);
      db.prepare("DELETE FROM upload_budget WHERE day < ?").run(day);
      const result = db
        .prepare(
          `INSERT INTO upload_budget VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET bytes=bytes+excluded.bytes WHERE bytes+excluded.bytes<=?`,
        )
        .run(day, bytes, limit);
      return result.changes === 1 && bytes <= limit;
    },
    refundUpload(bytes) {
      db.prepare(
        "UPDATE upload_budget SET bytes=MAX(0, bytes-?) WHERE day=?",
      ).run(bytes, new Date().toISOString().slice(0, 10));
    },
    close() {
      db.close();
    },
  };
}
