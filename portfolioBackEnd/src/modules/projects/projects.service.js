export function createProjectsService({ prisma, uploadMedia }) {
  return {
    async catalog() {
      const [projects, links, technologies] = await prisma.$transaction([
        prisma.projetos.findMany({
          select: { id: true, nome: true, descricao: true },
          orderBy: { id: "asc" },
        }),
        prisma.projeto_tecnologias.findMany({
          select: { projeto_id: true, tecnologia_id: true },
        }),
        prisma.tecnologias.findMany({
          select: { id: true, nome: true }, orderBy: { id: "asc" },
        }),
      ]);
      const byId = new Map(technologies.map((tech) => [tech.id, tech]));
      const usages = new Map();
      for (const link of links) {
        if (!usages.has(link.projeto_id)) usages.set(link.projeto_id, []);
        const tech = byId.get(link.tecnologia_id);
        if (tech) usages.get(link.projeto_id).push(tech);
      }
      return projects.map((project) => ({
        ...project,
        tecnologias: (usages.get(project.id) || []).sort((a, b) => a.id - b.id),
      }));
    },

    async update(id, { nome, descricao, tecnologias }) {
      // Projeto e vínculos mudam juntos; uma tecnologia inválida desfaz toda a edição.
      return prisma.$transaction(async (tx) => {
        const data = {};
        if (nome !== undefined) data.nome = nome;
        if (descricao !== undefined) data.descricao = descricao;
        const projeto = await tx.projetos.update({ where: { id }, data });
        if (tecnologias !== undefined) {
          const ids = [...new Set(tecnologias)];
          const existing = await tx.tecnologias.findMany({
            where: { id: { in: ids } },
            select: { id: true },
          });
          if (existing.length !== ids.length) {
            throw Object.assign(new Error("Tecnologias inexistentes."), {
              code: "INVALID_TECHNOLOGIES",
            });
          }
          await tx.projeto_tecnologias.deleteMany({
            where: { projeto_id: id },
          });
          if (ids.length)
            await tx.projeto_tecnologias.createMany({
              data: ids.map((tecnologia_id) => ({
                projeto_id: id,
                tecnologia_id,
              })),
            });
        }
        const vinculos = await tx.projeto_tecnologias.findMany({
          where: { projeto_id: id },
        });
        return {
          ...projeto,
          tecnologias: vinculos.map((v) => v.tecnologia_id),
        };
      });
    },

    async remove(id) {
      return prisma.$transaction(async (tx) => {
        await tx.projeto_midias.deleteMany({ where: { projeto_id: id } });
        await tx.projeto_tecnologias.deleteMany({ where: { projeto_id: id } });
        await tx.projetos.delete({ where: { id } });
      });
    },

    async addMedia(id, file, ordem) {
      // Só envia ao Cloudinary após confirmar que o projeto existe.
      const projeto = await prisma.projetos.findUnique({ where: { id } });
      if (!projeto)
        throw Object.assign(new Error("Projeto não encontrado."), {
          code: "P2025",
        });
      const tipo = file.mimetype.startsWith("video/") ? "video" : "imagem";
      const result = await uploadMedia(
        file.buffer,
        file.originalname,
        "projetos",
        tipo === "video" ? "video" : "image",
      );
      return prisma.projeto_midias.create({
        data: { projeto_id: id, tipo, url: result.secure_url, ordem },
      });
    },

    async removeMedia(id, mediaId) {
      const result = await prisma.projeto_midias.deleteMany({
        where: { id: mediaId, projeto_id: id },
      });
      if (!result.count)
        throw Object.assign(new Error("Mídia não encontrada."), {
          code: "MEDIA_NOT_FOUND",
        });
    },

    list: () =>
      prisma.projetos.findMany({
        select: { id: true, nome: true, descricao: true },
        orderBy: { id: "asc" },
      }),

    async findById(id) {
      const projeto = await prisma.projetos.findUnique({
        where: { id },
        select: { nome: true },
      });
      if (!projeto) return null;

      const vinculos = await prisma.projeto_tecnologias.findMany({
        where: { projeto_id: id },
        select: { tecnologia_id: true },
      });
      const [tecnologias, midias] = await Promise.all([
        prisma.tecnologias.findMany({
          where: {
            id: { in: vinculos.map((vinculo) => vinculo.tecnologia_id) },
          },
          select: { nome: true, imagem: true },
          orderBy: { id: "asc" },
        }),
        prisma.projeto_midias.findMany({
          where: { projeto_id: id },
          select: { id: true, url: true, tipo: true, ordem: true },
          orderBy: [{ ordem: "asc" }, { id: "asc" }],
        }),
      ]);
      return { ...projeto, tecnologias, midias };
    },

    async create({ nome, descricao, tecnologias }) {
      const ids = [...new Set(tecnologias)];

      return prisma.$transaction(async (tx) => {
        const existing = await tx.tecnologias.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        });
        if (existing.length !== ids.length) {
          throw Object.assign(
            new Error("Uma ou mais tecnologias não existem."),
            { code: "INVALID_TECHNOLOGIES" },
          );
        }

        const projeto = await tx.projetos.create({ data: { nome, descricao } });
        if (ids.length) {
          await tx.projeto_tecnologias.createMany({
            data: ids.map((tecnologia_id) => ({
              projeto_id: projeto.id,
              tecnologia_id,
            })),
          });
        }
        return { ...projeto, tecnologias: ids };
      });
    },
  };
}
