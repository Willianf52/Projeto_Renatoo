import { paraCsv } from "@/lib/csv";
import {
  extrairFiltros,
  getRegistroDeEventos,
  linhaDeTotal,
  paraLinhasDeExportacao,
  TABLE_COLUMNS,
} from "../../queries";

/**
 * "Exportar para Excel" desta tela: CSV com os mesmos filtros da listagem,
 * sempre o periodo inteiro (sem a paginacao da tela) e com a linha TOTAL no
 * fim, como no rodape da tabela.
 *
 * Sem periodo, o arquivo sai so com o cabecalho -- mesma resposta que a tela
 * da ("Selecione um período"), e nao uma varredura de `leituras` inteira
 * disparada por um link aberto em aba nova.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const registro = await getRegistroDeEventos(filtros);
  const dados = registro ? [...paraLinhasDeExportacao(registro), linhaDeTotal(registro)] : [];

  return new Response(paraCsv(TABLE_COLUMNS, dados), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="registro-de-eventos.csv"',
    },
  });
}
