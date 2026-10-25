import { Router } from "express";
import {
  parse,
  projectCreate,
  projectUpdate,
  mediaInput,
} from "../../security/validation.js";

export function createProjectsRouter(service, security) {
  const router = Router();
  for (const param of ["id", "mediaId"]) {
    router.param(param, (req, res, next, value) => {
      if (
        !/^\d+$/.test(value) ||
        Number(value) < 1 ||
        Number(value) > 2147483647
      )
        return res
          .status(400)
          .json({ message: "Informe um id inteiro positivo." });
      next();
    });
  }
  router.get("/get", async (req, res) => res.json(await service.list()));
  router.get("/catalog", async (req, res) => res.json(await service.catalog()));
  router.get("/get/:id", async (req, res) => {
    const project = await service.findById(Number(req.params.id));
    if (!project)
      return res.status(404).json({ message: "Projeto não encontrado." });
    res.json(project);
  });
  router.post("/create", async (req, res) =>
    res.status(201).json(await service.create(parse(projectCreate, req.body))),
  );
  router.patch("/edit/:id", async (req, res) =>
    res.json(
      await service.update(
        Number(req.params.id),
        parse(projectUpdate, req.body),
      ),
    ),
  );
  router.delete("/delete/:id", async (req, res) => {
    await service.remove(Number(req.params.id));
    res.status(204).end();
  });
  router.post(
    "/:id/media/create",
    security.upload("arquivo", "media", async (req, res) => {
      if (!req.file)
        return res.status(400).json({ message: "Envie uma imagem ou vídeo." });
      const { ordem = 0 } = parse(mediaInput, req.body || {});
      res
        .status(201)
        .json(await service.addMedia(Number(req.params.id), req.file, ordem));
    }),
  );
  router.delete("/:id/media/delete/:mediaId", async (req, res) => {
    await service.removeMedia(
      Number(req.params.id),
      Number(req.params.mediaId),
    );
    res.status(204).end();
  });
  router.use((error, req, res, next) => {
    if (error.code === "P2025")
      return res.status(404).json({ message: "Projeto não encontrado." });
    if (error.code === "MEDIA_NOT_FOUND")
      return res
        .status(404)
        .json({ message: "Mídia não encontrada neste projeto." });
    if (error.code === "INVALID_TECHNOLOGIES")
      return res
        .status(400)
        .json({ message: "Uma ou mais tecnologias não existem." });
    if (error.code === "P2003")
      return res
        .status(409)
        .json({ message: "Referência inexistente ou registro vinculado." });
    next(error);
  });
  return router;
}
