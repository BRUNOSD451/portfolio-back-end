import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMessagesService } from "../src/modules/messages/messages.service.js";
import { createMessagesRouter } from "../src/modules/messages/messages.routes.js";
import { errorHandler } from "../src/middlewares/errors.js";

test("messages are saved only with the agent API key", async () => {
  const saved = [];
  const service = createMessagesService({ prisma: { messages: {
    create: async ({ data }) => { saved.push(data); return { id: saved.length, ...data }; },
  } } });
  const app = express();
  app.use(express.json());
  const apiKey = "k".repeat(32);
  app.use("/messages", createMessagesRouter(service, { authenticate: (req, res) => res.status(401).end(), apiKey }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const post = (body, key) => fetch(`http://127.0.0.1:${server.address().port}/messages/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key && { "X-Api-Key": key }) },
    body: JSON.stringify(body),
  });
  try {
    assert.equal((await post({ conteudo: "Oi" })).status, 401);
    assert.equal((await post({ conteudo: "Oi" }, "errada")).status, 401);
    assert.equal((await post({ conteudo: "" }, apiKey)).status, 400);
    const response = await post({ conteudo: " Olá, vaga React ", sessao: "abc" }, apiKey);
    assert.equal(response.status, 201);
    assert.deepEqual(saved, [{ conteudo: "Olá, vaga React", sessao: "abc" }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
