/**
 * Formatacao de data/hora para as tabelas.
 *
 * Morava em `coletas-importadas/queries.ts`, que era a unica tela a precisar.
 * Com a tela de Site / Planta exibindo "Data Criação", subiu para `lib/` pelo
 * mesmo motivo que `escaparLike` virou `lib/postgrest-escape.ts` e as
 * permissoes viraram `lib/permissoes.ts`: a alternativa era a segunda tela
 * importar de dentro da pasta da primeira.
 */

/**
 * Nulo vira string vazia, e nao "Invalid Date": a coluna e nullable no banco, e
 * a celula vazia ja diz "nao ha" sem gastar a atencao de quem le.
 *
 * `pt-BR` fixo, e nao a locale do navegador: o servidor renderiza esta tabela,
 * entao a locale de quem le nao chega ate aqui de qualquer forma -- e o
 * publico deste sistema e um so.
 */
export function formatarDataHora(valor: string | null): string {
  if (!valor) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(valor),
  );
}
