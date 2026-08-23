import { paraCsv } from "@/lib/csv";
import { getGruposSitesParaExportar, toTableRow } from "../../queries";

const TABLE_COLUMNS = ["ID", "Nome", "Status", "Descrição"];

/**
 * "Exportar para Excel" desta tela: CSV com o mesmo filtro de busca aplicado
 * na listagem (sem paginacao). A autorizacao de leitura e a mesma da
 * listagem -- RLS de `grupos_sites` e aberta para `authenticated` (migration
 * 0003), entao nao ha checagem extra aqui alem da sessao que o middleware ja
 * exige para qualquer rota de `/dashboard`.
 */
export async function GET(request: Request) {
  const busca = new URL(request.url).searchParams.get("busca") ?? undefined;

  const { rows, truncado } = await getGruposSitesParaExportar(busca);
  const linhas = rows.map(toTableRow);
  if (truncado) {
    linhas.push(["…", "Resultado truncado — ajuste os filtros para reduzir o total", "", ""]);
  }

  return new Response(paraCsv(TABLE_COLUMNS, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="grupo-de-sites.csv"',
    },
  });
}
