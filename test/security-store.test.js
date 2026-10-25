// Integração com um MySQL real. Execute com TEST_DATABASE_URL apontando para um
// banco descartável já criado por `npm run db:push`; sem a variável, é ignorado.
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { openSecurityStore } from "../src/security/store.js";
import { createResumeStorage } from "../src/integrations/resumeStorage.js";

const url = process.env.TEST_DATABASE_URL;

test("sessions, upload quota and resume persist in MySQL", { skip: !url }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.admin_sessoes.deleteMany();
    await prisma.upload_cota.deleteMany();
    const store = openSecurityStore(prisma);
    const password = "senha-de-teste-bem-longa";
    await store.configure(" Admin@Exemplo.com ", password);
    assert.equal(await store.login("admin@exemplo.com", "senha-errada-mas-longa"), null);

    const tokens = [];
    for (let i = 0; i < 6; i++)
      tokens.push((await store.login("admin@exemplo.com", password)).token);
    // A sessão mais antiga é descartada ao passar de cinco.
    assert.equal(await store.session(tokens[0]), null);
    assert.equal((await store.session(tokens[5])).admin.email, "admin@exemplo.com");
    await store.revoke(tokens[5]);
    assert.equal(await store.session(tokens[5]), null);
    await store.configure("admin@exemplo.com", password);
    assert.equal(await store.session(tokens[4]), null);

    assert.equal(await store.reserveUpload(60, 100), true);
    assert.equal(await store.reserveUpload(60, 100), false);
    await store.refundUpload(50);
    assert.equal(await store.reserveUpload(60, 100), true);
    assert.equal(await store.reserveUpload(101, 100), false);

    const resume = createResumeStorage(prisma);
    await resume.remove();
    assert.equal(await resume.exists(), false);
    await resume.save(Buffer.from("%PDF-1.4 teste"));
    assert.equal((await resume.read()).toString(), "%PDF-1.4 teste");
    await resume.remove();
    assert.equal(await resume.read(), null);
  } finally {
    await prisma.$disconnect();
  }
});
