import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { COLUNAS, extrairFiltros, getEventos, paraLinhaDeExportacao } from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Cadastro_de_Eventos.pdf", "Cadastro de Eventos", async () => ({
    titulo: "Cadastro de Eventos",
    colunas: COLUNAS,
    linhas: (await getEventos(filtros)).map(paraLinhaDeExportacao),
  }));
}
