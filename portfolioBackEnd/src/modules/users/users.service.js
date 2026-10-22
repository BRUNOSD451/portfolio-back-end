// O portfólio possui um único proprietário.
const OWNER_ID = 1;
// Caminho relativo à API; os clientes completam com a URL base.
export const RESUME_PATH = "/user/resume";

export function createUsersService({ prisma, uploadImage, resumeStorage }) {
  // O PDF guardado no servidor tem prioridade sobre um link antigo no cadastro.
  const withResume = async (user) =>
    user && (await resumeStorage.exists())
      ? { ...user, curriculo: RESUME_PATH }
      : user;
  return {
    // Somente o proprietário e os campos destinados ao portfólio público.
    list: async () =>
      Promise.all(
        (
          await prisma.user.findMany({
            where: { id: OWNER_ID },
            select: {
              id: true,
              nome: true,
              descricao: true,
              email: true,
              telefone: true,
              idade: true,
              curriculo: true,
              imageUrl: true,
            },
          })
        ).map(withResume),
      ),

    update: async (id, data) =>
      withResume(await prisma.user.update({ where: { id }, data })),

    async updatePhoto(file) {
      const result = await uploadImage(file.buffer, file.originalname, "users");
      await prisma.user.update({
        where: { id: OWNER_ID },
        data: { imageUrl: result.secure_url },
      });
      return result;
    },

    async updateResume(file) {
      await resumeStorage.save(file.buffer);
      // Remove o link antigo para o cadastro não apontar para outro arquivo.
      await prisma.user.update({
        where: { id: OWNER_ID },
        data: { curriculo: null },
      });
      return RESUME_PATH;
    },

    async removeResume() {
      await resumeStorage.remove();
      await prisma.user.update({
        where: { id: OWNER_ID },
        data: { curriculo: null },
      });
    },

    async resume() {
      const user = await prisma.user.findUnique({
        where: { id: OWNER_ID },
        select: { nome: true, curriculo: true },
      });
      if (!user) return null;
      return {
        nome: user.nome,
        file: (await resumeStorage.exists()) ? resumeStorage.path : null,
        link: user.curriculo,
      };
    },
  };
}
