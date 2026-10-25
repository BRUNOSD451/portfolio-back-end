import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const digest = (token) => createHash("sha256").update(token).digest("hex");
const today = () => new Date().toISOString().slice(0, 10);
export const SESSION_MS = 8 * 60 * 60 * 1000;

// Os dados ficam no MySQL: hospedagens gratuitas apagam o disco a cada reinício.
export function openSecurityStore(prisma) {
  return {
    async configure(email, password) {
      const salt = randomBytes(16).toString("hex");
      const hash = (await derive(password, salt, 64, options)).toString("hex");
      const data = { email: email.trim().toLowerCase(), salt, hash };
      // Trocar a senha invalida todas as sessões, inclusive na API Python.
      await prisma.$transaction([
        prisma.admin_conta.upsert({
          where: { id: 1 },
          create: { id: 1, ...data },
          update: data,
        }),
        prisma.admin_sessoes.deleteMany(),
      ]);
    },
    async login(email, password) {
      const admin = await prisma.admin_conta.findUnique({ where: { id: 1 } });
      if (!admin) return null;
      const hash = await derive(password, admin.salt, 64, options);
      const valid = timingSafeEqual(hash, Buffer.from(admin.hash, "hex"));
      if (
        !valid ||
        email.trim().toLowerCase() !== admin.email ||
        (await prisma.admin_conta.findUnique({ where: { id: 1 } }))?.hash !==
          admin.hash
      )
        return null;
      const now = Date.now();
      const token = randomBytes(32).toString("base64url");
      await prisma.admin_sessoes.deleteMany({
        where: { expira_em: { lte: now } },
      });
      await prisma.admin_sessoes.create({
        data: {
          digest: digest(token),
          expira_em: now + SESSION_MS,
          criado_em: now,
        },
      });
      // Mantém no máximo cinco sessões, descartando as mais antigas.
      const extra = await prisma.admin_sessoes.findMany({
        orderBy: { criado_em: "desc" },
        skip: 5,
        select: { digest: true },
      });
      if (extra.length)
        await prisma.admin_sessoes.deleteMany({
          where: { digest: { in: extra.map((row) => row.digest) } },
        });
      return {
        token,
        expiresAt: now + SESSION_MS,
        admin: { email: admin.email, role: "admin" },
      };
    },
    async session(token) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token || "")) return null;
      const [row, admin] = await Promise.all([
        prisma.admin_sessoes.findUnique({ where: { digest: digest(token) } }),
        prisma.admin_conta.findUnique({
          where: { id: 1 },
          select: { email: true },
        }),
      ]);
      if (!row || !admin || Number(row.expira_em) <= Date.now()) return null;
      return {
        admin: { email: admin.email, role: "admin" },
        expiresAt: Number(row.expira_em),
      };
    },
    async revoke(token) {
      await prisma.admin_sessoes.deleteMany({
        where: { digest: digest(token) },
      });
    },
    async reserveUpload(bytes, limit) {
      if (bytes > limit) return false;
      const day = today();
      await prisma.upload_cota.deleteMany({ where: { dia: { lt: day } } });
      await prisma.$executeRaw`INSERT IGNORE INTO upload_cota (dia, bytes) VALUES (${day}, 0)`;
      // Atualização condicional e atômica: requisições simultâneas não ultrapassam o limite.
      const changed = await prisma.$executeRaw`UPDATE upload_cota SET bytes = bytes + ${bytes} WHERE dia = ${day} AND bytes + ${bytes} <= ${limit}`;
      return changed === 1;
    },
    async refundUpload(bytes) {
      await prisma.$executeRaw`UPDATE upload_cota SET bytes = GREATEST(0, bytes - ${bytes}) WHERE dia = ${today()}`;
    },
    close() {},
  };
}
