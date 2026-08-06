import { paraCsv } from "@/lib/csv";
import { getGruposUsuariosParaExportar, toTableRow, COLUNAS_EXPORTACAO } from "../../queries";

/**
 * "Exportar para Excel" desta tela: CSV com o mesmo filtro de busca aplicado
 * na listagem (sem paginacao). A autorizacao de leitura e a mesma da
 * listagem -- RLS de `grupos_usuarios` libera apenas para gestao (migration
 * 0006), entao quem nao alcanca a lista tambem recebe um CSV vazio aqui.
 */
export async function GET(request: Request) {
  const busca = new URL(request.url).searchParams.get("busca") ?? undefined;

  const { rows, truncado } = await getGruposUsuariosParaExportar(busca);
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
      "Content-Disposition": 'attachment; filename="grupo-de-usuarios.csv"',
    },
  });
}
