import { z } from "zod";

/**
 * Limites de aplicacao, nao do banco: `nome` e `descricao` sao `text` sem
 * restricao de tamanho. Servem para recusar colagem acidental de um texto
 * enorme, nao para validar regra de negocio.
 *
 * Fora de `actions.ts` porque aquele arquivo e `"use server"` (so exporta
 * funcao async) e a importacao em lote (`importacao.ts`) precisa dos MESMOS
 * limites -- um grupo que o formulario recusa nao pode entrar pela planilha.
 */
export const esquemaDeTexto = z.object({
  nome: z.string().min(1, "Informe o nome do grupo.").max(200, "O nome deve ter no máximo 200 caracteres."),
  descricao: z.string().max(500, "A descrição deve ter no máximo 500 caracteres."),
});
