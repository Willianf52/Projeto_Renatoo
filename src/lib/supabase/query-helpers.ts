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
