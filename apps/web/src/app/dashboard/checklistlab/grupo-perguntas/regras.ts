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

/** Teto do nome no banco (0073: `length(btrim(nome)) between 1 and 100`). */
const TAMANHO_MAXIMO_DO_NOME = 100;

/**
 * Nome da "Cópia completa", como no sistema de referencia: o nome original
 * com o sufixo " cópia" e um contador entre parenteses, o primeiro que ainda
 * nao existe -- o nome e unico sem maiusculas (0073). Corta o original para
 * caber nos 100 caracteres com o sufixo. Pura.
 */
export function nomeDaCopia(nome: string, existentes: string[]): string {
  const usados = new Set(existentes.map((n) => n.trim().toLowerCase()));
  for (let contador = 1; ; contador += 1) {
    const sufixo = ` cópia (${contador})`;
    const candidato = `${nome.trim().slice(0, TAMANHO_MAXIMO_DO_NOME - sufixo.length)}${sufixo}`;
    if (!usados.has(candidato.toLowerCase())) return candidato;
  }
}
