import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { messageInput, parse } from "../../security/validation.js";

const digest = (value) => createHash("sha256").update(value).digest();

// O servidor do agente de IA se identifica pelo cabeçalho X-Api-Key.
export function requireApiKey(apiKey) {
  const expected = apiKey && apiKey.length >= 32 ? digest(apiKey) : null;
  return (req, res, next) => {
    const received = req.get("x-api-key");
    if (!expected || !received || !timingSafeEqual(digest(received), expected))
      return res.status(401).json({ message: "Chave de API inválida." });
    next();
  };
}

export function createMessagesRouter(service, { authenticate, apiKey }) {
  const router = Router();
  router.get("/get", authenticate, async (req, res) => {
    const sessao = typeof req.query.sessao === "string" ? req.query.sessao : undefined;
    res.json(await service.list(sessao));
  });
  router.post("/create", requireApiKey(apiKey), async (req, res) => {
    res.status(201).json(await service.create(parse(messageInput, req.body || {})));
  });
  return router;
}
