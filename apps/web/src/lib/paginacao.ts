/**
 * Texto do rodape de paginacao das listagens ("Pag: 2 de 5 | Total: 43 itens").
 *
 * Existe porque a versao montada inline em cada tela mostrava "Pag: 0 de 1"
 * com a lista vazia -- pagina zero de uma -- e "Total: 1 itens", e porque a
 * mesma frase se repetia no `DataTable` e em dois relatorios com paginacao
 * propria. Funcao pura para o caso de borda ficar coberto por teste sem
 * renderizar tabela.
 */
export type EntradaDaPaginacao = {
  pagina: number;
  totalPaginas: number;
  totalItens: number;
  /** Contagem por estimativa (`count=estimated`): o total leva "~". */
  aproximado?: boolean;
  /** Substantivo contado. Padrao: item/itens. */
  singular?: string;
  plural?: string;
};

export function textoDaPaginacao({
  pagina,
  totalPaginas,
  totalItens,
  aproximado = false,
  singular = "item",
  plural = "itens",
}: EntradaDaPaginacao): string {
  /**
   * Sem pagina para anunciar. O "~" sai junto de proposito: "~0" diz que
   * talvez exista algo, e a tabela logo acima ja mostrou o estado vazio.
   */
  if (totalItens <= 0) {
    return `Nenhum ${singular}`;
  }

  // `totalPaginas` pode chegar 0 de quem calcula com o total estimado; com
  // item na tela ha no minimo uma pagina.
  const paginas = Math.max(totalPaginas, 1);
  const substantivo = totalItens === 1 ? singular : plural;

  return `Pág: ${pagina} de ${paginas} | Total: ${aproximado ? "~" : ""}${totalItens} ${substantivo}`;
}
