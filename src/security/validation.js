import { z } from "zod";

const text = (length) => z.string().trim().max(length);
const httpUrl = text(2048).refine((value) => {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}, "Informe uma URL HTTP(S) válida.");
export const credentials = z
  .object({
    email: z.string().trim().email().max(150),
    password: z.string().min(1).max(128),
  })
  .strict();
export const adminCredentials = credentials.extend({
  email: z.string().trim()
    .email("Informe um e-mail válido para o administrador.")
    .max(150, "O e-mail deve ter no máximo 150 caracteres."),
  password: z.string()
    .min(10, "A senha deve ter pelo menos 10 caracteres.")
    .max(128, "A senha deve ter no máximo 128 caracteres."),
});
export const profileInput = z
  .object({
    // Compatibilidade com o app atual: nenhum outro proprietário pode ser escolhido.
    id: z.literal(1).optional(),
    nome: text(100).min(1).optional(),
    email: z.string().trim().email().max(150).optional(),
    idade: z.number().int().min(0).max(130).nullable().optional(),
    telefone: text(20)
      .refine((v) => /^[+\d\s().-]+$/.test(v), "Telefone inválido.")
      .nullable()
      .optional(),
    curriculo: httpUrl.nullable().optional(),
    descricao: text(5000).nullable().optional(),
  })
  .strict()
  .refine(
    (v) => Object.keys(v).some((k) => k !== "id"),
    "Informe ao menos um campo para atualizar.",
  );
const technologyIds = z.array(z.number().int().min(1).max(2147483647)).max(100);
export const projectCreate = z
  .object({
    nome: text(150).min(1),
    descricao: text(20000).nullable().default(null),
    tecnologias: technologyIds,
  })
  .strict();
export const projectUpdate = projectCreate
  .omit({ descricao: true })
  .partial()
  .extend({
    descricao: text(20000).nullable().optional(),
  })
  .refine(
    (v) => Object.keys(v).length > 0,
    "Informe ao menos um campo para atualizar.",
  );
export const technologyInput = z
  .object({ nome: text(100).min(1).optional() })
  .strict();
export const mediaInput = z
  .object({
    ordem: z
      .string()
      .regex(/^\d{1,10}$/)
      .transform(Number)
      .pipe(z.number().max(2147483647))
      .optional(),
  })
  .strict();

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw Object.assign(
      new Error("Dados inválidos. Confira os campos e seus limites."),
      { status: 400 },
    );
  return result.data;
}
export const messageInput = z
  .object({
    conteudo: text(10000).min(1),
    // Identificador da conversa no agente, para agrupar as mensagens.
    sessao: text(100).min(1).nullable().default(null),
  })
  .strict();
