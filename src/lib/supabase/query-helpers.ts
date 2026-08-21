/**
 * Helpers puros compartilhados pelas telas de listagem (`queries.ts` de cada
 * cadastro) -- matematica de paginacao e o corte de exportacao.
 *
 * As tres linhas de `from`/`to` e o idioma de "pede um a mais, corta e sinaliza
 * truncamento" apareciam copiadas em usuarios, grupo-de-sites,
 * grupo-de-usuarios, site-planta, qr-code e coletas-importadas. E aritmetica
 * pura, sem nada especifico de cada tabela -- diferente de `comBusca`/
 * `aplicarFiltros`, que continuam por arquivo porque os campos do `.or()`
 * mudam de tela para tela.
 */

/** Pagina 1-based -> intervalo `[from, to]` para `.range()` do PostgREST. */
export function paginar(pagina: number, pageSize: number): { from: number; to: number } {
  const paginaValida = Math.max(1, pagina);
  const from = (paginaValida - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

/** Teto de linhas nas exportacoes: evita devolver uma tabela sem fim. */
export const LIMITE_EXPORTACAO = 2000;

/**
 * Aplica o corte de exportacao. A consulta que chama isto pede
 * `LIMITE_EXPORTACAO + 1` linhas (via `.range(0, LIMITE_EXPORTACAO)`); esta
 * funcao devolve so as `limite` primeiras e sinaliza se havia mais, sem
 * precisar de uma segunda consulta de `count` so para saber se coube.
 */
export function resultadoExportacao<T>(
  rows: T[],
  limite: number = LIMITE_EXPORTACAO,
): { rows: T[]; truncado: boolean } {
  return { rows: rows.slice(0, limite), truncado: rows.length > limite };
}

/**
 * Teto de linhas que uma agregacao em memoria busca, somando todas as paginas.
 *
 * Nao e um limite de exibicao: e uma trava contra varredura sem fim. Cada
 * pagina custa uma ida ao PostgREST, entao 100 mil linhas ja sao ~100
 * requisicoes -- um relatorio nesse volume esta lento demais para ser util, e
 * o sinal de que a agregacao precisa descer para SQL (item de Media prioridade
 * em `docs/melhorias.md`), nao de que o teto deveria subir.
 */
export const TETO_DE_AGREGACAO = 100_000;

/** Quanto pedir por ida. O PostgREST tem teto proprio (`max_rows`, hoje 1000);
 * pedir mais que ele nao quebra nada -- `buscarEmPaginas` avanca pelo que
 * voltou, nao pelo que pediu. */
const TAMANHO_DA_PAGINA = 1000;

/**
 * Busca o resultado inteiro de uma consulta que sera agregada em memoria.
 *
 * Existe porque tres relatorios (`horas-por-usuario`,
 * `mapa-de-locais-inspecionados`, `ranking-de-inspecoes`) selecionavam
 * `leituras` sem `.range()` e somavam o que voltasse. O PostgREST corta em
 * `max_rows` e devolve o pedaco **sem erro e sem sinal nenhum**: a agregacao
 * somava em cima do recorte e a tela exibia um numero menor que o real com
 * cara de certo. "Quantidade de Horas por Usuario" subnotificava justamente
 * quem trabalhou mais, porque e quem tem mais leituras para cortar.
 *
 * DUAS DECISOES QUE PARECEM DETALHE E NAO SAO
 *
 * 1) **Avanca pelo que voltou, nao pelo que pediu, e so para quando uma pagina
 *    volta vazia.** A condicao obvia -- parar quando a pagina veio menor que a
 *    pedida -- reintroduz o bug original se o teto do servidor for menor que
 *    `TAMANHO_DA_PAGINA`: a primeira pagina ja voltaria "menor", e a busca
 *    pararia achando que acabou. Do jeito que esta, funciona qualquer que seja
 *    o `max_rows` do ambiente, que e configuracao de servidor e nao esta sob
 *    controle deste codigo. O preco e uma ida a mais no fim, que devolve zero.
 *
 * 2) **Quem chama precisa ordenar a consulta.** `.range()` sem `order by`
 *    estavel nao garante que duas paginas nao repitam ou pulem a mesma linha.
 *    Sem ordenacao, paginar troca "numero menor que o real" por "numero
 *    aleatorio", que e pior.
 *
 * `atingiuTeto` nao vai para a tela: nenhuma das tres muda de aparencia. Quem
 * chama registra em log/Sentry -- e o evento e operacional (o relatorio passou
 * de um volume que este desenho aguenta), nao algo que quem le o relatorio
 * possa resolver ajustando um filtro.
 *
 * `buscarPagina` recebe `any` pelo mesmo motivo de `aplicarFiltros` em cada
 * `queries.ts`: reencadear um builder do PostgREST ja criado nao preserva o
 * generic `Database` sem repetir cada metodo na assinatura.
 */
export async function buscarEmPaginas<T>(
  buscarPagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>,
  teto: number = TETO_DE_AGREGACAO,
): Promise<{ linhas: T[]; atingiuTeto: boolean }> {
  const linhas: T[] = [];
  let de = 0;

  while (de < teto) {
    const ate = Math.min(de + TAMANHO_DA_PAGINA, teto) - 1;

    const { data, error } = await buscarPagina(de, ate);
    if (error) throw error;

    const pagina = (data ?? []) as T[];
    if (pagina.length === 0) return { linhas, atingiuTeto: false };

    linhas.push(...pagina);
    de += pagina.length;
  }

  return { linhas, atingiuTeto: true };
}
