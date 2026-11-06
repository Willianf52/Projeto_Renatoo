import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import {
  extrairFiltros,
  getMapaDeEventos,
  linhaDeTotal,
  paraLinhasDeExportacao,
  TABLE_COLUMNS,
} from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Mapa_de_Eventos.pdf", "Mapa de Eventos", async () => {
    const mapa = await getMapaDeEventos(filtros);
    return {
      titulo: filtros.mes ? `Mapa de Eventos de ${filtros.mes.split("-").reverse().join("/")}` : "Mapa de Eventos",
      colunas: TABLE_COLUMNS,
      linhas: mapa ? paraLinhasDeExportacao(mapa) : [],
      rodape: mapa ? linhaDeTotal(mapa) : undefined,
    };
  });
}
