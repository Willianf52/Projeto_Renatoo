import { paraCsv } from "@/lib/csv";
import { colunasDeExportacao, extrairFiltros, getMapaDeEventosPorSite, paraLinhasDeExportacao } from "../../queries";

/**
 * "Exportar para Excel" desta tela: a arvore inteira aberta (organizacao,
 * grupos e sites, cada linha com o caminho completo) e uma coluna por dia,
 * com os mesmos filtros da tela. Sem periodo, sai so o cabecalho "Site" --
 * a tela tambem nao consulta sem as duas datas.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const mapa = await getMapaDeEventosPorSite(filtros);
  const colunas = colunasDeExportacao(mapa?.dias ?? []);
  const dados = mapa && mapa.dias.length > 0 ? paraLinhasDeExportacao(mapa.raiz) : [];

  return new Response(paraCsv(colunas, dados), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mapa-de-eventos-por-site.csv"',
    },
  });
}
