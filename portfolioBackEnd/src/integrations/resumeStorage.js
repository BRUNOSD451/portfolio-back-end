import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// O currículo fica no disco do servidor; há um único arquivo, do proprietário.
export function createResumeStorage(
  folder = process.env.UPLOADS_DIR ||
    fileURLToPath(new URL("../../data/uploads", import.meta.url)),
) {
  const path = join(resolve(folder), "curriculo.pdf");
  return {
    path,
    async exists() {
      return Boolean(await stat(path).catch(() => null));
    },
    async save(buffer) {
      await mkdir(resolve(folder), { recursive: true, mode: 0o700 });
      // Grava em um temporário e renomeia: quem baixa nunca recebe um PDF pela metade.
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, buffer, { mode: 0o600 });
      await rename(temporary, path);
    },
    remove: () => rm(path, { force: true }),
  };
}
