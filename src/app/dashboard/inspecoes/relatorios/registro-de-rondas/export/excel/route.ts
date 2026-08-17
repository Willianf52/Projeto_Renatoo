import { paraCsv } from "@/lib/csv";
import { extrairFiltros, getRegistroDeRondas, paraLinhaDeExportacao, TABLE_COLUMNS } from "../../queries";

/**
 * "Exportar para Excel" desta tela: CSV com os mesmos filtros da listagem,
 * sempre o mes inteiro (sem a paginacao de Locais da tela). Cada celula de
 * dia com mais de uma ronda leva uma duracao por linha dentro da mesma
 * celula -- paraCsv aspa todo campo (RFC 4180), entao a quebra de linha e
 * segura dentro do arquivo.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const { linhas, truncado } = await getRegistroDeRondas(filtros);
  const dados = linhas.map(paraLinhaDeExportacao);
  if (truncado) {
    dados.push([
      "…",
      "Resultado truncado — ajuste os filtros para reduzir o total",
      ...Array(TABLE_COLUMNS.length - 2).fill(""),
    ]);
  }

  return new Response(paraCsv(TABLE_COLUMNS, dados), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="registro-de-rondas.csv"',
    },
  });
}
