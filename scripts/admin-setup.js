import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { prisma } from "../src/integrations/prisma.js";
import { openSecurityStore } from "../src/security/store.js";
import { adminCredentials } from "../src/security/validation.js";

if (!process.stdin.isTTY)
  throw new Error(
    "Execute em um terminal interativo para cadastrar a senha sem expô-la.",
  );
let hidden = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!hidden) process.stdout.write(chunk, encoding);
    callback();
  },
});
const input = createInterface({ input: process.stdin, output, terminal: true });
const store = openSecurityStore(prisma);
try {
  console.log(
    "Configurar administrador. Isso também revoga as sessões anteriores.",
  );
  const email = await input.question("E-mail: ");
  process.stdout.write("Senha (15 a 128 caracteres; entrada oculta): ");
  hidden = true;
  const password = await input.question("");
  process.stdout.write("\nConfirme a senha: ");
  const confirmation = await input.question("");
  hidden = false;
  console.log();
  if (password !== confirmation) throw new Error("As senhas não coincidem.");
  const validated = adminCredentials.safeParse({ email, password });
  if (!validated.success) {
    // Exibe somente as regras violadas, nunca os valores informados.
    throw new Error(validated.error.issues.map((issue) => issue.message).join("\n"));
  }
  await store.configure(validated.data.email, validated.data.password);
  console.log("Administrador configurado. Você já pode entrar no app.");
} catch (error) {
  hidden = false;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  input.close();
  await prisma.$disconnect();
}
