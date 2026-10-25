import multer from "multer";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import ffprobe from "ffprobe-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const execute = promisify(execFile);
const MB = 1024 * 1024;
const rejectFile = (message) =>
  Object.assign(new Error(message), { status: 415 });

export async function validateMedia(file, allowVideo = false) {
  const detected = await fileTypeFromBuffer(file.buffer).catch(() => null);
  if (!detected) throw rejectFile("Não foi possível identificar o arquivo.");
  if (
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
      detected.mime,
    )
  ) {
    if (file.size > 5 * MB) throw rejectFile("Imagens devem ter até 5 MB.");
    try {
      // Decodifica e regrava: não confia no MIME, remove metadados e não aceita SVG.
      const image = sharp(file.buffer, {
        limitInputPixels: 20_000_000,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width > 8192 ||
        metadata.height > 8192
      )
        throw new Error("dimensions");
      file.buffer = await image.rotate().webp({ quality: 85 }).toBuffer();
      if (file.buffer.length > 5 * MB) throw new Error("size");
      file.size = file.buffer.length;
      file.mimetype = "image/webp";
      file.originalname = `${randomUUID()}.webp`;
      return;
    } catch {
      throw rejectFile(
        "Imagem inválida ou muito grande (máximo 20 megapixels e 8192 px por lado).",
      );
    }
  }
  if (
    !allowVideo ||
    !["video/mp4", "video/quicktime", "video/webm"].includes(detected.mime)
  )
    throw rejectFile(
      "Use JPEG, PNG, WebP ou GIF; projetos também aceitam MP4, MOV e WebM.",
    );
  const folder = await mkdtemp(join(tmpdir(), "portfolio-media-"));
  const filename = join(folder, `upload.${detected.ext}`);
  try {
    await writeFile(filename, file.buffer, { mode: 0o600 });
    // O processo não usa shell nem protocolos de rede; limita tempo e saída.
    const { stdout } = await execute(
      ffprobe.path,
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-format_whitelist",
        "mov,matroska,webm",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        filename,
      ],
      { timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true },
    );
    const info = JSON.parse(stdout);
    const videos = info.streams?.filter((s) => s.codec_type === "video") || [];
    const duration = Number(info.format?.duration);
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 120 ||
      videos.length !== 1 ||
      !videos[0].width ||
      !videos[0].height ||
      videos[0].width > 4096 ||
      videos[0].height > 4096 ||
      videos[0].width * videos[0].height > 4096 * 2160
    )
      throw new Error("metadata");
    file.mimetype = detected.mime;
    file.originalname = `${randomUUID()}.${detected.ext}`;
  } catch {
    throw rejectFile(
      "Vídeo inválido. Use até 120 segundos, 50 MB e resolução máxima equivalente a 4K.",
    );
  } finally {
    await unlink(filename).catch(() => {});
    await rmdir(folder);
  }
}

// Documentos públicos (currículo): somente PDF, identificado pelo conteúdo.
export async function validateDocument(file) {
  const detected = await fileTypeFromBuffer(file.buffer).catch(() => null);
  if (detected?.mime !== "application/pdf")
    throw rejectFile("Envie o currículo em PDF.");
  if (file.size > 5 * MB) throw rejectFile("O currículo deve ter até 5 MB.");
  file.mimetype = "application/pdf";
  file.originalname = `${randomUUID()}.pdf`;
}

// kind: "image" (imagens), "media" (imagens e vídeos) ou "pdf".
export function createUploadHandler(store) {
  let active = 0;
  return (field, kind, handler) => async (req, res, next) => {
    if (active >= 2)
      return res
        .status(429)
        .json({ message: "Há uploads em andamento. Aguarde." });
    const maximum = (kind === "media" ? 50 : 5) * MB;
    const multipart = Boolean(req.is("multipart/form-data"));
    if (multipart && !(await store.reserveUpload(maximum, 500 * MB)))
      return res
        .status(429)
        .json({ message: "Cota diária de upload atingida (500 MB)." });
    active++;
    try {
      const parser = multer({
        storage: multer.memoryStorage(),
        limits: {
          fileSize: maximum,
          files: 1,
          fields: 4,
          parts: 5,
          fieldSize: 1024,
          fieldNameSize: 50,
        },
      }).single(field);
      await new Promise((resolve, reject) => {
        const aborted = () =>
          reject(
            Object.assign(new Error("Upload interrompido."), { status: 400 }),
          );
        req.once("aborted", aborted);
        parser(req, res, (error) => {
          req.off("aborted", aborted);
          error ? reject(error) : resolve();
        });
      });
      if (req.aborted)
        throw Object.assign(new Error("Upload interrompido."), { status: 400 });
      const receivedBytes = req.file?.size || 0;
      if (req.file)
        await (kind === "pdf"
          ? validateDocument(req.file)
          : validateMedia(req.file, kind === "media"));
      if (multipart) await store.refundUpload(maximum - receivedBytes);
      await handler(req, res);
    } catch (error) {
      if (error instanceof multer.MulterError) {
        error.status = 400;
        error.message = `Envie um único arquivo no campo ${field}, dentro do limite de ${maximum / MB} MB.`;
      }
      next(error);
    } finally {
      active--;
    }
  };
}
