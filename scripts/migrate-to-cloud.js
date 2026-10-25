// Copia os dados locais para o banco de DATABASE_URL (ex.: TiDB Cloud).
// - SOURCE_DATABASE_URL (opcional): MySQL local com usuário, tecnologias e projetos.
// - data/security.sqlite3: conta administrativa criada antes da mudança para o MySQL.
// - data/uploads/curriculo.pdf: currículo guardado em disco.
// Registros que já existem no destino são mantidos; pode ser executado mais de uma vez.
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { databaseUrl } from "../src/config/database-url.js";

const file = (path) => new URL(`../data/${path}`, import.meta.url);
const target = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const source = process.env.SOURCE_DATABASE_URL
  ? new PrismaClient({
      datasources: { db: { url: process.env.SOURCE_DATABASE_URL } },
    })
  : null;

try {
  if (source) {
    // Ordem sem dependências: os IDs originais são preservados.
    for (const table of [
      "user",
      "tecnologias",
      "projetos",
      "projeto_tecnologias",
      "projeto_midias",
    ]) {
      const rows = await source[table].findMany();
      const { count } = await target[table].createMany({
        data: rows,
        skipDuplicates: true,
      });
      console.log(`${table}: ${count} de ${rows.length} registros copiados.`);
    }
  } else {
    console.log("SOURCE_DATABASE_URL não definido: dados do portfólio ignorados.");
  }

  if (existsSync(file("security.sqlite3"))) {
    const sqlite = new DatabaseSync(file("security.sqlite3"), { readOnly: true });
    const admin = sqlite.prepare("SELECT email, salt, hash FROM admin WHERE id=1").get();
    sqlite.close();
    if (admin && !(await target.admin_conta.findUnique({ where: { id: 1 } }))) {
      await target.admin_conta.create({ data: { id: 1, ...admin } });
      console.log(`Administrador ${admin.email} copiado.`);
    } else console.log("Administrador: nada a copiar.");
  }

  if (existsSync(file("uploads/curriculo.pdf"))) {
    const conteudo = readFileSync(file("uploads/curriculo.pdf"));
    const { count } = await target.curriculo_arquivo.createMany({
      data: [{ id: 1, conteudo }],
      skipDuplicates: true,
    });
    console.log(count ? "Currículo copiado." : "Currículo: já existia no destino.");
  }
} finally {
  await target.$disconnect();
  await source?.$disconnect();
}
