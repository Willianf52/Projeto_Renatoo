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

/**
 * A legenda de status das telas de Eventos, na ordem e com as cores da
 * referencia. Sao SETE, nao os cinco do filtro Status (que tem "Atendido" no
 * lugar de "Concluído" e nao tem Pânico nem Alerta) -- as duas listas sao
 * assim na referencia.
 *
 * Mora aqui, e nao no `queries.ts` de uma tela, porque Eventos por Site e
 * Graficos de Eventos desenham a MESMA legenda: quando o schema passar a
 * guardar situacao de tratativa, a troca precisa ser num lugar so.
 */
export const STATUS_DO_GRAFICO = [
  { nome: "Aguardando", cor: "#dc2626" },
  { nome: "Em análise", cor: "#eab308" },
  { nome: "Concluído", cor: "#16a34a" },
  { nome: "Cancelado", cor: "#2dd4bf" },
  { nome: "Crítico", cor: "#5b21b6" },
  { nome: "Pânico", cor: "#f87171" },
  { nome: "Alerta", cor: "#e5e77a" },
] as const;

/**
 * Uma serie por status, um valor por categoria (site, evento...).
 *
 * O schema ainda nao guarda situacao de tratativa, entao TODA ocorrencia
 * entra em "Aguardando" -- que e, alias, como a referencia aparece: so
 * vermelho. As demais series existem (vazias) para a legenda ficar completa.
 */
export function montarSeriesDeStatus(totais: number[]) {
  return STATUS_DO_GRAFICO.map((status, i) => ({
    nome: status.nome,
    cor: status.cor,
    valores: totais.map((total) => (i === 0 ? total : 0)),
  }));
}
