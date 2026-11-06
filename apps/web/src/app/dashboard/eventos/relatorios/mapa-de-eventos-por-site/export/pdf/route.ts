import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import {
  colunasDeExportacao,
  extrairFiltros,
  getMapaDeEventosPorSite,
  LIMITE_DIAS,
  paraLinhasDeExportacao,
} from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Mapa_de_Eventos_por_Site.pdf", "Mapa de Eventos por Site", async () => {
    const mapa = await getMapaDeEventosPorSite(filtros);
    return {
      titulo: `Mapa de Eventos por Site${mapa?.diasExcedidos ? ` (primeiros ${LIMITE_DIAS} dias do período)` : ""}`,
      colunas: colunasDeExportacao(mapa?.dias ?? []),
      linhas: mapa && mapa.dias.length > 0 ? paraLinhasDeExportacao(mapa.raiz) : [],
      paisagem: true,
    };
  });
}
