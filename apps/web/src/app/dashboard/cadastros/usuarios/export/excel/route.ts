import { paraCsv } from "@/lib/csv";
import { COLUNAS_EXPORTACAO, extrairFiltros, getUsuariosParaExportar, toTableRow } from "../../queries";

/**
 * "Exportar para Excel" de Usuários: CSV com os filtros da tela (busca,
 * função, tipo, nível de acesso, grupo e situação), sem a paginação. Passa
 * pelo RLS de `profiles` como a lista: quem só enxerga o próprio perfil
 * exporta só ele.
 */
export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  const { rows, truncado } = await getUsuariosParaExportar(filtros);

  const linhas = rows.map(toTableRow);
  if (truncado) {
    linhas.push([
      "…",
      "Resultado truncado: ajuste os filtros para reduzir o total",
      ...Array(COLUNAS_EXPORTACAO.length - 2).fill(""),
    ]);
  }

  return new Response(paraCsv(COLUNAS_EXPORTACAO, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="usuarios.csv"',
    },
  });
}
