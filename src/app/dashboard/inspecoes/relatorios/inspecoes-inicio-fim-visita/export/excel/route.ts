import { paraCsv } from "@/lib/csv";
import { extrairFiltros, getInspecoesComInicioEFim, paraLinhaDeExportacao, TABLE_COLUMNS } from "../../queries";

/** "Exportar para Excel" desta tela: CSV com os mesmos filtros da listagem
 * (sem paginacao). */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const resultado = await getInspecoesComInicioEFim(filtros);
  const dados = (resultado?.linhas ?? []).map(paraLinhaDeExportacao);
  if (resultado?.truncado) {
    dados.push(["…", "Resultado truncado — ajuste o período para reduzir o total", ...Array(TABLE_COLUMNS.length - 2).fill("")]);
  }

  return new Response(paraCsv(TABLE_COLUMNS, dados), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="inspecoes-inicio-fim-visita.csv"',
    },
  });
}
