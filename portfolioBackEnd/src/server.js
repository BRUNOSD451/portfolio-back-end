import { env } from "./config/env.js";
import { prisma } from "./integrations/prisma.js";
import { uploadImage, uploadMedia } from "./integrations/cloudinary.js";
import { createResumeStorage } from "./integrations/resumeStorage.js";
import { createApp } from "./app.js";

const app = createApp({
  prisma,
  uploadImage,
  uploadMedia,
  resumeStorage: createResumeStorage(),
});
const server = app.listen(env.port, async () => {
  console.log(`Servidor disponível em http://localhost:${env.port}`);
  try {
    await prisma.$connect();
    console.log("MySQL conectado com sucesso!");
  } catch (error) {
    console.error(
      "Não foi possível conectar ao MySQL:",
      error.code || "Erro desconhecido",
    );
  }
});
server.requestTimeout = 120_000;
server.headersTimeout = 20_000;

server.on("error", async (error) => {
  console.error("Não foi possível iniciar o servidor:", error.code);
  await prisma.$disconnect();
  process.exitCode = 1;
});

let stopping = false;
// Aguarda as requisições em andamento antes de encerrar a conexão com o banco.
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(async () => {
    try {
      await prisma.$disconnect();
      app.locals.securityStore.close();
    } catch (error) {
      console.error(
        "Erro ao encerrar conexão com o banco:",
        error.code || error.name,
      );
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
