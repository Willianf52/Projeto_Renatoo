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

export type AvisoDePeriodo = {
  titulo: string;
  descricao: string;
  /**
   * `true` quando a pessoa ja clicou em Filtrar e faltou data: o aviso muda
   * de cor e e anunciado ao leitor de tela. Na primeira abertura e so
   * orientacao, sem tom de erro.
   */
  destaque: boolean;
};

/**
 * Texto do corpo dos relatorios que so consultam com periodo fechado (Horas
 * por Usuario, Ranking, Mapa de Locais, Inicio e Fim).
 *
 * Antes, clicar em Filtrar sem as datas recarregava a pagina com a mesma
 * frase da primeira abertura -- nada indicava que o clique foi recebido nem o
 * que faltou. A distincao vem da URL: o formulario e GET e manda
 * `data_inicial`/`data_final` mesmo vazios, entao a chave presente quer dizer
 * "ja tentou filtrar"; ausente, "acabou de abrir".
 *
 * `temDataInicial`/`temDataFinal` sao as datas JA VALIDADAS pelo
 * `extrairFiltros` da tela: uma data malformada na URL conta como faltando.
 */
export function avisoDePeriodo({
  params,
  temDataInicial,
  temDataFinal,
  oQueMostra,
}: {
  params: Record<string, string | string[] | undefined>;
  temDataInicial: boolean;
  temDataFinal: boolean;
  /** Completa "para ver ...": "as horas por usuário", "o ranking do período". */
  oQueMostra: string;
}): AvisoDePeriodo {
  const tentouFiltrar = "data_inicial" in params || "data_final" in params;

  if (!tentouFiltrar) {
    return {
      titulo: "Selecione um período",
      descricao: `Escolha a Data Inicial e a Data Final acima e clique em Filtrar para ver ${oQueMostra}.`,
      destaque: false,
    };
  }

  if (temDataInicial && !temDataFinal) {
    return {
      titulo: "Falta a Data Final",
      descricao: "Escolha a Data Final acima e clique em Filtrar de novo.",
      destaque: true,
    };
  }

  if (!temDataInicial && temDataFinal) {
    return {
      titulo: "Falta a Data Inicial",
      descricao: "Escolha a Data Inicial acima e clique em Filtrar de novo.",
      destaque: true,
    };
  }

  return {
    titulo: "Informe o período para filtrar",
    descricao: "Este relatório precisa da Data Inicial e da Data Final. Escolha as duas acima e clique em Filtrar de novo.",
    destaque: true,
  };
}
