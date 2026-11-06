import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { extrairFiltros, getAnalitico, paraLinhasDeExportacao, TABLE_COLUMNS } from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Analitico_de_Eventos.pdf", "Analítico de Eventos", async () => {
    const linhas = await getAnalitico(filtros, new Date());
    return {
      titulo: "Analítico de Eventos",
      colunas: TABLE_COLUMNS,
      linhas: linhas ? paraLinhasDeExportacao(linhas) : [],
    };
  });
}
