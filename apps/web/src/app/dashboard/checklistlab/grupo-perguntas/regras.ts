import { z } from "zod";

/**
 * Grupo de Perguntas (migration 0073): Ordem, Grupo, Cor e Status, como na
 * referencia. Fora de `actions.ts` (arquivo `"use server"` so exporta funcao
 * assincrona) para o teste exercitar a regra sem montar Server Action.
 */

export const LISTAGEM = "/dashboard/checklistlab/grupo-perguntas";

/** Cor inicial do formulario: o azul da marca (`brand-blue`, tema.ts). */
export const COR_PADRAO = "#2b6cb0";

/** Mesmos limites dos `check` da 0073. */
export const esquemaDoGrupo = z.object({
  nome: z.string().min(1, "Informe o nome do grupo.").max(100, "O nome deve ter no máximo 100 caracteres."),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Escolha uma cor válida."),
  ordem: z
    .number({ error: "Informe a ordem." })
    .int("A ordem deve ser um número inteiro.")
    .min(0, "A ordem não pode ser negativa.")
    .max(9999, "A ordem deve ser no máximo 9999."),
});

export type Situacao = "ativos" | "inativos" | "todos";

/** "Todos" e o padrao, como no filtro da referencia. */
export function situacaoDe(valor: string | undefined): Situacao {
  return valor === "ativos" || valor === "inativos" ? valor : "todos";
}
