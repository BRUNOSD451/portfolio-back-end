export function createMessagesService({ prisma }) {
  const messages = prisma.messages;
  return {
    list: (sessao) =>
      messages.findMany({
        where: sessao ? { sessao } : undefined,
        orderBy: { id: "desc" },
        take: 500,
      }),
    create: (data) => messages.create({ data }),
  };
}
