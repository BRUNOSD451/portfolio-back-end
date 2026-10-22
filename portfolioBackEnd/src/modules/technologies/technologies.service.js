export function createTechnologiesService({ prisma, uploadImage }) {
  const tecnologias = prisma.tecnologias;

  async function ensureAvailableName(nome, id) {
    const existing = await tecnologias.findUnique({ where: { nome } });
    if (existing && existing.id !== id) {
      throw Object.assign(new Error("Tecnologia já cadastrada."), {
        code: "P2002",
      });
    }
  }

  async function upload(file) {
    const result = await uploadImage(
      file.buffer,
      file.originalname,
      "tecnologias",
    );
    return result.secure_url;
  }

  return {
    list: () => tecnologias.findMany({ orderBy: { id: "asc" } }),

    async create(nome, file) {
      await ensureAvailableName(nome);
      const imagem = await upload(file);
      return tecnologias.create({ data: { nome, imagem } });
    },

    async update(id, nome, file) {
      // Evita enviar arquivos para um registro inexistente.
      const existing = await tecnologias.findUnique({ where: { id } });
      if (!existing) {
        throw Object.assign(new Error("Tecnologia não encontrada."), {
          code: "P2025",
        });
      }
      const data = {};
      if (nome !== undefined) {
        await ensureAvailableName(nome, id);
        data.nome = nome;
      }
      if (file) data.imagem = await upload(file);
      return tecnologias.update({ where: { id }, data });
    },

    remove: (id) => tecnologias.delete({ where: { id } }),
  };
}
