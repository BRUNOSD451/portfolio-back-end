import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createProjectsService } from "../src/modules/projects/projects.service.js";
import { createProjectsRouter } from "../src/modules/projects/projects.routes.js";

test("catalog joins projects and technologies in three bulk queries", async () => {
  let queries = 0;
  const table = (rows) => ({ findMany: async () => { queries++; return rows; } });
  const service = createProjectsService({ prisma: {
    projetos: table([{ id: 1, nome: "Site", descricao: "Portfolio" }, { id: 2, nome: "Empty", descricao: null }]),
    projeto_tecnologias: table([{ projeto_id: 1, tecnologia_id: 3 }]),
    tecnologias: table([{ id: 3, nome: "React" }]),
    $transaction: (operations) => Promise.all(operations),
  } });
  const app = express();
  app.use("/projects", createProjectsRouter(service, { upload: () => (req, res) => res.end() }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/projects/catalog`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result[0].tecnologias, [{ id: 3, nome: "React" }]);
    assert.deepEqual(result[1].tecnologias, []);
    assert.equal(result[0].descricao, "Portfolio");
    assert.equal(queries, 3);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
