import { paraCsv } from "@/lib/csv";
import { extrairFiltros, getAnalitico, paraLinhasDeExportacao, TABLE_COLUMNS } from "../../queries";

/**
 * "Exportar para Excel": CSV com os mesmos filtros da tela. Sem periodo, so o
 * cabecalho -- a mesma resposta da tela ("Selecione um período").
 */
export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  const linhas = await getAnalitico(filtros, new Date());

  return new Response(paraCsv(TABLE_COLUMNS, linhas ? paraLinhasDeExportacao(linhas) : []), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="analitico-de-eventos.csv"',
    },
  });
}
