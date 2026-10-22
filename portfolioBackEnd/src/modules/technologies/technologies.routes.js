import { Router } from "express";
import { parse, technologyInput } from "../../security/validation.js";

export function createTechnologiesRouter(service, security) {
  const router = Router();
  router.param("id", (req, res, next, value) => {
    const id = Number(value);
    if (
      !/^\d+$/.test(value) ||
      !Number.isInteger(id) ||
      id < 1 ||
      id > 2147483647
    )
      return res
        .status(400)
        .json({ message: "Informe um id inteiro positivo." });
    res.locals.technologyId = id;
    next();
  });
  router.get("/get", async (req, res) => res.json(await service.list()));
  router.post(
    "/create",
    security.upload("imagem", "image", async (req, res) => {
      const { nome } = parse(technologyInput, req.body || {});
      if (!nome || !req.file)
        return res.status(400).json({ message: "Informe nome e imagem." });
      res.status(201).json(await service.create(nome, req.file));
    }),
  );
  router.patch(
    "/edit/:id",
    security.upload("imagem", "image", async (req, res) => {
      const { nome } = parse(technologyInput, req.body || {});
      if (nome === undefined && !req.file)
        return res
          .status(400)
          .json({ message: "Informe nome ou imagem para atualizar." });
      res.json(await service.update(res.locals.technologyId, nome, req.file));
    }),
  );
  router.delete("/delete/:id", async (req, res) => {
    await service.remove(res.locals.technologyId);
    res.status(204).end();
  });
  router.use((error, req, res, next) => {
    const errors = {
      P2025: [404, "Tecnologia não encontrada."],
      P2002: [409, "Tecnologia já cadastrada."],
      P2003: [409, "Tecnologia vinculada a outros registros."],
    };
    const response = errors[error.code];
    if (!response) return next(error);
    res.status(response[0]).json({ message: response[1] });
  });
  return router;
}
