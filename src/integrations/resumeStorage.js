// O currículo fica no MySQL; há um único arquivo, do proprietário.
// Hospedagens gratuitas apagam o disco local a cada reinício.
export function createResumeStorage(prisma) {
  const where = { id: 1 };
  return {
    async exists() {
      return Boolean(
        await prisma.curriculo_arquivo.findUnique({
          where,
          select: { id: true },
        }),
      );
    },
    async read() {
      const row = await prisma.curriculo_arquivo.findUnique({ where });
      return row ? Buffer.from(row.conteudo) : null;
    },
    // Upsert é atômico: quem baixa nunca recebe um PDF pela metade.
    async save(buffer) {
      await prisma.curriculo_arquivo.upsert({
        where,
        create: { id: 1, conteudo: buffer },
        update: { conteudo: buffer },
      });
    },
    remove: () => prisma.curriculo_arquivo.deleteMany({ where }),
  };
}
