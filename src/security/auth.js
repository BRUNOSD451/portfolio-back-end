import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { credentials, parse } from "./validation.js";

export const bearerToken = (req) =>
  /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || "")?.[1];
export function requireAdmin(store) {
  return async (req, res, next) => {
    const token = bearerToken(req);
    const session = await store.session(token);
    if (!session)
      return res
        .status(401)
        .json({ message: "Sessão inválida ou expirada. Entre novamente." });
    res.locals.session = session;
    res.setHeader("Cache-Control", "no-store");
    next();
  };
}

export function limiter(limit, windowMs = 60_000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Muitas requisições. Aguarde e tente novamente." },
  });
}

export function createAuthRouter(store) {
  const router = Router();
  let active = 0;
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.post("/login", limiter(5, 15 * 60_000), async (req, res) => {
    const { email, password } = parse(credentials, req.body);
    if (active >= 2)
      return res.status(429).json({ message: "Aguarde e tente novamente." });
    active++;
    try {
      const session = await store.login(email, password);
      if (!session)
        return res.status(401).json({ message: "E-mail ou senha inválidos." });
      res.json(session);
    } finally {
      active--;
    }
  });
  router.get("/session", requireAdmin(store), (req, res) =>
    res.json(res.locals.session),
  );
  router.post("/logout", requireAdmin(store), async (req, res) => {
    await store.revoke(bearerToken(req));
    res.status(204).end();
  });
  return router;
}
