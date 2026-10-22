import "dotenv/config";

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("PORT deve ser um número inteiro entre 0 e 65535.");
}

export const env = { port };
