import { paraCsv } from "@/lib/csv";
import { extrairFiltros, getHorasPorUsuario, paraLinhaDeExportacao, TABLE_COLUMNS } from "../../queries";

/** "Exportar para Excel" desta tela: CSV com os mesmos filtros da listagem. */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  // Sem aviso de truncado desde a 0049: as horas sao somadas inteiras no banco.
  const dados = ((await getHorasPorUsuario(filtros)) ?? []).map(paraLinhaDeExportacao);

  return new Response(paraCsv(TABLE_COLUMNS, dados), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="horas-por-usuario.csv"',
    },
  });
}
