/**
 * Estado vazio das listagens de cadastro: "nao achei com esses filtros" e
 * "ainda nao existe nada" sao situacoes diferentes e pedem frases diferentes.
 *
 * Antes, as cinco telas diziam sempre "Ajuste os filtros acima" -- inclusive
 * na primeira abertura, sem filtro nenhum, com a tabela vazia porque nao ha
 * cadastro. Quem entra num sistema novo le isso como "estou fazendo algo
 * errado", quando o que falta e cadastrar o primeiro.
 */

type ValorDeParametro = string | string[] | undefined;

/**
 * Ha filtro escolhido por alguem na URL?
 *
 * Le o `searchParams` cru, e nao o objeto de filtros de cada tela, para
 * servir as cinco sem conhecer a forma de cada uma. Ignora `pagina` (nao
 * recorta nada), valor vazio (o formulario manda `busca=` ao clicar em
 * Filtrar sem digitar) e valor igual ao padrao da tela (a situacao comeca em
 * "ativos" sem ninguem escolher).
 */
export function temFiltroAplicado(
  params: Record<string, ValorDeParametro>,
  padroes: Record<string, string> = {},
): boolean {
  return Object.entries(params).some(([chave, bruto]) => {
    if (chave === "pagina") return false;
    const valor = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim();
    if (!valor) return false;
    return padroes[chave] !== valor;
  });
}

export function descricaoDeListaVazia({
  filtrado,
  podeCadastrar,
  descricaoFiltrada,
}: {
  filtrado: boolean;
  podeCadastrar: boolean;
  /** A frase da tela para o caso filtrado ("Ajuste os filtros acima..."). */
  descricaoFiltrada: string;
}): string {
  if (filtrado) return descricaoFiltrada;
  return podeCadastrar
    ? "Cadastre o primeiro pelo botão + no topo da tela."
    : "Os cadastros aparecem aqui assim que forem criados.";
}
