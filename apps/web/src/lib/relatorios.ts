/**
 * O que os `queries.ts` dos relatorios de Inspecoes compartilham depois que a
 * agregacao desceu para o banco (migration 0049).
 */

/**
 * Filtros da tela -> `p_filtros` das funcoes `relatorio_*`.
 *
 * Campo ausente ou vazio fica de FORA do objeto, e nao vai como `null`: na
 * funcao, `nullif(p_filtros ->> 'x', '')` trata ausencia e string vazia igual,
 * mas um `select` vazio da URL (`?evento=`) mandado como chave presente e o
 * tipo de detalhe que vira "filtro que ninguem escolheu" num log de consulta.
 *
 * As chaves sao as de `visitas_do_periodo`, nao as da querystring -- cada tela
 * faz o seu mapeamento (em Horas por Usuario, "Local" e "Sites" viram ambos
 * `site`).
 */
export function filtrosParaRpc(valores: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(valores).filter((par): par is [string, string] => Boolean(par[1]?.trim())),
  );
}
