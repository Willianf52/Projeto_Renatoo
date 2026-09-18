import { paraCsv } from "@/lib/csv";
import {
  extrairFiltros,
  getMapaDeEventos,
  linhaDeTotal,
  paraLinhasDeExportacao,
  TABLE_COLUMNS,
} from "../../queries";

/**
 * "Exportar para Excel" desta tela: CSV da grade Evento x dia com os mesmos
 * filtros da tela (sem Mês/Ano, o mes atual) e a linha Total no fim, como no
 * pe da tabela.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const mapa = await getMapaDeEventos(filtros);
  const dados = [...paraLinhasDeExportacao(mapa), linhaDeTotal(mapa)];

  return new Response(paraCsv(TABLE_COLUMNS, dados), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mapa-de-eventos.csv"',
    },
  });
}
