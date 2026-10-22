import express from "express";
import cors from "cors";
import { createUsersRouter } from "./modules/users/users.routes.js";
import { createUsersService } from "./modules/users/users.service.js";
import { createTechnologiesRouter } from "./modules/technologies/technologies.routes.js";
import { createTechnologiesService } from "./modules/technologies/technologies.service.js";
import { createProjectsRouter } from "./modules/projects/projects.routes.js";
import { createProjectsService } from "./modules/projects/projects.service.js";
import { notFound, errorHandler } from "./middlewares/errors.js";
import { openSecurityStore } from "./security/store.js";
import { createAuthRouter, requireAdmin, limiter } from "./security/auth.js";
import { createUploadHandler } from "./security/media.js";

// As integrações entram por parâmetro para separar a API das conexões externas.
export function createApp(dependencies) {
  const app = express();
  const store = dependencies.securityStore || openSecurityStore();
  app.locals.securityStore = store;
  const security = { upload: createUploadHandler(store) };
  app.disable("x-powered-by");
  // Só confie no proxy conhecido; por padrão X-Forwarded-For é ignorado.
  if (process.env.TRUSTED_PROXY)
    app.set(
      "trust proxy",
      process.env.TRUSTED_PROXY.split(",").map((v) => v.trim()),
    );
  const origins =
    process.env.CORS_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ||
    (process.env.NODE_ENV === "production"
      ? []
      : [
          "http://localhost:8081",
          "http://127.0.0.1:8081",
          "http://localhost:8082",
          "http://127.0.0.1:8082",
          "http://localhost:19006",
          "http://127.0.0.1:19006",
        ]);
  // Em desenvolvimento, o Expo web pode ser aberto pelo IP da rede local e
  // muda de porta quando a padrão está ocupada.
  const devLanOrigin =
    /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):\d+$/;
  const allowOrigin =
    process.env.CORS_ORIGINS || process.env.NODE_ENV === "production"
      ? origins
      : (origin, callback) =>
          callback(null, !origin || origins.includes(origin) || devLanOrigin.test(origin));
  app.use(
    cors({
      origin: allowOrigin,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(limiter(180));
  app.use(express.json({ limit: "64kb" }));
  app.use("/auth", createAuthRouter(store));
  const authenticate = requireAdmin(store);
  const writes = limiter(60);
  const uploads = limiter(20, 60 * 60_000);
  // Proteção central: novas rotas de escrita também exigem administrador.
  app.use(["/user", "/technologies", "/projects"], (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    authenticate(req, res, () =>
      writes(req, res, () =>
        req.is("multipart/form-data") ? uploads(req, res, next) : next(),
      ),
    );
  });
  app.use(
    "/user",
    createUsersRouter(createUsersService(dependencies), security),
  );
  app.use(
    "/technologies",
    createTechnologiesRouter(createTechnologiesService(dependencies), security),
  );
  app.use(
    "/projects",
    createProjectsRouter(createProjectsService(dependencies), security),
  );
  // Erros e rotas desconhecidas são tratados depois de todos os módulos.
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
