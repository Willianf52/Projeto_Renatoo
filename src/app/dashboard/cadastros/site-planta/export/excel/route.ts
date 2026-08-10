import { paraCsv } from "@/lib/csv";
import {
  extrairFiltros,
  getSitesParaExportar,
  toTableRow,
  COLUNAS_EXPORTACAO,
} from "../../queries";

/**
 * "Exportar para Excel" desta tela: CSV com os mesmos filtros aplicados na
 * listagem (sem paginacao). A autorizacao de leitura e a mesma da listagem --
 * RLS de `sites` e `usuario_ativo()` (migration 0006), entao nao ha checagem
 * extra aqui alem da sessao que o middleware ja exige para `/dashboard`.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filtros = extrairFiltros(params);

  const { rows, truncado } = await getSitesParaExportar(filtros);
  const linhas = rows.map(toTableRow);
  if (truncado) {
    linhas.push([
      "…",
      "Resultado truncado — ajuste os filtros para reduzir o total",
      ...Array(COLUNAS_EXPORTACAO.length - 2).fill(""),
    ]);
  }

  return new Response(paraCsv(COLUNAS_EXPORTACAO, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="site-planta.csv"',
    },
  });
}
