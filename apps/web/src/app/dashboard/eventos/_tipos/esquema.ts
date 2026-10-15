import { z } from "zod";

/**
 * Fora de `actions.ts` (que e `"use server"` e so exporta funcao async) para o
 * teste exercitar a regra sem montar Server Action. O formato da cor e o mesmo
 * `check` da 0071: o banco recusaria de qualquer jeito, aqui a mensagem sai
 * legivel antes de chegar la.
 */
export const esquemaDoTipo = z.object({
  nome: z.string().min(1, "Informe o nome.").max(100, "O nome deve ter no máximo 100 caracteres."),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Escolha uma cor válida."),
});
