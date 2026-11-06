import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import {
  extrairFiltros,
  getRegistroDeEventos,
  linhaDeTotal,
  paraLinhasDeExportacao,
  TABLE_COLUMNS,
} from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Registro_de_Eventos.pdf", "Registro de Eventos", async () => {
    const registro = await getRegistroDeEventos(filtros);
    return {
      titulo: "Registro de Eventos",
      colunas: TABLE_COLUMNS,
      linhas: registro ? paraLinhasDeExportacao(registro) : [],
      rodape: registro ? linhaDeTotal(registro) : undefined,
    };
  });
}
