import { Router } from "express";
import { parse, profileInput } from "../../security/validation.js";

export function createUsersRouter(service, security) {
  const router = Router();
  router.get("/get", async (req, res) => res.json(await service.list()));
  router.patch("/edit", async (req, res) => {
    const data = parse(profileInput, req.body);
    delete data.id;
    // O servidor determina qual perfil pode ser editado.
    res.json(await service.update(1, data));
  });
  router.post(
    "/photo",
    security.upload("photo", "image", async (req, res) => {
      if (!req.file)
        return res.status(400).json({ message: "Selecione uma foto." });
      if (Object.keys(req.body || {}).length)
        return res.status(400).json({ message: "Envie apenas a foto." });
      const result = await service.updatePhoto(req.file);
      res.status(201).json({ url: result.secure_url });
    }),
  );
  router.post(
    "/resume",
    security.upload("resume", "pdf", async (req, res) => {
      if (!req.file)
        return res.status(400).json({ message: "Selecione um PDF." });
      if (Object.keys(req.body || {}).length)
        return res.status(400).json({ message: "Envie apenas o currículo." });
      res.status(201).json({ url: await service.updateResume(req.file) });
    }),
  );
  router.delete("/resume", async (req, res) => {
    await service.removeResume();
    res.status(204).end();
  });
  // /resume abre no navegador; /resume/download entrega como anexo.
  const sendResume = (disposition) => async (req, res) => {
    const resume = await service.resume();
    if (resume?.file) {
      const name = resume.nome
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return res.sendFile(resume.file, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposition}; filename="Curriculo${name ? `-${name}` : ""}.pdf"`,
          // Mesmo endereço para versões novas: o navegador revalida a cada acesso.
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    // Compatibilidade com um link externo cadastrado antes do upload local.
    if (resume?.link && /^https?:\/\//i.test(resume.link))
      return res.redirect(302, resume.link);
    res.status(404).json({ message: "Currículo não cadastrado." });
  };
  router.get("/resume", sendResume("inline"));
  router.get("/resume/download", sendResume("attachment"));
  router.use((error, req, res, next) => {
    if (error.code === "P2025")
      return res.status(404).json({ message: "Usuário não encontrado." });
    if (error.code === "P2002")
      return res.status(409).json({ message: "E-mail já cadastrado." });
    next(error);
  });
  return router;
}
